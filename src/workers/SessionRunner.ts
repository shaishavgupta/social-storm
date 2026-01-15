import { Browser, Page } from 'puppeteer-core';
import { openBrowserSession } from '../browser/browserLauncher';
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
  browser: Browser;
  page: Page;
  logContext: ActionLogContext;
  stop: () => Promise<void>;
}

/**
 * SessionRunner orchestrates the full flow:
 * - Gets/creates GoLogin profile (in GoLogin mode)
 * - Opens browser session (Chrome in local, GoLogin in dev/prod)
 * - Sets up action logging
 * - Handles cleanup and snapshots
 */
export class SessionRunner {
  private gologinToken: string | null;

  constructor(gologinToken?: string) {
    // gologinToken is optional in local/Chrome mode
    this.gologinToken = gologinToken || null;
  }

  /**
   * Checks if we should use Chrome (local mode)
   */
  private shouldUseChrome(): boolean {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    return nodeEnv === 'development' || nodeEnv === 'local';
  }

  /**
   * Starts a session with browser (Chrome in local, GoLogin in dev/prod)
   */
  async startSession(options: SessionRunnerOptions): Promise<SessionRunnerContext> {
    const { socialAccountId } = options;
    const useChrome = this.shouldUseChrome();

    // Get platform for profile manager (only needed in GoLogin mode)
    const db = getDbConnection();
    const accountResult = await db.query('SELECT platform FROM social_accounts WHERE id = $1', [
      socialAccountId,
    ]);

    if (accountResult.rows.length === 0) {
      throw new Error(`Social account ${socialAccountId} not found`);
    }

    const platform = accountResult.rows[0].platform as Platform;

    // Create session (reuse existing session creation logic)
    const sessionService = getSessionService();
    const session = await sessionService.createSession({
      socialAccountId,
    });

    let profileId: number;
    let profileGologinId: string | undefined;
    let browserSession;

    if (useChrome) {
      // Chrome mode: no profile management needed
      logger.info(`Using Chrome for local development (session ${session.id})`);

      browserSession = await openBrowserSession();
      profileId = 0; // Dummy profile ID for Chrome mode

      // Create action logging context (no profile ID in Chrome mode)
      const logContext = createActionLogContext(session.id, undefined, socialAccountId);

      // Log session start
      await logContext.logAction({
        actionType: 'CUSTOM',
        metadata: {
          actionName: 'SESSION_START',
          browserMode: 'chrome',
        },
      });

      return {
        sessionId: session.id,
        profileId,
        socialAccountId,
        browser: browserSession.browser,
        page: browserSession.page,
        logContext,
        stop: browserSession.stop,
      };
    } else {
      // GoLogin mode: profile management required
      if (!this.gologinToken) {
        throw new Error('GOLOGIN_TOKEN is required for GoLogin mode');
      }

      // Get or create profile
      const profileManager = new ProfileManager(this.gologinToken);
      const profile = await profileManager.getValidProfileForUser(socialAccountId, platform);

      logger.info(`Using GoLogin profile ${profile.gologinProfileId} for social account ${socialAccountId}`);

      // Update last used timestamp
      await profileManager.updateLastUsed(profile.id);
      profileId = profile.id;
      profileGologinId = profile.gologinProfileId;

      // Open browser session (GoLogin mode)
      try {
        browserSession = await openBrowserSession({
          gologinToken: this.gologinToken,
          profileId: profile.gologinProfileId,
        });
      } catch (error) {
        // If profile fails to start, mark as expired and try with a new profile
        logger.error(`Failed to start GoLogin session for profile ${profile.gologinProfileId}:`, error);
        await profileManager.markProfileAsExpired(profile.id);

        // Try again with a new profile
        const newProfile = await profileManager.getValidProfileForUser(socialAccountId, platform);
        browserSession = await openBrowserSession({
          gologinToken: this.gologinToken,
          profileId: newProfile.gologinProfileId,
        });
        await profileManager.updateLastUsed(newProfile.id);
        profileId = newProfile.id;
        profileGologinId = newProfile.gologinProfileId;
      }

      // Create action logging context
      const logContext = createActionLogContext(session.id, profileId, socialAccountId);

      // Log session start
      await logContext.logAction({
        actionType: 'CUSTOM',
        metadata: {
          actionName: 'SESSION_START',
          profileId: profileGologinId,
        },
      });

      return {
        sessionId: session.id,
        profileId,
        socialAccountId,
        browser: browserSession.browser,
        page: browserSession.page,
        logContext,
        stop: browserSession.stop,
      };
    }
  }

  /**
   * Completes a session with snapshot and cleanup
   */
  async completeSession(
    sessionContext: SessionRunnerContext,
    error?: Error
  ): Promise<void> {
    const { sessionId, profileId, socialAccountId, page, stop, logContext } = sessionContext;

    try {
      // Log session error if present
      if (error) {
        const actionLogService = getActionLogService();
        await actionLogService.logSessionError(sessionId, profileId, socialAccountId, error);
      }

      // Create browser state snapshot (only in GoLogin mode with valid profile)
      if (profileId > 0) {
        try {
          const snapshotService = getBrowserStateSnapshotService();
          await snapshotService.captureSnapshot(sessionId, profileId, page);
          logger.info(`Created browser state snapshot for session ${sessionId}`);
        } catch (snapshotError) {
          logger.warn(`Failed to create browser state snapshot for session ${sessionId}:`, snapshotError);
        }
      }

      // Detect account bans (check for specific error patterns or pages)
      // Only in GoLogin mode (profileId > 0 indicates real profile)
      if (error && profileId > 0 && this.gologinToken) {
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
      // Always stop the browser session
      try {
        await stop();
        logger.info(`Stopped browser session for session ${sessionId}`);
      } catch (stopError) {
        logger.error(`Error stopping browser session for session ${sessionId}:`, stopError);
      }
    }
  }
}

