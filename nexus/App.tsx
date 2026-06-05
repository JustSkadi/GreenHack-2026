import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useMeshStore } from './stores/meshStore';
import { initWifiDirect, discoverPeers, connectToPeer, disconnectFromPeer } from './lib/mesh/wifiDirect';

export default function App() {
  const peers = useMeshStore((state) => state.peers);
  const connectedPeers = useMeshStore((state) => state.connectedPeers);
  const mode = useMeshStore((state) => state.mode);

  // Automatyczna inicjalizacja modułu Wi-Fi Direct przy starcie
  useEffect(() => {
    initWifiDirect();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nexus - Tester Wi-Fi Direct</Text>
      
      {/* Mesh Status */}
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>Tryb: <Text style={styles.bold}>{mode.toUpperCase()}</Text></Text>
        <Text style={styles.statusText}>
          Połączone urządzenia: <Text style={styles.bold}>{connectedPeers.length}</Text>
        </Text>
        {connectedPeers.map((cp, idx) => (
          <Text key={idx} style={styles.connectedDevice}>
            ● {cp.deviceName} ({cp.deviceAddress})
          </Text>
        ))}
      </View>

      {/* Przyciski kontrolne */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={() => discoverPeers()}>
          <Text style={styles.buttonText}>Skanuj urządzenia</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={() => disconnectFromPeer()}>
          <Text style={styles.buttonText}>Rozłącz</Text>
        </TouchableOpacity>
      </View>

      {/* Lista wykrytych urządzeń */}
      <Text style={styles.subtitle}>Wykryte urządzenia w pobliżu ({peers.length}):</Text>
      <ScrollView style={styles.scrollContainer}>
        {peers.length === 0 ? (
          <Text style={styles.emptyText}>Brak wykrytych urządzeń. Kliknij Skanuj.</Text>
        ) : (
          peers.map((peer, idx) => (
            <View key={idx} style={styles.peerCard}>
              <View>
                <Text style={styles.peerName}>{peer.deviceName}</Text>
                <Text style={styles.peerAddress}>{peer.deviceAddress}</Text>
              </View>
              <TouchableOpacity 
                style={styles.connectButton} 
                onPress={() => connectToPeer(peer.deviceAddress)}
              >
                <Text style={styles.connectButtonText}>Połącz</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', // Dark UI for crisis mode
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#aaaaaa',
    marginTop: 20,
    marginBottom: 10,
  },
  statusBox: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statusText: {
    color: '#cccccc',
    fontSize: 16,
    marginBottom: 5,
  },
  bold: {
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  connectedDevice: {
    color: '#4CAF50',
    fontSize: 14,
    marginLeft: 10,
    marginTop: 5,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  button: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  dangerButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  scrollContainer: {
    flex: 1,
  },
  emptyText: {
    color: '#666666',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 16,
  },
  peerCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d2d',
  },
  peerName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  peerAddress: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
  connectButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
