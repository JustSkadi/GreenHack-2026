import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, mono, radius } from '../constants/theme';
import { useMeshStore } from '../stores/meshStore';
import { useI18n, useT } from '../lib/i18n';

export default function MeshStatusBar() {
  const { mode, peers, routingMode, setMode } = useMeshStore();
  const { lang, setLang } = useI18n();
  const t = useT();
  const online = mode === 'online';

  return (
    <View style={styles.bar}>
      <Text style={styles.appName}>NEXUS</Text>

      <TouchableOpacity onPress={() => setMode(online ? 'offline' : 'online')} style={styles.statusChip}>
        <View style={[styles.dot, { backgroundColor: online ? colors.green : colors.textMuted }]} />
        <Text style={[styles.statusText, { color: online ? colors.green : colors.textSub }]}>
          {online ? t.status_online : `${t.status_offline} · ${peers.length}`}
        </Text>
        {!online && routingMode === 'rl' && (
          <View style={styles.rlBadge}>
            <Text style={styles.rlText}>RL</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.langToggle}>
        <TouchableOpacity
          style={[styles.langChip, lang === 'en' && styles.langChipActive]}
          onPress={() => setLang('en')}
        >
          <Text style={[styles.langOption, lang === 'en' && styles.langActive]}>EN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.langChip, lang === 'cs' && styles.langChipActive]}
          onPress={() => setLang('cs')}
        >
          <Text style={[styles.langOption, lang === 'cs' && styles.langActive]}>CS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  appName: {
    fontFamily: mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.text,
  },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  rlBadge: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  rlText: {
    fontFamily: mono,
    fontSize: 8,
    color: colors.yellow,
    letterSpacing: 1,
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  langChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  langChipActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  langOption: {
    fontFamily: mono,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  langActive: {
    color: colors.blue,
    fontWeight: '700',
  },
});
