import { 
  initialize, 
  startDiscoveringPeers, 
  stopDiscoveringPeers,
  subscribeOnPeersUpdates, 
  subscribeOnConnectionInfoUpdates,
  connect,
  removeGroup,
  getConnectionInfo
} from 'react-native-wifi-p2p';
import { PermissionsAndroid, Platform } from 'react-native';
import { useMeshStore, Peer, MeshMessage } from '../../stores/meshStore';
import { startTcpServer, connectTcpClient, stopTcp, sendTcpMessage } from './tcpSockets';

let autoMeshInterval: NodeJS.Timeout | null = null;
let isConnecting = false;

// 1. Android runtime permissions request
export async function requestP2pPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ];

    // Add NEARBY_WIFI_DEVICES for Android 13+ (API level 33)
    if (Platform.Version >= 33) {
      // @ts-ignore - NEARBY_WIFI_DEVICES might not be in the TS definitions of older React Native versions
      permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
    }

    const granted = await PermissionsAndroid.requestMultiple(permissions);

    const fineLocation = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    const coarseLocation = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    const nearbyWifi = Platform.Version >= 33 
      // @ts-ignore
      ? granted[PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES] === PermissionsAndroid.RESULTS.GRANTED 
      : true;

    return (fineLocation || coarseLocation) && nearbyWifi;
  } catch (err) {
    console.error('Błąd podczas żądania uprawnień P2P:', err);
    return false;
  }
}

// 2. Initialize Wi-Fi Direct module
export async function initWifiDirect() {
  const hasPermission = await requestP2pPermissions();
  if (!hasPermission) {
    console.warn('Wymagane uprawnienia lokalizacji/Wi-Fi nie zostały przyznane. Wi-Fi Direct nie będzie działać.');
    return;
  }

  try {
    await initialize();
    console.log('Wi-Fi Direct: Pomyślnie zainicjalizowano.');

    // Subskrypcja na wykryte urządzenia
    subscribeOnPeersUpdates(({ devices }) => {
      console.log('Wi-Fi Direct: Wykryte urządzenia:', devices);
      const peers: Peer[] = devices.map((d: any) => ({
        deviceAddress: d.deviceAddress,
        deviceName: d.deviceName || 'Nieznane urządzenie',
        battery: 100, // Domyślna wartość, będzie aktualizowana w routingu
        degree: 1
      }));
      useMeshStore.getState().setPeers(peers);
    });

    // Subskrypcja na zmianę statusu połączenia
    subscribeOnConnectionInfoUpdates(async (info) => {
      console.log('Wi-Fi Direct: Zmiana statusu połączenia:', info);
      if (info.groupFormed) {
        const ownerIp = info.groupOwnerAddress?.hostAddress || 'unknown';
        console.log('Wi-Fi Direct: Grupa utworzona. Group Owner Address:', ownerIp);
        console.log('Wi-Fi Direct: Czy jestem Group Ownerem?:', info.isGroupOwner);
        
        // Start TCP Server or Client based on role
        if (info.isGroupOwner) {
          startTcpServer();
        } else {
          if (ownerIp !== 'unknown') {
            connectTcpClient(ownerIp);
          }
        }
        
        // Mocking client details for connected peers
        const connectedPeer: Peer = {
          deviceAddress: ownerIp,
          deviceName: info.isGroupOwner ? 'Zarządca Sieci' : 'Węzeł Mesh',
        };
        useMeshStore.getState().addConnectedPeer(connectedPeer);
      } else {
        console.log('Wi-Fi Direct: Połączenie zerwane.');
        // Wyczyść połączone urządzenia w store
        useMeshStore.getState().setPeers([]);
        stopTcp();
      }
    });
  } catch (err) {
    console.error('Błąd podczas inicjalizacji Wi-Fi Direct:', err);
  }
}

// 3. Start peer discovery
export async function discoverPeers() {
  try {
    await startDiscoveringPeers();
    console.log('Wi-Fi Direct: Rozpoczęto wyszukiwanie urządzeń...');
  } catch (err) {
    console.error('Wi-Fi Direct: Błąd podczas uruchamiania wyszukiwania:', err);
  }
}

