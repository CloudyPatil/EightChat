import { io, Socket } from 'socket.io-client';
import { AuthSession } from '../api/auth';
import { ChatMessage, socketBaseUrl } from '../api/chat';

export type SendMessageAcknowledgement = {
  success: boolean;
  error?: string;
  message?: ChatMessage;
};

export const createSocket = (session: AuthSession): Socket =>
  io(socketBaseUrl, {
    auth: { token: session.accessToken },
    autoConnect: false,
    transports: ['websocket'],
  });
