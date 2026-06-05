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
  Government alerts                  Priority hierarchy broadcasts
```

The backbone of the offline mode is a **mesh network graph** built entirely on WiFi Direct — no internet, no cellular, no electricity infrastructure required. Just charged phones.

---

## Architecture

### Online Mode

When infrastructure is intact, Nexus operates as a standard, cloud-connected application:

- **Cloud AI Chatbot** — powered by a capable LLM (e.g. Claude / GPT-4 class), answers questions about crisis preparedness, what to do in case of X disaster, how to help others
- **Standard messaging** — regular internet-based group and direct messages
- **Government alert feed** — pull from official RCB / EU-ALERT systems
- **Checklist sync** — government pushes updated preparedness checklists to all users

### Offline Mode — The Core

When the grid or network fails, Nexus switches to a **self-organizing WiFi Direct mesh network**:

```
     [Phone A] ──── 80m ──── [Phone B] ──── 60m ──── [Phone C]
         │                       │                       │
         └──── 95m ──── [Phone D] ──── 70m ──── [Phone E]
```

- Each device is a **node** in a dynamic graph
- Edges exist between devices within **≤100m** (WiFi Direct range)
- Messages are **routed through the graph** — reaching a phone 500m away via 5 hops
- No router, no tower, no power grid needed

> WiFi Direct specification: peer-to-peer connections up to ~200m in open space, ~100m in urban environments.
> — [Wi-Fi Alliance — Wi-Fi Direct](https://www.wi-fi.org/discover-wi-fi/wi-fi-direct)

#### Reinforcement Learning Routing Agent

Instead of a static algorithm (e.g. Dijkstra), Nexus uses a **trained DQN agent** to make routing decisions. The agent learns to avoid bottlenecks, dying batteries, and congested nodes — adapting in real time to the changing topology of a crisis.

```
Training pipeline (Python, runs offline before deployment):

  NetworkX Graph Simulation
  ├── Nodes: phones with battery%, degree, tier
  ├── Edges: P2P connections that randomly drop
  └── Dynamics: nodes move, batteries drain, edges break

       ↓  state vector per neighbor

  PyTorch MLP (DQN Agent)
  ├── Input:  [battery/100, priority/4, degree/max, hop_count/ttl]
  ├── Output: Q-value per neighbor (= routing score)
  └── Learns via reward signal:
        +100  message reaches Command Node (gov tier)
        -10   per bottleneck edge created
        -exp  routing through low-battery node

  Managed by Hydra (CLI hyperparams) + W&B (training dashboard)

       ↓  after convergence

  ONNX export → quantized weights (~few hundred KB)
  Deployed via onnxruntime-react-native on device
