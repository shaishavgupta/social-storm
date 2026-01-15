import { FastifyInstance } from 'fastify';
import { getSessionService } from '../../services/SessionService';
import { addSessionJob } from '../../workers/queue';
import { logger } from '../../utils/logger';
import { authenticateSuperuser } from '../middleware/auth';
import { z } from 'zod';

const triggerSessionSchema = z.object({
  socialAccountId: z.number().int().positive(),
});

export async function sessionsRoutes(fastify: FastifyInstance): Promise<void> {
  // Trigger a session (creates session and queues execution)
  fastify.post('/api/sessions/trigger', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const body = triggerSessionSchema.parse(request.body);
      const sessionService = getSessionService();

      // Create session
      const session = await sessionService.createSession({
        socialAccountId: body.socialAccountId,
      });

      // Queue session job (will handle login and scenario execution)
      await addSessionJob({
        sessionId: session.id,
        socialAccountId: body.socialAccountId,
      });

      return reply.code(201).send({ session, message: 'Session triggered' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid request body', details: error.errors });
      }
      logger.error('Failed to trigger session:', error);
      return reply.code(500).send({
        error: 'Failed to trigger session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // List sessions
  fastify.get('/api/sessions', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const query = request.query as {
        socialAccountId?: string;
        scenarioId?: string;
        status?: string;
        limit?: string;
        offset?: string;
      };
      const sessionService = getSessionService();

      const sessions = await sessionService.listSessions({
        socialAccountId: query.socialAccountId ? parseInt(query.socialAccountId, 10) : undefined,
        scenarioId: query.scenarioId ? parseInt(query.scenarioId, 10) : undefined,
        status: query.status as any,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });

      return reply.send({ sessions });
    } catch (error) {
      logger.error('Failed to list sessions:', error);
      return reply.code(500).send({ error: 'Failed to list sessions' });
    }
  });

  // Get session by ID
  fastify.get('/api/sessions/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const sessionService = getSessionService();

      const session = await sessionService.getSession(parseInt(id, 10));
      return reply.send(session);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message });
      }
      logger.error('Failed to get session:', error);
      return reply.code(500).send({ error: 'Failed to get session' });
    }
  });
}

