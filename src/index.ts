// import dotenv from 'dotenv';
// import path from 'path';

// Load environment variables from .env file in project root
// Using path.resolve to ensure we find .env regardless of current working directory
// dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { startServer } from './api/server';
import { closeQueues } from './workers/queue';
import { getSessionWorker } from './workers/SessionWorker';
import { getScenarioExecutor } from './workers/ScenarioExecutor';
import { closeRedisConnection } from './config/redis';
import { logger } from './utils/logger';

async function main() {
  let server: Awaited<ReturnType<typeof startServer>> | null = null;

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Close server
      if (server) {
        await server.close();
        logger.info('Server closed');
      }

      // Close workers
      const sessionWorker = getSessionWorker();
      const scenarioExecutor = getScenarioExecutor();
      await Promise.all([sessionWorker.close(), scenarioExecutor.close()]);
      logger.info('Workers closed');

      // Close queues
      await closeQueues();
      logger.info('Queues closed');

      // Close Redis connection
      await closeRedisConnection();
      logger.info('Redis connection closed');

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
  });

  try {
    // Start the server
    server = await startServer();
    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to start application:', error);
    await shutdown('startup-error');
  }
}

main();

