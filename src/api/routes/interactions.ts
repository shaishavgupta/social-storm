import { FastifyInstance } from 'fastify';
import { getDbConnection } from '../../database/connection';
import { Interaction } from '../../models/Interaction';
import { logger } from '../../utils/logger';
import { authenticateSuperuser } from '../middleware/auth';

export async function interactionsRoutes(fastify: FastifyInstance): Promise<void> {
  // Query interactions
  fastify.get('/api/interactions', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const query = request.query as {
        sessionId?: string;
        accountId?: string;
        actionType?: string;
        entityType?: string;
        limit?: string;
        offset?: string;
      };
      const db = getDbConnection();

      let sql = 'SELECT * FROM interactions WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.sessionId) {
        sql += ` AND session_id = $${paramIndex}`;
        params.push(parseInt(query.sessionId, 10));
        paramIndex++;
      }

      if (query.accountId) {
        sql += ` AND interacted_by_account_id = $${paramIndex}`;
        params.push(parseInt(query.accountId, 10));
        paramIndex++;
      }

      if (query.actionType) {
        sql += ` AND action_type = $${paramIndex}`;
        params.push(query.actionType);
        paramIndex++;
      }

      if (query.entityType) {
        sql += ` AND entity_type = $${paramIndex}`;
        params.push(query.entityType);
        paramIndex++;
      }

      sql += ' ORDER BY timestamp DESC';

      if (query.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(parseInt(query.limit, 10));
        paramIndex++;
      }

      if (query.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(parseInt(query.offset, 10));
        paramIndex++;
      }

      const result = await db.query(sql, params);
      const interactions = result.rows.map((row) => mapRowToInteraction(row));

      return reply.send({ interactions });
    } catch (error) {
      logger.error('Failed to query interactions:', error);
      return reply.code(500).send({ error: 'Failed to query interactions' });
    }
  });
}

function mapRowToInteraction(row: any): Interaction {
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

