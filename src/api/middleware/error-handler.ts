import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { logger } from '../../utils/logger';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  logger.error('Request error:', {
    method: request.method,
    url: request.url,
    error: error.message,
    stack: error.stack,
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  reply.code(statusCode).send({
    error: message,
    statusCode,
  });
}

