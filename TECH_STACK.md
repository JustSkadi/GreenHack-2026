# Nexus — Tech Stack & Demo Strategy

> Hackathon-optimized. Every choice here prioritizes: **working demo in 24–48h** over perfection.

---

## TL;DR — Recommended Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Mobile framework | **React Native + Expo (bare workflow)** | Cross-platform, fastest UI dev, large ecosystem |
| Offline mesh (real) | **react-native-wifi-p2p** (Android) | Native WiFi Direct bindings |
| Offline mesh (demo fallback) | **Socket.IO over local LAN** | Same UX demo, zero native setup headaches |
| Online AI chatbot | **Claude API (claude-sonnet-4-5)** | Best quality, simple REST, fast to integrate |
| Offline AI chatbot | **llama.rn** + TinyLlama 1.1B or Phi-3 Mini | On-device inference, ~1–2 GB, runs on mid-range phone |
| Backend | **Supabase** | Auth + database + realtime in under 30 minutes |
| Local DB | **expo-sqlite** + MMKV | SQL for structured data, MMKV for fast key-value cache |
| Encryption | **tweetnacl-js** | Simple, audited, works in React Native out of the box |
| Maps | **React Native Maps** + OpenStreetMap tiles | Free, offline-capable tiles |
| Push notifications | **expo-notifications** | Zero config with Expo |
| Troll detection | **TensorFlow Lite** (pre-trained text classifier) | On-device, <50 MB model |
| **Mesh routing (ML)** | **PyTorch DQN → ONNX → onnxruntime-react-native** | RL agent trains offline, deploys as tiny .onnx on device |
| Mesh simulation (training) | **NetworkX + PyTorch + Hydra + W&B** | Dynamic graph env, hyperparameter CLI, cloud training dashboard |

---

## Architecture Decision: React Native vs Flutter vs Native Android

### Option A — React Native + Expo ✅ RECOMMENDED

```
Pros:
  ✓ Web devs can contribute immediately (JSX)
  ✓ Expo ecosystem = fast: camera, notifications, maps, SQLite — all one install
  ✓ llama.rn works natively
  ✓ Large community, lots of hackathon examples

Cons:
  ✗ WiFi Direct needs bare workflow (not Expo Go)
  ✗ Slightly heavier than Flutter in production
```

### Option B — Flutter

```
Pros:
  ✓ flutter_nearby_connections = WiFi Direct + BLE hybrid (works on iOS too)
  ✓ Better performance
  ✓ Great for showing smooth UI to jury

Cons:
  ✗ Dart — team needs to know it
  ✗ Less hackathon tooling, slower to debug
  ✗ llama.cpp integration more complex (llama_cpp_dart exists but less mature)
```

### Option C — Native Android (Kotlin)

```
Pros:
  ✓ Best WiFi Direct support (android.net.wifi.p2p is the gold standard)
  ✓ Full control over mesh topology

Cons:
  ✗ Android only — no iOS demo
  ✗ Slowest UI development
  ✗ Only makes sense if 2+ team members know Kotlin
```

**Decision rule:**
- Team knows JS/TS → **React Native + Expo**
- Team knows Dart → **Flutter**
- Team has Android devs and wants to impress technically → **Native Android**

---

## Component Deep-Dive

### 1. WiFi Direct Mesh Network

#### Real implementation (Android, impressive demo)

```bash
npm install react-native-wifi-p2p
```

```typescript
import WifiP2p from 'react-native-wifi-p2p';

// Initialize
await WifiP2p.initialize();
await WifiP2p.startDiscoveringPeers();

// Connect to peer
WifiP2p.connectWithConfig({ deviceAddress: peer.deviceAddress });

// Send message through graph
// Each node maintains a routing table: Map<nodeId, nextHop>
// Message = { id, payload, ttl, senderTier, signature }
```

Graph routing algorithm (simplified Flooding with TTL):
```
Message arrives at node X:
  1. if message.id in seen_cache → discard
  2. add message.id to seen_cache
  3. if message.destination == self → deliver to UI
  4. else → forward to all connected peers (TTL--)
```

> WiFi Direct Android docs: https://developer.android.com/develop/connectivity/wifi/wifi-direct

