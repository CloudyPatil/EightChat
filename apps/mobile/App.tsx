import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Socket } from 'socket.io-client';
import { AuthSession, login, register } from './src/api/auth';
import {
  ChatMessage,
  Conversation,
  createDirectConversation,
  clearConversation,
  deleteMessage,
  listConversations,
  listMessages,
  searchUsers,
  uploadImage,
} from './src/api/chat';
import { clearSession, getSession, saveSession, updateAccessToken } from './src/auth/session';
import { setSessionStore } from './src/api/client';
import { createSocket, SendMessageAcknowledgement } from './src/realtime/socket';
import { registerPushDevice, updatePushPreferences } from './src/api/notifications';
import { getPushPreferences, getPushToken, getStoredPushToken, PushPreferences, savePushPreferences } from './src/notifications/push';

// Show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type AuthMode = 'login' | 'register';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>('login');
  const pendingConversationId = useRef<string | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);

  useEffect(() => {
    void getSession().then((s) => {
      sessionRef.current = s;
      setSession(s);
    }).finally(() => setIsRestoringSession(false));

    // Wire session store for auto token refresh
    setSessionStore({
      getSession: () => sessionRef.current,
      updateAccessToken: async (token) => {
        await updateAccessToken(token);
        if (sessionRef.current) {
          const updated = { ...sessionRef.current, accessToken: token };
          sessionRef.current = updated;
          setSession(updated);
        }
      },
      onLogout: () => {
        void handleLogout();
      },
    });

    // Handle notification tap — open target conversation
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { conversation_id?: string };
      if (data?.conversation_id) {
        pendingConversationId.current = data.conversation_id;
      }
    });

    return () => sub.remove();
  }, []);

  const handleAuthenticated = async (newSession: AuthSession) => {
    await saveSession(newSession);
    sessionRef.current = newSession;
    setSession(newSession);
  };

  const handleLogout = async () => {
    await clearSession();
    sessionRef.current = null;
    setSession(null);
    setMode('login');
  };

  if (isRestoringSession) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      {session ? (
        <ChatApp
          session={session}
          onLogout={() => void handleLogout()}
          pendingConversationId={pendingConversationId}
        />
      ) : (
        <AuthScreen mode={mode} onChangeMode={setMode} onAuthenticated={handleAuthenticated} />
      )}
    </SafeAreaView>
  );
}

