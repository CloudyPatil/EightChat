// apps/mobile/src/api/client.ts
import { AuthSession } from './auth';
import { apiBaseUrl } from './config';

type SessionStore = {
  getSession: () => AuthSession | null;
  updateAccessToken: (token: string) => Promise<void>;
  onLogout: () => void;
};

let store: SessionStore | null = null;

export const setSessionStore = (s: SessionStore): void => {
  store = s;
};

export type ApiResponse<T> = { success: boolean; error?: string } & T;

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

const processQueue = (token: string | null) => {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
};

export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const session = store?.getSession();
  const token = session?.accessToken;

  const makeRequest = async (accessToken: string | undefined): Promise<Response> => {
    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers as Record<string, string> ?? {}),
      },
    });
  };

  let response = await makeRequest(token);

  // If 401 and we have a refresh token, try to refresh
  if (response.status === 401 && session?.refreshToken) {
    if (isRefreshing) {
      // Wait for ongoing refresh
      const newToken = await new Promise<string | null>((resolve) => {
        refreshQueue.push(resolve);
      });
      if (!newToken) throw new Error('Session expired. Please log in again.');
      response = await makeRequest(newToken);
    } else {
      isRefreshing = true;
      try {
        const refreshResponse = await fetch(`${apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refreshToken }),
        });

        if (!refreshResponse.ok) {
          processQueue(null);
          store?.onLogout();
          throw new Error('Session expired. Please log in again.');
        }

        const refreshBody = (await refreshResponse.json()) as { success: boolean; access_token?: string };
        if (!refreshBody.success || !refreshBody.access_token) {
          processQueue(null);
          store?.onLogout();
          throw new Error('Session expired. Please log in again.');
        }

        const newToken = refreshBody.access_token;
        await store?.updateAccessToken(newToken);
        processQueue(newToken);
        response = await makeRequest(newToken);
      } catch (error) {
        processQueue(null);
        throw error;
      } finally {
        isRefreshing = false;
      }
    }
  }

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || !body.success) throw new Error(body.error ?? 'Request failed.');
  return body;
};
