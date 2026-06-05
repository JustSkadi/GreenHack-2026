import { useEffect } from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { colors } from '../constants/theme';
import { useAuthStore } from '../stores/authStore';
import MeshStatusBar from '../components/MeshStatusBar';
import ChatBubble from '../components/ChatBubble';
import PriorityBanner from '../components/PriorityBanner';

const EXTRA_TOP    = 12;
const EXTRA_BOTTOM = 16;

function AppShell() {
  const insets = useSafeAreaInsets();
  const restoreSession = useAuthStore(s => s.restoreSession);

  useEffect(() => {
    restoreSession(); // [P2]
  }, []);

  return (
    <View style={[
      styles.root,
      {
        paddingTop:    insets.top    + EXTRA_TOP,
        paddingBottom: insets.bottom + EXTRA_BOTTOM,
        paddingLeft:   insets.left,
        paddingRight:  insets.right,
      },
    ]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <MeshStatusBar />
      <PriorityBanner />
      <View style={styles.content}>
        <Slot />
      </View>
      <ChatBubble />
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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
});