function ChatApp({ session, onLogout, pendingConversationId }: { session: AuthSession; onLogout: () => void; pendingConversationId: React.MutableRefObject<string | null> }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSettings, setIsSettings] = useState(false);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>({ enabled: false, hidePreview: true });
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const refreshConversations = useCallback(async () => {
    const results = await listConversations(session);
    setConversations(results);
  }, [session]);

  useEffect(() => {
    void refreshConversations().catch((error) => Alert.alert('Could not load chats', getErrorMessage(error))).finally(() => setIsLoading(false));
  }, [refreshConversations]);

  // Open conversation from a notification tap
  useEffect(() => {
    if (!isLoading && pendingConversationId.current && conversations.length > 0) {
      const target = conversations.find((c) => c.id === pendingConversationId.current);
      if (target) {
        pendingConversationId.current = null;
        openConversation(target);
      }
    }
  }, [isLoading, conversations]);

  useEffect(() => { void getPushPreferences().then(setPushPreferences); }, []);

  const changePushEnabled = async (enabled: boolean) => {
    try {
      let token = await getStoredPushToken();
      if (enabled) {
        const registration = await getPushToken();
        token = registration.token;
        await registerPushDevice(session, token, registration.platform, pushPreferences.hidePreview);
      } else if (token) {
        await updatePushPreferences(session, token, false, pushPreferences.hidePreview);
      }
      const next = { ...pushPreferences, enabled };
      setPushPreferences(next); await savePushPreferences(next);
    } catch (error) { Alert.alert('Push notifications', getErrorMessage(error)); }
  };

  const changeHidePreview = async (hidePreview: boolean) => {
    try {
      const token = await getStoredPushToken();
      if (token && pushPreferences.enabled) await updatePushPreferences(session, token, true, hidePreview);
      const next = { ...pushPreferences, hidePreview };
      setPushPreferences(next); await savePushPreferences(next);
    } catch (error) { Alert.alert('Notification settings', getErrorMessage(error)); }
  };

  useEffect(() => {
    const socket = createSocket(session);
    socketRef.current = socket;
    setSocket(socket);
    socket.on('message:new', ({ message }: { message: ChatMessage }) => {
      void refreshConversations().catch(() => undefined);
    });
    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [refreshConversations, session]);

  const openConversation = (conversation: Conversation) => {
    socketRef.current?.emit('conversation:join', { conversation_id: conversation.id });
    setActiveConversation(conversation);
  };

  const startConversation = async (username: string) => {
    try {
      const conversation = await createDirectConversation(session, username);
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setIsSearching(false);
      openConversation(conversation);
    } catch (error) {
      Alert.alert('Could not start chat', getErrorMessage(error));
    }
  };

  if (activeConversation) {
    return (
      <ConversationScreen
        conversation={activeConversation}
        currentUserId={session.user.id}
        session={session}
        socket={socket}
        onBack={() => {
          setActiveConversation(null);
          void refreshConversations().catch(() => undefined);
        }}
      />
    );
  }

  if (isSearching) {
    return <UserSearchScreen session={session} onBack={() => setIsSearching(false)} onSelect={startConversation} />;
  }
  if (isSettings) return <NotificationSettings preferences={pushPreferences} onBack={() => setIsSettings(false)} onEnabledChange={changePushEnabled} onHidePreviewChange={changeHidePreview} />;

  return (
    <View style={styles.inbox}>
      <View style={styles.inboxHeader}>
        <View>
          <Text style={styles.inboxTitle}>Messages</Text>
          <Text style={styles.inboxSubtitle}>@{session.user.username}</Text>
        </View>
        <View style={styles.headerActions}><Pressable onPress={() => setIsSettings(true)} style={styles.settingsButton}><Text style={styles.settingsText}>Settings</Text></Pressable><Pressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>Log out</Text></Pressable></View>
      </View>

      <Pressable accessibilityRole="button" onPress={() => setIsSearching(true)} style={styles.newChatButton}>
        <Text style={styles.newChatText}>+ New chat</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.fillCenter}><ActivityIndicator color="#8B5CF6" size="large" /></View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyInbox}>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>Start a chat by searching for someone’s username.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.conversationList}
          data={conversations}
          keyExtractor={(item) => item.id}
          onRefresh={() => void refreshConversations()}
          refreshing={isLoading}
          renderItem={({ item }) => (
            <Pressable onPress={() => openConversation(item)} style={styles.conversationRow}>
              <Avatar username={item.partner.username} />
              <View style={styles.conversationInfo}>
                <Text style={styles.conversationName}>{item.partner.display_name}</Text>
                <Text style={styles.conversationUsername}>@{item.partner.username}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function NotificationSettings({ preferences, onBack, onEnabledChange, onHidePreviewChange }: { preferences: PushPreferences; onBack: () => void; onEnabledChange: (enabled: boolean) => void; onHidePreviewChange: (hide: boolean) => void }) {
  return <View style={styles.inbox}>
    <View style={styles.chatHeader}><Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.chatTitle}>Notifications</Text><View style={styles.headerSpacer} /></View>
    <View style={styles.settingsCard}>
      <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Push notifications</Text><Text style={styles.settingDetail}>Receive new-message alerts.</Text></View><Switch value={preferences.enabled} onValueChange={onEnabledChange} trackColor={{ false: '#475569', true: '#7C3AED' }} /></View>
      <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Hide message previews</Text><Text style={styles.settingDetail}>Show “New message” on the lock screen.</Text></View><Switch disabled={!preferences.enabled} value={preferences.hidePreview} onValueChange={onHidePreviewChange} trackColor={{ false: '#475569', true: '#7C3AED' }} /></View>
    </View>
  </View>;
}

function UserSearchScreen({ session, onBack, onSelect }: { session: AuthSession; onBack: () => void; onSelect: (username: string) => void }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; username: string; display_name: string; avatar_url: string | null }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setUsers([]);
      return;
    }
    const timeout = setTimeout(() => {
      setIsLoading(true);
      void searchUsers(session, query.trim())
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setIsLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, session]);

  return (
    <View style={styles.inbox}>
      <View style={styles.chatHeader}>
        <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.chatTitle}>New chat</Text>
        <View style={styles.headerSpacer} />
      </View>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onChangeText={setQuery}
        placeholder="Search username"
        placeholderTextColor="#64748B"
        style={styles.searchInput}
        value={query}
      />
      {isLoading && <ActivityIndicator color="#8B5CF6" style={styles.searchLoader} />}
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item.username)} style={styles.conversationRow}>
            <Avatar username={item.username} />
            <View style={styles.conversationInfo}>
              <Text style={styles.conversationName}>{item.display_name}</Text>
              <Text style={styles.conversationUsername}>@{item.username}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={query.trim().length >= 2 && !isLoading ? <Text style={styles.noResults}>No users found.</Text> : null}
      />
    </View>
  );
}

