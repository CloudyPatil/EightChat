import * as SecureStore from 'expo-secure-store';
import { AuthSession } from '../api/auth';

const SESSION_KEY = 'eightchat.session';

export const getSession = async (): Promise<AuthSession | null> => {
  const storedSession = await SecureStore.getItemAsync(SESSION_KEY);
  if (!storedSession) return null;

  try {
    return JSON.parse(storedSession) as AuthSession;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
};

export const saveSession = (session: AuthSession): Promise<void> =>
  SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));

export const clearSession = (): Promise<void> => SecureStore.deleteItemAsync(SESSION_KEY);
