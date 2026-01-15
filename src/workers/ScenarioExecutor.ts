import { Worker, Job } from 'bullmq';
import { SCENARIO_QUEUE_NAME, SessionJobData } from './queue';
import { getRedisClient } from '../config/redis';
import { getSessionService } from '../services/SessionService';
import { getScenarioService } from '../services/ScenarioService';
import { getLLMService } from '../services/LLMService';
import { getSessionWorker } from './SessionWorker';
import { logger } from '../utils/logger';
import { IPlatformAdapter, Post, Comment } from '../adapters/interfaces/IPlatformAdapter';
import { PlatformAdapterFactory } from '../adapters/PlatformAdapterFactory';
import { Platform } from '../models/SocialAccount';
import { InteractionFlowStep } from '../models/Scenario';
import { humanDelay } from '../utils/delay';
import { loggedGoto } from '../utils/actionLogger';

interface StepResult {
  posts?: Post[];
  comments?: Comment[];
  [key: string]: unknown;
}

export class ScenarioExecutor {
  private worker: Worker<SessionJobData>;
  private stepResults: Map<number, StepResult> = new Map();

  constructor() {
    this.worker = new Worker<SessionJobData>(
      SCENARIO_QUEUE_NAME,
      async (job: Job<SessionJobData>) => {
        return this.executeScenario(job);
      },
      {
        connection: getRedisClient(),
        concurrency: 1,
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Max times a job can be stalled before being marked as failed
      }
    );

    this.worker.on('completed', (job) => {
      logger.info(`Scenario execution for session ${job.data.sessionId} completed`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Scenario execution for session ${job?.data.sessionId} failed:`, err);
    });
  }

  private async executeScenario(job: Job<SessionJobData>): Promise<void> {
    const { sessionId, socialAccountId, scenarioId } = job.data;

    if (!scenarioId) {
      logger.warn(`Session ${sessionId} has no scenario ID, skipping execution`);
      return;
    }

    const sessionService = getSessionService();
    const scenarioService = getScenarioService();
    const llmService = getLLMService();
    const sessionWorker = getSessionWorker();

    let adapter: IPlatformAdapter | null = null;

    try {
      logger.info(`Executing scenario ${scenarioId} for session ${sessionId}`);

      // Get scenario
      const scenario = await scenarioService.getScenario(scenarioId);

      // Get account info
      const { getDbConnection } = await import('../database/connection');
      const db = getDbConnection();
      const accountResult = await db.query(
        'SELECT platform FROM social_accounts WHERE id = $1',
        [socialAccountId]
      );

      if (accountResult.rows.length === 0) {
        throw new Error(`Social account ${socialAccountId} not found`);
      }

      const platform = accountResult.rows[0].platform as Platform;

      // Verify platform matches
      if (scenario.platform !== platform) {
        throw new Error(
          `Scenario platform (${scenario.platform}) does not match account platform (${platform})`
        );
      }

      // Get session to find associated profile
      await sessionService.getSession(sessionId);

      // Check if we should use Chrome (local mode)
      const nodeEnv = process.env.NODE_ENV?.toLowerCase();
      const useChrome = nodeEnv === 'development' || nodeEnv === 'local';

      let browserSession;

      if (useChrome) {
        // Chrome mode: no profile needed
        logger.info(`Using Chrome for scenario execution (local mode)`);
        const { openBrowserSession } = await import('../browser/browserLauncher');
        browserSession = await openBrowserSession();
      } else {
        // GoLogin mode: profile management required
        const gologinToken = process.env.GOLOGIN_TOKEN;
        if (!gologinToken) {
          throw new Error('GOLOGIN_TOKEN environment variable is required for GoLogin mode');
        }

        // Try to get profile from gologin_profiles table for this social account
        const profileResult = await db.query(
          'SELECT gologin_profile_id FROM gologin_profiles WHERE social_account_id = $1 AND status = $2 ORDER BY last_used_at DESC NULLS LAST, created_at DESC LIMIT 1',
          [socialAccountId, 'ACTIVE']
        );

        if (profileResult.rows.length === 0) {
          throw new Error(`No active GoLogin profile found for social account ${socialAccountId}`);
        }

        const gologinProfileId = profileResult.rows[0].gologin_profile_id;

        // For scenarios, we'll reuse the profile but start a fresh browser session
        // GoLogin will sync the profile state automatically
        const { openBrowserSession } = await import('../browser/browserLauncher');
        browserSession = await openBrowserSession({
          gologinToken,
          profileId: gologinProfileId,
        });
      }

      // Initialize adapter
      adapter = PlatformAdapterFactory.create(platform);

      // Set browser components from browser session
      (adapter as any).setBrowserComponents(
        browserSession.browser,
        browserSession.page,
        browserSession.stop
      );

      // Check if logged in (GoLogin profile should have session state in GoLogin mode)
      const homeUrl = adapter.getHomeUrl();
      const { createActionLogContext } = await import('../utils/actionLogger');
      const logContext = createActionLogContext(sessionId, undefined, socialAccountId);

      await loggedGoto(browserSession.page, homeUrl, { waitUntil: 'networkidle0' }, logContext);

      if (!(await adapter.isLoggedIn())) {
        const credentials = await sessionService.getDecryptedCredentials(socialAccountId);
        await adapter.login(credentials);
        logger.info(`Logged in for scenario ${scenarioId}`);
      }

      // Execute interaction flow steps in order
      const flow = scenario.interaction_flow_json;
      this.stepResults.clear();

      for (const step of flow) {
        await this.executeStep(
          step,
          adapter,
          sessionId,
          llmService,
          sessionWorker
        );
        await humanDelay(2000, 0.3); // Delay between steps
      }

      logger.info(`Scenario ${scenarioId} execution completed for session ${sessionId}`);

      // GoLogin handles state synchronization automatically, no need to manually save
      // But we can create a snapshot for diagnostics (only in GoLogin mode)
      if (!useChrome) {
        try {
          const snapshotService = await import('../services/BrowserStateSnapshotService').then(m => m.getBrowserStateSnapshotService());
          const profileResult = await db.query(
            'SELECT id FROM gologin_profiles WHERE social_account_id = $1 AND status = $2 ORDER BY last_used_at DESC NULLS LAST, created_at DESC LIMIT 1',
            [socialAccountId, 'ACTIVE']
          );
          const profileId = profileResult.rows.length > 0 ? profileResult.rows[0].id : undefined;

          if (adapter && (adapter as any).page && profileId) {
            await snapshotService.captureSnapshot(
              sessionId,
              profileId,
              (adapter as any).page
            );
          }
        } catch (error) {
          logger.warn(`Failed to create snapshot after scenario ${scenarioId} execution:`, error);
        }
      }
    } catch (error) {
      logger.error(`Scenario execution failed for session ${sessionId}:`, error);
      throw error;
    } finally {
      if (adapter) {
        try {
          await adapter.close();
        } catch (error) {
          logger.error('Error closing adapter:', error);
        }
      }
      this.stepResults.clear();
    }
  }


  private async executeStep(
    step: InteractionFlowStep,
    adapter: IPlatformAdapter,
    sessionId: number,
    llmService: import('../services/LLMService').LLMService,
    sessionWorker: import('./SessionWorker').SessionWorker
  ): Promise<void> {
    logger.info(`Executing step ${step.step}: ${step.action}`);

    try {
      switch (step.action) {
        case 'search':
          await this.executeSearchStep(step, adapter);
          break;

        case 'like':
          await this.executeLikeStep(step, adapter, sessionId, sessionWorker);
          break;

        case 'comment':
          await this.executeCommentStep(step, adapter, sessionId, llmService, sessionWorker);
          break;

        case 'reply':
          await this.executeReplyStep(step, adapter, sessionId, llmService, sessionWorker);
          break;

        case 'report':
          await this.executeReportStep(step, adapter, sessionId, sessionWorker);
          break;

        default:
          logger.warn(`Unknown action: ${step.action}`);
      }
    } catch (error) {
      logger.error(`Step ${step.step} failed:`, error);
      // Continue with next step even if current step fails
    }
  }

  private async executeSearchStep(
    step: InteractionFlowStep,
    adapter: IPlatformAdapter
  ): Promise<void> {
    if (!step.query) {
      throw new Error('Search step requires query');
    }

    const posts = await adapter.searchPosts(step.query);

    this.stepResults.set(step.step, { posts });
    logger.info(`Search step ${step.step} found ${posts.length} posts`);
  }

  private async executeLikeStep(
    step: InteractionFlowStep,
    adapter: IPlatformAdapter,
    sessionId: number,
    sessionWorker: import('./SessionWorker').SessionWorker
  ): Promise<void> {
    const target = this.getStepTarget(step);
    if (!target) {
      throw new Error(`Like step ${step.step} requires target`);
    }

    const result = await adapter.likePost(target.url);
    await sessionWorker.recordInteraction(
      sessionId,
      'like',
      step.entity_type || 'post',
      result,
      undefined,
      step.step
    );
  }

  private async executeCommentStep(
    step: InteractionFlowStep,
    adapter: IPlatformAdapter,
    sessionId: number,
    llmService: import('../services/LLMService').LLMService,
    sessionWorker: import('./SessionWorker').SessionWorker
  ): Promise<void> {
    const target = this.getStepTarget(step);
    if (!target) {
      throw new Error(`Comment step ${step.step} requires target`);
    }

    let commentText = '';
    if (step.generate_comment) {
      commentText = await llmService.generateComment(target.content, {
        tone: 'neutral',
        maxLength: 150,
      });
    } else {
      throw new Error('Comment step requires generate_comment to be true or provide comment text');
    }

    const result = await adapter.commentOnPost(target.url, commentText);
    await sessionWorker.recordInteraction(
      sessionId,
      'comment',
      step.entity_type || 'post',
      result,
      commentText,
      step.step
    );
  }

  private async executeReplyStep(
    step: InteractionFlowStep,
    adapter: IPlatformAdapter,
    sessionId: number,
    llmService: import('../services/LLMService').LLMService,
    sessionWorker: import('./SessionWorker').SessionWorker
  ): Promise<void> {
    const target = this.getStepTarget(step, true);
    if (!target) {
      throw new Error(`Reply step ${step.step} requires target`);
    }

    let replyText = '';
    if (step.generate_comment) {
      replyText = await llmService.generateComment(target.content, {
        tone: 'neutral',
        maxLength: 150,
        isReply: true,
        parentComment: target.content,
      });
    } else {
      throw new Error('Reply step requires generate_comment to be true or provide reply text');
    }

    const result = await adapter.replyToComment(target.url, replyText);
    await sessionWorker.recordInteraction(
      sessionId,
      'reply',
      step.entity_type || 'comment',
      result,
      replyText,
      step.step
    );
  }

  private async executeReportStep(
    step: InteractionFlowStep,
    adapter: IPlatformAdapter,
    sessionId: number,
    sessionWorker: import('./SessionWorker').SessionWorker
  ): Promise<void> {
    const target = this.getStepTarget(step);
    if (!target) {
      throw new Error(`Report step ${step.step} requires target`);
    }

    const reason = (step as any).reason || 'Spam';
    const result = await adapter.reportPost(target.url, reason);
    await sessionWorker.recordInteraction(
      sessionId,
      'report',
      step.entity_type || 'post',
      result,
      undefined,
      step.step
    );
  }

  private getStepTarget(step: InteractionFlowStep, isComment = false): Post | Comment | null {
    if (step.target) {
      // Parse target reference like "search_results[0]" or "comments[0]"
      const match = step.target.match(/^(search_results|comments)\[(\d+)\]$/);
      if (match) {
        const resultType = match[1];
        const index = parseInt(match[2], 10);

        // Find the step that produced this result
        for (const [stepNum, result] of this.stepResults.entries()) {
          if (stepNum >= step.step) {
            break; // Only look at previous steps
          }

          if (resultType === 'search_results' && result.posts) {
            if (result.posts[index]) {
              return result.posts[index];
            }
          } else if (resultType === 'comments' && result.comments) {
            if (result.comments[index]) {
              return result.comments[index];
            }
          }
        }
      }
    }

    // Fallback: try to get from most recent search results
    if (!isComment) {
      for (const result of Array.from(this.stepResults.values()).reverse()) {
        if (result.posts && result.posts.length > 0) {
          return result.posts[0];
        }
      }
    } else {
      for (const result of Array.from(this.stepResults.values()).reverse()) {
        if (result.comments && result.comments.length > 0) {
          return result.comments[0];
        }
      }
    }

    return null;
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}

// Singleton instance
let scenarioExecutor: ScenarioExecutor | null = null;

export function getScenarioExecutor(): ScenarioExecutor {
  if (!scenarioExecutor) {
    scenarioExecutor = new ScenarioExecutor();
  }
  return scenarioExecutor;
}

