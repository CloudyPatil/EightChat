import { Pool } from 'pg';
import { config } from './env';
import { logger } from '../utils/logger';

export const pgPool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  database: config.postgres.database,
  user: config.postgres.user,
  password: config.postgres.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pgPool.on('connect', () => {
  logger.info('PostgreSQL connected');
});

pgPool.on('error', (error) => {
  logger.error('PostgreSQL error:', error);
});

export const connectPostgres = async (): Promise<void> => {
  try {
    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('PostgreSQL connection verified');
  } catch (error) {
    logger.error('PostgreSQL connection failed:', error);
    throw error;
  }
};