#### Demo fallback — LAN simulation (same UX, easier to set up in conference room)

```bash
npm install socket.io-client
```

```typescript
// Each phone connects to a local Socket.IO server on the same WiFi
// Server simulates graph topology with artificial hop delays
// Jury sees: message routing through nodes, hop count, latency

socket.emit('mesh_send', {
  message: text,
  senderTier: user.tier,
  hops: [],
  ttl: 5,
});
```

**Demo tip:** Show two phones physically separated across the room, send a message, show it arrive with "3 hops, 0ms latency (offline mesh)". Jury doesn't need to see WiFi Direct internals — they need to see the concept working.

---

### 2. Online AI Chatbot — Claude API

```bash
npm install @anthropic-ai/sdk
```

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_KEY });

const SYSTEM_PROMPT = `You are a crisis preparedness assistant for Nexus.
You help users prepare for and respond to emergencies: blackouts, floods, 
earthquakes, medical emergencies. Be concise, practical, and calm.
Always prioritize life safety. When uncertain, direct users to call 112.`;

const response = await client.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 500,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userMessage }],
});
```

**Model recommendation:** `claude-sonnet-4-5` — best balance of speed and quality for live demo.

---

### 3. Offline AI Chatbot — llama.rn

```bash
npm install llama.rn
```

**Model choice for hackathon:**

| Model | Size | Quality | Recommended? |
|-------|------|---------|-------------|
| TinyLlama 1.1B Q4 | ~650 MB | Basic | ✓ Good for demo |
| Llama 3.2 1B Q4 | ~1.1 GB | Good | ✓✓ Best choice |
| Phi-3 Mini Q4 | ~2.3 GB | Excellent | If phone has 4GB+ RAM |

```typescript
import { initLlama, LlamaContext } from 'llama.rn';

// Model downloaded during online sync, stored locally
const context = await initLlama({
  model: `${FileSystem.documentDirectory}models/llama-3.2-1b-q4.gguf`,
  n_ctx: 1024,
  n_threads: 4,
});

const result = await context.completion({
  prompt: `[INST] ${CRISIS_SYSTEM_PROMPT}\n\nUser: ${message} [/INST]`,
  n_predict: 200,
  temperature: 0.3, // low temp = more factual, better for emergencies
});
```

**Pre-load crisis knowledge** as few-shot examples in the system prompt:
- First aid (CPR, Heimlich, hypothermia)
- Blackout procedures
- Water purification
- Evacuation protocols

> llama.rn GitHub: https://github.com/mybigday/llama.rn
> GGUF model hub: https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF

---

### 4. Backend — Supabase

```bash
npm install @supabase/supabase-js
```

**Schema (run in Supabase SQL editor — takes 5 minutes):**

```sql
-- Users with tier system
create table profiles (
  id uuid references auth.users primary key,
  username text unique,
  tier int default 4, -- 1=gov, 2=institution, 3=community, 4=user
  verified bool default false,
  family_group_id uuid
);

-- Messages (online mode)
create table messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id),
  content text,
  encrypted bool default false,
  group_id uuid,
  priority bool default false,
  trust_score float default 1.0,
  created_at timestamptz default now()
);

-- Checklist items
create table checklist_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  category text,
  item text,
  checked bool default false,
  expiry_date date,
  quantity_current int,
  quantity_target int
);

-- Enable realtime on messages
alter publication supabase_realtime add table messages;
```

**Realtime messaging:**
```typescript
supabase
  .channel('room:global')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => addMessageToUI(payload.new))
  .subscribe();
```

---

### 5. Encryption — tweetnacl-js

```bash
npm install tweetnacl tweetnacl-util
```

```typescript
import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

// Family group: shared symmetric key (exchanged via QR code during setup)
const familyKey = nacl.randomBytes(32);

// Encrypt message
function encryptForFamily(message: string, key: Uint8Array): string {
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.secretbox(encodeUTF8(message), nonce, key);
  return encodeBase64(new Uint8Array([...nonce, ...encrypted]));
}

