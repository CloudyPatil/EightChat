import { AuthSession } from './auth';
import { apiFetch } from './client';

export const registerPushDevice = async (_session: AuthSession, token: string, platform: 'ios' | 'android', hidePreview: boolean): Promise<void> => {
  await apiFetch('/notifications/devices', {
    method: 'POST',
    body: JSON.stringify({ expo_push_token: token, platform, hide_message_preview: hidePreview }),
  });
};

export const updatePushPreferences = async (_session: AuthSession, token: string, enabled: boolean, hidePreview: boolean): Promise<void> => {
  await apiFetch('/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ expo_push_token: token, notifications_enabled: enabled, hide_message_preview: hidePreview }),
  });
};
