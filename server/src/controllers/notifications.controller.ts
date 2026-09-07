import { Request, Response } from 'express';
import { pgPool } from '../config/database';
import { logger } from '../utils/logger';

export class NotificationsController {
  static async registerDevice(req: Request, res: Response): Promise<void> {
    try {
      const { expo_push_token: token, platform, hide_message_preview: hidePreview = true } = req.body;
      await pgPool.query(
        `INSERT INTO push_devices (user_id, expo_push_token, platform, hide_message_preview)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (expo_push_token) DO UPDATE SET
           user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
           notifications_enabled = TRUE, hide_message_preview = EXCLUDED.hide_message_preview,
           last_active_at = NOW(), updated_at = NOW()`,
        [req.user!.userId, token, platform, hidePreview]
      );
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error('register device error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const { expo_push_token: token, notifications_enabled: enabled, hide_message_preview: hidePreview } = req.body;
      const { rowCount } = await pgPool.query(
        `UPDATE push_devices SET notifications_enabled = $3, hide_message_preview = $4, updated_at = NOW()
         WHERE user_id = $1 AND expo_push_token = $2`,
        [req.user!.userId, token, enabled, hidePreview]
      );
      if (!rowCount) {
        res.status(404).json({ success: false, error: 'Device not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('notification preferences error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
