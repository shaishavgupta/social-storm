import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { logger } from '../utils/logger';
import { errorHandler } from './middleware/error-handler';
import { authRoutes } from './routes/auth';
import { socialAccountsRoutes } from './routes/social-accounts';
import { scenariosRoutes } from './routes/scenarios';
import { sessionsRoutes } from './routes/sessions';
import { interactionsRoutes } from './routes/interactions';
import { metricsRoutes } from './routes/metrics';
import { getSessionWorker } from '../workers/SessionWorker';
import { getScenarioExecutor } from '../workers/ScenarioExecutor';
import { sessionQueue, scenarioQueue } from '../workers/queue';

export async function startServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: logger,
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  });

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  // Health check endpoint (public, no auth)
  fastify.get('/api/health', async (_request, reply) => {
    try {
      // Check database connection
      const { getDbConnection } = await import('../database/connection');
      const db = getDbConnection();
      await db.query('SELECT 1');
      console.log((await db.query('SELECT * from superuser;')).rows);

      // Check Redis connection
      const { getRedisClient } = await import('../config/redis');
      const redis = getRedisClient();
      await redis.ping();

      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          redis: 'connected',
        },
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Register routes
  await fastify.register(authRoutes);
  await fastify.register(socialAccountsRoutes);
  await fastify.register(scenariosRoutes);
  await fastify.register(sessionsRoutes);
  await fastify.register(interactionsRoutes);
  await fastify.register(metricsRoutes);

  // Setup BullMQ Dashboard
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(sessionQueue) as any,
      new BullMQAdapter(scenarioQueue) as any,
    ],
    serverAdapter,
  });

  await fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' } as any);

  logger.info('BullMQ Dashboard available at http://localhost:' + (process.env.PORT || '3000') + '/admin/queues');

  // Initialize workers
  try {
    getSessionWorker();
    getScenarioExecutor();
    logger.info('Workers initialized');
  } catch (error) {
    logger.error('Failed to initialize workers:', error);
  }

  // Start server
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await fastify.listen({ port, host });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }

  return fastify;
}

