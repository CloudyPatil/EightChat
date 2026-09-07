import { Request, Response } from 'express';
import { clearConversationForUser, deleteMessageForUser, getConversationMemberIds, listMessages, MessageServiceError } from '../services/messages.service';
import { logger } from '../utils/logger';

export class MessagesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = Array.isArray(req.params.conversationId)
        ? req.params.conversationId[0]
        : req.params.conversationId;
      const beforeValue = typeof req.query.before === 'string' ? req.query.before : null;
      const before = beforeValue ? new Date(beforeValue) : null;
      const limitValue = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;

      if (before && Number.isNaN(before.getTime())) {
        res.status(400).json({ success: false, error: 'before must be a valid ISO date' });
        return;
      }

      const messages = await listMessages(conversationId, req.user!.userId, before, limit);
      res.json({ success: true, messages });
    } catch (error) {
      if (error instanceof MessageServiceError) {
        res.status(error.status).json({ success: false, error: error.message });
        return;
      }
      logger.error('message list error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const messageId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
      const everyone = req.body.scope === 'everyone';
      const result = await deleteMessageForUser(messageId, req.user!.userId, everyone);
      if (everyone) {
        const io = req.app.get('io');
        (await getConversationMemberIds(result.conversationId)).forEach((memberId) => {
          io.to(`user:${memberId}`).emit('message:deleted', { message_id: messageId });
        });
      }
      res.json({ success: true });
    } catch (error) {
      if (error instanceof MessageServiceError) {
        res.status(error.status).json({ success: false, error: error.message });
        return;
      }
      logger.error('message delete error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async clear(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
      await clearConversationForUser(conversationId, req.user!.userId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof MessageServiceError) {
        res.status(error.status).json({ success: false, error: error.message });
        return;
      }
      logger.error('conversation clear error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
