import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

const winstonLogger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'social-automation' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
      ),
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  winstonLogger.add(
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  );
  winstonLogger.add(
    new winston.transports.File({ filename: 'combined.log' })
  );
}

// Create Fastify-compatible logger adapter
// Fastify requires: fatal, error, warn, info, debug, trace, child, level, silent, msgPrefix
function createFastifyLoggerAdapter(baseLogger: winston.Logger) {
  return {
    level: logLevel,
    silent: false,
    msgPrefix: '',
    fatal: (msg: any, ...args: any[]) => {
      // Winston doesn't have fatal, so we use error level
      if (args.length > 0 && args[0] instanceof Error) {
        baseLogger.error(msg, args[0]);
      } else {
        baseLogger.error(msg, ...args);
      }
    },
    error: (msg: any, ...args: any[]) => {
      if (args.length > 0 && args[0] instanceof Error) {
        baseLogger.error(msg, args[0]);
      } else {
        baseLogger.error(msg, ...args);
      }
    },
    warn: (msg: any, ...args: any[]) => {
      baseLogger.warn(msg, ...args);
    },
    info: (msg: any, ...args: any[]) => {
      baseLogger.info(msg, ...args);
    },
    debug: (msg: any, ...args: any[]) => {
      baseLogger.debug(msg, ...args);
    },
    trace: (msg: any, ...args: any[]) => {
      // Winston doesn't have trace, so we use debug level
      baseLogger.debug(msg, ...args);
    },
    child: (bindings: any) => {
      const childLogger = baseLogger.child(bindings);
      return createFastifyLoggerAdapter(childLogger);
    },
  };
}

export const logger = createFastifyLoggerAdapter(winstonLogger);

