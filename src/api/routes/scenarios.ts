import { FastifyInstance } from 'fastify';
import { getScenarioService } from '../../services/ScenarioService';
import { InteractionFlowStep } from '../../models/Scenario';
import { Platform } from '../../models/SocialAccount';
import { logger } from '../../utils/logger';
import { authenticateSuperuser } from '../middleware/auth';
import { z } from 'zod';

const createScenarioSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(['twitter', 'facebook']),
  interactionFlow: z.array(z.any()),
  targetingRules: z.record(z.unknown()).optional(),
});

const updateScenarioSchema = z.object({
  name: z.string().min(1).optional(),
  interactionFlow: z.array(z.any()).optional(),
  targetingRules: z.record(z.unknown()).optional(),
});

export async function scenariosRoutes(fastify: FastifyInstance): Promise<void> {
  // Create scenario
  fastify.post('/api/scenarios', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const body = createScenarioSchema.parse(request.body);
      const scenarioService = getScenarioService();

      const scenario = await scenarioService.createScenario({
        name: body.name,
        platform: body.platform as Platform,
        interactionFlow: body.interactionFlow as InteractionFlowStep[],
        targetingRules: body.targetingRules,
      });

      return reply.code(201).send(scenario);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid request body', details: error.errors });
      }
      logger.error('Failed to create scenario:', error);
      return reply.code(500).send({
        error: 'Failed to create scenario',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // List scenarios
  fastify.get('/api/scenarios', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const query = request.query as { platform?: string; limit?: string; offset?: string };
      const scenarioService = getScenarioService();

      const scenarios = await scenarioService.listScenarios({
        platform: query.platform as Platform | undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });

      return reply.send({ scenarios });
    } catch (error) {
      logger.error('Failed to list scenarios:', error);
      return reply.code(500).send({ error: 'Failed to list scenarios' });
    }
  });

  // Get scenario by ID
  fastify.get('/api/scenarios/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const scenarioService = getScenarioService();

      const scenario = await scenarioService.getScenario(parseInt(id, 10));
      return reply.send(scenario);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message });
      }
      logger.error('Failed to get scenario:', error);
      return reply.code(500).send({ error: 'Failed to get scenario' });
    }
  });

  // Update scenario
  fastify.put('/api/scenarios/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateScenarioSchema.parse(request.body);
      const scenarioService = getScenarioService();

      const scenario = await scenarioService.updateScenario(parseInt(id, 10), {
        name: body.name,
        interactionFlow: body.interactionFlow as InteractionFlowStep[] | undefined,
        targetingRules: body.targetingRules,
      });

      return reply.send(scenario);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid request body', details: error.errors });
      }
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message });
      }
      logger.error('Failed to update scenario:', error);
      return reply.code(500).send({
        error: 'Failed to update scenario',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Delete scenario
  fastify.delete('/api/scenarios/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const scenarioService = getScenarioService();

      await scenarioService.deleteScenario(parseInt(id, 10));
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message });
      }
      logger.error('Failed to delete scenario:', error);
      return reply.code(500).send({ error: 'Failed to delete scenario' });
    }
  });
}

