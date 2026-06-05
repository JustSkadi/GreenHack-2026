import TcpSocket from 'react-native-tcp-socket';
import * as Battery from 'expo-battery';
import { useMeshStore, MeshMessage } from '../../stores/meshStore';

const PORT = 8888;
let server: TcpSocket.Server | null = null;
let client: TcpSocket.Socket | null = null;
// Active sockets (since server can have multiple clients, or client connects to one server)
const activeSockets: { [ip: string]: TcpSocket.Socket } = {};
let pingIntervalTimer: NodeJS.Timeout | null = null;

// Starts a TCP Server (used by Group Owner)
export function startTcpServer() {
  if (server) return;

  server = TcpSocket.createServer((socket) => {
    const remoteIp = socket.remoteAddress || 'unknown';
    console.log(`TCP Server: Nowy klient połączony z ${remoteIp}`);
    activeSockets[remoteIp] = socket;

    socket.on('data', (data) => {
      handleIncomingData(data, remoteIp, socket);
    });

    socket.on('error', (error) => {
      console.log(`TCP Server Socket Error (${remoteIp}):`, error);
    });

    socket.on('close', () => {
      console.log(`TCP Server: Klient ${remoteIp} rozłączony`);
      delete activeSockets[remoteIp];
      useMeshStore.getState().updatePeerLatency(remoteIp, -1); // -1 means disconnected
    });
  }).listen({ port: PORT, host: '0.0.0.0' }, () => {
    console.log(`TCP Server uruchomiony na porcie ${PORT}`);
    startPingInterval();
  });

  server.on('error', (error) => {
    console.log('TCP Server Error:', error);
  });
}

// Connects to a TCP Server (used by Client)
export function connectTcpClient(groupOwnerIp: string) {
  if (client) return;

  console.log(`TCP Client: Łączenie z ${groupOwnerIp}:${PORT}...`);
  client = TcpSocket.createConnection(
    { port: PORT, host: groupOwnerIp },
    () => {
      console.log(`TCP Client: Połączono z ${groupOwnerIp}`);
      activeSockets[groupOwnerIp] = client!;
      startPingInterval();
    }
  );

  client.on('data', (data) => {
    handleIncomingData(data, groupOwnerIp, client!);
  });

  client.on('error', (error) => {
    console.log(`TCP Client Error:`, error);
  });

  client.on('close', () => {
    console.log(`TCP Client: Rozłączono z serwerem`);
    delete activeSockets[groupOwnerIp];
    useMeshStore.getState().updatePeerLatency(groupOwnerIp, -1);
    client = null;
    stopPingInterval();
  });
}

