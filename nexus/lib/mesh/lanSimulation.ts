import { io, Socket } from 'socket.io-client';
import { useMeshStore, Peer, MeshMessage } from '../../stores/meshStore';

let socket: Socket | null = null;

// 1. Initialize simulation connection
// IP address should be the IP of the developer's laptop running the mock server
export function initLanSimulation(serverIp: string = '192.168.1.100', port: number = 3000) {
  if (socket) {
    socket.disconnect();
  }

  const serverUrl = `http://${serverIp}:${port}`;
  console.log(`LAN Simulation: Łączenie z serwerem symulacji ${serverUrl}...`);

  socket = io(serverUrl, {
    transports: ['websocket'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('LAN Simulation: Połączono z serwerem symulacyjnym.');
    useMeshStore.getState().setMode('offline'); // Switch UI to offline mode for simulation
  });

  socket.on('disconnect', () => {
    console.log('LAN Simulation: Rozłączono z serwerem symulacyjnym.');
    useMeshStore.getState().setMode('online');
  });

  // Reakcja na nową wiadomość w sieci mesh
  socket.on('mesh_receive', (message: MeshMessage) => {
    console.log('LAN Simulation: Otrzymano wiadomość mesh:', message);
    
    // Zapisz do Zustand store
    useMeshStore.getState().addMessage(message);
  });

  // Reakcja na aktualizację listy aktywnych nodów w sieci symulowanej
  socket.on('mesh_peers_update', (activePeers: Peer[]) => {
    console.log('LAN Simulation: Aktualizacja peerów z serwera:', activePeers);
    useMeshStore.getState().setPeers(activePeers);
    
    // Dodaj jako połączone
    activePeers.forEach(peer => {
      useMeshStore.getState().addConnectedPeer(peer);
    });
  });
}

// 2. Send message through simulation server
export function sendLanSimMessage(messageContent: string, senderId: string, senderTier: number, isPriority: boolean = false) {
  if (!socket || !socket.connected) {
    console.warn('LAN Simulation: Brak połączenia z serwerem. Wiadomość nie została wysłana.');
    return;
  }

  const message: MeshMessage = {
    id: Math.random().toString(36).substring(7),
    senderId,
    senderTier,
    content: messageContent,
    encrypted: false,
    isPriority,
    trustScore: senderTier === 1 ? 1.0 : 0.8,
    hops: [senderId], // Initial hop is the sender itself
    ttl: 5,
    timestamp: Date.now(),
  };

  console.log('LAN Simulation: Wysyłanie wiadomości do sieci...', message);
  
  // Zapisz najpierw u siebie lokalnie
  useMeshStore.getState().addMessage(message);

  // Emituj do serwera symulacyjnego
  socket.emit('mesh_send', message);
}

// 3. Disconnect simulation
export function disconnectLanSimulation() {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log('LAN Simulation: Wyłączono symulację.');
  }
}
