import Redis from 'ioredis';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import path from 'path';

// Ensure dotenv is loaded (fallback in case it wasn't loaded in index.ts)
if (!process.env.REDIS_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set. Please check your .env file.');
    }

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });
  }

  return redisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

