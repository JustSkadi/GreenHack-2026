import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, mono, radius } from '../constants/theme';
import { useMeshStore } from '../stores/meshStore';
import { useI18n, useT } from '../lib/i18n';
import { useAppModeStore } from '../stores/appModeStore';

export default function MeshStatusBar() {
  const { mode, peers, routingMode, setMode } = useMeshStore();
  const { lang, setLang } = useI18n();
  const t = useT();
  const online = mode === 'online';
  const switchTo = useAppModeStore(s => s.switchTo);

  return (
    <View style={styles.bar}>
      <Text style={styles.appName}>NEXUS</Text>

      <TouchableOpacity onPress={() => setMode(online ? 'offline' : 'online')} style={styles.statusChip}>
        <View style={[styles.dot, { backgroundColor: online ? '#81C784' : 'rgba(255,255,255,0.35)' }]} />
        <Text style={[styles.statusText, { color: online ? '#81C784' : 'rgba(255,255,255,0.75)' }]}>
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

      <TouchableOpacity style={styles.backChip} onPress={() => switchTo('idoklady')}>
        <Text style={styles.backChipText}>← eD</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 48,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
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
    color: colors.textInverted,
  },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
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
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  langChipActive: {
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  langOption: {
    fontFamily: mono,
    fontSize: 10,
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 0.5,
  },
  langActive: {
    color: colors.textInverted,
    fontWeight: '700',
  },
  backChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  backChipText: {
    fontFamily: mono,
    fontSize: 10,
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 0.5,
  },
});
