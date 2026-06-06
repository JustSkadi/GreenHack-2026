import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Platform } from 'react-native';
import { colors, spacing, mono, radius } from '../../constants/theme';
import { MOCK_MAP_PINS } from '../../lib/mock/mockData';
import { MapPin } from '../../types';
import { useMeshStore } from '../../stores/meshStore';
import { useT } from '../../lib/i18n';

// [P2] Piny mapy: supabase.from('map_pins').select('*')
//      Lub: statyczny JSON z rządu/NGO, pobierany online i cache w MMKV
//      Wróć do mock gdy offline
//
// [P3] Piny węzłów mesh: useMeshStore().peers — pozycje z WiFi Direct / LAN sim
//      Każdy peer ma { coordinate: { latitude, longitude } } — dodaj to do typu Peer

const PIN_COLORS: Record<MapPin['type'], string> = {
  hospital:  colors.red,
  water:     colors.blue,
  food:      colors.orange,
  charging:  colors.yellow,
  shelter:   colors.green,
  mesh_node: colors.purple,
  outage:    colors.textMuted,
};

const PIN_SYMBOLS: Record<MapPin['type'], string> = {
  hospital:  '+',
  water:     '~',
  food:      '◆',
  charging:  '⚡',
  shelter:   '⌂',
  mesh_node: '◎',
  outage:    '✕',
};

const PIN_LABEL_KEYS: Record<MapPin['type'], string> = {
  hospital:  'pin_hospital',
  water:     'pin_water',
  food:      'pin_food',
  charging:  'pin_charging',
  shelter:   'pin_shelter',
  mesh_node: 'pin_mesh_node',
  outage:    'pin_outage',
};

const LEGEND_TYPES: MapPin['type'][] = ['hospital', 'water', 'food', 'shelter', 'charging', 'mesh_node', 'outage'];

const PRAGUE_CENTER = { latitude: 50.0755, longitude: 14.4378, latitudeDelta: 0.06, longitudeDelta: 0.06 };

export default function MapScreen() {
  const t = useT();
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [legendOpen, setLegendOpen]   = useState(false);
  const { mode } = useMeshStore();

  // [P2] ZASTĄP MOCK_MAP_PINS danymi z Supabase lub MMKV cache
  const pins = MOCK_MAP_PINS;

  const pinLabel = (type: MapPin['type']) => (t as any)[PIN_LABEL_KEYS[type]] ?? type;

  return (
    <View style={styles.screen}>
      <MapView
        style={styles.map}
        initialRegion={PRAGUE_CENTER}
        showsUserLocation
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
      >
          {pins.map(pin => (
            <Marker
              key={pin.id}
              coordinate={pin.coordinate}
              onPress={() => setSelectedPin(pin)}
            >
              <View style={[styles.markerWrap, { borderColor: PIN_COLORS[pin.type] }]}>
                <Text style={[styles.markerSymbol, { color: PIN_COLORS[pin.type] }]}>
                  {PIN_SYMBOLS[pin.type]}
                </Text>
              </View>
            </Marker>
          ))}

          {pins.filter(p => p.type === 'outage').map(pin => (
            <Circle
              key={`zone-${pin.id}`}
              center={pin.coordinate}
              radius={600}
              fillColor="rgba(198,40,40,0.10)"
              strokeColor="rgba(198,40,40,0.35)"
              strokeWidth={1}
            />
          ))}
        </MapView>

      {selectedPin && (
        <TouchableOpacity
          style={styles.pinCardWrap}
          onPress={() => setSelectedPin(null)}
          activeOpacity={1}
        >
          <View style={styles.pinCard}>
            <View style={styles.pinCardHeader}>
              <View style={[styles.pinTypeDot, { backgroundColor: PIN_COLORS[selectedPin.type] }]} />
              <Text style={[styles.pinTypeLabel, { color: PIN_COLORS[selectedPin.type] }]}>
                {pinLabel(selectedPin.type).toUpperCase()}
              </Text>
              <Text style={styles.pinClose}>✕</Text>
            </View>
            <Text style={styles.pinTitle}>{selectedPin.title}</Text>
            {selectedPin.description && (
              <Text style={styles.pinDesc}>{selectedPin.description}</Text>
            )}
            <Text style={styles.pinCoords}>
              {selectedPin.coordinate.latitude.toFixed(4)}, {selectedPin.coordinate.longitude.toFixed(4)}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.legendContainer}>
        <TouchableOpacity style={styles.legendToggle} onPress={() => setLegendOpen(o => !o)}>
          <Text style={styles.legendToggleText}>
            {legendOpen ? '▾' : '▸'} {t.map_legend}
          </Text>
        </TouchableOpacity>

        {legendOpen && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.legendScrollContent}
          >
            {LEGEND_TYPES.map(type => (
              <View key={type} style={styles.legendItem}>
                <Text style={[styles.legendSymbol, { color: PIN_COLORS[type] }]}>
                  {PIN_SYMBOLS[type]}
                </Text>
                <Text style={styles.legendLabel}>{pinLabel(type)}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {mode === 'offline' && (
        <View style={styles.offlineNotice}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineNoticeText}>{t.map_offline_notice}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  map:    { flex: 1 },

  markerWrap: {
    width: 28, height: 28,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  markerSymbol: { fontSize: 13, fontWeight: '700' },

  pinCardWrap: {
    position: 'absolute',
    bottom: 80,
    left: spacing.md,
    right: spacing.md,
  },
  pinCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 5,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  pinCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pinTypeDot:  { width: 7, height: 7, borderRadius: 4 },
  pinTypeLabel: { fontFamily: mono, fontSize: 9, fontWeight: '700', letterSpacing: 1.2, flex: 1 },
  pinClose:    { fontSize: 12, color: colors.textMuted, paddingHorizontal: 4 },
  pinTitle:    { fontSize: 15, fontWeight: '600', color: colors.text },
  pinDesc:     { fontSize: 13, color: colors.textSub, lineHeight: 18 },
  pinCoords:   { fontFamily: mono, fontSize: 9, color: colors.textMuted, marginTop: 2 },

  legendContainer: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  legendToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  legendToggleText: {
    fontFamily: mono,
    fontSize: 9,
    color: colors.textSub,
    letterSpacing: 1,
    fontWeight: '700',
  },
  legendScrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    flexDirection: 'row',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSymbol: { fontSize: 13 },
  legendLabel:  { fontFamily: mono, fontSize: 9, color: colors.textSub },

  offlineNotice: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,249,230,0.97)',
    borderBottomWidth: 1,
    borderBottomColor: colors.yellow,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  offlineDot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.yellow },
  offlineNoticeText: { fontFamily: mono, fontSize: 9, color: colors.yellow, letterSpacing: 0.4 },
});