// Decrypt message
function decryptFromFamily(cipher: string, key: Uint8Array): string | null {
  const data = decodeBase64(cipher);
  const nonce = data.slice(0, 24);
  const box = data.slice(24);
  const decrypted = nacl.secretbox.open(box, nonce, key);
  return decrypted ? new TextDecoder().decode(decrypted) : null;
}
```

**Key exchange for demo:** Generate QR code with the family key → second phone scans → instant encrypted group. Very visual for jury.

```bash
npm install react-native-qrcode-svg expo-barcode-scanner
```

---

### 6. Troll Detection — TensorFlow Lite

```bash
npm install @tensorflow/tfjs @tensorflow/tfjs-react-native @tensorflow-models/toxicity
```

```typescript
import * as toxicity from '@tensorflow-models/toxicity';

const model = await toxicity.load(0.7, ['threat', 'insult', 'identity_attack']);

async function checkMessage(text: string): Promise<TrustScore> {
  const predictions = await model.classify([text]);
  const isToxic = predictions.some(p => p.results[0].match);
  return {
    score: isToxic ? 0.2 : 1.0,
    flag: isToxic ? 'potential_disinformation' : null,
  };
}
```

**For demo:** Pre-load the model. Test with obvious messages like "Go to [wrong address], everyone is safe there!" to show the system flagging it.

---

### 7. Maps — React Native Maps + Offline Tiles

```bash
npm install react-native-maps
npx expo install expo-location
```

```typescript
// Offline map tiles from OpenStreetMap — download during online sync
// Store in: FileSystem.documentDirectory/map-tiles/{z}/{x}/{y}.png

import MapView, { Marker, UrlTile } from 'react-native-maps';

<MapView>
  <UrlTile
    urlTemplate={isOnline
      ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      : `${FileSystem.documentDirectory}map-tiles/{z}/{x}/{y}.png`}
    maximumZ={16}
  />
  {waterPoints.map(p => <Marker key={p.id} coordinate={p} title="Water" />)}
  {meshNodes.map(n => <Marker key={n.id} coordinate={n} title={`Node (${n.hops} hops)`} />)}
</MapView>
```

---

### 8. Checklist + Expiry Notifications

```typescript
// Store in expo-sqlite
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('blackbridge.db');

// Expiry notification (runs daily via background task)
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';

TaskManager.defineTask('CHECK_EXPIRY', async () => {
  const soon = await db.getAllAsync(
    `SELECT * FROM checklist_items WHERE expiry_date BETWEEN date('now') AND date('now', '+7 days')`
  );
  for (const item of soon) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Expiry warning',
        body: `${item.item} expires in ${daysUntil(item.expiry_date)} days — replace soon.`,
      },
      trigger: null, // immediate
    });
  }
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
```

---

## Project Structure

```
blackbridge/
├── app/                          # Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx             # Screen 1: SOS button
│   │   ├── messenger.tsx         # Screen 2: Communicator
│   │   ├── checklist.tsx         # Screen 3: Checklist
│   │   └── map.tsx               # Screen 5: Crisis map
│   └── _layout.tsx
├── components/
│   ├── ChatBubble.tsx            # Screen 4: AI chatbot floating button
│   ├── MeshStatus.tsx            # Mesh connectivity indicator
│   ├── MessageItem.tsx           # Message with tier badge + trust score
│   └── QRKeyExchange.tsx         # Family group setup
├── lib/
│   ├── mesh/
│   │   ├── wifiDirect.ts         # react-native-wifi-p2p wrapper
│   │   ├── lanSimulation.ts      # Socket.IO fallback for demo
│   │   └── router.ts             # Graph routing algorithm
│   ├── ai/
│   │   ├── onlineChat.ts         # Claude API
│   │   └── offlineChat.ts        # llama.rn wrapper
│   ├── crypto/
│   │   └── familyEncryption.ts   # tweetnacl-js helpers
│   ├── troll/
│   │   └── detector.ts           # TF.js toxicity model
│   └── supabase.ts               # Supabase client
├── stores/
│   ├── meshStore.ts              # Zustand: mesh state, peers, routing table
│   ├── authStore.ts              # Zustand: user, tier, family group
│   └── settingsStore.ts          # Zustand: online/offline mode toggle
└── assets/
    └── models/                   # Bundled GGUF model (or downloaded on first run)
