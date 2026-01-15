import { FastifyRequest, FastifyReply } from 'fastify';
import { getDbConnection } from '../../database/connection';
import { logger } from '../../utils/logger';

export interface SuperuserContext {
  id: number;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    superuser?: SuperuserContext;
  }
}

export async function authenticateSuperuser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing or invalid authorization header' });
      return;
    }

    // Verify JWT token
    try {
      const decoded = await request.jwtVerify<{ id: number; username: string }>();

      // Verify superuser exists
      const db = getDbConnection();
      const result = await db.query('SELECT id, username FROM superuser WHERE id = $1', [
        decoded.id,
      ]);

      if (result.rows.length === 0) {
        reply.code(401).send({ error: 'Invalid token: superuser not found' });
        return;
      }

      // Attach superuser context to request
      request.superuser = {
        id: result.rows[0].id,
        username: result.rows[0].username,
      };
    } catch (error) {
      logger.error('JWT verification failed:', error);
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    reply.code(500).send({ error: 'Authentication failed' });
    return;
  }
}

