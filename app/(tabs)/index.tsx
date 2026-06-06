import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Platform, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { colors, spacing, mono, radius } from '../../constants/theme';
import { useT } from '../../lib/i18n';
import { useMeshStore } from '../../stores/meshStore';
import { useLocationStore } from '../../stores/locationStore';

const EMERGENCY_NUMBER = '112';

function buildSmsBody(lat: number | null, lon: number | null, savedAt: number | null): string {
  const locLine = lat != null && lon != null
    ? `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`
    : 'GPS: unknown';
  const timeLine = savedAt
    ? `(at ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
    : '';
  return `🆘 SOS - Nexus Emergency\n${locLine} ${timeLine}\nPlease send help immediately.`;
}

export default function SOSScreen() {
  const t = useT();
  const { mode } = useMeshStore();
  const { lastKnown, savedAt, save } = useLocationStore();
  const [smsSent, setSmsSent] = useState(false);

  useEffect(() => {
    if (mode !== 'online') return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      save(pos.coords.latitude, pos.coords.longitude);
    })();
  }, [mode]);

  const handleSOS = () => {
    const body = buildSmsBody(lastKnown?.lat ?? null, lastKnown?.lon ?? null, savedAt);
    const url = Platform.OS === 'android'
      ? `sms:${EMERGENCY_NUMBER}?body=${encodeURIComponent(body)}`
      : `sms:${EMERGENCY_NUMBER}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => {});
    setSmsSent(true);
    setTimeout(() => setSmsSent(false), 3000);
  };

  const locLabel = lastKnown
    ? `${lastKnown.lat.toFixed(4)}°N  ${lastKnown.lon.toFixed(4)}°E`
    : null;

  return (
    <View style={styles.screen}>
      <View style={styles.top} />

      <View style={styles.center}>
        <TouchableOpacity
          style={[styles.button, smsSent && styles.buttonSent]}
          onPress={handleSOS}
          activeOpacity={0.75}
        >
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.smsText}>{smsSent ? t.sos_hint_calling : 'SMS'}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>{smsSent ? t.sos_hint_calling : t.sos_hint_idle}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.locRow}>
          <View style={[styles.locDot, { backgroundColor: lastKnown ? colors.green : colors.textMuted }]} />
          <Text style={styles.locText}>
            {locLabel ?? t.sos_no_location}
          </Text>
        </View>

        <View style={styles.numberRow}>
          {[['EU', '112'], ['PL', '112'], ['UK', '999'], ['US', '911']].map(([region, num]) => (
            <View key={region} style={styles.numberTag}>
              <Text style={styles.numberRegion}>{region}</Text>
              <Text style={styles.numberVal}>{num}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.legal}>{t.sos_legal}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  top:    { height: spacing.xxl },
  center: { alignItems: 'center', gap: spacing.lg },

  button: {
    width: '72%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 14,
  },
  buttonSent: {
    borderColor: colors.green,
    shadowColor: colors.green,
  },
  sosText: {
    fontFamily: mono,
    fontSize: 52,
    fontWeight: '700',
    color: colors.red,
    letterSpacing: 4,
  },
  smsText: {
    fontFamily: mono,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSub,
    letterSpacing: 3,
  },

  hint: {
    fontFamily: mono,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },

  bottom:  { gap: spacing.md, alignItems: 'center' },

  locRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  locDot:  { width: 6, height: 6, borderRadius: 3 },
  locText: { fontFamily: mono, fontSize: 10, color: colors.textMuted, letterSpacing: 0.4 },

  numberRow: { flexDirection: 'row', gap: spacing.sm },
  numberTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
  },
  numberRegion: {
    fontFamily: mono,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  numberVal: {
    fontFamily: mono,
    fontSize: 14,
    color: colors.textSub,
    fontWeight: '600',
  },
  legal: {
    fontFamily: mono,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
