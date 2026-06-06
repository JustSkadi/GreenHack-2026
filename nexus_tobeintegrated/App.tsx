import './crypto-polyfill';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { useMeshStore } from './stores/meshStore';
import { initWifiDirect, discoverPeers, connectToPeer, disconnectFromPeer, sendMeshMessage, startAutoMesh, stopAutoMesh } from './lib/mesh/wifiDirect';
import { encryptE2E, decryptE2E } from './lib/mesh/cryptoAsym';

export default function App() {
  const peers = useMeshStore((state) => state.peers);
  const connectedPeers = useMeshStore((state) => state.connectedPeers);
  const mode = useMeshStore((state) => state.mode);
  const myPhoneNumber = useMeshStore((state) => state.myPhoneNumber);
  const setMyPhoneNumber = useMeshStore((state) => state.setMyPhoneNumber);
  const mySecretKey = useMeshStore((state) => state.mySecretKey);
  const meshMessages = useMeshStore((state) => state.meshMessages);
  const [autoMeshActive, setAutoMeshActive] = React.useState(false);
  const [recipientInput, setRecipientInput] = React.useState('');

  // Automatyczna inicjalizacja modułu Wi-Fi Direct przy starcie
  useEffect(() => {
    initWifiDirect();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nexus - Sieć Ratunkowa Mesh</Text>
      
      {/* Profil Użytkownika & Szyfrowanie */}
      <View style={styles.profileBox}>
        <Text style={styles.statusText}>Twój Numer Telefonu (ID):</Text>
        <TextInput 
          style={styles.phoneInput}
          placeholder="+48 000 000 000"
          placeholderTextColor="#666"
          value={myPhoneNumber}
          onChangeText={setMyPhoneNumber}
          keyboardType="phone-pad"
        />
        
        <Text style={[styles.statusText, { marginTop: 10 }]}>Adresat (do kogo wysłać?):</Text>
        <TextInput 
          style={styles.phoneInput}
          placeholder="Wpisz numer (z listy poniżej)"
          placeholderTextColor="#666"
          value={recipientInput}
          onChangeText={setRecipientInput}
          keyboardType="phone-pad"
        />
      </View>

      {/* Mesh Status */}
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>Tryb: <Text style={styles.bold}>{mode.toUpperCase()}</Text></Text>
        <Text style={styles.statusText}>
          Połączone urządzenia: <Text style={styles.bold}>{connectedPeers.length}</Text>
        </Text>
        {connectedPeers.map((cp, idx) => {
          const latencyText = cp.latency === undefined || cp.latency < 0 
            ? '⏳ Łączenie...' 
            : cp.latency < 100 ? `🟢 ${cp.latency} ms` : cp.latency < 500 ? `🟡 ${cp.latency} ms` : `🔴 ${cp.latency} ms`;

          const phoneText = cp.phoneNumber ? `(${cp.phoneNumber})` : '';
          const batteryText = cp.battery !== undefined ? `🔋 ${cp.battery}%` : '';

          return (
            <Text key={idx} style={styles.connectedDevice}>
              ● {cp.deviceName} {phoneText} - {batteryText} - {latencyText}
            </Text>
          );
        })}
      </View>

      {/* Przyciski kontrolne */}
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.button, autoMeshActive ? { backgroundColor: '#FF9800' } : { backgroundColor: '#2196F3' }]} 
          onPress={() => {
            if (autoMeshActive) {
              stopAutoMesh();
              setAutoMeshActive(false);
            } else {
              startAutoMesh();
              setAutoMeshActive(true);
            }
          }}
        >
          <Text style={styles.buttonText}>{autoMeshActive ? 'Zatrzymaj Auto-Mesh' : 'Start Auto-Mesh'}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={() => {
          disconnectFromPeer();
          if (autoMeshActive) {
            stopAutoMesh();
            setAutoMeshActive(false);
          }
        }}>
          <Text style={styles.buttonText}>Rozłącz</Text>
        </TouchableOpacity>
      </View>

      {/* Przycisk Testowego JSONa */}
      {connectedPeers.length > 0 && (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#9C27B0' }]} onPress={() => {
            if (!recipientInput) {
              Alert.alert('Błąd', 'Podaj numer adresata!');
              return;
            }
            
            // Szukamy klucza publicznego adresata w profilach połączonych urządzeń
            const targetPeer = connectedPeers.find(p => p.phoneNumber === recipientInput);
            if (!targetPeer || !targetPeer.publicKey) {
              Alert.alert('Brak Klucza', 'Odbiorca musi być w sieci (Ping), abyśmy pobrali jego Klucz Publiczny w tle!');
              return;
            }

            const rawContent = 'Zlokalizowano potrzebujących. Mam wodę i prąd.';
            const finalContent = encryptE2E(rawContent, mySecretKey, targetPeer.publicKey);
            
            if (!finalContent) {
              Alert.alert('Błąd', 'Szyfrowanie nie powiodło się.');
              return;
            }

            sendMeshMessage({
              id: Math.random().toString(36).substring(7),
              senderId: myPhoneNumber || 'nieznany',
              recipientId: recipientInput,
              senderTier: 4,
              content: finalContent,
              encrypted: true,
              isPriority: false,
              trustScore: 100,
              hops: [myPhoneNumber || 'nieznany'],
              ttl: 5,
              timestamp: Date.now()
            });
            Alert.alert('Wysłano', 'Wiadomość została zaszyfrowana kluczem odbiorcy i puszczona w sieć!');
          }}>
            <Text style={styles.buttonText}>Wyślij Prywatną (E2E)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Odebrane Wiadomości (Skrzynka) */}
      <Text style={styles.subtitle}>Wiadomości (Flooding):</Text>
      <ScrollView style={[styles.scrollContainer, { maxHeight: 200, marginBottom: 10 }]}>
        {meshMessages.length === 0 ? (
          <Text style={styles.emptyText}>Brak pakietów w eterze.</Text>
        ) : (
          meshMessages.map((msg, idx) => {
            // Próba deszyfrowania E2E w locie
            let displayContent = msg.content;
            let isDecrypted = false;
            
            if (msg.encrypted) {
              if (msg.recipientId === myPhoneNumber) {
                // To do mnie! Szukam publicznego klucza NADAWCY, by to odszyfrować
                const senderPeer = connectedPeers.find(p => p.phoneNumber === msg.senderId);
                if (senderPeer && senderPeer.publicKey) {
                  const decryptedText = decryptE2E(msg.content, mySecretKey, senderPeer.publicKey);
                  if (decryptedText) {
                    displayContent = decryptedText;
                    isDecrypted = true;
                  } else {
                    displayContent = '[🔒 Uszkodzona treść]';
                  }
                } else {
                  displayContent = '[🔒 Trwa szukanie klucza nadawcy...]';
                }
              } else {
                // To NIE JEST do mnie. Pełnię tylko rolę rutera.
                displayContent = `[🔒 List prywatny do ${msg.recipientId}]`;
              }
            }

            return (
              <View key={idx} style={styles.messageCard}>
                <Text style={styles.messageSender}>{msg.senderId} ➔ {msg.recipientId} {msg.isPriority ? '🔴 SOS' : ''}</Text>
                <Text style={[styles.messageContent, msg.encrypted && !isDecrypted && { color: '#F44336' }]}>
                  {displayContent}
                </Text>
                <Text style={styles.messageMeta}>Trasa (Hops): {msg.hops.join(' > ')}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

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
  profileBox: {
    marginBottom: 15,
  },
  phoneInput: {
    backgroundColor: '#1e1e1e',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginTop: 5,
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
  messageCard: {
    backgroundColor: '#262626',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#9C27B0',
  },
  messageSender: {
    color: '#aaaaaa',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  messageContent: {
    color: '#ffffff',
    fontSize: 15,
  },
  messageMeta: {
    color: '#666666',
    fontSize: 10,
    marginTop: 6,
  },
});
