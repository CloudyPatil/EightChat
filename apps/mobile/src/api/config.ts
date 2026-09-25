const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

if (!__DEV__ && (!configuredUrl || !configuredUrl.startsWith('https://'))) {
  throw new Error('A release build requires an HTTPS EXPO_PUBLIC_API_URL.');
}

export const apiBaseUrl = configuredUrl ?? 'http://10.0.2.2:3000/api';

if (!apiBaseUrl.endsWith('/api')) {
  throw new Error('EXPO_PUBLIC_API_URL must end with /api.');
}
