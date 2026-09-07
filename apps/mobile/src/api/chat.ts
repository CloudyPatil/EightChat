import { AuthSession, AuthenticatedUser } from './auth';

export type Conversation = {
  id: string;
  type: 'direct';
  created_at: string;
  updated_at: string;
  partner: Pick<AuthenticatedUser, 'id' | 'username' | 'display_name' | 'avatar_url'>;
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

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api')
  .replace(/\/$/, '');

type ApiResponse<T> = { success: boolean; error?: string } & T;

const request = async <T>(session: AuthSession, path: string, init: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Check your API address and connection.');
  }

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || !body.success) throw new Error(body.error ?? 'Request failed.');
  return body;
};

export const searchUsers = async (session: AuthSession, query: string) => {
  const response = await request<{ users: Array<Pick<AuthenticatedUser, 'id' | 'username' | 'display_name' | 'avatar_url'>> }>(
    session,
    `/users?query=${encodeURIComponent(query)}`
  );
  return response.users;
};

export const listConversations = async (session: AuthSession): Promise<Conversation[]> => {
  const response = await request<{ conversations: Conversation[] }>(session, '/conversations');
  return response.conversations;
};

export const createDirectConversation = async (session: AuthSession, recipientUsername: string): Promise<Conversation> => {
  const response = await request<{ conversation: Conversation }>(session, '/conversations/direct', {
    body: JSON.stringify({ recipient_username: recipientUsername }),
    method: 'POST',
  });
  return response.conversation;
};

export const listMessages = async (session: AuthSession, conversationId: string, before?: string): Promise<ChatMessage[]> => {
  const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
  const response = await request<{ messages: ChatMessage[] }>(
    session,
    `/conversations/${conversationId}/messages?limit=50${cursor}`
  );
  return response.messages;
};

export const uploadImage = async (session: AuthSession, conversationId: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null }): Promise<string> => {
  const formData = new FormData();
  formData.append('image', {
    uri: asset.uri,
    name: asset.fileName ?? 'image.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  } as unknown as Blob);
  const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: formData,
  });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; image_url?: string };
  if (!response.ok || !body.success || !body.image_url) throw new Error(body.error ?? 'Image upload failed.');
  return body.image_url;
};

export const deleteMessage = (session: AuthSession, messageId: string, scope: 'me' | 'everyone') =>
  request(session, `/conversations/messages/${messageId}`, { method: 'DELETE', body: JSON.stringify({ scope }) });

export const clearConversation = (session: AuthSession, conversationId: string) =>
  request(session, `/conversations/${conversationId}/messages`, { method: 'DELETE' });

export const socketBaseUrl = apiBaseUrl.replace(/\/api$/, '');
