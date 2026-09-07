import { PoolClient } from 'pg';
import { pgPool } from '../config/database';
import { sendMessageNotifications } from './notifications.service';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: 'text' | 'image';
  is_deleted: boolean;
  created_at: Date;
  server_ts: string;
};

export class MessageServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const toMessage = (row: Omit<Message, 'body'> & { encrypted_body: Buffer }): Message => ({
  id: row.id,
  conversation_id: row.conversation_id,
  sender_id: row.sender_id,
  body: row.is_deleted ? '' : row.encrypted_body.toString('utf8'),
  message_type: row.message_type,
  is_deleted: row.is_deleted,
  created_at: row.created_at,
  server_ts: row.server_ts,
});

export const conversationRoom = (conversationId: string): string => `conversation:${conversationId}`;
export const userRoom = (userId: string): string => `user:${userId}`;

export const isConversationMember = async (conversationId: string, userId: string): Promise<boolean> => {
  const { rowCount } = await pgPool.query(
    `SELECT 1
     FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId]
  );
  return rowCount === 1;
};

export const getUserConversationIds = async (userId: string): Promise<string[]> => {
  const { rows } = await pgPool.query<{ conversation_id: string }>(
    `SELECT conversation_id
     FROM conversation_members
     WHERE user_id = $1 AND left_at IS NULL`,
    [userId]
  );
  return rows.map((row) => row.conversation_id);
};

export const getConversationMemberIds = async (conversationId: string): Promise<string[]> => {
  const { rows } = await pgPool.query<{ user_id: string }>(
    `SELECT user_id
     FROM conversation_members
     WHERE conversation_id = $1 AND left_at IS NULL`,
    [conversationId]
  );
  return rows.map((row) => row.user_id);
};

export const createTextMessage = async (
  conversationId: string,
  senderId: string,
  body: string
): Promise<Message> => {
  return createMessage(conversationId, senderId, body, 'text');
};

export const createImageMessage = async (
  conversationId: string,
  senderId: string,
  imageUrl: string
): Promise<Message> => createMessage(conversationId, senderId, imageUrl, 'image');

const createMessage = async (
  conversationId: string,
  senderId: string,
  body: string,
  messageType: Message['message_type']
): Promise<Message> => {
  const normalizedBody = body.trim();
  if (!normalizedBody || (messageType === 'text' && normalizedBody.length > 4000)) {
    throw new MessageServiceError(400, messageType === 'text' ? 'Message must be between 1 and 4000 characters' : 'Image URL is required');
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const member = await isMember(client, conversationId, senderId);
    if (!member) {
      throw new MessageServiceError(404, 'Conversation not found');
    }

    const { rows } = await client.query<Omit<Message, 'body'> & { encrypted_body: Buffer }>(
      `INSERT INTO messages (conversation_id, sender_id, encrypted_body, message_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, conversation_id, sender_id, encrypted_body, message_type, is_deleted, created_at, server_ts`,
      [conversationId, senderId, Buffer.from(normalizedBody, 'utf8'), messageType]
    );
    const message = toMessage(rows[0]);

    await client.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    await client.query(
      `INSERT INTO message_status (message_id, user_id, status)
       SELECT $1, user_id, CASE WHEN user_id = $2 THEN 'delivered' ELSE 'sent' END
       FROM conversation_members
       WHERE conversation_id = $3 AND left_at IS NULL
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [message.id, senderId, conversationId]
    );

    await client.query('COMMIT');
    void sendMessageNotifications(message);
    return message;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listMessages = async (
  conversationId: string,
  userId: string,
  before: Date | null,
  limit: number
): Promise<Message[]> => {
  if (!(await isConversationMember(conversationId, userId))) {
    throw new MessageServiceError(404, 'Conversation not found');
  }

  const { rows } = await pgPool.query<Omit<Message, 'body'> & { encrypted_body: Buffer }>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.encrypted_body, m.message_type, m.is_deleted, m.created_at, m.server_ts
     FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $2
     LEFT JOIN message_user_deletions mud ON mud.message_id = m.id AND mud.user_id = $2
     WHERE m.conversation_id = $1
       AND mud.message_id IS NULL
       AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
       AND ($3::timestamptz IS NULL OR m.created_at < $3)
     ORDER BY created_at DESC
     LIMIT $4`,
    [conversationId, userId, before, limit]
  );

  return rows.map(toMessage).reverse();
};

export const deleteMessageForUser = async (messageId: string, userId: string, everyone: boolean): Promise<{ conversationId: string; everyone: boolean }> => {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ conversation_id: string; sender_id: string }>(
      `SELECT m.conversation_id, m.sender_id FROM messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
       WHERE m.id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL`, [messageId, userId]
    );
    const message = rows[0];
    if (!message) throw new MessageServiceError(404, 'Message not found');
    if (everyone) {
      if (message.sender_id !== userId) throw new MessageServiceError(403, 'Only the sender can delete for everyone');
      await client.query(`UPDATE messages SET is_deleted = TRUE, deleted_at = NOW(), encrypted_body = ''::bytea WHERE id = $1`, [messageId]);
    } else {
      await client.query(`INSERT INTO message_user_deletions (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [messageId, userId]);
    }
    await client.query('COMMIT');
    return { conversationId: message.conversation_id, everyone };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
};

export const clearConversationForUser = async (conversationId: string, userId: string): Promise<void> => {
  const { rowCount } = await pgPool.query(
    `UPDATE conversation_members SET cleared_at = NOW() WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId]
  );
  if (!rowCount) throw new MessageServiceError(404, 'Conversation not found');
};

const isMember = async (client: PoolClient, conversationId: string, userId: string): Promise<boolean> => {
  const { rowCount } = await client.query(
    `SELECT 1
     FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId]
  );
  return rowCount === 1;
};
