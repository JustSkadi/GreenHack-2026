import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, mono, spacing, radius } from '../../constants/theme';
import { useT } from '../../lib/i18n';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
      <View style={styles.dotSlot}>
        {focused && <View style={styles.activeDot} />}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const t = useT();

  const TABS = [
    { name: 'index',        label: t.tab_sos,  icon: '⚠' },
    { name: 'communicator', label: t.tab_comm, icon: '◈' },
    { name: 'checklist',    label: t.tab_list, icon: '◻' },
    { name: 'map',          label: t.tab_map,  icon: '◎' },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      {TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={tab.icon} label={tab.label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 62,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingTop: 6,
    minWidth: 56,
  },
  tabIcon: {
    fontSize: 18,
    color: colors.textMuted,
  },
  tabIconActive: {
    color: colors.text,
  },
  tabLabel: {
    fontFamily: mono,
    fontSize: 8,
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.text,
  },
  dotSlot: {
    height: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.blue,
  },
});
