// server/src/config/redis.ts
import Redis from 'ioredis';
import { config } from './env';
import { logger } from '../utils/logger';

const getRedisOptions = () => {
  return {
    password: config.REDIS_PASSWORD || undefined,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis: Too many retries');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
  };
};

// Main Redis client
export const redis = new Redis(config.REDIS_URL, getRedisOptions());

// Subscriber client (for pub/sub)
export const redisSub = new Redis(config.REDIS_URL, getRedisOptions());

// Publisher client
export const redisPub = new Redis(config.REDIS_URL, getRedisOptions());

export const connectRedis = async () => {
  try {
    await redis.connect();
    await redisSub.connect();
    await redisPub.connect();
    await redis.ping();
    logger.info('✅ Redis connected');
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    throw error;
  }
};

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

// ============ Redis Helper Functions ============
export const RedisKeys = {
  userOnline: (userId: string) => `online:${userId}`,
  userSocket: (userId: string) => `socket:${userId}`,
  userRoom: (userId: string) => `room:${userId}`,
  otpCode: (identifier: string) => `otp:${identifier}`,
  refreshToken: (token: string) => `refresh:${token}`,
  userRefreshTokens: (userId: string) => `user_tokens:${userId}`, // Set of tokens for a user
  rateLimitMsg: (ip: string) => `rate:msg:${ip}`,
  ghostMode: (userId: string) => `ghost:${userId}`,
  typingStatus: (convId: string) => `typing:${convId}`,
  conversationCache: (convId: string) => `conv:${convId}`,
  userConversations: (userId: string) => `user_convs:${userId}`,
};

export class RedisService {
  // Online presence
  static async setUserOnline(userId: string, socketId: string): Promise<void> {
    await redis.setex(
      RedisKeys.userOnline(userId),
      300, // 5 min TTL (refreshed by heartbeat)
      socketId
    );
  }

  static async setUserOffline(userId: string): Promise<void> {
    await redis.del(RedisKeys.userOnline(userId));
    await redis.del(RedisKeys.userSocket(userId));
  }

  static async isUserOnline(userId: string): Promise<boolean> {
    const result = await redis.exists(RedisKeys.userOnline(userId));
    return result === 1;
  }

  static async getUserSocketId(userId: string): Promise<string | null> {
    return redis.get(RedisKeys.userOnline(userId));
  }

  // OTP Management
  static async saveOTP(identifier: string, otp: string): Promise<void> {
    await redis.setex(
      RedisKeys.otpCode(identifier),
      600, // 10 minutes
      otp
    );
  }

  static async getOTP(identifier: string): Promise<string | null> {
    return redis.get(RedisKeys.otpCode(identifier));
  }

  static async deleteOTP(identifier: string): Promise<void> {
    await redis.del(RedisKeys.otpCode(identifier));
  }

  // Refresh tokens
  static async saveRefreshToken(userId: string, token: string): Promise<void> {
    const ttl = 30 * 24 * 60 * 60; // 30 days
    await redis.setex(RedisKeys.refreshToken(token), ttl, userId);
    await redis.sadd(RedisKeys.userRefreshTokens(userId), token);
  }

  static async getRefreshTokenUserId(token: string): Promise<string | null> {
    return redis.get(RedisKeys.refreshToken(token));
  }

  static async deleteRefreshToken(userId: string, token: string): Promise<void> {
    await redis.del(RedisKeys.refreshToken(token));
    await redis.srem(RedisKeys.userRefreshTokens(userId), token);
  }

  static async revokeAllUserTokens(userId: string): Promise<void> {
    const tokens = await redis.smembers(RedisKeys.userRefreshTokens(userId));
    if (tokens.length > 0) {
      await redis.del(...tokens.map(t => RedisKeys.refreshToken(t)));
    }
    await redis.del(RedisKeys.userRefreshTokens(userId));
  }

  // Ghost mode
  static async setGhostMode(userId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await redis.set(RedisKeys.ghostMode(userId), '1');
    } else {
      await redis.del(RedisKeys.ghostMode(userId));
    }
  }

  static async isGhostMode(userId: string): Promise<boolean> {
    const result = await redis.get(RedisKeys.ghostMode(userId));
    return result === '1';
  }

  // Typing indicator
  static async setTyping(
    convId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    const key = RedisKeys.typingStatus(convId);
    if (isTyping) {
      await redis.hset(key, userId, Date.now().toString());
      await redis.expire(key, 10); // Auto-expire after 10 seconds
    } else {
      await redis.hdel(key, userId);
    }
  }

  static async getTypingUsers(convId: string): Promise<string[]> {
    const users = await redis.hgetall(RedisKeys.typingStatus(convId));
    if (!users) return [];
    const now = Date.now();
    // Filter out stale typing indicators (older than 8 seconds)
    return Object.entries(users)
      .filter(([, timestamp]) => now - parseInt(timestamp) < 8000)
      .map(([userId]) => userId);
  }
}
