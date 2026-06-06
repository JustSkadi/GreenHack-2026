import { View, Text, StyleSheet, TouchableOpacity, Image, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppModeStore } from '../../stores/appModeStore';
import { mono } from '../../constants/theme';

const BLUE = '#4369AA';

const logo         = require('../../png/Zrzut ekranu 2026-06-05 221840.png');
const iconCitizen  = require('../../png/Zrzut ekranu 2026-06-05 221846.png');
const iconVerifier = require('../../png/Zrzut ekranu 2026-06-05 221850.png');

export default function IdokladyApp() {
  const insets = useSafeAreaInsets();
  const { loginNexus, switchTo, nexusLoggedIn } = useAppModeStore();

  const goToNexus = () => {
    if (!nexusLoggedIn) loginNexus();
    switchTo('nexus');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />

      {/* ── Blue top section ── */}
      <View style={s.blue}>
        {/* NEXUS chip — top-right */}
        <TouchableOpacity style={s.nexusChip} onPress={goToNexus} activeOpacity={0.85}>
          <View style={s.nexusDot} />
          <Text style={s.nexusChipLabel}>NEXUS</Text>
        </TouchableOpacity>

        <Image source={logo} style={s.logo} resizeMode="contain" />
        <Text style={s.appTitle}>eDoklady</Text>
        <Text style={s.appTagline}>nová éra prokazování totožnosti</Text>
        <TouchableOpacity activeOpacity={0.7}>
          <Text style={s.learnMore}>Chci vědět více</Text>
        </TouchableOpacity>
      </View>

      {/* ── White panel ── */}
      <View style={[s.panel, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
        <Text style={s.panelLabel}>Vyberte účet pro přihlášení</Text>

        <View style={s.card}>
          {/* Row 1 — Zdeněk Zázvor */}
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <Image source={iconCitizen} style={s.rowIcon} resizeMode="contain" />
            <View style={s.rowInfo}>
              <Text style={s.rowName}>Zdeněk Zázvor</Text>
              <Text style={s.rowRole}>Občan</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>

          <View style={s.sep} />

          {/* Row 2 — Zdeňkova firma (disabled) */}
          <View style={[s.row, s.rowDisabled]}>
            <Image source={iconVerifier} style={s.rowIcon} resizeMode="contain" />
            <View style={s.rowInfo}>
              <Text style={s.rowName}>Zdeňkova firma, s.r.o.</Text>
              <Text style={s.rowRole}>Ověřovatel</Text>
            </View>
            <Text style={[s.chevron, s.chevronMuted]}>›</Text>
          </View>
        </View>

        <TouchableOpacity activeOpacity={0.7}>
          <Text style={s.registerLink}>Registrace dalšího ověřovatele</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BLUE,
  },

  // ── Blue section ──────────────────────────────────────────────────
  blue: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 24,
  },

  nexusChip: {
    position: 'absolute',
    top: 12,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#512DA8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  nexusDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#A5D6A7' },
  nexusChipLabel: { fontFamily: mono, fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 2 },

  logo:       { width: 72, height: 72, marginBottom: 4 },
  appTitle:   { fontSize: 30, fontWeight: '800', color: '#fff' },
  appTagline: { fontSize: 15, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  learnMore:  { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 4 },

  // ── White panel ───────────────────────────────────────────────────
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    gap: 16,
  },
  panelLabel: {
    fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center',
  },

  card: {
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    overflow: 'hidden', backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
  },
  rowDisabled:  { opacity: 0.4 },
  rowIcon:      { width: 40, height: 40 },
  rowInfo:      { flex: 1 },
  rowName:      { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowRole:      { fontSize: 12, color: '#6B7280', marginTop: 1 },
  chevron:      { fontSize: 24, color: '#1565C0' },
  chevronMuted: { color: '#9CA3AF' },
  sep:          { height: 1, backgroundColor: '#E5E7EB' },

  registerLink: { fontSize: 14, color: '#1565C0', fontWeight: '600', textAlign: 'center' },
});
