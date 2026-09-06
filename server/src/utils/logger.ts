// server/src/utils/logger.ts
import winston from 'winston';
import { config } from '../config/env';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  config.IS_PROD
    ? winston.format.json()
    : winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
      })
);

export const logger = winston.createLogger({
  level: config.IS_PROD ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: config.IS_PROD
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            logFormat
          ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});