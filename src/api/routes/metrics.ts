import { FastifyInstance } from 'fastify';
import { getMetricsService } from '../../services/MetricsService';
import { Platform } from '../../models/SocialAccount';
import { logger } from '../../utils/logger';
import { authenticateSuperuser } from '../middleware/auth';

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  // Query metrics
  fastify.get('/api/metrics', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const query = request.query as {
        sessionId?: string;
        platform?: string;
        startDate?: string;
        endDate?: string;
        limit?: string;
        offset?: string;
        aggregated?: string;
      };
      const metricsService = getMetricsService();

      if (query.aggregated === 'true') {
        // Get aggregated metrics
        const aggregated = await metricsService.getAggregatedMetrics({
          sessionId: query.sessionId ? parseInt(query.sessionId, 10) : undefined,
          platform: query.platform as Platform | undefined,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
        });

        return reply.send(aggregated);
      } else {
        // Get individual metrics
        const metrics = await metricsService.queryMetrics({
          sessionId: query.sessionId ? parseInt(query.sessionId, 10) : undefined,
          platform: query.platform as Platform | undefined,
          startDate: query.startDate ? new Date(query.startDate) : undefined,
          endDate: query.endDate ? new Date(query.endDate) : undefined,
          limit: query.limit ? parseInt(query.limit, 10) : undefined,
          offset: query.offset ? parseInt(query.offset, 10) : undefined,
        });

        return reply.send({ metrics });
      }
    } catch (error) {
      logger.error('Failed to query metrics:', error);
      return reply.code(500).send({ error: 'Failed to query metrics' });
    }
  });
}

