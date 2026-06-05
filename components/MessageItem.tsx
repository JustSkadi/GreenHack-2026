import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, mono, radius } from '../constants/theme';
import { Message } from '../types';
import { useT } from '../lib/i18n';

const TIER_COLOR: Record<number, string> = {
  1: colors.tier1,
  2: colors.tier2,
  3: colors.tier3,
  4: colors.tier4,
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

interface Props {
  message: Message;
  isOwn?: boolean;
}

export default function MessageItem({ message, isOwn }: Props) {
  const t = useT();
  const tierColor = TIER_COLOR[message.sender_tier];
  const isFlagged = message.trust_score < 0.5;

  return (
    <View style={[
      styles.wrapper,
      message.is_priority && styles.wrapperPriority,
      isOwn && styles.wrapperOwn,
    ]}>
      <View style={styles.header}>
        <View style={styles.senderRow}>
          <View style={[styles.tierDot, { backgroundColor: tierColor }]} />
          <Text style={[styles.username, { color: isOwn ? colors.textSub : colors.text }]}>
            {message.sender_username}
          </Text>
          {message.encrypted && <Text style={styles.lock}>🔒</Text>}
          {message.is_priority && (
            <View style={styles.priorityTag}>
              <Text style={styles.priorityTagText}>PRIORITY</Text>
            </View>
          )}
        </View>
        <View style={styles.meta}>
          {message.hops > 0 && (
            <Text style={styles.hops}>{message.hops} hops</Text>
          )}
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
        </View>
      </View>

      <Text style={[styles.content, isOwn && styles.contentOwn]}>
        {message.content}
      </Text>

      {isFlagged && (
        <View style={styles.flagRow}>
          <Text style={styles.flagText}>
            {t.msg_unverified(Math.round(message.trust_score * 100))}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.md,
    marginVertical: 5,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  wrapperPriority: {
    backgroundColor: colors.redDim,
    borderWidth: 1,
    borderColor: colors.red,
  },
  wrapperOwn: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  tierDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  username: {
    fontSize: 13,
    fontWeight: '600',
  },
  lock: {
    fontSize: 11,
  },
  priorityTag: {
    backgroundColor: colors.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  priorityTagText: {
    fontFamily: mono,
    fontSize: 8,
    color: '#fff',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hops: {
    fontFamily: mono,
    fontSize: 9,
    color: colors.blue,
  },
  time: {
    fontFamily: mono,
    fontSize: 10,
    color: colors.textMuted,
  },
  content: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 21,
  },
  contentOwn: {
    color: colors.textSub,
  },
  flagRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  flagText: {
    fontFamily: mono,
    fontSize: 10,
    color: colors.orange,
    letterSpacing: 0.2,
  },
});
