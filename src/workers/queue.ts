import { Queue, QueueEvents, QueueOptions } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export interface SessionJobData {
  sessionId: number;
  socialAccountId: number;
  scenarioId?: number;
}

export const SESSION_QUEUE_NAME = 'session-execution';
export const SCENARIO_QUEUE_NAME = 'scenario-execution';

// Shared queue configuration
const queueConfig: QueueOptions = {
  connection: getRedisClient(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Create queues
export const sessionQueue = new Queue<SessionJobData>(SESSION_QUEUE_NAME, queueConfig);

export const scenarioQueue = new Queue<SessionJobData>(SCENARIO_QUEUE_NAME, queueConfig);

// Queue events for monitoring
export const sessionQueueEvents = new QueueEvents(SESSION_QUEUE_NAME, {
  connection: getRedisClient(),
});

export const scenarioQueueEvents = new QueueEvents(SCENARIO_QUEUE_NAME, {
  connection: getRedisClient(),
});

// Log queue events
sessionQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Session job ${jobId} completed`);
});

sessionQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Session job ${jobId} failed: ${failedReason}`);
});

scenarioQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Scenario job ${jobId} completed`);
});

scenarioQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Scenario job ${jobId} failed: ${failedReason}`);
});

/**
 * Adds a session execution job to the queue
 */
export async function addSessionJob(data: SessionJobData): Promise<void> {
  await sessionQueue.add('execute-session', data, {
    priority: 1,
    jobId: `session-${data.sessionId}`,
  });
  logger.info(`Session job added for session ${data.sessionId}`);
}

/**
 * Adds a scenario execution job to the queue
 */
export async function addScenarioJob(data: SessionJobData): Promise<void> {
  await scenarioQueue.add('execute-scenario', data, {
    priority: 1,
    jobId: `scenario-${data.sessionId}`,
  });
  logger.info(`Scenario job added for session ${data.sessionId}`);
}

/**
 * Gracefully closes all queues and their events
 */
export async function closeQueues(): Promise<void> {
  try {
    await Promise.all([
      sessionQueue.close(),
      scenarioQueue.close(),
      sessionQueueEvents.close(),
      scenarioQueueEvents.close(),
    ]);
    logger.info('All queues and queue events closed');
  } catch (error) {
    logger.error('Error closing queues:', error);
    throw error;
  }
}

/**
 * Gets queue statistics for monitoring
 */
export async function getQueueStats() {
  const [sessionStats, scenarioStats] = await Promise.all([
    sessionQueue.getJobCounts(),
    scenarioQueue.getJobCounts(),
  ]);

  return {
    session: {
      waiting: sessionStats.waiting,
      active: sessionStats.active,
      completed: sessionStats.completed,
      failed: sessionStats.failed,
      delayed: sessionStats.delayed,
    },
    scenario: {
      waiting: scenarioStats.waiting,
      active: scenarioStats.active,
      completed: scenarioStats.completed,
      failed: scenarioStats.failed,
      delayed: scenarioStats.delayed,
    },
  };
}

