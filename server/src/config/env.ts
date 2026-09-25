// server/src/config/env.ts
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root directory
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const requiredEnvVars = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'POSTGRES_HOST',
  'REDIS_URL'
];

if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push('POSTGRES_PASSWORD', 'CLOUDINARY_URL');
}

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
});

if (process.env.NODE_ENV === 'production' &&
    (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET ||
      (process.env.JWT_SECRET?.length ?? 0) < 32 ||
      (process.env.JWT_REFRESH_SECRET?.length ?? 0) < 32 ||
      !process.env.REDIS_URL?.startsWith('rediss://'))) {
  throw new Error('Production requires distinct long JWT secrets and a TLS Redis URL');
}

export const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:8081',
  IS_PROD: process.env.NODE_ENV === 'production',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  // PostgreSQL
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'eightchat',
    user: process.env.POSTGRES_USER || 'eightchat',
    password: process.env.POSTGRES_PASSWORD || 'eightchat_password',
    ssl: process.env.POSTGRES_SSL === 'true',
  },

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',

  // Cloudinary & Sentry
  CLOUDINARY_URL: process.env.CLOUDINARY_URL || '',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
};
