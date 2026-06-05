import { useRef, useState } from 'react';
import { View, Text, Animated, Pressable, Linking, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors, spacing, mono, radius } from '../../constants/theme';
import { useT } from '../../lib/i18n';

const HOLD_MS = 2000;
const EMERGENCY_NUMBER = '112';

export default function SOSScreen() {
  const t = useT();
  const progress = useRef(new Animated.Value(0)).current;
  const anim     = useRef<Animated.CompositeAnimation | null>(null);
  const [holding, setHolding] = useState(false);
  const [called,  setCalled]  = useState(false);

  const handlePressIn = () => {
    if (called) return;
    setHolding(true);
    anim.current = Animated.timing(progress, {
      toValue: 1, duration: HOLD_MS, useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished) {
        Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
        setCalled(true);
        setHolding(false);
        progress.setValue(0);
      }
    });
  };

  const handlePressOut = () => {
    anim.current?.stop();
    Animated.timing(progress, { toValue: 0, duration: 300, useNativeDriver: false }).start(
      () => setHolding(false),
    );
  };

  const barWidth = progress.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  const buttonScale = progress.interpolate({
    inputRange: [0, 0.5, 1], outputRange: [1, 0.97, 0.95],
  });

  const hint = called ? t.sos_hint_calling : holding ? t.sos_hint_holding : t.sos_hint_idle;

  return (
    <View style={styles.screen}>
      <View style={styles.top} />

      <View style={styles.center}>
        <Animated.View style={[styles.buttonWrap, { transform: [{ scale: buttonScale }] }]}>
          <Pressable style={styles.button} onPressIn={handlePressIn} onPressOut={handlePressOut} android_disableSound>
            <FontAwesome5 name="plus" size={90} color={colors.red} solid />
            <Text style={styles.labelNumber}>{t.sos_number}</Text>

            {holding && (
              <Animated.View style={[styles.progressBar, { width: barWidth }]} />
            )}
          </Pressable>
        </Animated.View>

        <Text style={styles.hint}>{hint}</Text>
      </View>

      <View style={styles.bottom}>
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
    backgroundColor: colors.bg,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  top:    { height: spacing.xxl },
  center: { alignItems: 'center', gap: spacing.lg },

  buttonWrap: {
    width: '72%',
    aspectRatio: 1,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 14,
  },
  button: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  labelNumber: {
    fontFamily: mono,
    fontSize: 28,
    fontWeight: '300',
    color: colors.textSub,
    letterSpacing: 6,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: colors.red,
    borderBottomLeftRadius: radius.xl,
  },

  hint: {
    fontFamily: mono,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  bottom:    { gap: spacing.md, alignItems: 'center' },
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