```

The trained `.onnx` model is bundled with the app. During offline mesh operation, each routing decision calls the model with a neighbor's state vector and picks the highest Q-value path. A classic flooding algorithm serves as fallback if inference fails.

#### Local AI Model (Offline Chatbot)

A compact, on-device language model serves as the offline AI assistant:

- Candidate models: **Llama 3.2 1B** (~2 GB), **Phi-3 Mini** (~2.3 GB), **Gemma 2B** (~1.5 GB)
- Focused on: first aid instructions, crisis navigation, step-by-step emergency guidance
- Knowledge is **pre-downloaded** and updated during online mode
- Does NOT require internet — runs entirely on device CPU/NPU

> Llama 3.2 1B model: [huggingface.co/meta-llama/Llama-3.2-1B](https://huggingface.co/meta-llama/Llama-3.2-1B)
> Phi-3 Mini: [huggingface.co/microsoft/Phi-3-mini-4k-instruct](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct)

---

## Security Architecture

### Troll Detection & Disinformation Prevention

During a crisis, false information can cost lives. Nexus implements multi-layer protection:

1. **AI-based troll detection** — on-device ML model flags messages containing patterns of disinformation (false emergency locations, panic-inducing unverified claims)
2. **Message trust scoring** — each message carries a trust score based on sender tier and network behavior
3. **Community flagging** — users can flag suspicious messages, which are then deprioritized in routing

### User Hierarchy

Not all messages are equal. Nexus enforces a verified sender hierarchy:

```
🔴 TIER 1 — Government / Emergency Services   (cryptographically signed)
🟠 TIER 2 — Verified institutions (hospitals, municipalities)
🟡 TIER 3 — Verified community leaders
🟢 TIER 4 — Regular users
```

Priority messages from Tier 1–2 behave like **RCB alerts** — they bypass normal routing limits and reach the entire local mesh first.

### Family & Group Encrypted Communication

- Each family/household can create a **private encrypted group**
- Messages within the group use **end-to-end encryption** (e.g., Signal Protocol / Curve25519)
- Members of the same apartment building can communicate securely, even if other nodes in the mesh are compromised
- The encryption keys are **derived locally** — no server involved

---

## App Structure — 5 Screens

### Screen 1 — Emergency SOS

```
┌────────────────────────────┐
│                            │
│   ┌──────────────────┐     │
│   │                  │     │
│   │    🆘 RATUNKU    │     │
│   │   (tap to call)  │     │
│   │                  │     │
│   └──────────────────┘     │
│                            │
│   Auto-detects country     │
│   Connects to local 112    │
│                            │
└────────────────────────────┘
```

One large button. One action. Works offline (GSM fallback). Automatically dials the local emergency number (112 in EU, 999 in UK, 911 in US).

---

### Screen 2 — Communicator

The main messaging interface with a visible **ONLINE / OFFLINE** toggle indicator.

**Online:**
- Standard messaging (groups, DMs, broadcast)
- Government alert feed
- Full emoji, media, file sharing

**Offline (WiFi Direct mesh):**
- Text-only messaging (bandwidth optimization)
- User tier badges visible on all messages
- Troll detection warnings in-line
- Family group with lock icon (encrypted)
- Broadcast channel for Tier 1 priority alerts
- Mesh signal strength indicator (how many hops to nearest router node)

---

### Screen 3 — Preparedness Checklist

A government-maintained, category-organized checklist of what every household should have before a crisis:

**Example categories:**

#### Water
- [ ] Minimum 3L per person per day for 3 days stored
- [ ] Water purification tablets (Iodine / Chlorine)
- [ ] Manual water filter (LifeStraw or equivalent)

#### Food
- [ ] Non-perishable food supply for 72 hours minimum
- [ ] 🗓️ *Enter expiry dates manually — app sends push notifications 7 days before expiry*
- [ ] Manual can opener

#### Medical
- [ ] First aid kit (bandages, antiseptic, scissors, gloves)
- [ ] 14-day supply of personal prescription medications
- [ ] Thermometer + blood pressure monitor (non-electric)

#### Power & Communication
- [ ] Fully charged power bank (minimum 20,000 mAh)
- [ ] Battery-powered or hand-crank radio (DAB/FM)
- [ ] Nexus app pre-configured and tested

#### Documents
- [ ] Copies of ID, passport, insurance documents
- [ ] Emergency contacts list (physical printout)
- [ ] Cash reserve (ATMs will be down)

> The WHO recommends a minimum 72-hour emergency supply for households in urban areas.
> — [WHO Emergency Preparedness Guidelines](https://www.who.int/publications/i/item/9789240003545)

> FEMA's Ready.gov recommends a minimum 3-day supply of water (1 gallon/person/day) and food.
> — [ready.gov/kit](https://www.ready.gov/kit)

> Czech Republic civil emergency preparedness guidelines (HZS ČR):
> — [hzscr.cz](https://www.hzscr.cz/clanek/jak-se-pripravit-na-krizi.aspx)

---

### Screen 4 — AI Chatbot (Floating Bubble, top-right)

Available as a persistent floating bubble across all screens.

**Online mode — Cloud AI:**
- Full LLM capability
- Example questions: *"What should I do if my neighbor is having a heart attack and paramedics can't reach us?"* / *"How do I store water safely for 2 weeks?"* / *"Where is the nearest resilience center?"*

**Offline mode — Local AI:**
- On-device model (Llama / Phi / Gemma class)
- Pre-loaded with first aid guides (CPR, Heimlich, wound care, hypothermia treatment)
- Pre-loaded with local map data (downloaded during online sync)
- Answers questions like: *"Step by step: how do I perform CPR on an adult?"* / *"What are signs of carbon monoxide poisoning?"* / *"Where is the nearest water distribution point?"*

---

### Screen 5 — Crisis Map *(Phase 2)*

An interactive offline-capable map showing:

- 🔵 Active mesh nodes (device density heatmap)
- 🏥 Hospitals & medical points
- 💧 Water distribution points
- 🍞 Food distribution centers
- 🔋 Charging stations (solar-powered)
- 🛡️ Resilience centers / civil protection shelters
- ⚡ Known power outage zones

Map data pre-downloaded and updated during online sync.

---

## Solving the Urban Density Problem

WiFi Direct works within ~100m. In a large, spread-out city this could create **isolated graph islands** — groups of phones that can't reach each other.

We have two bridge solutions:

### Solution A — Solar-Powered Infrastructure Nodes

Mount small relay devices on **existing lamp posts and utility poles**, powered by their own solar panels. These nodes:
- Are **grid-independent** (solar + small battery)
- Serve as permanent **graph bridges** between isolated clusters
- Require one-time municipal investment
- Can double as **charging points** for civilian phones

### Solution B — Mobile Bridge Vehicles

Government-coordinated vehicles that drive pre-defined routes through districts, acting as **moving bridge nodes** between isolated mesh clusters. This requires zero new infrastructure and can be activated within hours using existing emergency vehicle fleets.

---

## Future Roadmap

### Phase 3 — Starlink Backbone
For municipalities with resources: solar-powered Starlink terminals at key city points (resilience centers, hospitals) provide a **satellite internet bridge** that is fully grid-independent. Individual users connect via the mesh, packets route to the Starlink node.

### Phase 4 — Community Reward System
A point/credit system to encourage mutual aid:
- An elderly neighbor posts a request: *"I need medication from pharmacy on Wenceslas Square"*
- A user in the area fulfills the request and earns **community points**
- Points redeemable for discounts at partner stores or public services
- Gamifies resilience without monetizing crisis

### Phase 5 — Civic App Integration
Rather than a standalone app, integrate Nexus capabilities into:
- **mObywatel** (Poland) — already installed on millions of phones
- National banking apps — high install rate, verified user identity
- EU Digital Identity Wallet — pan-European crisis communication

### Phase 6 — Water Infrastructure Mapping
Inspired by post-war Ukraine experience, where water access was the #1 survival factor:
- Map all functional wells, springs, and manual pumps in the city
- Offline-downloadable
- Community-updated during crisis

> Lessons from Ukraine: During power outages in winter 2022–2023, access to water was identified as the primary survival challenge for urban residents.
> — [UNHCR Ukraine Situation Report](https://www.unhcr.org/ua/en)
> — [Reuters: Ukraine water crisis](https://www.reuters.com/world/europe/)

---

## Challenge Alignment

| Challenge Area (from GreenHack 2026) | Nexus Feature |
|--------------------------------------|---------------------|
| **2 — Communication bridges** | WiFi Direct mesh network |
| **3 — Resilience centres** | Map + checklist sync to centers |
| **7 — Individuals & households** | Checklist, family groups, offline chatbot |
| **5 — NGOs & volunteers** | User hierarchy, coordination layer |
| **Track 9 — Community preparedness platform** | Checklists + AI advisor |
| **Track 9 — Crisis alert translator** | Tier 1 priority broadcast system |
| **Track 9 — Shared resilience data layer** | Mesh graph + map data layer |

---

## Technical Constraints & Honest Trade-offs

| Constraint | Our Approach |
|------------|-------------|
| App size (must run on older phones) | Modular architecture — offline AI model is optional download |
| Local AI model size (~2GB) | Downloaded only on Wi-Fi, stored on SD card if available |
| Battery drain from mesh networking | Low-power mesh mode: reduce scan frequency after 2h of outage |
| WiFi Direct max ~100m range | Solar bridge nodes + mobile bridges for sparse areas |
| Troll detection without internet | Pre-trained lightweight classifier, updated during online sync |
| Encryption key exchange without server | QR-code based key exchange during household setup |
