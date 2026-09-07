import { Server, Socket } from 'socket.io';
import { RedisService } from '../config/redis';
import {
  conversationRoom,
  createImageMessage,
  createTextMessage,
  getConversationMemberIds,
  getUserConversationIds,
  isConversationMember,
  Message,
  MessageServiceError,
  userRoom,
} from '../services/messages.service';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

type SocketAck = (response: { success: boolean; error?: string; message?: Message }) => void;

type AuthenticatedSocket = Socket & {
  data: {
    userId: string;
    username?: string;
  };
};

const getString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const initializeSocket = (io: Server): void => {
  io.use((socket, next) => {
    const token = getString(socket.handshake.auth.token);
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const user = verifyAccessToken(token);
      const authenticatedSocket = socket as AuthenticatedSocket;
      authenticatedSocket.data.userId = user.userId;
      authenticatedSocket.data.username = user.username;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const authenticatedSocket = socket as AuthenticatedSocket;
    const { userId } = authenticatedSocket.data;

    void (async () => {
      try {
        authenticatedSocket.join(userRoom(userId));
        const conversationIds = await getUserConversationIds(userId);
        await Promise.all(conversationIds.map((conversationId) => authenticatedSocket.join(conversationRoom(conversationId))));
        await RedisService.setUserOnline(userId, socket.id);
        const partnerIds = new Set((await Promise.all(conversationIds.map(getConversationMemberIds))).flat());
        partnerIds.delete(userId);
        partnerIds.forEach((partnerId) => {
          io.to(userRoom(partnerId)).emit('presence:update', { user_id: userId, is_online: true });
        });
      } catch (error) {
        logger.error('socket connection setup error:', error);
        socket.disconnect(true);
      }
    })();

    socket.on('message:send', async (payload: unknown, acknowledge?: SocketAck) => {
      try {
        const data = payload as { conversation_id?: unknown; body?: unknown; message_type?: unknown };
        const conversationId = getString(data.conversation_id);
        const body = getString(data.body);
        if (!conversationId || !body) {
          acknowledge?.({ success: false, error: 'conversation_id and body are required' });
          return;
        }

        const message = data.message_type === 'image'
          ? await createImageMessage(conversationId, userId, body)
          : await createTextMessage(conversationId, userId, body);
        const memberIds = await getConversationMemberIds(conversationId);
        memberIds.forEach((memberId) => {
          io.to(userRoom(memberId)).emit('message:new', { message });
        });
        acknowledge?.({ success: true, message });
      } catch (error) {
        const errorMessage = error instanceof MessageServiceError ? error.message : 'Unable to send message';
        acknowledge?.({ success: false, error: errorMessage });
        if (!(error instanceof MessageServiceError)) logger.error('socket message send error:', error);
      }
    });

    socket.on('typing:update', async (payload: unknown) => {
      const data = payload as { conversation_id?: unknown; is_typing?: unknown };
      const conversationId = getString(data.conversation_id);
      if (!conversationId || typeof data.is_typing !== 'boolean') return;

      try {
        if (!(await isConversationMember(conversationId, userId))) return;
        await RedisService.setTyping(conversationId, userId, data.is_typing);
        socket.to(conversationRoom(conversationId)).emit('typing:update', {
          conversation_id: conversationId,
          user_id: userId,
          is_typing: data.is_typing,
        });
      } catch (error) {
        logger.error('typing update error:', error);
      }
    });

    socket.on('conversation:join', async (payload: unknown, acknowledge?: SocketAck) => {
      const conversationId = getString((payload as { conversation_id?: unknown }).conversation_id);
      if (!conversationId || !(await isConversationMember(conversationId, userId))) {
        acknowledge?.({ success: false, error: 'Conversation not found' });
        return;
      }

      authenticatedSocket.join(conversationRoom(conversationId));
      acknowledge?.({ success: true });
    });

    socket.on('disconnect', () => {
      void (async () => {
        const remainingSockets = await io.in(userRoom(userId)).fetchSockets();
        if (remainingSockets.length === 0) {
          await RedisService.setUserOffline(userId);
          const conversationIds = await getUserConversationIds(userId);
          const partnerIds = new Set((await Promise.all(conversationIds.map(getConversationMemberIds))).flat());
          partnerIds.delete(userId);
          partnerIds.forEach((partnerId) => {
            io.to(userRoom(partnerId)).emit('presence:update', { user_id: userId, is_online: false });
          });
        }
      })().catch((error) => logger.error('socket disconnect error:', error));
    });
  });
};
