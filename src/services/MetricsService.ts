import { getDbConnection } from '../database/connection';
import { Metric } from '../models/Metric';
import { Platform } from '../models/SocialAccount';
import { logger } from '../utils/logger';

export interface MetricsQuery {
  sessionId?: number;
  platform?: Platform;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AggregatedMetrics {
  totalSessions: number;
  totalInteractions: number;
  successRate: number;
  averageLatency: number;
  failureRate: number;
  engagementRate: number;
  platformBreakdown: Record<string, {
    sessions: number;
    interactions: number;
    successRate: number;
  }>;
}

export class MetricsService {
  /**
   * Creates a metric record
   */
  async createMetric(
    sessionId: number,
    platform: Platform,
    engagementRate?: number,
    latencyMs?: number,
    failureRate?: number
  ): Promise<Metric> {
    const db = getDbConnection();

    try {
      const result = await db.query(
        `INSERT INTO metrics (session_id, platform, engagement_rate, latency_ms, failure_rate, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [sessionId, platform, engagementRate, latencyMs, failureRate]
      );

      return this.mapRowToMetric(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create metric:', error);
      throw error;
    }
  }

  /**
   * Calculates and stores metrics for a session
   */
  async calculateSessionMetrics(sessionId: number): Promise<Metric> {
    const db = getDbConnection();

    try {
      // Get session info
      const sessionResult = await db.query(
        'SELECT social_account_id, platform FROM sessions s JOIN social_accounts sa ON s.social_account_id = sa.id WHERE s.id = $1',
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const platform = sessionResult.rows[0].platform as Platform;

      // Calculate metrics from interactions
      const metricsResult = await db.query(
        `SELECT
          COUNT(*) as total_interactions,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successful_interactions,
          AVG(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp))) * 1000) as avg_latency
         FROM interactions
         WHERE session_id = $1`,
        [sessionId]
      );

      const totalInteractions = parseInt(metricsResult.rows[0]?.total_interactions || '0', 10);
      const successfulInteractions = parseInt(
        metricsResult.rows[0]?.successful_interactions || '0',
        10
      );
      const avgLatency = parseFloat(metricsResult.rows[0]?.avg_latency || '0');

      const successRate = totalInteractions > 0 ? (successfulInteractions / totalInteractions) * 100 : 0;
      const failureRate = 100 - successRate;
      const engagementRate = totalInteractions > 0 ? (successfulInteractions / totalInteractions) * 100 : 0;

      return await this.createMetric(sessionId, platform, engagementRate, avgLatency, failureRate);
    } catch (error) {
      logger.error('Failed to calculate session metrics:', error);
      throw error;
    }
  }

  /**
   * Queries metrics with filters
   */
  async queryMetrics(query: MetricsQuery): Promise<Metric[]> {
    const db = getDbConnection();

    try {
      let sql = 'SELECT * FROM metrics WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.sessionId) {
        sql += ` AND session_id = $${paramIndex}`;
        params.push(query.sessionId);
        paramIndex++;
      }

      if (query.platform) {
        sql += ` AND platform = $${paramIndex}`;
        params.push(query.platform);
        paramIndex++;
      }

      if (query.startDate) {
        sql += ` AND created_at >= $${paramIndex}`;
        params.push(query.startDate);
        paramIndex++;
      }

      if (query.endDate) {
        sql += ` AND created_at <= $${paramIndex}`;
        params.push(query.endDate);
        paramIndex++;
      }

      sql += ' ORDER BY created_at DESC';

      if (query.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(query.limit);
        paramIndex++;
      }

      if (query.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(query.offset);
        paramIndex++;
      }

      const result = await db.query(sql, params);
      return result.rows.map((row) => this.mapRowToMetric(row));
    } catch (error) {
      logger.error('Failed to query metrics:', error);
      throw error;
    }
  }

  /**
   * Gets aggregated metrics
   */
  async getAggregatedMetrics(query: MetricsQuery): Promise<AggregatedMetrics> {
    const db = getDbConnection();

    try {
      let sql = `
        SELECT
          COUNT(DISTINCT m.session_id) as total_sessions,
          COUNT(m.id) as total_metrics,
          AVG(m.engagement_rate) as avg_engagement_rate,
          AVG(m.latency_ms) as avg_latency,
          AVG(m.failure_rate) as avg_failure_rate,
          m.platform
        FROM metrics m
        WHERE 1=1
      `;
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.startDate) {
        sql += ` AND m.created_at >= $${paramIndex}`;
        params.push(query.startDate);
        paramIndex++;
      }

      if (query.endDate) {
        sql += ` AND m.created_at <= $${paramIndex}`;
        params.push(query.endDate);
        paramIndex++;
      }

      sql += ' GROUP BY m.platform';

      const result = await db.query(sql, params);

      // Get total interactions
      let interactionsSql = 'SELECT COUNT(*) as total FROM interactions WHERE 1=1';
      const interactionsParams: unknown[] = [];
      let interactionsParamIndex = 1;

      if (query.startDate) {
        interactionsSql += ` AND timestamp >= $${interactionsParamIndex}`;
        interactionsParams.push(query.startDate);
        interactionsParamIndex++;
      }

      if (query.endDate) {
        interactionsSql += ` AND timestamp <= $${interactionsParamIndex}`;
        interactionsParams.push(query.endDate);
        interactionsParamIndex++;
      }

      const interactionsResult = await db.query(interactionsSql, interactionsParams);
      const totalInteractions = parseInt(interactionsResult.rows[0]?.total || '0', 10);

      // Calculate overall metrics
      const totalSessions = result.rows.reduce((sum, row) => sum + parseInt(row.total_sessions || '0', 10), 0);
      const avgEngagementRate = result.rows.length > 0
        ? result.rows.reduce((sum, row) => sum + parseFloat(row.avg_engagement_rate || '0'), 0) / result.rows.length
        : 0;
      const avgLatency = result.rows.length > 0
        ? result.rows.reduce((sum, row) => sum + parseFloat(row.avg_latency || '0'), 0) / result.rows.length
        : 0;
      const avgFailureRate = result.rows.length > 0
        ? result.rows.reduce((sum, row) => sum + parseFloat(row.avg_failure_rate || '0'), 0) / result.rows.length
        : 0;

      // Platform breakdown
      const platformBreakdown: Record<string, any> = {};
      for (const row of result.rows) {
        platformBreakdown[row.platform] = {
          sessions: parseInt(row.total_sessions || '0', 10),
          interactions: 0, // Would need to join with interactions table for accurate count
          successRate: 100 - parseFloat(row.avg_failure_rate || '0'),
        };
      }

      return {
        totalSessions,
        totalInteractions,
        successRate: 100 - avgFailureRate,
        averageLatency: avgLatency,
        failureRate: avgFailureRate,
        engagementRate: avgEngagementRate,
        platformBreakdown,
      };
    } catch (error) {
      logger.error('Failed to get aggregated metrics:', error);
      throw error;
    }
  }

  private mapRowToMetric(row: any): Metric {
    return {
      id: row.id,
      session_id: row.session_id,
      platform: row.platform,
      engagement_rate: row.engagement_rate ? parseFloat(row.engagement_rate) : null,
      latency_ms: row.latency_ms ? parseInt(row.latency_ms, 10) : null,
      failure_rate: row.failure_rate ? parseFloat(row.failure_rate) : null,
      created_at: row.created_at,
    };
  }
}

// Singleton instance
let metricsService: MetricsService | null = null;

export function getMetricsService(): MetricsService {
  if (!metricsService) {
    metricsService = new MetricsService();
  }
  return metricsService;
}

