import { Request, Response } from 'express';
import { pgPool } from '../config/database';
import { logger } from '../utils/logger';

type UserSearchResult = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export class UsersController {
  static async search(req: Request, res: Response): Promise<void> {
    try {
      const query = String(req.query.query ?? '').trim().toLowerCase();
      if (query.length < 2) {
        res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
        return;
      }

      const { rows } = await pgPool.query<UserSearchResult>(
        `SELECT id, username, display_name, avatar_url
         FROM users
         WHERE username ILIKE $1
           AND id != $2
           AND deleted_at IS NULL
         ORDER BY username ASC
         LIMIT 20`,
        [`${query}%`, req.user!.userId]
      );

      res.json({ success: true, users: rows });
    } catch (error) {
      logger.error('user search error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
