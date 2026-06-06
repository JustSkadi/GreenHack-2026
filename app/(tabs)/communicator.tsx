import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, mono, radius } from '../../constants/theme';
import { useMeshStore } from '../../stores/meshStore';
import { useAuthStore } from '../../stores/authStore';
import MessageItem from '../../components/MessageItem';
import { useT } from '../../lib/i18n';
import { Message, MessageGroup } from '../../types';

// [P2] Supabase realtime subscription + history fetch

type ThreadInfo = {
  senderId: string;
  senderName: string;
  senderTier: number;
  tab: MessageGroup;
  readOnly: boolean;
};

export default function CommunicatorScreen() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<MessageGroup>('global');
  const [thread, setThread]       = useState<ThreadInfo | null>(null);
  const [threadInput, setThreadInput] = useState('');
  const listRef   = useRef<FlatList>(null);
  const threadRef = useRef<FlatList>(null);

  const { messages, sendMessage, mode } = useMeshStore();
  const { profile } = useAuthStore();

  const TABS: { key: MessageGroup; label: string }[] = [
    { key: 'global',     label: t.comm_tab_all },
    { key: 'family',     label: t.comm_tab_family },
    { key: 'broadcasts', label: t.comm_tab_alerts },
  ];

  const currentMessages = messages[activeTab];

  useEffect(() => {
    if (currentMessages.length > 0)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, [currentMessages.length]);

  const openThread = (msg: Message) => {
    if (activeTab === 'broadcasts') {
      setThread({ senderId: msg.sender_id, senderName: msg.sender_username, senderTier: msg.sender_tier, tab: 'broadcasts', readOnly: true });
    } else if (activeTab === 'family') {
      setThread({ senderId: 'family', senderName: 'Family', senderTier: 0, tab: 'family', readOnly: false });
    } else {
      setThread({ senderId: msg.sender_id, senderName: msg.sender_username, senderTier: msg.sender_tier, tab: 'global', readOnly: false });
    }
  };

  const threadMessages = useMemo((): Message[] => {
    if (!thread) return [];
    if (thread.tab === 'family')     return messages.family;
    if (thread.tab === 'broadcasts') return messages.broadcasts.filter(m => m.sender_id === thread.senderId);
    return messages.global.filter(m =>
      m.sender_id === thread.senderId || m.sender_id === (profile?.id ?? 'user-local-001')
    );
  }, [thread, messages, profile]);

  const sendInThread = () => {
    const text = threadInput.trim();
    if (!text || !thread) return;
    sendMessage(text, thread.tab === 'family' ? 'family' : 'global');
    setThreadInput('');
    setTimeout(() => threadRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const tierColor = (tier: number) =>
    ({ 1: colors.tier1, 2: colors.tier2, 3: colors.tier3, 4: colors.tier4 } as Record<number, string>)[tier] ?? colors.textMuted;

  return (
    <>
      <View style={styles.screen}>
        {/* Tab row */}
        <View style={styles.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
              {messages[tab.key].length > 0 && activeTab !== tab.key && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{messages[tab.key].length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'offline' && (
          <View style={styles.offlineBar}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>{t.comm_offline_bar}</Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={currentMessages}
          keyExtractor={m => m.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => openThread(item)} activeOpacity={0.72}>
              <MessageItem message={item} isOwn={item.sender_id === profile?.id} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>◌</Text>
              <Text style={styles.emptyText}>{t.comm_empty}</Text>
            </View>
          }
        />

        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>tap message · open conversation</Text>
        </View>
      </View>

      {/* ── Conversation Modal ── */}
      <Modal
        visible={thread !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setThread(null)}
      >
        <SafeAreaView style={styles.threadRoot} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            {/* Header */}
            <View style={styles.threadHeader}>
              <TouchableOpacity onPress={() => setThread(null)} style={styles.backBtn}>
                <Text style={styles.backArrow}>←</Text>
              </TouchableOpacity>
              <View style={styles.threadSenderWrap}>
                {thread && thread.senderTier > 0 && (
                  <View style={[styles.threadTierDot, { backgroundColor: tierColor(thread.senderTier) }]} />
                )}
                <Text style={styles.threadSenderName} numberOfLines={1}>{thread?.senderName}</Text>
              </View>
              {thread?.readOnly && (
                <View style={styles.readOnlyChip}>
                  <Text style={styles.readOnlyText}>READ ONLY</Text>
                </View>
              )}
            </View>

            {/* Thread messages */}
            <FlatList
              ref={threadRef}
              data={threadMessages}
              keyExtractor={m => m.id}
              style={styles.list}
              contentContainerStyle={[styles.listContent, { paddingBottom: spacing.md }]}
              renderItem={({ item }) => (
                <MessageItem message={item} isOwn={item.sender_id === (profile?.id ?? 'user-local-001')} />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>◌</Text>
                  <Text style={styles.emptyText}>{t.comm_empty}</Text>
                </View>
              }
            />

            {/* Input bar — only if not read-only */}
            {thread && !thread.readOnly && (
              <View style={styles.inputBar}>
                <TextInput
                  style={styles.input}
                  value={threadInput}
                  onChangeText={setThreadInput}
                  placeholder={thread.tab === 'family' ? t.comm_placeholder_family : t.comm_placeholder}
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={sendInThread}
                  returnKeyType="send"
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !threadInput.trim() && styles.sendBtnDisabled]}
                  onPress={sendInThread}
                  disabled={!threadInput.trim()}
                >
                  <Text style={styles.sendIcon}>↑</Text>
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.sm,
  },
  tabActive:      { backgroundColor: colors.surfaceHigh },
  tabLabel:       { fontFamily: mono, fontSize: 10, letterSpacing: 0.6, color: colors.textMuted },
  tabLabelActive: { color: colors.text, fontWeight: '600' },
  badge: {
    backgroundColor: colors.red, minWidth: 16, height: 16,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontFamily: mono, fontSize: 8, color: '#fff', fontWeight: '700' },

  offlineBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: spacing.md, marginVertical: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.yellow,
  },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.yellow },
  offlineText: { fontFamily: mono, fontSize: 9, color: colors.yellow, flex: 1 },

  list:        { flex: 1 },
  listContent: { paddingVertical: spacing.sm },

  emptyState: { flex: 1, alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyIcon:  { fontSize: 32, color: colors.textMuted },
  emptyText:  { fontFamily: mono, fontSize: 11, color: colors.textMuted },

  tapHint:     { alignItems: 'center', paddingVertical: 6 },
  tapHintText: { fontFamily: mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.3 },

  // ── Thread / Conversation ──
  threadRoot:   { flex: 1, backgroundColor: colors.surface },
  threadHeader: {
    height: 54, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:         { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  backArrow:       { fontSize: 18, color: colors.text },
  threadSenderWrap:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadTierDot:   { width: 7, height: 7, borderRadius: 4 },
  threadSenderName:{ fontSize: 15, fontWeight: '700', color: colors.text },
  readOnlyChip:    { backgroundColor: colors.surfaceHigh, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  readOnlyText:    { fontFamily: mono, fontSize: 8, color: colors.textMuted, letterSpacing: 0.8 },

  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  input: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14, color: colors.text, maxHeight: 100 },
  sendBtn: {
    width: 44, height: 44, margin: 4,
    backgroundColor: colors.blue, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendIcon: { fontSize: 18, color: '#fff', fontWeight: '600' },
});
