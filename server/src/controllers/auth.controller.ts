// server/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { pgPool } from '../config/database';
import { RedisService } from '../config/redis';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { logger } from '../utils/logger';

type DatabaseUser = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: Date;
  updated_at: Date;
};

const toPublicUser = (user: DatabaseUser) => ({
  id: user.id,
  username: user.username,
  display_name: user.display_name,
  avatar_url: user.avatar_url,
  bio: user.bio,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

const issueTokens = async (user: DatabaseUser) => {
  const payload = { userId: user.id, username: user.username };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await RedisService.saveRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken };
};

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const username = req.body.username.trim().toLowerCase();
      const { password } = req.body;

      if (!password || password.length < 8 || !/\d/.test(password)) {
        res.status(400).json({ success: false, error: 'Password must be at least 8 characters long and contain a number' });
        return;
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      const { rows } = await pgPool.query<DatabaseUser>(
        `INSERT INTO users (username, display_name, password_hash)
         VALUES ($1, $1, $2)
         RETURNING id, username, display_name, password_hash, avatar_url, bio, created_at, updated_at`,
        [username, passwordHash]
      );

      const user = rows[0];
      const tokens = await issueTokens(user);

      res.status(201).json({
        success: true,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        user: toPublicUser(user),
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        res.status(409).json({ success: false, error: 'Username is already taken' });
        return;
      }

      logger.error('register error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const username = req.body.username.trim().toLowerCase();
      const { password } = req.body;
      const { rows } = await pgPool.query<DatabaseUser>(
        `SELECT id, username, display_name, password_hash, avatar_url, bio, created_at, updated_at
         FROM users
         WHERE username = $1 AND deleted_at IS NULL`,
        [username]
      );

      const user = rows[0];
      if (!user || !(await argon2.verify(user.password_hash, password))) {
        res.status(401).json({ success: false, error: 'Invalid username or password' });
        return;
      }

      const tokens = await issueTokens(user);
      res.json({
        success: true,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        user: toPublicUser(user),
      });
    } catch (error) {
      logger.error('login error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refresh_token: refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ success: false, error: 'Refresh token required' });
        return;
      }

      const decoded = verifyRefreshToken(refreshToken);
      const storedUserId = await RedisService.getRefreshTokenUserId(refreshToken);

      if (!storedUserId || storedUserId !== decoded.userId) {
        res.status(401).json({ success: false, error: 'Invalid refresh token' });
        return;
      }

      res.json({
        success: true,
        access_token: generateAccessToken({
          userId: decoded.userId,
          username: decoded.username,
        }),
      });
    } catch {
      res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const refreshToken = req.body.refresh_token; // Assume client passes refresh_token to revoke

      if (refreshToken) {
        await RedisService.deleteRefreshToken(userId, refreshToken);
      }
      // If we also want to set them offline globally, we can, but multi-device means we might just close this socket.
      // We will skip setUserOffline to avoid kicking other devices, or just rely on socket disconnect.

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error('logout error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
