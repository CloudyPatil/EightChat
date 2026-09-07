import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../config/database';
import { logger } from '../utils/logger';

type Conversation = {
  id: string;
  type: 'direct';
  created_at: Date;
  updated_at: Date;
  partner_id: string;
  partner_username: string;
  partner_display_name: string;
  partner_avatar_url: string | null;
};

const toConversation = (conversation: Conversation) => ({
  id: conversation.id,
  type: conversation.type,
  created_at: conversation.created_at,
  updated_at: conversation.updated_at,
  partner: {
    id: conversation.partner_id,
    username: conversation.partner_username,
    display_name: conversation.partner_display_name,
    avatar_url: conversation.partner_avatar_url,
  },
});

const getConversationForMember = async (client: PoolClient, conversationId: string, userId: string) => {
  const { rows } = await client.query<Conversation>(
    `SELECT c.id, c.type, c.created_at, c.updated_at,
            partner.id AS partner_id,
            partner.username AS partner_username,
            partner.display_name AS partner_display_name,
            partner.avatar_url AS partner_avatar_url
     FROM conversations c
     JOIN conversation_members current_member
       ON current_member.conversation_id = c.id
      AND current_member.user_id = $2
      AND current_member.left_at IS NULL
     JOIN conversation_members partner_member
       ON partner_member.conversation_id = c.id
      AND partner_member.user_id != $2
      AND partner_member.left_at IS NULL
     JOIN users partner ON partner.id = partner_member.user_id
     WHERE c.id = $1 AND c.type = 'direct'`,
    [conversationId, userId]
  );

  return rows[0] ?? null;
};

export class ConversationsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { rows } = await pgPool.query<Conversation>(
        `SELECT c.id, c.type, c.created_at, c.updated_at,
                partner.id AS partner_id,
                partner.username AS partner_username,
                partner.display_name AS partner_display_name,
                partner.avatar_url AS partner_avatar_url
         FROM conversations c
         JOIN conversation_members current_member
           ON current_member.conversation_id = c.id
          AND current_member.user_id = $1
          AND current_member.left_at IS NULL
         JOIN conversation_members partner_member
           ON partner_member.conversation_id = c.id
          AND partner_member.user_id != $1
          AND partner_member.left_at IS NULL
         JOIN users partner ON partner.id = partner_member.user_id
         WHERE c.type = 'direct'
         ORDER BY c.updated_at DESC`,
        [req.user!.userId]
      );

      res.json({ success: true, conversations: rows.map(toConversation) });
    } catch (error) {
      logger.error('conversation list error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async createDirect(req: Request, res: Response): Promise<void> {
    const client = await pgPool.connect();

    try {
      const userId = req.user!.userId;
      const recipientUsername = req.body.recipient_username.trim().toLowerCase();
      const { rows: recipients } = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL`,
        [recipientUsername]
      );
      const recipient = recipients[0];

      if (!recipient) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      if (recipient.id === userId) {
        res.status(400).json({ success: false, error: 'You cannot create a conversation with yourself' });
        return;
      }

      const directKey = [userId, recipient.id].sort().join(':');
      await client.query('BEGIN');
      try {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO conversations (type, created_by, direct_conversation_key)
           VALUES ('direct', $1, $2)
           ON CONFLICT (direct_conversation_key)
           WHERE direct_conversation_key IS NOT NULL
           DO UPDATE SET updated_at = conversations.updated_at
           RETURNING id`,
          [userId, directKey]
        );
        const conversationId = rows[0].id;

        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id)
           VALUES ($1, $2), ($1, $3)
           ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL`,
          [conversationId, userId, recipient.id]
        );

        const conversation = await getConversationForMember(client, conversationId, userId);
        await client.query('COMMIT');

        res.status(201).json({ success: true, conversation: toConversation(conversation!) });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('create direct conversation error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const client = await pgPool.connect();
    try {
      const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const conversation = await getConversationForMember(client, conversationId, req.user!.userId);
      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      res.json({ success: true, conversation: toConversation(conversation) });
    } catch (error) {
      logger.error('get conversation error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
      client.release();
    }
  }
}
