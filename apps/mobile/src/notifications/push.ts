import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'eightchat.push-token';
export type PushPreferences = { enabled: boolean; hidePreview: boolean };
const PREFERENCES_KEY = 'eightchat.push-preferences';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

export const getPushPreferences = async (): Promise<PushPreferences> => {
  const saved = await SecureStore.getItemAsync(PREFERENCES_KEY);
  return saved ? JSON.parse(saved) as PushPreferences : { enabled: false, hidePreview: true };
};
export const savePushPreferences = (preferences: PushPreferences) => SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(preferences));
export const getStoredPushToken = () => SecureStore.getItemAsync(TOKEN_KEY);

export const getPushToken = async (): Promise<{ token: string; platform: 'ios' | 'android' }> => {
  if (!Device.isDevice) throw new Error('Push notifications require a physical device.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('messages', { name: 'Messages', importance: Notifications.AndroidImportance.HIGH });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Notification permission was not granted.');
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId || projectId === 'REPLACE_WITH_EAS_PROJECT_ID') throw new Error('Expo project ID is not configured.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
};
