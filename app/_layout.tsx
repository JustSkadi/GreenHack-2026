import { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { colors } from '../constants/theme';
import { useAuthStore } from '../stores/authStore';
import { useAppModeStore } from '../stores/appModeStore';
import MeshStatusBar from '../components/MeshStatusBar';
import ChatBubble from '../components/ChatBubble';
import PriorityBanner from '../components/PriorityBanner';
import IdokladyApp from '../components/idoklady/IdokladyApp';

const EXTRA_TOP    = 12;
const EXTRA_BOTTOM = 16;

function AppShell() {
  const insets          = useSafeAreaInsets();
  const restoreSession  = useAuthStore(s => s.restoreSession);
  const { mode }        = useAppModeStore();

  useEffect(() => {
    // Restore Nexus session silently in background
    restoreSession();
  }, []);

  const isNexus = mode === 'nexus';

  return (
    <View style={styles.wrapper}>
      {/* ── Nexus shell — always mounted so expo-router Slot is satisfied ── */}
      <View
        style={[
          styles.nexusRoot,
          {
            paddingTop:    insets.top    + EXTRA_TOP,
            paddingBottom: insets.bottom + EXTRA_BOTTOM,
            paddingLeft:   insets.left,
            paddingRight:  insets.right,
          },
          // Hide completely when not active, but keep mounted for routing
          !isNexus && styles.hidden,
        ]}
      >
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <MeshStatusBar />
        <PriorityBanner />
        <View style={styles.content}>
          <Slot />
        </View>
        <ChatBubble />
      </View>

      {/* ── Overlay: iDoklady ── */}
      {!isNexus && (
        <View style={StyleSheet.absoluteFillObject}>
          <IdokladyApp />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  nexusRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
});
