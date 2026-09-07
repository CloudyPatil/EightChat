import { AuthSession } from './auth';

export const registerPushDevice = async (session: AuthSession, token: string, platform: 'ios' | 'android', hidePreview: boolean): Promise<void> => {
  const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api'}/notifications/devices`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expo_push_token: token, platform, hide_message_preview: hidePreview }),
  });
  if (!response.ok) throw new Error('Could not enable push notifications.');
};

export const updatePushPreferences = async (session: AuthSession, token: string, enabled: boolean, hidePreview: boolean): Promise<void> => {
  const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api'}/notifications/preferences`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expo_push_token: token, notifications_enabled: enabled, hide_message_preview: hidePreview }),
  });
  if (!response.ok) throw new Error('Could not update notification settings.');
};