function ConversationScreen({ conversation, currentUserId, session, socket, onBack }: {
  conversation: Conversation;
  currentUserId: string;
  session: AuthSession;
  socket: Socket | null;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasEarlierMessages, setHasEarlierMessages] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appendMessage = useCallback((message: ChatMessage) => {
    if (message.conversation_id !== conversation.id) return;
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }, [conversation.id]);

  useEffect(() => {
    setIsLoading(true);
    setMessages([]);
    setHasEarlierMessages(true);
    void listMessages(session, conversation.id)
      .then((loadedMessages) => {
        setMessages(loadedMessages);
        setHasEarlierMessages(loadedMessages.length === 50);
      })
      .catch((error) => Alert.alert('Could not load messages', getErrorMessage(error)))
      .finally(() => setIsLoading(false));
  }, [conversation.id, session]);

  useEffect(() => {
    const onMessage = ({ message }: { message: ChatMessage }) => appendMessage(message);
    const onTyping = (event: { conversation_id: string; user_id: string; is_typing: boolean }) => {
      if (event.conversation_id === conversation.id && event.user_id !== currentUserId) setIsPartnerTyping(event.is_typing);
    };
    const onDeleted = ({ message_id }: { message_id: string }) => setMessages((current) => current.map((item) => item.id === message_id ? { ...item, body: '', is_deleted: true, message_type: 'text' } : item));
    socket?.on('message:new', onMessage);
    socket?.on('typing:update', onTyping);
    socket?.on('message:deleted', onDeleted);
    socket?.emit('conversation:join', { conversation_id: conversation.id });
    return () => {
      socket?.off('message:new', onMessage);
      socket?.off('typing:update', onTyping);
      socket?.off('message:deleted', onDeleted);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [appendMessage, conversation.id, currentUserId, socket]);

  const updateDraft = (text: string) => {
    setDraft(text);
    if (!socket) return;
    socket.emit('typing:update', { conversation_id: conversation.id, is_typing: text.length > 0 });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit('typing:update', { conversation_id: conversation.id, is_typing: false }), 2500);
  };

  const send = () => {
    const body = draft.trim();
    if (!body || !socket || isSending) return;
    setIsSending(true);
    socket.emit('message:send', { conversation_id: conversation.id, body }, (result: SendMessageAcknowledgement) => {
      setIsSending(false);
      if (!result.success || !result.message) {
        Alert.alert('Could not send message', result.error ?? 'Please try again.');
        return;
      }
      appendMessage(result.message);
      setDraft('');
      socket.emit('typing:update', { conversation_id: conversation.id, is_typing: false });
    });
  };

  const sendImage = async () => {
    if (!socket || isUploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to send images.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    setIsUploading(true);
    try {
      const imageUrl = await uploadImage(session, conversation.id, result.assets[0]);
      socket.emit('message:send', { conversation_id: conversation.id, body: imageUrl, message_type: 'image' }, (response: SendMessageAcknowledgement) => {
        setIsUploading(false);
        if (!response.success || !response.message) return Alert.alert('Could not send image', response.error ?? 'Please try again.');
        appendMessage(response.message);
      });
    } catch (error) {
      setIsUploading(false);
      Alert.alert('Could not upload image', getErrorMessage(error));
    }
  };

  const loadEarlierMessages = async () => {
    const oldestMessage = messages[0];
    if (!oldestMessage || isLoadingEarlier || !hasEarlierMessages) return;
    setIsLoadingEarlier(true);
    try {
      const earlierMessages = await listMessages(session, conversation.id, oldestMessage.created_at);
      setMessages((current) => [...earlierMessages, ...current]);
      setHasEarlierMessages(earlierMessages.length === 50);
    } catch (error) {
      Alert.alert('Could not load earlier messages', getErrorMessage(error));
    } finally {
      setIsLoadingEarlier(false);
    }
  };

  const removeMessage = (message: ChatMessage) => {
    const deleteForMe = async () => {
      try { await deleteMessage(session, message.id, 'me'); setMessages((current) => current.filter((item) => item.id !== message.id)); }
      catch (error) { Alert.alert('Could not delete message', getErrorMessage(error)); }
    };
    if (message.sender_id !== currentUserId) return void Alert.alert('Delete message', 'Remove this message from your chat?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete for me', style: 'destructive', onPress: () => void deleteForMe() }]);
    Alert.alert('Delete message', 'Choose where to remove it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete for me', style: 'destructive', onPress: () => void deleteForMe() },
      { text: 'Delete for everyone', style: 'destructive', onPress: () => void deleteMessage(session, message.id, 'everyone').catch((error) => Alert.alert('Could not delete message', getErrorMessage(error))) },
    ]);
  };

  const clearChat = () => Alert.alert('Clear chat', 'This removes all current messages only from your chat.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear chat', style: 'destructive', onPress: () => void clearConversation(session, conversation.id).then(() => setMessages([])).catch((error) => Alert.alert('Could not clear chat', getErrorMessage(error))) },
  ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatScreen}>
      <View style={styles.chatHeader}>
        <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.chatHeaderName}>
          <Text style={styles.chatTitle}>{conversation.partner.display_name}</Text>
          <Text style={styles.chatUsername}>@{conversation.partner.username}{isPartnerTyping ? ' is typing…' : ''}</Text>
        </View>
        <Pressable onPress={clearChat} style={styles.clearButton}><Text style={styles.clearText}>Clear</Text></Pressable>
      </View>
      {isLoading ? <View style={styles.fillCenter}><ActivityIndicator color="#8B5CF6" size="large" /></View> : (
        <FlatList
          contentContainerStyle={styles.messageList}
          data={messages}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={hasEarlierMessages ? <Pressable disabled={isLoadingEarlier} onPress={() => void loadEarlierMessages()} style={styles.loadEarlierButton}>{isLoadingEarlier ? <ActivityIndicator color="#C4B5FD" /> : <Text style={styles.loadEarlierText}>Load earlier messages</Text>}</Pressable> : null}
          renderItem={({ item }) => <MessageBubble message={item} isMine={item.sender_id === currentUserId} onLongPress={() => removeMessage(item)} />}
        />
      )}
      <View style={styles.composer}>
        <Pressable disabled={isUploading} onPress={() => void sendImage()} style={styles.attachButton}><Text style={styles.attachText}>{isUploading ? '…' : '+'}</Text></Pressable>
        <TextInput
          multiline
          onChangeText={updateDraft}
          placeholder="Write a message"
          placeholderTextColor="#64748B"
          style={styles.composerInput}
          value={draft}
        />
        <Pressable disabled={!draft.trim() || isSending} onPress={send} style={({ pressed }) => [styles.sendButton, (!draft.trim() || pressed) && styles.buttonPressed]}>
          {isSending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, isMine, onLongPress }: { message: ChatMessage; isMine: boolean; onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} style={[styles.bubble, isMine ? styles.myBubble : styles.partnerBubble]}>
      {message.is_deleted ? <Text style={styles.deletedText}>This message was deleted</Text> : message.message_type === 'image' ? <Image source={{ uri: message.body }} style={styles.messageImage} /> : <Text style={styles.messageText}>{message.body}</Text>}
      <Text style={styles.messageTime}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
    </Pressable>
  );
}

