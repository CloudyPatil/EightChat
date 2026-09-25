import { Request, Response } from 'express';
import { pgPool } from '../config/database';
import { RedisService } from '../config/redis';
import { uploadImageBuffer } from '../config/cloudinary';
import { validateImageSignature } from '../utils/fileValidation';
import { logger } from '../utils/logger';

const publicFields = 'id, username, display_name, avatar_url, bio, created_at, updated_at';

export class ProfileController {
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const { display_name: displayName, bio } = req.body;
      const updates: string[] = [];
      const values: string[] = [];
      if (displayName !== undefined) {
        if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 50) {
          res.status(400).json({ success: false, error: 'display_name must be 1-50 characters' });
          return;
        }
        values.push(displayName.trim());
        updates.push(`display_name = $${values.length}`);
      }
      if (bio !== undefined) {
        if (typeof bio !== 'string' || bio.length > 200) {
          res.status(400).json({ success: false, error: 'bio must be 200 characters or less' });
          return;
        }
        values.push(bio);
        updates.push(`bio = $${values.length}`);
      }
      if (!updates.length) {
        res.status(400).json({ success: false, error: 'No valid fields provided' });
        return;
      }
      values.push(req.user!.userId);
      const { rows } = await pgPool.query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} AND deleted_at IS NULL RETURNING ${publicFields}`,
        values
      );
      if (!rows[0]) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      res.json({ success: true, user: rows[0] });
    } catch (error) {
      logger.error('updateProfile error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async uploadAvatar(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file?.buffer || !validateImageSignature(req.file.buffer)) {
        res.status(400).json({ success: false, error: 'Valid image file is required' });
        return;
      }
      const avatarUrl = await uploadImageBuffer(req.file.buffer, 'eightchat/avatars');
      const { rows } = await pgPool.query(
        `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING ${publicFields}`,
        [avatarUrl, req.user!.userId]
      );
      if (!rows[0]) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      res.json({ success: true, user: rows[0] });
    } catch (error) {
      logger.error('uploadAvatar error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      await pgPool.query(
        `UPDATE users SET deleted_at = NOW(), username = NULL, phone = NULL, phone_hash = NULL,
           email = NULL, password_hash = NULL, display_name = 'Deleted user', avatar_url = NULL,
           bio = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      await pgPool.query('DELETE FROM push_devices WHERE user_id = $1', [userId]);
      await RedisService.revokeAllUserTokens(userId);
      await RedisService.setUserOffline(userId);
      res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
      logger.error('deleteAccount error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getMe(req: Request, res: Response): Promise<void> {
    try {
      const { rows } = await pgPool.query(
        `SELECT ${publicFields} FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [req.user!.userId]
      );
      if (!rows[0]) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      res.json({ success: true, user: rows[0] });
    } catch (error) {
      logger.error('getMe error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
