import TcpSocket from 'react-native-tcp-socket';
import * as Battery from 'expo-battery';
import { useMeshStore } from '../../stores/meshStore';
import { useAuthStore } from '../../stores/authStore';
import { Message, Peer } from '../../types';

const PORT = 8888;
let server: TcpSocket.Server | null = null;
let client: TcpSocket.Socket | null = null;
const activeSockets: { [ip: string]: TcpSocket.Socket } = {};
let pingIntervalTimer: NodeJS.Timeout | null = null;

// Pamięć widzianych pakietów do ochrony przed zapętleniem (Packet Flooding)
const seenMessages = new Set<string>();

export function startTcpServer() {
  if (server) return;
  console.log(`[TCP Server] Uruchamianie serwera nasłuchującego na porcie ${PORT}...`);
  server = TcpSocket.createServer((socket) => {
    const remoteIp = socket.remoteAddress || 'unknown';
    console.log(`[TCP Server] 🟢 Złapano nowe połączenie od klienta: ${remoteIp}`);
    activeSockets[remoteIp] = socket;

    socket.on('data', (data) => handleIncomingData(data, remoteIp, socket));
    socket.on('error', (err) => console.log(`[TCP Server] 🔴 Błąd gniazda klienta ${remoteIp}:`, err));
    socket.on('close', () => {
      console.log(`[TCP Server] 🔌 Klient rozłączony: ${remoteIp}`);
      delete activeSockets[remoteIp];
    });
  }).listen({ port: PORT, host: '0.0.0.0' }, () => {
    console.log(`[TCP Server] ✅ Serwer TCP z powodzeniem nasłuchuje na porcie ${PORT}`);
    startPingInterval();
  });
  
  server.on('error', (err) => console.log(`[TCP Server] 🔴 Błąd samego serwera:`, err));
}

export function connectTcpClient(groupOwnerIp: string) {
  if (client) return;
  console.log(`[TCP Client] 🚀 Inicjowanie próby połączenia do właściciela: ${groupOwnerIp}:${PORT}...`);
  
  client = TcpSocket.createConnection(
    { port: PORT, host: groupOwnerIp },
    () => {
      console.log(`[TCP Client] ✅ POŁĄCZONO Z WŁAŚCICIELEM GRUPY: ${groupOwnerIp}!`);
      activeSockets[groupOwnerIp] = client!;
      startPingInterval();
    }
  );

  client.on('data', (data) => handleIncomingData(data, groupOwnerIp, client!));
  client.on('error', (err) => {
     console.log(`[TCP Client] 🔴 BŁĄD POŁĄCZENIA z ${groupOwnerIp}:`, err);
  });
  client.on('close', () => {
    console.log(`[TCP Client] 🔌 ROZŁĄCZONO z właścicielem: ${groupOwnerIp}`);
    delete activeSockets[groupOwnerIp];
    client = null;
    stopPingInterval();
  });
}