function Avatar({ username }: { username: string }) {
  return <View style={styles.avatar}><Text style={styles.avatarText}>{username.slice(0, 1).toUpperCase()}</Text></View>;
}

function LoadingScreen() {
  return <SafeAreaView style={[styles.app, styles.fillCenter]}><Text style={styles.brand}>eightchat</Text><ActivityIndicator color="#8B5CF6" size="large" /></SafeAreaView>;
}

function AuthScreen({ mode, onChangeMode, onAuthenticated }: { mode: AuthMode; onChangeMode: (mode: AuthMode) => void; onAuthenticated: (session: AuthSession) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLogin = mode === 'login';
  const submit = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) return Alert.alert('Choose a valid username', 'Use 3-30 lowercase letters, numbers, or underscores.');
    if (password.length < 8) return Alert.alert('Password too short', 'Your password must be at least 8 characters.');
    setIsSubmitting(true);
    try { await onAuthenticated(isLogin ? await login(normalizedUsername, password) : await register(normalizedUsername, password)); }
    catch (error) { Alert.alert(isLogin ? 'Login failed' : 'Account creation failed', getErrorMessage(error)); }
    finally { setIsSubmitting(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authContainer}>
    <View style={styles.header}><Text style={styles.brand}>eightchat</Text><Text style={styles.tagline}>Private conversations, simply.</Text></View>
    <View style={styles.card}>
      <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create your account'}</Text><Text style={styles.subtitle}>{isLogin ? 'Sign in to continue chatting.' : 'A username and password are all you need.'}</Text>
      <Text style={styles.label}>Username</Text><TextInput autoCapitalize="none" autoCorrect={false} editable={!isSubmitting} maxLength={30} onChangeText={setUsername} placeholder="your_username" placeholderTextColor="#64748B" style={styles.input} value={username} />
      <Text style={styles.label}>Password</Text><TextInput autoCapitalize="none" editable={!isSubmitting} onChangeText={setPassword} placeholder="At least 8 characters" placeholderTextColor="#64748B" secureTextEntry style={styles.input} value={password} />
      <Pressable disabled={isSubmitting} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, (pressed || isSubmitting) && styles.buttonPressed]}>{isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{isLogin ? 'Log in' : 'Create account'}</Text>}</Pressable>
      <Pressable disabled={isSubmitting} onPress={() => onChangeMode(isLogin ? 'register' : 'login')} style={styles.linkButton}><Text style={styles.linkText}>{isLogin ? "Don't have an account? Create one" : 'Already have an account? Log in'}</Text></Pressable>
    </View>
  </KeyboardAvoidingView>;
}

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#0F172A' }, fillCenter: { alignItems: 'center', flex: 1, gap: 24, justifyContent: 'center' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 24 }, header: { marginBottom: 34 }, brand: { color: '#F8FAFC', fontSize: 32, fontWeight: '800', letterSpacing: -1 }, tagline: { color: '#94A3B8', fontSize: 16, marginTop: 6 }, card: { backgroundColor: '#1E293B', borderRadius: 20, padding: 22 }, title: { color: '#F8FAFC', fontSize: 23, fontWeight: '700' }, subtitle: { color: '#94A3B8', fontSize: 15, lineHeight: 21, marginBottom: 26, marginTop: 7 }, label: { color: '#CBD5E1', fontSize: 14, fontWeight: '600', marginBottom: 8 }, input: { backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: 12, borderWidth: 1, color: '#F8FAFC', fontSize: 16, marginBottom: 18, paddingHorizontal: 14, paddingVertical: 13 }, primaryButton: { alignItems: 'center', backgroundColor: '#7C3AED', borderRadius: 12, minHeight: 50, justifyContent: 'center', marginTop: 4 }, buttonPressed: { opacity: 0.7 }, primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, linkButton: { alignItems: 'center', paddingTop: 20 }, linkText: { color: '#C4B5FD', fontSize: 14, fontWeight: '600' },
  inbox: { flex: 1, padding: 24 }, inboxHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 }, inboxTitle: { color: '#F8FAFC', fontSize: 28, fontWeight: '800' }, inboxSubtitle: { color: '#94A3B8', fontSize: 15, marginTop: 3 }, headerActions: { flexDirection: 'row', gap: 7 }, settingsButton: { borderColor: '#475569', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9 }, settingsText: { color: '#C4B5FD', fontSize: 13, fontWeight: '600' }, logoutButton: { borderColor: '#475569', borderRadius: 10, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 }, logoutText: { color: '#E2E8F0', fontSize: 14, fontWeight: '600' }, settingsCard: { backgroundColor: '#1E293B', borderRadius: 16, marginTop: 22, paddingHorizontal: 16 }, settingRow: { alignItems: 'center', borderBottomColor: '#334155', borderBottomWidth: 1, flexDirection: 'row', minHeight: 82 }, settingCopy: { flex: 1, paddingRight: 16 }, settingTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' }, settingDetail: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginTop: 3 }, newChatButton: { alignItems: 'center', backgroundColor: '#7C3AED', borderRadius: 12, marginTop: 28, paddingVertical: 14 }, newChatText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, emptyInbox: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28 }, emptyTitle: { color: '#F8FAFC', fontSize: 21, fontWeight: '700', textAlign: 'center' }, emptyText: { color: '#94A3B8', fontSize: 16, lineHeight: 23, marginTop: 9, textAlign: 'center' }, conversationList: { paddingTop: 16 }, conversationRow: { alignItems: 'center', borderBottomColor: '#1E293B', borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 15 }, avatar: { alignItems: 'center', backgroundColor: '#4C1D95', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 }, avatarText: { color: '#EDE9FE', fontSize: 18, fontWeight: '800' }, conversationInfo: { flex: 1, marginLeft: 13 }, conversationName: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' }, conversationUsername: { color: '#94A3B8', fontSize: 14, marginTop: 3 }, chevron: { color: '#94A3B8', fontSize: 28 },
  chatScreen: { flex: 1 }, chatHeader: { alignItems: 'center', borderBottomColor: '#1E293B', borderBottomWidth: 1, flexDirection: 'row', minHeight: 68, paddingHorizontal: 16 }, backButton: { alignItems: 'center', justifyContent: 'center', width: 40 }, backText: { color: '#EDE9FE', fontSize: 38, fontWeight: '300', lineHeight: 42 }, chatHeaderName: { flex: 1 }, chatTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '700' }, chatUsername: { color: '#94A3B8', fontSize: 13, marginTop: 2 }, headerSpacer: { width: 40 }, clearButton: { paddingHorizontal: 6, paddingVertical: 8 }, clearText: { color: '#C4B5FD', fontSize: 13, fontWeight: '700' }, searchInput: { backgroundColor: '#1E293B', borderRadius: 12, color: '#F8FAFC', fontSize: 16, marginTop: 18, paddingHorizontal: 14, paddingVertical: 13 }, searchLoader: { marginTop: 14 }, noResults: { color: '#94A3B8', marginTop: 24, textAlign: 'center' }, messageList: { padding: 16 }, loadEarlierButton: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 10 }, loadEarlierText: { color: '#C4B5FD', fontSize: 13, fontWeight: '600' }, bubble: { borderRadius: 16, marginBottom: 10, maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 10 }, myBubble: { alignSelf: 'flex-end', backgroundColor: '#6D28D9', borderBottomRightRadius: 3 }, partnerBubble: { alignSelf: 'flex-start', backgroundColor: '#1E293B', borderBottomLeftRadius: 3 }, messageText: { color: '#F8FAFC', fontSize: 16, lineHeight: 21 }, deletedText: { color: '#C4B5FD', fontSize: 14, fontStyle: 'italic' }, messageImage: { borderRadius: 10, height: 220, width: 220 }, messageTime: { alignSelf: 'flex-end', color: '#DDD6FE', fontSize: 11, marginTop: 5 }, composer: { alignItems: 'flex-end', borderTopColor: '#1E293B', borderTopWidth: 1, flexDirection: 'row', padding: 12 }, attachButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 34 }, attachText: { color: '#C4B5FD', fontSize: 27, lineHeight: 30 }, composerInput: { backgroundColor: '#1E293B', borderRadius: 18, color: '#F8FAFC', flex: 1, fontSize: 16, maxHeight: 110, paddingHorizontal: 14, paddingVertical: 10 }, sendButton: { alignItems: 'center', backgroundColor: '#7C3AED', borderRadius: 12, height: 44, justifyContent: 'center', marginLeft: 8, width: 58 }, sendText: { color: '#FFFFFF', fontWeight: '700' },
});
