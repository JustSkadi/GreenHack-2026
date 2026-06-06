# Nexus — Offline-First Crisis Communication & Preparedness App

> **GreenHack 2026 · BlackOut Prague Challenge**
> *Designing for day two or five, not day one.*

---

## The Problem

On **July 2025, a single conductor failure near Žatec** triggered a cascade that paralyzed Prague within 90 minutes:

| Time  | Event |
|-------|-------|
| 11:51 | Conductor failure. 60-year-old connector fails. |
| 12:00 | Metro halted. Trams stop. Traffic lights go dark. |
| 12:05 | 3 Prague hospitals switch to backup generators. |
| 13:00 | Mobile networks overloaded. 5G fails. |
| 14:00 | Škoda Auto, Toyota: production halted. |

*Source: Prague blackout, July 2025 — Blackout 2026 Conference*

### What actually fails during a blackout

- Phones lose charge within **6 hours** of the outage
- Generators last **24–48 hours**, not 72
- Water supply depends on **electric pumps**
- Winter brings **hypothermia risk**, summer means **spoiled medication and food**
- Cities have **no real-time situational map** of themselves during a crisis
- Radio, SMS, sirens, and apps operate as **disconnected silos**
- ATMs go offline — **cash only**, instantly
- Volunteers surge but **coordination collapses** without a system

