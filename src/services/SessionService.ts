import { getDbConnection } from '../database/connection';
import { Session, SessionStatus } from '../models/Session';
import { logger } from '../utils/logger';
import { getEncryptionService } from './EncryptionService';

const MIN_SESSION_DURATION_MS = 8 * 60 * 1000; // 8 minutes
const MAX_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SESSIONS_PER_DAY = 3;

export interface CreateSessionParams {
  socialAccountId: number;
  scenarioId?: number;
}

export class SessionService {
  /**
   * Creates a new session
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    const db = getDbConnection();

    // Check if account has reached daily limit
    await this.checkDailyLimit(params.socialAccountId);

    try {
      const result = await db.query(
        `INSERT INTO sessions (social_account_id, scenario_id, started_at, status, actions_count)
         VALUES ($1, $2, NOW(), 'running', 0)
         RETURNING *`,
        [params.socialAccountId, params.scenarioId || null]
      );

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Checks if account has reached daily session limit
   */
  private async checkDailyLimit(socialAccountId: number): Promise<void> {
    const db = getDbConnection();

    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM sessions
       WHERE social_account_id = $1
         AND DATE(started_at) = CURRENT_DATE
         AND status IN ('running', 'completed')`,
      [socialAccountId]
    );

    const count = parseInt(result.rows[0]?.count || '0', 10);
    if (count >= MAX_SESSIONS_PER_DAY) {
      throw new Error(
        `Account has reached the maximum of ${MAX_SESSIONS_PER_DAY} sessions per day`
      );
    }
  }

  /**
   * Updates session status
   */
  async updateSessionStatus(
    sessionId: number,
    status: SessionStatus,
    endedAt?: Date
  ): Promise<Session> {
    const db = getDbConnection();

    try {
      // Calculate duration if ending session
      let duration = null;
      if (endedAt) {
        const session = await this.getSession(sessionId);
        duration = Math.floor((endedAt.getTime() - session.started_at.getTime()) / 1000);
      }

      const result = await db.query(
        `UPDATE sessions
         SET status = $1, ended_at = $2, duration = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status, endedAt || null, duration, sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update session status:', error);
      throw error;
    }
  }

  /**
   * Ends a session
   */
  async endSession(sessionId: number, status: SessionStatus = 'completed'): Promise<Session> {
    return this.updateSessionStatus(sessionId, status, new Date());
  }

  /**
   * Gets a session by ID
   */
  async getSession(sessionId: number): Promise<Session> {
    const db = getDbConnection();

    try {
      const result = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);

      if (result.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get session:', error);
      throw error;
    }
  }

  /**
   * Lists sessions with optional filters
   */
  async listSessions(filters?: {
    socialAccountId?: number;
    scenarioId?: number;
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  }): Promise<Session[]> {
    const db = getDbConnection();

    try {
      let sql = 'SELECT * FROM sessions WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters?.socialAccountId) {
        sql += ` AND social_account_id = $${paramIndex}`;
        params.push(filters.socialAccountId);
        paramIndex++;
      }

      if (filters?.scenarioId) {
        sql += ` AND scenario_id = $${paramIndex}`;
        params.push(filters.scenarioId);
        paramIndex++;
      }

      if (filters?.status) {
        sql += ` AND status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
      }

      sql += ' ORDER BY started_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }

      if (filters?.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
        paramIndex++;
      }

      const result = await db.query(sql, params);
      return result.rows.map((row) => this.mapRowToSession(row));
    } catch (error) {
      logger.error('Failed to list sessions:', error);
      throw error;
    }
  }

  /**
   * Increments action count for a session
   */
  async incrementActionCount(sessionId: number): Promise<void> {
    const db = getDbConnection();

    try {
      await db.query(
        'UPDATE sessions SET actions_count = actions_count + 1 WHERE id = $1',
        [sessionId]
      );
    } catch (error) {
      logger.error('Failed to increment action count:', error);
      throw error;
    }
  }

  /**
   * Checks if session duration is within limits
   */
  async checkSessionDuration(sessionId: number): Promise<{
    isValid: boolean;
    currentDuration: number;
    minDuration: number;
    maxDuration: number;
  }> {
    const session = await this.getSession(sessionId);
    const now = new Date();
    const currentDuration = Math.floor((now.getTime() - session.started_at.getTime()) / 1000);

    return {
      isValid: currentDuration >= MIN_SESSION_DURATION_MS / 1000 && currentDuration <= MAX_SESSION_DURATION_MS / 1000,
      currentDuration,
      minDuration: MIN_SESSION_DURATION_MS / 1000,
      maxDuration: MAX_SESSION_DURATION_MS / 1000,
    };
  }

  /**
   * Gets decrypted credentials for a social account
   */
  async getDecryptedCredentials(socialAccountId: number): Promise<import('../models/SocialAccount').SocialAccountCredentials> {
    const db = getDbConnection();
    const encryptionService = getEncryptionService();

    try {
      const result = await db.query(
        'SELECT encrypted_credentials FROM social_accounts WHERE id = $1',
        [socialAccountId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Social account ${socialAccountId} not found`);
      }

      return encryptionService.decrypt(result.rows[0].encrypted_credentials);
    } catch (error) {
      logger.error('Failed to get decrypted credentials:', error);
      throw error;
    }
  }

  /**
   * Saves browser state for a session
   */
  async saveBrowserState(sessionId: number, browserState: string): Promise<void> {
    const db = getDbConnection();

    try {
      await db.query(
        'UPDATE sessions SET browser_state = $1, updated_at = NOW() WHERE id = $2',
        [browserState, sessionId]
      );
      logger.info(`Browser state saved for session ${sessionId}`);
    } catch (error) {
      logger.error('Failed to save browser state:', error);
      throw error;
    }
  }

  /**
   * Gets browser state for a session
   */
  async getBrowserState(sessionId: number): Promise<string | null> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        'SELECT browser_state FROM sessions WHERE id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      return result.rows[0].browser_state || null;
    } catch (error) {
      logger.error('Failed to get browser state:', error);
      throw error;
    }
  }

  /**
   * Gets the most recent browser state for a social account
   */
  async getLatestBrowserState(socialAccountId: number): Promise<string | null> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        `SELECT browser_state FROM sessions
         WHERE social_account_id = $1
           AND browser_state IS NOT NULL
           AND status = 'completed'
         ORDER BY ended_at DESC
         LIMIT 1`,
        [socialAccountId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].browser_state || null;
    } catch (error) {
      logger.error('Failed to get latest browser state:', error);
      throw error;
    }
  }

  private mapRowToSession(row: any): Session {
    return {
      id: row.id,
      social_account_id: row.social_account_id,
      scenario_id: row.scenario_id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration: row.duration ? parseInt(row.duration, 10) : null,
      status: row.status,
      actions_count: row.actions_count,
      browser_state: row.browser_state || null,
    };
  }
}

// Singleton instance
let sessionService: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionService) {
    sessionService = new SessionService();
  }
  return sessionService;
}

