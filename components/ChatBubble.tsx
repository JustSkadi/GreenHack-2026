import { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity,
  FlatList, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, PanResponder, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, mono, radius } from '../constants/theme';
import { useMeshStore } from '../stores/meshStore';
import { useT } from '../lib/i18n';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const BUBBLE = 42;
const EDGE   = 14;
const { width: SW, height: SH } = Dimensions.get('window');

export default function ChatBubble() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: t.chat_welcome },
  ]);
  const flatRef = useRef<FlatList>(null);
  const { mode } = useMeshStore();

  // Draggable position
  const posX    = useRef(new Animated.Value(SW - BUBBLE - EDGE)).current;
  const posY    = useRef(new Animated.Value(0)).current;
  const curX    = useRef(SW - BUBBLE - EDGE);
  const curY    = useRef(0);
  const isDrag  = useRef(false);

  useEffect(() => {
    const y = insets.top + 72;
    posY.setValue(y);
    curY.current = y;
  }, [insets.top]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
    onPanResponderGrant: () => { isDrag.current = false; },
    onPanResponderMove: (_, gs) => {
      if (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6) isDrag.current = true;
      posX.setValue(curX.current + gs.dx);
      posY.setValue(curY.current + gs.dy);
    },
    onPanResponderRelease: (_, gs) => {
      if (!isDrag.current) {
        setOpen(true);
        return;
      }
      const newX = curX.current + gs.dx;
      const newY = Math.max(
        insets.top + 60,
        Math.min(curY.current + gs.dy, SH - BUBBLE - 80),
      );
      const snapX = newX + BUBBLE / 2 < SW / 2 ? EDGE : SW - BUBBLE - EDGE;
      curX.current = snapX;
      curY.current = newY;
      Animated.parallel([
        Animated.spring(posX, { toValue: snapX, useNativeDriver: false, tension: 120, friction: 8 }),
        Animated.spring(posY, { toValue: newY,  useNativeDriver: false, tension: 120, friction: 8 }),
      ]).start();
    },
  })).current;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setHistory(h => [...h, { id: `u-${Date.now()}`, role: 'user', text }]);
    setLoading(true);
    try {
      // [P4] reply = await askOnline(text) / askOffline(text)
      const reply = `[MOCK] ${text}`;
      setHistory(h => [...h, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    } finally {
      setLoading(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <>
      <Animated.View
        style={[styles.bubble, { left: posX, top: posY }]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.bubbleText}>AI</Text>
        <View style={[styles.modeDot, { backgroundColor: mode === 'online' ? colors.green : colors.textMuted }]} />
      </Animated.View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{t.chat_title}</Text>
                <View style={styles.modeRow}>
                  <View style={[styles.modeDotSmall, { backgroundColor: mode === 'online' ? colors.green : colors.textMuted }]} />
                  <Text style={styles.modeText}>{mode === 'online' ? 'online · cloud' : 'offline · on-device'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              ref={flatRef}
              data={history}
              keyExtractor={m => m.id}
              style={styles.messageList}
              contentContainerStyle={{ padding: spacing.md, gap: 10 }}
              renderItem={({ item }) => (
                <View style={[styles.bubble2, item.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
                  <Text style={styles.roleLabel}>
                    {item.role === 'user' ? t.chat_role_user : t.chat_role_ai}
                  </Text>
                  <Text style={[styles.msgText, item.role === 'user' && styles.msgTextUser]}>
                    {item.text}
                  </Text>
                </View>
              )}
            />

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={styles.loadingText}>{t.chat_loading}</Text>
              </View>
            )}

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder={t.chat_placeholder}
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={send}
                  returnKeyType="send"
                  multiline
                />
                <TouchableOpacity style={styles.sendBtn} onPress={send}>
                  <Text style={styles.sendText}>↑</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: BUBBLE, height: BUBBLE,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bubbleText: { fontFamily: mono, fontSize: 11, fontWeight: '700', color: colors.text },
  modeDot:    { position: 'absolute', top: 7, right: 7, width: 5, height: 5, borderRadius: 3 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    height: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle:   { fontSize: 16, fontWeight: '700', color: colors.text },
  modeRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  modeDotSmall: { width: 5, height: 5, borderRadius: 3 },
  modeText:     { fontFamily: mono, fontSize: 9, color: colors.textMuted },
  closeBtn:     { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  closeText:    { fontSize: 13, color: colors.textSub },

  messageList: { flex: 1 },
  bubble2:     { maxWidth: '82%', gap: 3 },
  bubbleAI:    { alignSelf: 'flex-start' },
  bubbleUser:  { alignSelf: 'flex-end', alignItems: 'flex-end' },
  roleLabel:   { fontFamily: mono, fontSize: 8, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  msgText: {
    fontSize: 14, color: colors.text, lineHeight: 20,
    backgroundColor: colors.surfaceHigh,
    padding: spacing.md, borderRadius: radius.md,
  },
  msgTextUser: { backgroundColor: colors.blue, color: '#fff' },

  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 6 },
  loadingText: { fontFamily: mono, fontSize: 10, color: colors.textMuted },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: spacing.md,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  input:    { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 14, color: colors.text, maxHeight: 100 },
  sendBtn:  { width: 44, height: 44, margin: 4, backgroundColor: colors.blue, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
