// apps/mobile/src/api/chat.ts
import { AuthSession } from './auth';
import { apiFetch } from './client';
import { apiBaseUrl } from './config';

export type Conversation = {
  id: string;
  type: 'direct';
  created_at: string;
  updated_at: string;
  partner: Pick<AuthSession['user'], 'id' | 'username' | 'display_name' | 'avatar_url'>;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: 'text' | 'image';
  is_deleted: boolean;
  created_at: string;
  server_ts: string;
};

export const socketBaseUrl = apiBaseUrl.replace(/\/api$/, '');

export const searchUsers = async (_session: AuthSession, query: string) => {
  const response = await apiFetch<{ users: AuthSession['user'][] }>(`/users?query=${encodeURIComponent(query)}`);
  return response.users;
};

export const listConversations = async (_session: AuthSession): Promise<Conversation[]> => {
  const response = await apiFetch<{ conversations: Conversation[] }>('/conversations');
  return response.conversations;
};

export const createDirectConversation = async (_session: AuthSession, recipientUsername: string): Promise<Conversation> => {
  const response = await apiFetch<{ conversation: Conversation }>('/conversations/direct', {
    method: 'POST',
    body: JSON.stringify({ recipient_username: recipientUsername }),
  });
  return response.conversation;
};

export const listMessages = async (_session: AuthSession, conversationId: string, before?: string): Promise<ChatMessage[]> => {
  const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
  const response = await apiFetch<{ messages: ChatMessage[] }>(`/conversations/${conversationId}/messages?limit=50${cursor}`);
  return response.messages;
};

export const uploadImage = async (_session: AuthSession, conversationId: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null }): Promise<string> => {
  const formData = new FormData();
  formData.append('image', {
    uri: asset.uri,
    name: asset.fileName ?? 'image.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  } as unknown as Blob);
  const response = await apiFetch<{ image_url: string }>(`/conversations/${conversationId}/images`, {
    method: 'POST',
    body: formData,
  });
  return response.image_url;
};

export const deleteMessage = (_session: AuthSession, messageId: string, scope: 'me' | 'everyone') =>
  apiFetch(`/conversations/messages/${messageId}`, { method: 'DELETE', body: JSON.stringify({ scope }) });

export const clearConversation = (_session: AuthSession, conversationId: string) =>
  apiFetch(`/conversations/${conversationId}/messages`, { method: 'DELETE' });
