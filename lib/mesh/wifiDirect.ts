import { 
  initialize, 
  startDiscoveringPeers, 
  stopDiscoveringPeers,
  subscribeOnPeersUpdates, 
  subscribeOnConnectionInfoUpdates,
  connect,
  removeGroup,
} from 'react-native-wifi-p2p';
import { PermissionsAndroid, Platform } from 'react-native';
import { useMeshStore } from '../../stores/meshStore';
import { Peer, Message } from '../../types';
import { startTcpServer, connectTcpClient, stopTcp, sendTcpMessage } from './tcpSockets';

let autoMeshInterval: NodeJS.Timeout | null = null;
let isConnecting = false;

export async function requestP2pPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ];

    if (Platform.Version >= 33) {
      // @ts-ignore
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

export async function initWifiDirect() {
  const hasPermission = await requestP2pPermissions();
  if (!hasPermission) {
    console.warn('Wymagane uprawnienia lokalizacji/Wi-Fi nie zostały przyznane.');
    return;
  }

  try {
    await initialize();
    console.log('Wi-Fi Direct: Pomyślnie zainicjalizowano.');

    subscribeOnPeersUpdates(({ devices }) => {
      console.log('Wi-Fi Direct: Wykryte urządzenia:', devices);
      devices.forEach((d: any) => {
        const p: Peer = {
          id: d.deviceAddress,
          username: d.deviceName || 'Nieznane urządzenie',
          battery: 100, tier: 4, degree: 1, hops_to_command: 0, last_seen: Date.now()
        };
        useMeshStore.getState().addPeer(p);
      });
    });

    subscribeOnConnectionInfoUpdates(async (info) => {
      console.log('Wi-Fi Direct: Info o połączeniu (ConnectionInfo):', info);
      if (info.groupFormed) {
        // W zależności od wersji biblioteki, groupOwnerAddress to string lub obiekt
        const rawOwner = info.groupOwnerAddress;
        const ownerIp = typeof rawOwner === 'string' ? rawOwner : (rawOwner?.hostAddress || rawOwner?.address || 'unknown');
        console.log('Wi-Fi Direct: Właściciel grupy IP:', ownerIp, 'Czy ja nim jestem?', info.isGroupOwner);
        
        if (info.isGroupOwner) {
          console.log('Wi-Fi Direct: Startuję TCP Server...');
          startTcpServer();
        } else {
          if (ownerIp !== 'unknown') {
            console.log('Wi-Fi Direct: Łączę się po TCP z właścicielem...', ownerIp);
            connectTcpClient(ownerIp);
          }
        }
        
        const connectedPeer: Peer = {
          id: ownerIp,
          username: info.isGroupOwner ? 'Zarządca Sieci (Ja)' : 'Węzeł Mesh',
          battery: 100, tier: 4, degree: 1, hops_to_command: 0, last_seen: Date.now()
        };
        useMeshStore.getState().addPeer(connectedPeer);
      } else {
        console.log('Wi-Fi Direct: Rozłączono.');
        stopTcp();
      }
    });

    // Wcześniej było tutaj setTimeout(startAutoMesh, 5000), ale spamowało to Androida
    // i blokowało powiadomienia systemowe o połączeniu. Zamiast tego odpalamy tylko cykliczne szukanie:
    setInterval(discoverPeers, 8000);
  } catch (err) {
    console.error('Błąd podczas inicjalizacji Wi-Fi Direct:', err);
  }
}

export async function discoverPeers() {
  try {
    await startDiscoveringPeers();
  } catch (err) {}
}

export async function stopDiscovery() {
  try {
    await stopDiscoveringPeers();
  } catch (err) {}
}

export async function connectToPeer(deviceAddress: string) {
  try {
    await connect(deviceAddress);
  } catch (err) {}
}

export async function disconnectFromPeer() {
  try {
    await removeGroup();
  } catch (err) {}
}

export function startAutoMesh() {
  if (autoMeshInterval) return;
  
  discoverPeers();

  autoMeshInterval = setInterval(() => {
    const { peers } = useMeshStore.getState();
    if (isConnecting) return;

    if (peers.length > 0) {
      const targetPeer = peers[Math.floor(Math.random() * peers.length)].id;
      isConnecting = true;
      const delay = Math.floor(Math.random() * 4000) + 1000;
      
      setTimeout(() => {
         connectToPeer(targetPeer).finally(() => {
           setTimeout(() => { isConnecting = false; }, 15000);
         });
      }, delay);
    } else {
      discoverPeers();
    }
  }, 10000);
}

export function stopAutoMesh() {
  if (autoMeshInterval) {
    clearInterval(autoMeshInterval);
    autoMeshInterval = null;
  }
}

export async function sendMeshMessage(message: Message) {
  try {
    console.log(`\n[Wi-Fi Direct] Próba wysłania z UI: "${message.content}"`);
    // Uwaga: addMessage() jest już dodawany w meshStore, więc tutaj usuwam dodawanie, by nie było dubli.
    sendTcpMessage(message);
  } catch (err) {
    console.error('Wi-Fi Direct: Błąd wysyłania wiadomości:', err);
  }
}
