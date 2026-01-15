import { Worker, Job } from 'bullmq';
import { SESSION_QUEUE_NAME, SessionJobData, addScenarioJob } from './queue';
import { getRedisClient } from '../config/redis';
import { getSessionService } from '../services/SessionService';
import { getScenarioService } from '../services/ScenarioService';
import { getMetricsService } from '../services/MetricsService';
import { getDbConnection } from '../database/connection';
import { Interaction, ActionType, EntityType } from '../models/Interaction';
import { logger } from '../utils/logger';
import { IPlatformAdapter } from '../adapters/interfaces/IPlatformAdapter';
import { PlatformAdapterFactory } from '../adapters/PlatformAdapterFactory';
import { Platform } from '../models/SocialAccount';
import { SessionRunner } from './SessionRunner';
import { loggedGoto } from '../utils/actionLogger';

export class SessionWorker {
  private worker: Worker<SessionJobData>;

  constructor() {
    this.worker = new Worker<SessionJobData>(
      SESSION_QUEUE_NAME,
      async (job: Job<SessionJobData>) => {
        return this.processSession(job);
      },
      {
        connection: getRedisClient(),
        concurrency: 1, // Process one session at a time to avoid rate limits
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Max times a job can be stalled before being marked as failed
      }
    );

    this.worker.on('completed', (job) => {
      logger.info(`Session ${job.data.sessionId} processing completed`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Session ${job?.data.sessionId} processing failed:`, err);
    });
  }

  private async processSession(job: Job<SessionJobData>): Promise<void> {
    const { sessionId, socialAccountId } = job.data;
    const sessionService = getSessionService();
    const scenarioService = getScenarioService();
    const metricsService = getMetricsService();
    const db = getDbConnection();

    const gologinToken = process.env.GOLOGIN_TOKEN;
    if (!gologinToken) {
      throw new Error('GOLOGIN_TOKEN environment variable is required');
    }

    let adapter: IPlatformAdapter | null = null;
    let sessionRunner: SessionRunner | null = null;
    let sessionContext: import('./SessionRunner').SessionRunnerContext | null = null;

    try {
      logger.info(`Processing session ${sessionId}`);

      // Get session and account info
      const session = await sessionService.getSession(sessionId);
      const accountResult = await db.query(
        'SELECT platform FROM social_accounts WHERE id = $1',
        [socialAccountId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error(`Social account ${socialAccountId} not found`);
      }

      const platform = accountResult.rows[0].platform as Platform;

      // Start session with SessionRunner (handles GoLogin profile management)
      sessionRunner = new SessionRunner(gologinToken);
      sessionContext = await sessionRunner.startSession({
        socialAccountId,
      });

      // Initialize adapter based on platform
      adapter = PlatformAdapterFactory.create(platform);

      // Set browser components from SessionRunner
      (adapter as any).setBrowserComponents(
        sessionContext.browser,
        sessionContext.page,
        sessionContext.stop
      );

      // Check if logged in (GoLogin profile may already have session)
      const homeUrl = adapter.getHomeUrl();
      await loggedGoto(sessionContext.page, homeUrl, { waitUntil: 'networkidle0' }, sessionContext.logContext);
      let loggedIn = await adapter.isLoggedIn();

      if (loggedIn) {
        logger.info(`GoLogin profile already logged in for session ${sessionId}`);
      } else {
        // Perform login with credentials
        const credentials = await sessionService.getDecryptedCredentials(socialAccountId);
        await adapter.login(credentials);
        logger.info(`Logged in to ${platform} for session ${sessionId}`);
      }

      // Get all scenarios for the platform
      const scenarios = await scenarioService.listScenarios({ platform });
      logger.info(`Found ${scenarios.length} scenarios for platform ${platform}`);

      // Queue all scenarios for execution
      for (const scenario of scenarios) {
        await addScenarioJob({
          sessionId: session.id,
          socialAccountId: socialAccountId,
          scenarioId: scenario.id,
        });
        logger.info(`Queued scenario ${scenario.id} (${scenario.name}) for session ${sessionId}`);
      }

      // Monitor session duration
      const startTime = Date.now();
      const maxDuration = 15 * 60 * 1000; // 15 minutes

      // Keep session alive until minimum duration or max duration
      while (Date.now() - startTime < maxDuration) {
        const elapsed = Date.now() - startTime;
        const minDuration = 8 * 60 * 1000; // 8 minutes

        if (elapsed >= minDuration) {
          // Check if we should end session
          const durationCheck = await sessionService.checkSessionDuration(sessionId);
          if (!durationCheck.isValid && durationCheck.currentDuration >= durationCheck.maxDuration) {
            break;
          }
        }

        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 60000)); // Check every minute
      }

      // End session
      await sessionService.endSession(sessionId, 'completed');

      // Calculate and store metrics
      await metricsService.calculateSessionMetrics(sessionId);

      logger.info(`Session ${sessionId} completed successfully`);

      // Complete session with SessionRunner (creates snapshot, handles cleanup)
      if (sessionRunner && sessionContext) {
        await sessionRunner.completeSession(sessionContext);
      }
    } catch (error) {
      logger.error(`Session ${sessionId} failed:`, error);
      await sessionService.endSession(sessionId, 'failed');

      // Complete session with error
      if (sessionRunner && sessionContext) {
        await sessionRunner.completeSession(sessionContext, error as Error);
      }

      throw error;
    } finally {
      // Cleanup adapter (SessionRunner.stop() should handle browser cleanup, but ensure adapter is closed)
      if (adapter) {
        try {
          await adapter.close();
        } catch (error) {
          logger.error('Error closing adapter:', error);
        }
      }
    }
  }

  /**
   * Records an interaction to the database
   */
  async recordInteraction(
    sessionId: number,
    actionType: ActionType,
    entityType: EntityType,
    result: import('../adapters/interfaces/IPlatformAdapter').InteractionResult,
    commentText?: string,
    stepSequence?: number
  ): Promise<Interaction> {
    const db = getDbConnection();
    const sessionService = getSessionService();

    try {
      const session = await sessionService.getSession(sessionId);

      const result_query = await db.query(
        `INSERT INTO interactions (
          session_id, action_type, entity_type, entity_id, entity_url,
          interacted_by_account_id, comment_text, parent_entity_id, parent_entity_type,
          success, error_message, timestamp, step_sequence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
        RETURNING *`,
        [
          sessionId,
          actionType,
          entityType,
          result.entityId,
          result.entityUrl,
          session.social_account_id,
          commentText || null,
          result.parentEntityId || null,
          result.parentEntityType || null,
          result.success,
          result.errorMessage || null,
          stepSequence || null,
        ]
      );

      // Increment action count
      await sessionService.incrementActionCount(sessionId);

      return this.mapRowToInteraction(result_query.rows[0]);
    } catch (error) {
      logger.error('Failed to record interaction:', error);
      throw error;
    }
  }

  private mapRowToInteraction(row: any): Interaction {
    return {
      id: row.id,
      session_id: row.session_id,
      action_type: row.action_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      entity_url: row.entity_url,
      interacted_by_account_id: row.interacted_by_account_id,
      comment_text: row.comment_text,
      parent_entity_id: row.parent_entity_id,
      parent_entity_type: row.parent_entity_type,
      success: row.success,
      error_message: row.error_message,
      timestamp: row.timestamp,
      metadata_json: row.metadata_json,
      step_sequence: row.step_sequence,
    };
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

// Singleton instance
let sessionWorker: SessionWorker | null = null;

export function getSessionWorker(): SessionWorker {
  if (!sessionWorker) {
    sessionWorker = new SessionWorker();
  }
  return sessionWorker;
}