// Handler for incoming JSON data
function handleIncomingData(data: Buffer | string, remoteIp: string, socket: TcpSocket.Socket) {
  try {
    const rawData = data.toString();
    // Split by newline in case TCP chunks multiple JSONs together
    const packets = rawData.split('\n').filter(p => p.trim().length > 0);
    
    for (const packet of packets) {
      const parsed = JSON.parse(packet);
      
      if (parsed.type === 'PING') {
        // Zaktualizuj profil jeśli przyszedł w pingu
        if (parsed.phone || parsed.battery !== undefined) {
          useMeshStore.getState().updatePeerProfile(remoteIp, parsed.phone, parsed.battery);
        }
        
        // Reply with PONG immediately, dołączając nasz profil
        const state = useMeshStore.getState();
        Battery.getBatteryLevelAsync().then(level => {
           const myBattery = level > 0 ? Math.round(level * 100) : undefined;
           sendJsonToSocket(socket, { 
             type: 'PONG', 
             timestamp: parsed.timestamp,
             phone: state.myPhoneNumber,
             battery: myBattery
           });
        }).catch(() => {
           sendJsonToSocket(socket, { type: 'PONG', timestamp: parsed.timestamp, phone: state.myPhoneNumber });
        });

      } else if (parsed.type === 'PONG') {
        // Calculate latency based on original timestamp
        const latency = Date.now() - parsed.timestamp;
        useMeshStore.getState().updatePeerLatency(remoteIp, latency);
        
        // Zaktualizuj profil jeśli przyszedł w pongu
        if (parsed.phone || parsed.battery !== undefined) {
          useMeshStore.getState().updatePeerProfile(remoteIp, parsed.phone, parsed.battery);
        }

      } else if (parsed.type === 'MESSAGE') {
        const payload = parsed.payload as MeshMessage;
        const store = useMeshStore.getState();
        
        // 1. Sprawdzamy czy już mamy tę wiadomość (ZABEZPIECZENIE PRZED PĘTLĄ)
        const alreadyExists = store.meshMessages.some(m => m.id === payload.id);
        if (alreadyExists) {
          console.log(`TCP: Odrzucono duplikat wiadomości ${payload.id}`);
          continue; // Porzucamy pakiet
        }

        console.log('TCP: Otrzymano NOWĄ wiadomość! Zapisuję...');
        store.addMessage(payload);

        // 2. PACKET HOPPING (Flooding) - Przesyłamy dalej, jeśli TTL > 0
        if (payload.ttl > 0) {
          const forwardedPayload = {
            ...payload,
            ttl: payload.ttl - 1,
            hops: [...payload.hops, store.myPhoneNumber || 'nieznany-wezel']
          };
          
          console.log(`TCP: Packet-Hopping (Kolejny skok, zostało TTL: ${forwardedPayload.ttl}). Rozsyłanie do sąsiadów...`);
          
          const rawPacket = { type: 'MESSAGE', payload: forwardedPayload };
          // Rozsyłamy do wszystkich AKTYWNYCH gniazd z wyjątkiem nadawcy (z którego to właśnie przyszło)
          Object.keys(activeSockets).forEach(ip => {
            if (ip !== remoteIp) {
              sendJsonToSocket(activeSockets[ip], rawPacket);
            }
          });
        }
      }
    }
  } catch (e) {
    console.log('Błąd parsowania TCP JSON:', e);
  }
}

// Safe JSON sender
function sendJsonToSocket(socket: TcpSocket.Socket, obj: any) {
  try {
    socket.write(JSON.stringify(obj) + '\n'); // Newline delimiter
  } catch (e) {
    console.log('Błąd wysyłania do TCP:', e);
  }
}

// Exported function to send chat messages
export function sendTcpMessage(message: MeshMessage) {
  console.log(`TCP: Wysyłanie wiadomości do ${Object.keys(activeSockets).length} peerów...`);
  const payload = { type: 'MESSAGE', payload: message };
  Object.values(activeSockets).forEach(socket => {
    sendJsonToSocket(socket, payload);
  });
}

// Interval to measure range / connection quality and exchange profiles
function startPingInterval() {
  if (pingIntervalTimer) clearInterval(pingIntervalTimer);
  pingIntervalTimer = setInterval(async () => {
    const state = useMeshStore.getState();
    let myBattery: number | undefined;
    try {
      const level = await Battery.getBatteryLevelAsync();
      myBattery = level > 0 ? Math.round(level * 100) : undefined;
    } catch(e) {}

    const pingObj = { 
      type: 'PING', 
      timestamp: Date.now(),
      phone: state.myPhoneNumber,
      battery: myBattery
    };
    
    Object.values(activeSockets).forEach(socket => {
      sendJsonToSocket(socket, pingObj);
    });
  }, 2000); // 2 seconds ping interval
}

function stopPingInterval() {
  if (pingIntervalTimer) clearInterval(pingIntervalTimer);
  pingIntervalTimer = null;
}

export function stopTcp() {
  stopPingInterval();
  if (client) {
    client.destroy();
    client = null;
  }
  if (server) {
    server.close();
    server = null;
  }
  Object.keys(activeSockets).forEach(ip => delete activeSockets[ip]);
}
