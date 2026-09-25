import { Request, Response } from 'express';
import { pgPool } from '../config/database';
import { logger } from '../utils/logger';

const paramId = (req: Request): string => Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

export class BlocksController {
  static async blockUser(req: Request, res: Response): Promise<void> {
    try {
      const blockerId = req.user!.userId;
      const blockedId = paramId(req);
      if (blockerId === blockedId) {
        res.status(400).json({ success: false, error: 'Cannot block yourself' });
        return;
      }
      const { rowCount } = await pgPool.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [blockedId]);
      if (!rowCount) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      await pgPool.query(
        'INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [blockerId, blockedId]
      );
      res.json({ success: true, message: 'User blocked' });
    } catch (error) {
      logger.error('blockUser error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async unblockUser(req: Request, res: Response): Promise<void> {
    try {
      await pgPool.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user!.userId, paramId(req)]);
      res.json({ success: true, message: 'User unblocked' });
    } catch (error) {
      logger.error('unblockUser error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async reportUser(req: Request, res: Response): Promise<void> {
    try {
      const reporterId = req.user!.userId;
      const reportedId = paramId(req);
      if (reporterId === reportedId) {
        res.status(400).json({ success: false, error: 'Cannot report yourself' });
        return;
      }
      const { rowCount } = await pgPool.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [reportedId]);
      if (!rowCount) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      await pgPool.query(
        'INSERT INTO user_reports (reporter_id, reported_id, reason) VALUES ($1, $2, $3)',
        [reporterId, reportedId, req.body.reason ?? null]
      );
      res.json({ success: true, message: 'Report submitted' });
    } catch (error) {
      logger.error('reportUser error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