// 4. Stop peer discovery
export async function stopDiscovery() {
  try {
    await stopDiscoveringPeers();
    console.log('Wi-Fi Direct: Zatrzymano wyszukiwanie urządzeń.');
  } catch (err) {
    console.error('Wi-Fi Direct: Błąd podczas zatrzymywania wyszukiwania:', err);
  }
}

// 5. Connect to a specific peer
export async function connectToPeer(deviceAddress: string) {
  try {
    await connect(deviceAddress);
    console.log(`Wi-Fi Direct: Wysłano żądanie połączenia do: ${deviceAddress}`);
  } catch (err) {
    console.error(`Wi-Fi Direct: Błąd łączenia do ${deviceAddress}:`, err);
  }
}

// 6. Disconnect P2P Connection
export async function disconnectFromPeer() {
  try {
    await removeGroup();
    console.log('Wi-Fi Direct: Rozłączono połączenie P2P (usunięto grupę).');
  } catch (err) {
    console.error('Wi-Fi Direct: Błąd podczas rozłączania:', err);
  }
}

// 7. Auto-Mesh (Automatyczne wyszukiwanie i łączenie)
export function startAutoMesh() {
  if (autoMeshInterval) return;
  console.log('Wi-Fi Direct: Uruchamiam Auto-Mesh...');
  
  // Pierwsze wyszukiwanie na start
  discoverPeers();

  autoMeshInterval = setInterval(() => {
    const { connectedPeers, peers } = useMeshStore.getState();

    // Jeśli jesteśmy już połączeni z kimkolwiek, przerywamy pętlę dla tej iteracji (aby nie psuć połączenia)
    if (connectedPeers.length > 0) return;
    
    // Jeśli aktualnie przetwarzamy łączenie, czekamy
    if (isConnecting) return;

    if (peers.length > 0) {
      // Mamy kogoś w zasięgu! Zapobiegamy kolizji stosując "Random Backoff" (Losowe opóźnienie 1-5s)
      const targetPeer = peers[0].deviceAddress;
      isConnecting = true;
      const delay = Math.floor(Math.random() * 4000) + 1000;
      
      console.log(`Wi-Fi Direct: Wykryto ${targetPeer}. Auto-Mesh czeka ${delay}ms przed połączeniem (uniknięcie kolizji)...`);
      
      setTimeout(() => {
        // Podwójne sprawdzenie na wypadek gdyby w trakcie pauzy ktoś się z nami połączył
        if (useMeshStore.getState().connectedPeers.length === 0) {
          connectToPeer(targetPeer).finally(() => {
            // Zwalniamy blokadę dopiero po 15 sekundach, aby dać czas użytkownikowi drugiego urządzenia na kliknięcie "Akceptuj"
            setTimeout(() => { isConnecting = false; }, 15000);
          });
        } else {
          isConnecting = false;
        }
      }, delay);
    } else {
      // Nikogo nie ma, skanujemy dalej
      discoverPeers();
    }
  }, 8000); // Pętla co 8 sekund
}

export function stopAutoMesh() {
  if (autoMeshInterval) {
    clearInterval(autoMeshInterval);
    autoMeshInterval = null;
    console.log('Wi-Fi Direct: Auto-Mesh zatrzymany.');
  }
}

// 8. Send message via mesh
// Zastąpiliśmy uproszczony model natywnym przesyłem przez gniazda TCP
export async function sendMeshMessage(message: MeshMessage) {
  try {
    console.log('Wi-Fi Direct: Wysyłanie wiadomości mesh:', message);
    
    // Dodaj do lokalnego sklepu stanu
    useMeshStore.getState().addMessage(message);

    // Natywny przesył JSON przez TCP
    sendTcpMessage(message);
    
    console.log(`Wiadomość została wysłana przez gniazdo TCP.`);
  } catch (err) {
    console.error('Wi-Fi Direct: Błąd wysyłania wiadomości:', err);
  }
}
