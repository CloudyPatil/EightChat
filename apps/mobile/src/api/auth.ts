export type AuthenticatedUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
};

type AuthResponse = {
  success: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  user?: AuthenticatedUser;
};

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api')
  .replace(/\/$/, '');

const authenticate = async (endpoint: 'login' | 'register', username: string, password: string) => {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Cannot reach the server. Check the API address and that the server is running.');
  }

  const body = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok || !body.success || !body.access_token || !body.refresh_token || !body.user) {
    throw new Error(body.error ?? 'Something went wrong. Please try again.');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    user: body.user,
  } satisfies AuthSession;
};

export const login = (username: string, password: string) =>
  authenticate('login', username, password);

export const register = (username: string, password: string) =>
  authenticate('register', username, password);
