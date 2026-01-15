import { getDbConnection } from '../database/connection';
import { Scenario, InteractionFlowStep } from '../models/Scenario';
import { Platform } from '../models/SocialAccount';
import { logger } from '../utils/logger';
import { z } from 'zod';

const InteractionFlowStepSchema = z.object({
  step: z.number().int().positive(),
  action: z.enum(['search', 'like', 'comment', 'reply', 'report']),
  entity_type: z.enum(['post', 'comment']).optional(),
  query: z.string().optional(),
  target: z.string().optional(),
  generate_comment: z.boolean().optional(),
  filters: z.record(z.unknown()).optional(),
});

const InteractionFlowSchema = z.array(InteractionFlowStepSchema);

export interface CreateScenarioParams {
  name: string;
  platform: Platform;
  interactionFlow: InteractionFlowStep[];
  targetingRules?: Record<string, unknown>;
}

export interface UpdateScenarioParams {
  name?: string;
  interactionFlow?: InteractionFlowStep[];
  targetingRules?: Record<string, unknown>;
}

export class ScenarioService {
  /**
   * Creates a new scenario
   */
  async createScenario(params: CreateScenarioParams): Promise<Scenario> {
    // Validate interaction flow
    this.validateInteractionFlow(params.interactionFlow, params.platform);

    const db = getDbConnection();

    try {
      const result = await db.query(
        `INSERT INTO scenarios (name, platform, interaction_flow_json, targeting_rules, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING *`,
        [
          params.name,
          params.platform,
          JSON.stringify(params.interactionFlow),
          params.targetingRules ? JSON.stringify(params.targetingRules) : null,
        ]
      );

      return this.mapRowToScenario(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create scenario:', error);
      throw error;
    }
  }

  /**
   * Updates a scenario
   */
  async updateScenario(scenarioId: number, params: UpdateScenarioParams): Promise<Scenario> {
    const db = getDbConnection();

    // Get existing scenario to validate platform
    const existing = await this.getScenario(scenarioId);

    // Validate interaction flow if provided
    if (params.interactionFlow) {
      this.validateInteractionFlow(params.interactionFlow, existing.platform);
    }

    try {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (params.name) {
        updates.push(`name = $${paramIndex}`);
        values.push(params.name);
        paramIndex++;
      }

      if (params.interactionFlow) {
        updates.push(`interaction_flow_json = $${paramIndex}`);
        values.push(JSON.stringify(params.interactionFlow));
        paramIndex++;
      }

      if (params.targetingRules !== undefined) {
        updates.push(`targeting_rules = $${paramIndex}`);
        values.push(params.targetingRules ? JSON.stringify(params.targetingRules) : null);
        paramIndex++;
      }

      if (updates.length === 0) {
        return existing;
      }

      updates.push(`updated_at = NOW()`);
      values.push(scenarioId);

      const sql = `UPDATE scenarios SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      const result = await db.query(sql, values);

      return this.mapRowToScenario(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update scenario:', error);
      throw error;
    }
  }

  /**
   * Gets a scenario by ID
   */
  async getScenario(scenarioId: number): Promise<Scenario> {
    const db = getDbConnection();

    try {
      const result = await db.query('SELECT * FROM scenarios WHERE id = $1', [scenarioId]);

      if (result.rows.length === 0) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }

      return this.mapRowToScenario(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get scenario:', error);
      throw error;
    }
  }

  /**
   * Lists scenarios with optional filters
   */
  async listScenarios(filters?: {
    platform?: Platform;
    limit?: number;
    offset?: number;
  }): Promise<Scenario[]> {
    const db = getDbConnection();

    try {
      let sql = 'SELECT * FROM scenarios WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters?.platform) {
        sql += ` AND platform = $${paramIndex}`;
        params.push(filters.platform);
        paramIndex++;
      }

      sql += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }

      if (filters?.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
        paramIndex++;
      }

      const result = await db.query(sql, params);
      return result.rows.map((row) => this.mapRowToScenario(row));
    } catch (error) {
      logger.error('Failed to list scenarios:', error);
      throw error;
    }
  }

  /**
   * Deletes a scenario
   */
  async deleteScenario(scenarioId: number): Promise<void> {
    const db = getDbConnection();

    try {
      const result = await db.query('DELETE FROM scenarios WHERE id = $1', [scenarioId]);

      if (result.rowCount === 0) {
        throw new Error(`Scenario ${scenarioId} not found`);
      }
    } catch (error) {
      logger.error('Failed to delete scenario:', error);
      throw error;
    }
  }

  /**
   * Validates interaction flow structure
   */
  validateInteractionFlow(flow: InteractionFlowStep[], platform: Platform): void {
    // Validate schema
    try {
      InteractionFlowSchema.parse(flow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid interaction flow: ${error.errors.map((e) => e.message).join(', ')}`);
      }
      throw error;
    }

    // Validate step sequence
    const steps = flow.map((s) => s.step).sort((a, b) => a - b);
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] !== i + 1) {
        throw new Error(`Step sequence must be consecutive starting from 1, found step ${steps[i]}`);
      }
    }

    // Validate step dependencies
    for (const step of flow) {
      // Search steps must have query
      if (step.action === 'search' && !step.query) {
        throw new Error(`Step ${step.step}: search action requires query`);
      }

      // Like, comment, reply, report need target or entity_type
      if (['like', 'comment', 'reply', 'report'].includes(step.action)) {
        if (!step.target && !step.entity_type) {
          throw new Error(`Step ${step.step}: ${step.action} action requires target or entity_type`);
        }
      }

      // Comment and reply actions should have generate_comment flag if needed
      if (['comment', 'reply'].includes(step.action) && step.generate_comment === undefined) {
        logger.warn(`Step ${step.step}: comment/reply action should specify generate_comment`);
      }

      // Reply actions need entity_type
      if (step.action === 'reply' && !step.entity_type) {
        throw new Error(`Step ${step.step}: reply action requires entity_type`);
      }
    }

    // Platform-specific validations
    if (platform === 'twitter') {
      // Twitter-specific validations if needed
    } else if (platform === 'facebook') {
      // Facebook-specific validations if needed
    }
  }

  /**
   * Validates that steps can reference previous step results
   */
  validateStepReferences(flow: InteractionFlowStep[]): void {
    for (const step of flow) {
      if (step.target) {
        // Check if target references a valid previous result
        const targetMatch = step.target.match(/^(search_results|comments)\[(\d+)\]$/);
        if (targetMatch) {
          const resultType = targetMatch[1];

          // Check if this result type exists from previous steps
          const hasSearchStep = flow
            .slice(0, step.step - 1)
            .some((s) => s.action === 'search');
          const hasCommentStep = flow
            .slice(0, step.step - 1)
            .some((s) => s.action === 'comment' || s.action === 'reply');

          if (resultType === 'search_results' && !hasSearchStep) {
            throw new Error(
              `Step ${step.step}: target references search_results but no search step found before it`
            );
          }

          if (resultType === 'comments' && !hasCommentStep) {
            throw new Error(
              `Step ${step.step}: target references comments but no comment/reply step found before it`
            );
          }
        }
      }
    }
  }

  private mapRowToScenario(row: any): Scenario {
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      interaction_flow_json: row.interaction_flow_json,
      targeting_rules: row.targeting_rules,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// Singleton instance
let scenarioService: ScenarioService | null = null;

export function getScenarioService(): ScenarioService {
  if (!scenarioService) {
    scenarioService = new ScenarioService();
  }
  return scenarioService;
}

