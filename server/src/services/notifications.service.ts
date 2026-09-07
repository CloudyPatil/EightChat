import { pgPool } from '../config/database';
import { logger } from '../utils/logger';
import type { Message } from './messages.service';

type Device = { expo_push_token: string; hide_message_preview: boolean };

export const sendMessageNotifications = async (message: Message): Promise<void> => {
  const { rows } = await pgPool.query<Device & { sender_username: string }>(
    `SELECT d.expo_push_token, d.hide_message_preview, sender.username AS sender_username
     FROM push_devices d
     JOIN users sender ON sender.id = $2
     WHERE d.user_id IN (
       SELECT user_id FROM conversation_members
       WHERE conversation_id = $1 AND user_id != $2 AND left_at IS NULL
     ) AND d.notifications_enabled = TRUE`,
    [message.conversation_id, message.sender_id]
  );

  await Promise.all(rows.map(async (device) => {
    const hidden = device.hide_message_preview;
    const payload = {
      to: device.expo_push_token,
      sound: 'default',
      title: hidden ? 'EightChat' : `@${device.sender_username}`,
      body: hidden ? 'New message' : message.message_type === 'image' ? 'Sent an image' : message.body.slice(0, 160),
      data: { conversation_id: message.conversation_id },
      channelId: 'messages',
    };
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) logger.warn(`Push delivery failed: ${response.status}`);
    } catch (error) {
      logger.error('Push delivery error:', error);
    }
  }));
};
