import { FastifyInstance } from 'fastify';
import { getDbConnection } from '../../database/connection';
import { getEncryptionService } from '../../services/EncryptionService';
import { SocialAccount, SocialAccountCredentials } from '../../models/SocialAccount';
import { logger } from '../../utils/logger';
import { authenticateSuperuser } from '../middleware/auth';
import { z } from 'zod';

const createSocialAccountSchema = z.object({
  platform: z.enum(['twitter', 'facebook']),
  credentials: z.object({
    username: z.string().optional(),
    email: z.string().optional(),
    password: z.string().optional(),
    email_password: z.string().optional(),
    cookies: z.string().optional(),
  }),
});

const updateSocialAccountSchema = z.object({
  credentials: z.object({
    username: z.string().optional(),
    email: z.string().optional(),
    password: z.string().optional(),
    email_password: z.string().optional(),
    cookies: z.string().optional(),
  }).optional(),
  is_active: z.boolean().optional(),
});

export async function socialAccountsRoutes(fastify: FastifyInstance): Promise<void> {
  // Create social account
  fastify.post('/api/social-accounts', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const body = createSocialAccountSchema.parse(request.body);
      const encryptionService = getEncryptionService();
      const db = getDbConnection();

      const encryptedCredentials = encryptionService.encrypt(body.credentials as SocialAccountCredentials);

      const result = await db.query(
        `INSERT INTO social_accounts (platform, encrypted_credentials, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         RETURNING *`,
        [body.platform, encryptedCredentials]
      );

      const account = mapRowToAccount(result.rows[0]);
      return reply.code(201).send(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid request body', details: error.errors });
      }
      logger.error('Failed to create social account:', error);
      return reply.code(500).send({ error: 'Failed to create social account' });
    }
  });

  // List all social accounts
  fastify.get('/api/social-accounts', {
    preHandler: authenticateSuperuser,
  }, async (_request, reply) => {
    try {
      const db = getDbConnection();
      const result = await db.query('SELECT * FROM social_accounts ORDER BY created_at DESC');

      const accounts = result.rows.map((row: any) => mapRowToAccount(row));
      return reply.send({ accounts });
    } catch (error) {
      logger.error('Failed to list social accounts:', error);
      return reply.code(500).send({ error: 'Failed to list social accounts' });
    }
  });

  // Get social account by ID
  fastify.get('/api/social-accounts/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const db = getDbConnection();
      const result = await db.query('SELECT * FROM social_accounts WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Social account not found' });
      }

      const account = mapRowToAccount(result.rows[0]);
      return reply.send(account);
    } catch (error) {
      logger.error('Failed to get social account:', error);
      return reply.code(500).send({ error: 'Failed to get social account' });
    }
  });

  // Update social account
  fastify.put('/api/social-accounts/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateSocialAccountSchema.parse(request.body);
      const encryptionService = getEncryptionService();
      const db = getDbConnection();

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (body.credentials) {
        const encryptedCredentials = encryptionService.encrypt(body.credentials as SocialAccountCredentials);
        updates.push(`encrypted_credentials = $${paramIndex}`);
        values.push(encryptedCredentials);
        paramIndex++;
      }

      if (body.is_active !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        values.push(body.is_active);
        paramIndex++;
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const sql = `UPDATE social_accounts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      const result = await db.query(sql, values);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Social account not found' });
      }

      const account = mapRowToAccount(result.rows[0]);
      return reply.send(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid request body', details: error.errors });
      }
      logger.error('Failed to update social account:', error);
      return reply.code(500).send({ error: 'Failed to update social account' });
    }
  });

  // Delete social account
  fastify.delete('/api/social-accounts/:id', {
    preHandler: authenticateSuperuser,
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const db = getDbConnection();
      const result = await db.query('DELETE FROM social_accounts WHERE id = $1', [id]);

      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'Social account not found' });
      }

      return reply.code(204).send();
    } catch (error) {
      logger.error('Failed to delete social account:', error);
      return reply.code(500).send({ error: 'Failed to delete social account' });
    }
  });
}

function mapRowToAccount(row: any): Omit<SocialAccount, 'encrypted_credentials'> & { id: number } {
  return {
    id: row.id,
    platform: row.platform,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

