import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { getDbConnection } from '../../database/connection';
import { logger } from '../../utils/logger';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username?: string; password?: string };

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    try {
      const db = getDbConnection();
      const result = await db.query('SELECT * FROM superuser WHERE username = $1', [username]);

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const superuser = result.rows[0];
      const isValid = await bcrypt.compare(password, superuser.password_hash);

      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = fastify.jwt.sign({
        id: superuser.id,
        username: superuser.username,
      });

      return reply.send({
        token,
        user: {
          id: superuser.id,
          username: superuser.username,
        },
      });
    } catch (error) {
      logger.error('Login error:', error);
      return reply.code(500).send({ error: 'Login failed' });
    }
  });
}

