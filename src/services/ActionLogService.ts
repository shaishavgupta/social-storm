import { getDbConnection } from '../database/connection';
import { logger } from '../utils/logger';
import { ActionLog, CreateActionLogParams, ActionType } from '../models/ActionLog';

export class ActionLogService {
  /**
   * Logs an action to the database
   */
  async logAction(params: CreateActionLogParams): Promise<ActionLog> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        `INSERT INTO action_logs (
          session_id, profile_id, social_account_id, action_type, target, url, metadata_json, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          params.sessionId,
          params.profileId || null,
          params.socialAccountId,
          params.actionType,
          params.target || null,
          params.url || null,
          params.metadata ? JSON.stringify(params.metadata) : null,
        ]
      );

      return this.mapRowToActionLog(result.rows[0]);
    } catch (error) {
      logger.error('Failed to log action:', error);
      throw error;
    }
  }

  /**
   * Logs a SESSION_ERROR action with error details
   */
  async logSessionError(
    sessionId: number,
    profileId: number | undefined,
    socialAccountId: number,
    error: Error,
    metadata?: Record<string, unknown>
  ): Promise<ActionLog> {
    return this.logAction({
      sessionId,
      profileId,
      socialAccountId,
      actionType: 'SESSION_ERROR',
      metadata: {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...metadata,
      },
    });
  }

  /**
   * Gets all action logs for a session
   */
  async getSessionLogs(sessionId: number): Promise<ActionLog[]> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        'SELECT * FROM action_logs WHERE session_id = $1 ORDER BY timestamp ASC',
        [sessionId]
      );

      return result.rows.map((row) => this.mapRowToActionLog(row));
    } catch (error) {
      logger.error('Failed to get session logs:', error);
      throw error;
    }
  }

  /**
   * Gets action logs for a profile
   */
  async getProfileLogs(profileId: number, limit?: number): Promise<ActionLog[]> {
    const db = getDbConnection();

    try {
      const query = limit
        ? 'SELECT * FROM action_logs WHERE profile_id = $1 ORDER BY timestamp DESC LIMIT $2'
        : 'SELECT * FROM action_logs WHERE profile_id = $1 ORDER BY timestamp DESC';

      const params = limit ? [profileId, limit] : [profileId];
      const result = await db.query(query, params);

      return result.rows.map((row) => this.mapRowToActionLog(row));
    } catch (error) {
      logger.error('Failed to get profile logs:', error);
      throw error;
    }
  }

  private mapRowToActionLog(row: any): ActionLog {
    return {
      id: row.id,
      sessionId: row.session_id,
      profileId: row.profile_id,
      socialAccountId: row.social_account_id,
      timestamp: row.timestamp,
      actionType: row.action_type as ActionType,
      target: row.target,
      url: row.url,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }
}

// Singleton instance
let actionLogService: ActionLogService | null = null;

export function getActionLogService(): ActionLogService {
  if (!actionLogService) {
    actionLogService = new ActionLogService();
  }
  return actionLogService;
}