function handleIncomingData(data: Buffer | string, remoteIp: string, socket: TcpSocket.Socket) {
  try {
    const packets = data.toString().split('\n').filter(p => p.trim().length > 0);
    
    for (const packet of packets) {
      const parsed = JSON.parse(packet);
      const store = useMeshStore.getState();
      
      if (parsed.type === 'PING') {
        const username = parsed.username || 'Nieznany Node';
        const peerId = parsed.id || remoteIp;
        const isNewPeer = !store.peers.some(p => p.id === peerId);

        store.addPeer({
          id: peerId,
          username: username,
          battery: parsed.battery || 100,
          tier: parsed.tier || 4,
          degree: 1,
          hops_to_command: 0,
          last_seen: Date.now()
        });

        // Wysłanie lokalnej informacji tylko za pierwszym razem!
        if (isNewPeer) {
          const profile = useAuthStore.getState().profile;
          store.addMessage({
            id: `sys-join-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            sender_id: 'system',
            sender_username: 'Mesh System',
            sender_tier: 0,
            content: `📱 Urządzenie "${username}" dołączyło do lokalnej sieci Mesh!`,
            encrypted: false,
            group_id: peerId,
            is_priority: false,
            trust_score: 1.0,
            hops: 0,
            routed_by_rl: false,
            created_at: new Date().toISOString()
          });
        }
        
        const profile = useAuthStore.getState().profile;
        Battery.getBatteryLevelAsync().then(level => {
           sendJsonToSocket(socket, { 
             type: 'PONG', timestamp: parsed.timestamp,
             id: profile?.id || 'local',
             username: profile?.username || 'Me',
             tier: profile?.tier || 4,
             battery: level > 0 ? Math.round(level * 100) : 100,
           });
        }).catch(() => {});

      } else if (parsed.type === 'PONG') {
        store.addPeer({
          id: parsed.id || remoteIp,
          username: parsed.username || 'Nieznany Node',
          battery: parsed.battery || 100,
          tier: parsed.tier || 4,
          degree: 1,
          hops_to_command: 0,
          last_seen: Date.now()
        });

      } else if (parsed.type === 'MESSAGE') {
        const payload = parsed.payload as Message;
        
        console.log(`\n[TCP] 📥 ODBRANO WIADOMOŚĆ od [${remoteIp}]`);
        console.log(`      Nadawca: ${payload.sender_username}`);
        console.log(`      Treść:   "${payload.content}"`);

        // Zabezpieczenie przed pętlami (Flooding)
        if (seenMessages.has(payload.id)) {
           console.log(`      (Ignoruję duplikat, id: ${payload.id})`);
           continue;
        }
        seenMessages.add(payload.id);

        store.addMessage(payload);

        // Przekazanie dalej (jeśli przeszło mniej niż 6 węzłów)
        if (payload.hops < 6) {
          console.log(`      (Przekazuję dalej... hops: ${payload.hops})`);
          const forwardedPayload = { ...payload, hops: payload.hops + 1 };
          const rawPacket = { type: 'MESSAGE', payload: forwardedPayload };
          Object.keys(activeSockets).forEach(ip => {
            if (ip !== remoteIp) sendJsonToSocket(activeSockets[ip], rawPacket);
          });
        }
      }
    }
  } catch (e) {
    console.log('TCP Parse Error:', e);
  }
}

function sendJsonToSocket(socket: TcpSocket.Socket, obj: any) {
  try { socket.write(JSON.stringify(obj) + '\n'); } catch (e) {}
}

export function sendTcpMessage(message: Message) {
  seenMessages.add(message.id);
  const payload = { type: 'MESSAGE', payload: message };
  
  const connectedIps = Object.keys(activeSockets);
  console.log(`\n[TCP] 📤 WYSYŁANIE WIADOMOŚCI do ${connectedIps.length} połączonych węzłów...`);
  console.log(`      Treść: "${message.content}"`);
  
  if (connectedIps.length === 0) {
     console.log('      (Brak otwartych gniazd TCP. Wiadomość nigdzie nie poleci!)');
  }

  Object.values(activeSockets).forEach(socket => sendJsonToSocket(socket, payload));
}

function startPingInterval() {
  if (pingIntervalTimer) clearInterval(pingIntervalTimer);
  pingIntervalTimer = setInterval(async () => {
    const profile = useAuthStore.getState().profile;
    let myBattery = 100;
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level > 0) myBattery = Math.round(level * 100);
    } catch(e) {}

    const pingObj = { 
      type: 'PING', timestamp: Date.now(),
      id: profile?.id || 'local',
      username: profile?.username || 'Me',
      tier: profile?.tier || 4,
      battery: myBattery
    };
    
    Object.values(activeSockets).forEach(socket => sendJsonToSocket(socket, pingObj));
  }, 3000);
}

function stopPingInterval() {
  if (pingIntervalTimer) clearInterval(pingIntervalTimer);
  pingIntervalTimer = null;
}

export function stopTcp() {
  stopPingInterval();
  if (client) { client.destroy(); client = null; }
  if (server) { server.close(); server = null; }
  Object.keys(activeSockets).forEach(ip => delete activeSockets[ip]);
}
