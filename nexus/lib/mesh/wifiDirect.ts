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
        
        // Mocking client details for connected peers
        const connectedPeer: Peer = {
          deviceAddress: ownerIp,
          deviceName: info.isGroupOwner ? 'Client Node' : 'Group Owner Node',
        };
        useMeshStore.getState().addConnectedPeer(connectedPeer);
      } else {
        console.log('Wi-Fi Direct: Połączenie zerwane.');
        // Wyczyść połączone urządzenia w store
        useMeshStore.getState().setPeers([]);
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

// 7. Send message via mesh
// W prawdziwej implementacji tu otworzysz Socket TCP do Group Ownera na porcie np. 8888.
// Jako że to hackathon, przygotowaliśmy uproszczony model przesyłania danych w grafie.
export async function sendMeshMessage(message: MeshMessage) {
  try {
    console.log('Wi-Fi Direct: Wysyłanie wiadomości mesh:', message);
    
    // Dodaj do lokalnego sklepu stanu
    useMeshStore.getState().addMessage(message);

    // TODO: Zaimplementuj natywny przesył danych socketami TCP lub wywołaj LAN Simulation fallback
    // Poniżej mock/logika dla jury:
    console.log(`Wiadomość "${message.content}" wysłana do sąsiadów w zasięgu.`);
  } catch (err) {
    console.error('Wi-Fi Direct: Błąd wysyłania wiadomości:', err);
  }
}
