import { pgPool } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const queueKey = 'push:pending_tickets';
const tokenKey = (id: string) => `push:ticket:${id}`;

export const storePushTicket = async (ticketId: string, token: string): Promise<void> => {
  await redis.setex(tokenKey(ticketId), 24 * 60 * 60, token);
  await redis.lpush(queueKey, ticketId);
  await redis.ltrim(queueKey, 0, 999);
};

export const processPushReceipts = async (): Promise<void> => {
  try {
    const ids = await redis.lrange(queueKey, 0, 99);
    if (!ids.length) return;
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      logger.warn(`Push receipts fetch failed: ${response.status}`);
      return;
    }
    const body = await response.json() as {
      data?: Record<string, { status: string; details?: { error?: string } }>;
    };
    for (const [id, receipt] of Object.entries(body.data ?? {})) {
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        const token = await redis.get(tokenKey(id));
        if (token) await pgPool.query('DELETE FROM push_devices WHERE expo_push_token = $1', [token]);
      }
      await redis.del(tokenKey(id));
      await redis.lrem(queueKey, 1, id);
    }
  } catch (error) {
    logger.error('Push receipts job error:', error);
  }
};

export const startPushReceiptsJob = (): void => {
  setInterval(() => void processPushReceipts(), 15 * 60 * 1000).unref();
};