```

---

## Demo Strategy for Jury

### What to build REAL (core demo, non-negotiable)

- [x] SOS button → calls 112
- [x] Online AI chatbot (Claude API) answering crisis question live
- [x] Mesh messaging between 2 phones (WiFi Direct OR LAN simulation)
- [x] Priority message arriving with red badge (Tier 1)
- [x] Checklist with one expiry notification firing
- [x] Online/Offline mode toggle with visible state change

### What to mock convincingly

- [ ] Offline AI — show pre-loaded response OR use tiny model; label as "local AI model (Llama 3.2 1B)"
- [ ] Troll detection — show a flagged message with a warning banner; can be rule-based for demo
- [ ] Map with mesh nodes — static pins on map showing "6 mesh nodes detected nearby"
- [ ] Family encrypted group — show lock icon + "E2E Encrypted" badge; encryption can be real or visual-only

### Demo script (5 minutes for jury)

```
1. (0:00) Open app → show SOS button → "works offline, calls 112"

2. (0:30) Toggle to ONLINE mode
         → Ask AI: "What should I do if there's a blackout in winter?"
         → Show fast, helpful response

3. (1:30) Toggle to OFFLINE mode (airplane mode on both phones)
         → Send message from Phone A
         → Show it arriving on Phone B with "2 hops • mesh network"
         → Send a Tier 1 priority broadcast → show red alert banner

4. (2:30) Show a suspicious message being flagged by troll detection
         → "Go to Wenceslas Square, food is being distributed" (false)
         → Show ⚠️ Unverified — low trust score banner

5. (3:00) Open Checklist
         → Show food item expiring in 3 days
         → Show notification that fired

6. (3:30) Show Offline AI: ask "How do I perform CPR?"
         → Show step-by-step response (from local model or pre-loaded)

7. (4:00) Open Map → show hospital, water, and mesh node pins
```

---

## Setup in 5 Commands

```bash
# 1. Create project
npx create-expo-app blackbridge --template blank-typescript
cd blackbridge

# 2. Core dependencies
npm install @anthropic-ai/sdk @supabase/supabase-js socket.io-client \
  tweetnacl tweetnacl-util zustand llama.rn \
  react-native-maps react-native-wifi-p2p \
  @tensorflow/tfjs @tensorflow/tfjs-react-native @tensorflow-models/toxicity

# 3. Expo modules
npx expo install expo-sqlite expo-location expo-notifications \
  expo-barcode-scanner expo-background-fetch expo-task-manager \
  expo-file-system react-native-qrcode-svg

# 4. Switch to bare workflow (required for WiFi Direct)
npx expo prebuild

# 5. Run
npx expo run:android   # or run:ios
```

---

## Environment Variables

```env
# .env (never commit this)
EXPO_PUBLIC_ANTHROPIC_KEY=sk-ant-...
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_DEMO_MODE=true    # enables LAN simulation instead of WiFi Direct
```

---

## 24h vs 48h Build Plan

### First 8 hours — foundation
- [ ] Expo project setup + navigation (5 screens)
- [ ] Supabase: auth + profiles + messages table
- [ ] SOS button
- [ ] Online AI chatbot (Claude API)
- [ ] Basic checklist UI + SQLite

### Hours 8–16 — core offline features
- [ ] LAN mesh simulation (Socket.IO) with hop visualization
- [ ] Online/Offline mode toggle
- [ ] Tier badges on messages
- [ ] Priority message UI (red alert banner)
- [ ] Troll detection (keyword-based first, ML if time)

### Hours 16–24 — polish + demo prep
- [ ] Family encrypted group (tweetnacl + QR exchange)
- [ ] Expiry notification
- [ ] Offline AI (llama.rn + TinyLlama)
- [ ] Map with static crisis pins
- [ ] Demo rehearsal, fix critical bugs

### Bonus (if ahead of schedule)
- [ ] Real WiFi Direct (swap Socket.IO simulation for react-native-wifi-p2p)
- [ ] Actual TF.js toxicity model
- [ ] Offline map tiles pre-download
