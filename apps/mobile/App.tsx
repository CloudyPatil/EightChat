import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthSession, login, register } from './src/api/auth';
import { clearSession, getSession, saveSession } from './src/auth/session';

type AuthMode = 'login' | 'register';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>('login');

  useEffect(() => {
    const restoreSession = async () => {
      try {
        setSession(await getSession());
      } finally {
        setIsRestoringSession(false);
      }
    };

    void restoreSession();
  }, []);

  const handleAuthenticated = async (newSession: AuthSession) => {
    await saveSession(newSession);
    setSession(newSession);
  };

  const handleLogout = async () => {
    await clearSession();
    setSession(null);
    setMode('login');
  };

  if (isRestoringSession) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      {session ? (
        <InboxScreen username={session.user.username} onLogout={() => void handleLogout()} />
      ) : (
        <AuthScreen
          mode={mode}
          onChangeMode={setMode}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={[styles.app, styles.centered]}>
      <StatusBar style="light" />
      <Text style={styles.brand}>eightchat</Text>
      <ActivityIndicator color="#8B5CF6" size="large" />
    </SafeAreaView>
  );
}

function AuthScreen({
  mode,
  onChangeMode,
  onAuthenticated,
}: {
  mode: AuthMode;
  onChangeMode: (mode: AuthMode) => void;
  onAuthenticated: (session: AuthSession) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLogin = mode === 'login';

  const submit = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      Alert.alert('Choose a valid username', 'Use 3–30 lowercase letters, numbers, or underscores.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Your password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newSession = isLogin
        ? await login(normalizedUsername, password)
        : await register(normalizedUsername, password);
      await onAuthenticated(newSession);
    } catch (error) {
      Alert.alert(isLogin ? 'Login failed' : 'Account creation failed', getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.authContainer}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>eightchat</Text>
        <Text style={styles.tagline}>Private conversations, simply.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.subtitle}>
          {isLogin ? 'Sign in to continue chatting.' : 'A username and password are all you need.'}
        </Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          maxLength={30}
          onChangeText={setUsername}
          placeholder="your_username"
          placeholderTextColor="#64748B"
          style={styles.input}
          value={username}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          autoCapitalize="none"
          editable={!isSubmitting}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          placeholderTextColor="#64748B"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.primaryButton, (pressed || isSubmitting) && styles.buttonPressed]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{isLogin ? 'Log in' : 'Create account'}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => onChangeMode(isLogin ? 'register' : 'login')}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            {isLogin ? "Don't have an account? Create one" : 'Already have an account? Log in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function InboxScreen({ username, onLogout }: { username: string; onLogout: () => void }) {
  return (
    <View style={styles.inbox}>
      <View style={styles.inboxHeader}>
        <View>
          <Text style={styles.inboxTitle}>Messages</Text>
          <Text style={styles.inboxSubtitle}>@{username}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.emptyInbox}>
        <Text style={styles.emptyTitle}>Your inbox is ready</Text>
        <Text style={styles.emptyText}>Conversations will appear here in the next phase.</Text>
      </View>
    </View>
  );
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#0F172A' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 24 },
  authContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { marginBottom: 34 },
  brand: { color: '#F8FAFC', fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  tagline: { color: '#94A3B8', fontSize: 16, marginTop: 6 },
  card: { backgroundColor: '#1E293B', borderRadius: 20, padding: 22 },
  title: { color: '#F8FAFC', fontSize: 23, fontWeight: '700' },
  subtitle: { color: '#94A3B8', fontSize: 15, lineHeight: 21, marginBottom: 26, marginTop: 7 },
  label: { color: '#CBD5E1', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderRadius: 12,
    borderWidth: 1,
    color: '#F8FAFC',
    fontSize: 16,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  primaryButton: { alignItems: 'center', backgroundColor: '#7C3AED', borderRadius: 12, minHeight: 50, justifyContent: 'center', marginTop: 4 },
  buttonPressed: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  linkButton: { alignItems: 'center', paddingTop: 20 },
  linkText: { color: '#C4B5FD', fontSize: 14, fontWeight: '600' },
  inbox: { flex: 1, padding: 24 },
  inboxHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 },
  inboxTitle: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' },
  inboxSubtitle: { color: '#94A3B8', fontSize: 15, marginTop: 3 },
  logoutButton: { borderColor: '#475569', borderRadius: 10, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  logoutText: { color: '#E2E8F0', fontSize: 14, fontWeight: '600' },
  emptyInbox: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { color: '#F8FAFC', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: '#94A3B8', fontSize: 16, lineHeight: 23, marginTop: 9, textAlign: 'center' },
});
