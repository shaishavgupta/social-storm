import { BrowserContext, Page } from 'playwright';
import { openGoLoginSession, GoLoginSession } from '../browser/gologinPlaywright';
import { ProfileManager } from '../gologin/profileManager';
import { getActionLogService } from '../services/ActionLogService';
import { getBrowserStateSnapshotService } from '../services/BrowserStateSnapshotService';
import { createActionLogContext, ActionLogContext } from '../utils/actionLogger';
import { getSessionService } from '../services/SessionService';
import { getDbConnection } from '../database/connection';
import { Platform } from '../models/SocialAccount';
import { logger } from '../utils/logger';

export interface SessionRunnerOptions {
  socialAccountId: number;
  flowType?: string;
}

export interface SessionRunnerContext {
  sessionId: number;
  profileId: number;
  socialAccountId: number;
  browser: import('playwright').Browser;
  context: BrowserContext;
  page: Page;
  logContext: ActionLogContext;
  stop: () => Promise<void>;
}

/**
 * SessionRunner orchestrates the full flow:
 * - Gets/creates GoLogin profile
 * - Opens GoLogin session
 * - Sets up action logging
 * - Handles cleanup and snapshots
 */
export class SessionRunner {
  private gologinToken: string;

  constructor(gologinToken: string) {
    if (!gologinToken) {
      throw new Error('GoLogin token is required');
    }
    this.gologinToken = gologinToken;
  }

  /**
   * Starts a session with GoLogin profile management
   */
  async startSession(options: SessionRunnerOptions): Promise<SessionRunnerContext> {
    const { socialAccountId } = options;

    // Get platform for profile manager
    const db = getDbConnection();
    const accountResult = await db.query('SELECT platform FROM social_accounts WHERE id = $1', [
      socialAccountId,
    ]);

    if (accountResult.rows.length === 0) {
      throw new Error(`Social account ${socialAccountId} not found`);
    }

    const platform = accountResult.rows[0].platform as Platform;

    // Get or create profile
    const profileManager = new ProfileManager(this.gologinToken);
    const profile = await profileManager.getValidProfileForUser(socialAccountId, platform);

    logger.info(`Using GoLogin profile ${profile.gologinProfileId} for social account ${socialAccountId}`);

    // Update last used timestamp
    await profileManager.updateLastUsed(profile.id);

    // Create session (reuse existing session creation logic)
    const sessionService = getSessionService();
    const session = await sessionService.createSession({
      socialAccountId,
    });

    // Open GoLogin session
    let goLoginSession: GoLoginSession;
    try {
      goLoginSession = await openGoLoginSession({
        gologinToken: this.gologinToken,
        profileId: profile.gologinProfileId,
      });
    } catch (error) {
      // If profile fails to start, mark as expired and try with a new profile
      logger.error(`Failed to start GoLogin session for profile ${profile.gologinProfileId}:`, error);
      await profileManager.markProfileAsExpired(profile.id);

      // Try again with a new profile
      const newProfile = await profileManager.getValidProfileForUser(socialAccountId, platform);
      goLoginSession = await openGoLoginSession({
        gologinToken: this.gologinToken,
        profileId: newProfile.gologinProfileId,
      });
      await profileManager.updateLastUsed(newProfile.id);
    }

    // Create action logging context
    const logContext = createActionLogContext(session.id, profile.id, socialAccountId);

    // Log session start
    await logContext.logAction({
      actionType: 'CUSTOM',
      metadata: {
        actionName: 'SESSION_START',
        profileId: profile.gologinProfileId,
      },
    });

    return {
      sessionId: session.id,
      profileId: profile.id,
      socialAccountId,
      browser: goLoginSession.browser,
      context: goLoginSession.context,
      page: goLoginSession.page,
      logContext,
      stop: goLoginSession.stop,
    };
  }

  /**
   * Completes a session with snapshot and cleanup
   */
  async completeSession(
    sessionContext: SessionRunnerContext,
    error?: Error
  ): Promise<void> {
    const { sessionId, profileId, socialAccountId, context: browserContext, page, stop, logContext } = sessionContext;

    try {
      // Log session error if present
      if (error) {
        const actionLogService = getActionLogService();
        await actionLogService.logSessionError(sessionId, profileId, socialAccountId, error);
      }

      // Create browser state snapshot
      try {
        const snapshotService = getBrowserStateSnapshotService();
        await snapshotService.captureSnapshot(sessionId, profileId, browserContext, page);
        logger.info(`Created browser state snapshot for session ${sessionId}`);
      } catch (snapshotError) {
        logger.warn(`Failed to create browser state snapshot for session ${sessionId}:`, snapshotError);
      }

      // Detect account bans (check for specific error patterns or pages)
      if (error) {
        const errorMessage = error.message.toLowerCase();
        const banIndicators = ['banned', 'suspended', 'blocked', 'account disabled', '403', 'forbidden'];

        if (banIndicators.some((indicator) => errorMessage.includes(indicator))) {
          logger.warn(`Potential account ban detected for session ${sessionId}, marking profile as BANNED`);
          const profileManager = new ProfileManager(this.gologinToken);
          await profileManager.markProfileAsBanned(profileId);
        }
      }

      // Log session end
      await logContext.logAction({
        actionType: 'CUSTOM',
        metadata: {
          actionName: 'SESSION_END',
          error: error ? error.message : undefined,
        },
      });
    } catch (cleanupError) {
      logger.error(`Error during session completion for ${sessionId}:`, cleanupError);
    } finally {
      // Always stop the GoLogin session
      try {
        await stop();
        logger.info(`Stopped GoLogin session for session ${sessionId}`);
      } catch (stopError) {
        logger.error(`Error stopping GoLogin session for session ${sessionId}:`, stopError);
      }
    }
  }
}