> According to the EU Agency for Cybersecurity (ENISA), cascading infrastructure failures can affect **40–60% of urban services** within 3 hours of a major grid outage.
> — [ENISA Threat Landscape Report](https://www.enisa.europa.eu/publications/enisa-threat-landscape-2024)

> In Poland, the RCB (Rządowe Centrum Bezpieczeństwa) alert system is the only government-to-citizen channel — but it relies on mobile network availability.
> — [rcb.gov.pl](https://www.rcb.gov.pl)

---

## Our Solution: Nexus

**Nexus** is a mobile application built around a single principle: **it must work when everything else has failed.**

The app has two operational modes:

```
NORMAL CONDITIONS          ←→          CRISIS / BLACKOUT
     [ONLINE MODE]                      [OFFLINE MODE]
  Cloud AI · internet                WiFi Direct mesh · local AI
  Standard messaging                 Encrypted peer-to-peer graph
  Government alerts                  Priority broadcasts
```

The backbone of the offline mode is a **mesh network graph** built entirely on WiFi Direct — no internet, no cellular, no electricity infrastructure required. Just charged phones.

---

## Repository Structure

This repository contains three fully implemented components, developed in parallel across branches:

```
GreenHack-2026/
├── nexus/          ← React Native mobile app  (branch: P2PconnectAdam)
│   └── lib/mesh/   ← Wi-Fi Direct P2P layer
├── app/            ← Expo frontend UI         (branch: wera)
│   ├── (tabs)/     ← SOS, Communicator, Checklist, Map
│   └── components/ ← ChatBubble, MeshStatusBar, PriorityBanner
└── mesh/           ← Python RL routing agent  (branch: develop/mesh*)
    └── src/        ← training, simulation, visualization
```

---

## What We Built

### 1. Mobile App — React Native / Expo (branch: `wera`)

A fully implemented Expo (React Native) app with 4 screens, multilingual support, and a floating AI assistant.

**Tech stack:** Expo SDK 56, React Native, TypeScript, Zustand, Groq API (online), llama.rn/Gemma 2B (offline placeholder)

#### Screen 1 — Emergency SOS

One large button. Taps open a pre-filled SMS to **112** containing the user's last known GPS coordinates (latitude/longitude, cached from last online session). Works fully offline — uses the GSM voice/SMS layer, not internet.

- GPS cached automatically while online via `expo-location`
- SMS body format: `SOS - Nexus Emergency · GPS: lat, lon · (time)`
- Fallback notice when no GPS was ever cached

#### Screen 2 — Communicator

Three-tab message interface with real-time online/offline mode switching:

| Tab | Description |
|-----|-------------|
| **ALL** | Global mesh broadcast — all nodes |
| **FAMILY** | End-to-end encrypted private group (AES, family key) |
| **ALERTS** | Read-only — priority broadcasts only |

- Threaded message view per sender
- Animated `PriorityBanner` — RCB-style urgent alert bar that slides in from top
- `MeshStatusBar` — persistent header showing ONLINE / OFFLINE MESH state, peer count, RL badge when AI routing is active, EN/CS language toggle

#### Screen 3 — Preparedness Checklist

Government-style checklist with 5 categories: **WATER, FOOD, MEDICAL, POWER, DOCUMENTS**

- Items can be checked off with a tap
- Expiry date tracking — shows countdown ("EXPIRES: 12d"), "EXPIRES TODAY", "EXPIRED"
- Admin users can add custom items via modal
- Collapsible category sections

#### Screen 4 — AI Chatbot (Floating Bubble)

Draggable bubble (top-right by default) available on every screen. Opens a full chat modal.

| Mode | Implementation |
|------|---------------|
| **Online** | Groq API (`llama-3.1-8b-instant`) — full-speed cloud LLM |
| **Offline** | Placeholder for `llama.rn` + Gemma 2 2B GGUF (~1.5 GB, pre-downloaded) |

System prompt tunes the assistant for Central European crisis scenarios: CPR steps, flood evacuation, gas leaks, infrastructure failure. Responds in the user's language (PL/CS/EN/SK).

#### Screen 5 — Crisis Map

Offline-capable map tab (data pre-downloaded during online sync):
- Hospitals, water distribution, charging stations, resilience centers
- Offline tile cache notice
- `png/` folder contains demo screenshots from the running app

#### Shared Infrastructure

- **Zustand stores**: `meshStore` (mode, peers, messages, routing), `authStore` (profile), `locationStore` (GPS cache), `appModeStore` (online/offline switch)
- **i18n**: full EN/CS translation keys covering all UI strings
- **Theme**: Czech-flag blue (`#4369AA`) on white, monospace typography

---

### 2. Wi-Fi Direct P2P Mesh Layer (branch: `P2PconnectAdam`)

A complete native Android mesh networking implementation inside `nexus/lib/mesh/`.

**Tech stack:** `react-native-wifi-p2p`, `react-native-tcp-socket`, `tweetnacl`, `crypto-js`, `socket.io-client`, `expo-battery`

#### Wi-Fi Direct (`wifiDirect.ts`)

- Runtime permission requests for Android 12 and 13+ (`NEARBY_WIFI_DEVICES` API 33)
- `initWifiDirect()` — initializes `react-native-wifi-p2p`, subscribes to peer and connection updates
- `discoverPeers()` / `stopDiscoveringPeers()` — active scan lifecycle
- `connectToPeer(deviceAddress)` — P2P group formation
- `startAutoMesh()` — background interval that continuously discovers and connects to nearby devices, building a multi-hop graph automatically
- Group Owner vs. Client role detection → wires up TCP server or client accordingly

#### TCP Transport (`tcpSockets.ts`)

- `startTcpServer()` — TCP server on port 8888 (Group Owner role), accepts multiple simultaneous clients
- `connectTcpClient(groupOwnerIp)` — TCP client (non-Group-Owner role)
- Ping/pong heartbeat — measures round-trip latency per peer, marks peers disconnected on timeout
- `handleIncomingData()` — JSON frame parsing, duplicate message detection (by `id`), TTL-based flooding relay to all active sockets
- Battery level read via `expo-battery` and attached to outgoing messages

#### Encryption (`crypto.ts` + `cryptoAsym.ts`)

| Layer | Algorithm | Use case |
|-------|-----------|----------|
| Symmetric | AES (crypto-js) | Family group shared-key encryption |
| Asymmetric | NaCl box (Curve25519 + XSalsa20-Poly1305 via tweetnacl) | Direct peer-to-peer E2E messages |

Key pair generated locally at startup, public key shared with peers via mesh profile exchange.

#### LAN Simulation (`lanSimulation.ts`)

Socket.IO client that connects to a developer laptop running a mock mesh server — allows multi-device simulation over a local Wi-Fi network without needing Android hardware. Used during development to test routing and message delivery.

---

### 3. Mesh Routing — Two Approaches (branch: `develop/mesh`, `develop/mesh-PW`)

We implemented and compared two fundamentally different routing strategies for the mesh network, both written in Python and visualized with Matplotlib animations.

**Tech stack:** Python 3.11+, PyTorch, NetworkX, Hydra, Weights & Biases, ONNX, uv, Matplotlib, imageio-ffmpeg

---

#### Approach A — Algorithmic: BFS Routing Tree + Self-Healing

**Files:** `government_server.py`, `network_node.py`, `simulation.py`

The network is modeled as a **rooted spanning tree** where the government server (node 0) is the root. Every phone knows only two things: its parent and its hop count to the server. Routing a message goes up the tree to the server, then back down to the destination.

**`GovernmentServer` (node 0)**

Builds the routing tree using BFS from itself:
- `build_routing_tree_steps()` — generator that yields `(node_id, parent_id, hop_count)` one discovery at a time, enabling step-by-step animation
- Assigns every reachable node a parent and a hop count; serves as the root of all routing paths

**`NetworkNode`**

Each phone node implements one critical method — `handle_disconnection()`:
- When a node's parent goes offline, it scans its physical neighbors
- Picks the neighbor with the **strictly lowest hop count** (anti-loop invariant: never re-parent to a node worse than yourself)
- If no valid neighbor exists, marks itself isolated (`hop_count = ∞`)

**`simulation.py`** — full live simulation (150 nodes, 1.5 km × 1.5 km)

The simulation runs continuously at 60 FPS and handles:
- **Node mobility**: spring-physics movement (Brownian random forces + momentum damping + wall bouncing); edges update with hysteresis (`RANGE_RADIUS + 0.015`) to prevent flickering on the boundary
- **`silent_routing_update()`**: triggered every physics frame — runs `handle_disconnection()` on orphaned nodes when edges break, runs `optimize_all_routes()` when new edges appear
- **`optimize_all_routes()`**: full network scan sorted from lowest to highest hop count, finds shorter paths for every node in a cascading loop until stable; also recovers isolated nodes
- **`reconnect_isolated_nodes()`**: actively finds any isolated node with a free physical slot and connects it to the nearest in-network neighbor
- **Auto events**: random node spawn or kill every ~2.8 s to simulate phones joining/leaving
- **Manual events**: left-click to kill a node, right-click to add one
- **Message routing**: packet travels hop-by-hop up the BFS tree to the server, then down to the destination; if an edge breaks mid-flight the server re-routes
- **RCB broadcast**: server simultaneously sends to all its direct children, who forward to theirs — a BFS wave that reaches the entire mesh in `max_hop` steps
- `--record` flag switches to headless Agg backend and exports MP4 via imageio-ffmpeg

| Property | Value |
|----------|-------|
| Nodes | 150, random geometric graph |
| Area | 1.5 km × 1.5 km |
| Node range | 0.22 (regular), 0.32 (server) |
| Max connections | 4 per node, 50 for server |
| Animation | 60 FPS, ~16 ms/frame |

---

#### Approach B — Reinforcement Learning: Trained DQN Agent

**Files:** `mesh/src/env/mesh_env.py`, `mesh/src/env/multi_mesh_env.py`, `mesh/src/agent/net.py`, `mesh/src/train.py`, `mesh/src/router.py`, `mesh/src/render_multi.py`

Instead of a fixed algorithm, a neural network is trained in simulation to score routing decisions. Each node independently evaluates its neighbors and picks the one with the highest Q-value — no central coordination, no tree structure.

**Simulation environment (`MeshEnv`)**

- `nx.random_geometric_graph(N, radius)` — random ad-hoc topology, regenerated each episode
- Each node has: `battery` (0.2–1.0), `mobility`, `degree`
- `irl_mode`: nodes move, battery drains, edges randomly drop (`node_drop_prob`)
- Routing task: deliver a packet from `source → destination` in ≤ `max_hops` hops
- Store-and-forward: waits up to `max_store_steps` for a neighbor to reappear
- Reconnect heuristic: up to `max_reconnect_attempts` before giving up
- Gossip warmup: `gossip_warmup_steps` initial steps for topology propagation

`MultiMeshEnv` handles multiple simultaneous routes in a single environment step.

**Neural network (`TopologyAgent`)**

```
Input:  8-dim state vector per candidate neighbor
        [battery, priority, degree, hop_count, ...]
Hidden: Linear(8→128) → ReLU → Linear(128→128) → ReLU → Linear(128→64) → ReLU
Output: Linear(64→1) — scalar Q-value (routing score)

Decision: argmax Q-value across all neighbors
```

**Training (`train.py`)** — curriculum learning in three stages:

1. **Static**: fixed topology, no mobility or drops — agent learns basic shortest-path routing
2. **IRL easy**: nodes move at 0.5× speed, no drops — agent adapts to topology changes
3. **IRL full**: full mobility + random node drops — agent handles real crisis conditions

Managed by **Hydra** (YAML configs in `mesh/conf/`) + **Weights & Biases** (training curves, delivery rate). Evaluation: 80-episode delivery rate benchmark per epoch.

**Deployment:** trained model exported to `mesh/src/model.onnx.data` — ready for `onnxruntime-react-native` on-device inference.

**`render_multi.py`** — dedicated visualization for the RL agent:
- Smooth edge color interpolation (new edges = blue flash, dropped edges = red ghost fade)
- RCB station node rendered in amber, 2× larger than regular nodes
- RCB broadcast phase runs at 5× slower speed so the wave propagation is visible frame by frame
- `--record` exports `symulacja.mp4`

---

#### Comparison

| | BFS + Self-Healing | RL Agent |
|---|---|---|
| **Architecture** | Centralized spanning tree (server = root) | Decentralized per-node scoring |
| **Routing decision** | Follow parent pointer up to server, then down | argmax Q-value over neighbors |
| **Failure recovery** | `handle_disconnection()` — reactive re-parenting | Trained to route around bad nodes |
| **Battery awareness** | No (not a routing factor) | Yes — learned from reward signal |
| **Requires training** | No | Yes (curriculum, ~hours on CPU) |
| **Deployment size** | Zero (pure algorithm) | `model.onnx.data` (~few hundred KB) |
| **Fallback** | None needed | `greedy_to()` (Dijkstra) if inference fails |
| **Simulation** | 150 nodes, live interactive, 60 FPS | 50 nodes, episode-based training env |

---

## Security Architecture

### Encryption — Implemented

| Scope | Algorithm | Status |
|-------|-----------|--------|
| Direct messages | NaCl box (Curve25519 + XSalsa20-Poly1305) | Implemented |
| Family group | AES-256 (shared password) | Implemented |
| Key exchange | Local key pair generated at startup, public key gossiped via mesh | Implemented |

### Message Structure

Each `MeshMessage` carries: `hops[]` (full path), `ttl`, `isPriority`. Duplicate detection (by message `id`) prevents message replay in the mesh.

---

## App Screens — Screenshots

Screenshots from the running app are in `png/`:

- `Zrzut ekranu 2026-06-05 221840.png`
- `Zrzut ekranu 2026-06-05 221846.png`
- `Zrzut ekranu 2026-06-05 221850.png`

---

## Solving the Urban Density Problem

WiFi Direct works within ~100m. In a large city this creates **isolated graph islands**.

### Solution A — Solar-Powered Infrastructure Nodes

Relay devices on lamp posts and utility poles, powered by solar panels:
- Grid-independent (solar + small battery)
- Permanent graph bridges between isolated clusters
- One-time municipal investment, can double as phone charging points

### Solution B — Mobile Bridge Vehicles

Government emergency vehicles driving pre-defined district routes, acting as moving bridge nodes. Zero new infrastructure — activatable within hours using existing fleets.

---

## How to Run

### Mobile App (Expo)

```bash
cd app          # or cd nexus for the P2P branch
npm install
npx expo start
```

Requires a physical Android device for Wi-Fi Direct features. Expo Go works for UI-only development.

### RL Training (Python)

```bash
cd mesh
uv sync                          # install deps
uv run src/train.py              # train with default config
uv run src/render_multi.py       # visualize routing + RCB broadcast
uv run src/render_multi.py --record  # export symulacja.mp4
```

Requires Python 3.11+. W&B account optional (set `wandb.mode=disabled` to skip).

---

## Challenge Alignment

| Challenge Area (GreenHack 2026) | Nexus Feature | Status |
|---------------------------------|---------------|--------|
| **2 — Communication bridges** | WiFi Direct mesh, TCP relay, multi-hop routing | Implemented |
| **3 — Resilience centres** | Map screen + checklist sync to centers | Implemented |
| **7 — Individuals & households** | Checklist with expiry tracking, SOS with GPS, offline AI | Implemented |
| **5 — NGOs & volunteers** | Priority message routing, ALERTS broadcast tab | Implemented |
| **Track 9 — Community preparedness platform** | Checklist + Groq AI advisor | Implemented |
| **Track 9 — Crisis alert translator** | Priority broadcast (PriorityBanner, ALERTS tab) | Implemented |
| **Track 9 — Shared resilience data layer** | Mesh graph + RL routing agent + ONNX export | Implemented |

---

## Technical Trade-offs

| Constraint | Our Approach |
|------------|-------------|
| App size on older phones | Offline AI model (Gemma 2B GGUF) is a separate optional download |
| Local AI model size (~1.5 GB) | llama.rn with Gemma 2B; Groq used as stand-in in current build |
| Battery drain from mesh | Ping interval tunable; battery level attached to all messages so routing agent avoids low-battery nodes |
| WiFi Direct max ~100m range | Solar bridge nodes + mobile bridge vehicles for sparse areas |
| Encryption key exchange without server | Key pair generated locally at startup; public keys gossiped through the mesh on connect |
| RL model deployment | PyTorch → ONNX export; `model.onnx.data` included in repo |

---
