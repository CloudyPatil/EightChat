// server/src/app.ts
import * as Sentry from '@sentry/node';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config/env';
import { logger } from './utils/logger';
import { connectPostgres } from './config/database';
import { connectRedis, redisPub, redisSub, redis } from './config/redis';
import { pgPool } from './config/database';
import { runMigrations } from './database/migrate';

// Routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import conversationsRoutes from './routes/conversations.routes';
import messagesRoutes from './routes/messages.routes';
import uploadsRoutes from './routes/uploads.routes';
import notificationsRoutes from './routes/notifications.routes';
import profileRoutes from './routes/profile.routes';
import blocksRoutes from './routes/blocks.routes';
import { initializeSocket } from './socket/socketServer';
import { startPushReceiptsJob } from './jobs/pushReceipts.job';

const app = express();

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

const httpServer = createServer(app);
app.set('trust proxy', 1);

// ============ Middleware ============
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(config.IS_PROD ? 'combined' : 'dev'));

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// ============ Routes ============
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/users', profileRoutes);
app.use('/api/users', blocksRoutes);
app.use('/api/conversations', messagesRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/conversations', uploadsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// ============ Socket.IO Setup ============
export const io = new SocketServer(httpServer, {
  cors: {
    origin: config.CLIENT_URL,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 10000,
});

app.get('/ready', async (_req, res) => {
  try {
    await Promise.all([pgPool.query('SELECT 1'), redis.ping()]);
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

initializeSocket(io);
app.set('io', io);

// ============ 404 Handler ============
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
});

// ============ Error Handler ============
if (config.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: config.IS_PROD ? 'Internal server error' : err.message,
  });
});

// ============ Start Server ============
const startServer = async () => {
  try {
    logger.info('🚀 Starting EightChat server...');

    // Connect to all services
    await connectPostgres();
    await connectRedis();
    io.adapter(createAdapter(redisPub, redisSub));

    // Run database migrations
    await runMigrations();

    // Start listening
    httpServer.listen(config.PORT, () => {
      logger.info(`
╔═══════════════════════════════════════╗
║       EightChat Server Running        ║
╠═══════════════════════════════════════╣
║  Port:    ${config.PORT}                          ║
║  Mode:    ${config.NODE_ENV}               ║
║  Health:  /health                     ║
╚═══════════════════════════════════════╝
      `);
    });

    startPushReceiptsJob();

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received - Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

startServer();

export { app, httpServer };
