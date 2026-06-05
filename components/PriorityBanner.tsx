import { useState, useEffect, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, mono, radius } from '../constants/theme';
import { useMeshStore } from '../stores/meshStore';

export default function PriorityBanner() {
  const { activePriorityMessage, dismissPriority } = useMeshStore();
  const insets     = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-70)).current;

  useEffect(() => {
    if (activePriorityMessage) {
      Animated.parallel([
        Animated.spring(opacity,    { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      ]).start();
    } else {
      setExpanded(false);
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -70, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [activePriorityMessage]);

  if (!activePriorityMessage) return null;

  const msg = activePriorityMessage;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Animated.View style={[styles.banner, { opacity, transform: [{ translateY }], top: insets.top + 60 }]}>
        <TouchableOpacity style={styles.inner} onPress={() => setExpanded(true)} activeOpacity={0.85}>
          <View style={styles.left}>
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PRIORITY · T1</Text>
              <Text style={styles.content} numberOfLines={2}>{msg.content}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={dismissPriority}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            style={styles.closeBtn}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>PRIORITY ALERT · TIER 1</Text>
              </View>
              <TouchableOpacity onPress={() => setExpanded(false)} style={styles.cardClose}>
                <Text style={styles.cardCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.senderName}>{msg.sender_username}</Text>
            <Text style={styles.senderMeta}>{time} · {msg.hops === 0 ? 'direct' : `${msg.hops} hops`}</Text>

            <View style={styles.divider} />

            <Text style={styles.fullContent}>{msg.content}</Text>

            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => { setExpanded(false); dismissPriority(); }}
            >
              <Text style={styles.dismissText}>DISMISS ALERT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: spacing.md, right: spacing.md,
    zIndex: 100,
  },
  inner: {
    backgroundColor: colors.red,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  left:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.7)' },
  label:    { fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2, marginBottom: 2 },
  content:  { fontSize: 13, fontWeight: '600', color: '#fff', lineHeight: 18 },
  closeBtn: { padding: 2 },
  closeText:{ fontSize: 15, color: 'rgba(255,255,255,0.65)' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.red,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
    gap: spacing.sm,
  },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:          { backgroundColor: colors.red, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  badgeText:      { fontFamily: mono, fontSize: 9, color: '#fff', fontWeight: '700', letterSpacing: 0.8 },
  cardClose:      { width: 28, height: 28, borderRadius: radius.md, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  cardCloseText:  { fontSize: 12, color: colors.textSub },
  senderName:     { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  senderMeta:     { fontFamily: mono, fontSize: 10, color: colors.textMuted },
  divider:        { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  fullContent:    { fontSize: 15, color: colors.text, lineHeight: 24 },
  dismissBtn:     { marginTop: spacing.sm, backgroundColor: colors.surfaceHigh, padding: 14, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  dismissText:    { fontFamily: mono, fontSize: 11, color: colors.textSub, letterSpacing: 1, fontWeight: '700' },
});
