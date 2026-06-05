# Nexus — Podział zadań (4 osoby)

> Zasada: każda osoba ma swój **obszar własności**. Nakładają się tylko w miejscach opisanych jako "interface points" — tam krótka synchronizacja przed startem.

---

## Przegląd podziału

| Osoba | Obszar | Skrót |
|-------|--------|-------|
| **Osoba 1** | UI / Frontend — wszystkie ekrany | `P1` |
| **Osoba 2** | Backend + Auth + Baza danych | `P2` |
| **Osoba 3** | Mesh Network — komunikacja offline | `P3` |
| **Osoba 4** | AI + Bezpieczeństwo (szyfrowanie, troll detection) | `P4` |

---

## Osoba 1 — UI / Frontend

> Budujesz **wizualną powłokę** całej aplikacji. Inni podpinają się pod Twoje komponenty.

### Faza 1 (pierwsze 4h)
- [ ] Setup projektu: `npx create-expo-app nexus --template blank-typescript`
- [ ] Expo Router — nawigacja po 5 ekranach (tabs)
- [ ] Globalny theme: kolory, typografia, ciemny motyw (kryzys = dark UI)
- [ ] **Ekran 1:** duży przycisk SOS → `Linking.openURL('tel:112')`
- [ ] Placeholder screens dla pozostałych 4 ekranów

### Faza 2 (4h–12h)
- [ ] **Ekran 3 — Checklist:**
  - Lista z kategoriami (Woda, Jedzenie, Apteczka, Dokumenty, Zasilanie)
  - Checkbox przy każdym item
  - Modal "dodaj produkt" z polem na datę ważności
  - Wizualny alert gdy produkt wygasa za ≤7 dni (czerwone tło)
- [ ] **Ekran 5 — Mapa:**
  - React Native Maps z OpenStreetMap
  - Piny: szpitale, punkty wody, punkty jedzenia, węzły mesh
  - Legenda pinów
- [ ] Komponent `MeshStatusBar` — pasek na górze ekranu pokazujący: `● ONLINE` / `◌ OFFLINE MESH (4 nodes)`

### Faza 3 (12h–20h)
- [ ] **Ekran 2 — Komunikator (UI shell):**
  - Lista wiadomości z komponentem `MessageItem` (tekst + avatar + tier badge + timestamp)
  - Pole tekstowe + przycisk wyślij
  - Baner "PRIORITY MESSAGE" (czerwony, animowany) — wyzwalany z zewnątrz
  - Zakładki: `Global` / `Family 🔒` / `Broadcasts`
- [ ] Toggle ONLINE/OFFLINE w headerze (podpina się pod store z P3)
- [ ] Floating bubble chatbota w prawym górnym rogu (UI — logika od P4)

### Faza 4 (20h–24h)
- [ ] Połączenie UI z danymi od P2 (Supabase realtime → lista wiadomości)
- [ ] Testy na telefonie, poprawki UX
- [ ] Przygotowanie flow demo dla jury (golden path bez crashy)

---

## Osoba 2 — Backend + Auth + Baza danych

> Jesteś właścicielem **danych i tożsamości**. Dostarczasz innym gotowe hooki i klienta Supabase.

### Faza 1 (pierwsze 4h)
- [ ] Założenie projektu na [supabase.com](https://supabase.com) (free tier)
- [ ] Schema SQL — uruchomić w Supabase SQL Editor:

```sql
create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  tier int default 4,
  verified bool default false,
  family_group_id uuid
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id),
  content text not null,
  encrypted bool default false,
  group_id uuid,
  is_priority bool default false,
  trust_score float default 1.0,
  created_at timestamptz default now()
);

create table checklist_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  category text not null,
  item text not null,
  checked bool default false,
  expiry_date date,
  quantity_current int,
  quantity_target int
);

alter publication supabase_realtime add table messages;
```

- [ ] Plik `lib/supabase.ts` — klient Supabase eksportowany jako singleton
- [ ] Plik `.env` z kluczami + dodać do `.gitignore`

### Faza 2 (4h–12h)
- [ ] **Auth flow:**
  - Ekran logowania / rejestracji (możesz użyć gotowego UI od P1 lub zbudować prosty)
  - `authStore.ts` (Zustand): `user`, `profile`, `tier`, `isLoggedIn`
  - Auto-login przy starcie jeśli sesja istnieje
  - Logout
- [ ] **Hook `useMessages()`** — subskrypcja realtime na tabelę `messages`, zwraca tablicę wiadomości
- [ ] **Hook `useChecklist()`** — CRUD na `checklist_items` dla zalogowanego użytkownika

### Faza 3 (12h–20h)
- [ ] **Wysyłanie wiadomości online** — funkcja `sendMessage(content, groupId?, isPriority?)`
- [ ] **Tier system:** po rejestracji tier=4 (user); seed kilku użytkowników z tier=1 (gov) dla demo
- [ ] **Powiadomienia o datach ważności:**
  - `expo-background-fetch` + `expo-task-manager`
  - Codziennie sprawdza `checklist_items` gdzie `expiry_date` za ≤7 dni
  - Wysyła lokalny push przez `expo-notifications`
- [ ] RLS (Row Level Security) na Supabase — użytkownik widzi tylko swoje checklist items

### Faza 4 (20h–24h)
- [ ] Seed danych demo: 3–4 użytkowników, wiadomości, jeden item z datą ważności za 3 dni
- [ ] Upewnić się że `.env.example` jest w repo (bez kluczy)
- [ ] Pomoc przy integracji z P1 jeśli coś nie działa z Supabase

---

## Osoba 3 — Mesh Network + RL Routing

> Budujesz **serce aplikacji** — warstwę komunikacji gdy internet padnie + model ML który uczy się optymalnie przez nią routować.
>
> ⚠️ **Wymaga Pythona i PyTorcha.** Trening odbywa się na laptopie przed/w trakcie hackathonu — na telefon trafia tylko gotowy plik `.onnx`.

### Faza 1 (pierwsze 4h) — setup obu warstw równolegle

**Warstwa komunikacji (React Native):**
- [ ] Zainstalować: `npm install socket.io-client react-native-wifi-p2p onnxruntime-react-native`
- [ ] `meshStore.ts` (Zustand):
  ```typescript
  {
    mode: 'online' | 'offline',
    peers: Peer[],
    routingTable: Map<string, string>,
    meshMessages: Message[],
    routingMode: 'rl' | 'flooding',   // fallback jeśli ONNX nie załaduje
    setMode: (mode) => void,
    addPeer: (peer) => void,
  }
  ```

**Warstwa ML (Python — odpalasz na laptopie):**
- [ ] `pip install torch networkx hydra-core wandb onnx`
- [ ] Założyć darmowe konto na [wandb.ai](https://wandb.ai) — dashboard do flexowania przed jury
- [ ] Plik `ml/config.yaml` (Hydra):
  ```yaml
  graph:
    n_nodes: 20
    max_battery_drain: 0.05
    edge_drop_prob: 0.1
  training:
    episodes: 500
    lr: 0.001
    gamma: 0.95
    epsilon_start: 1.0
    epsilon_end: 0.05
  ```

### Faza 2 (4h–12h) — LAN simulation + środowisko RL

**LAN Simulation (demo-ready, React Native):**
- [ ] Prosty Node.js server (`server/mesh-sim.js`) — Socket.IO:
  ```javascript
  // { id, payload, ttl, senderTier, hops: [], routedByRL: bool }
  // Dodaje 20ms opóźnienia na hop — widoczne w UI
  ```
- [ ] `lib/mesh/lanSimulation.ts` — `sendMeshMessage()` + `onMeshMessage()`
- [ ] Integracja z `meshStore`

**Środowisko RL (Python `ml/environment.py`):**
- [ ] Klasa `MeshEnv` oparta o NetworkX:
  ```python
  class MeshEnv:
      # State: wektor cech sąsiada
      # [battery/100, priority/4, degree/max_degree, hop_count/max_ttl]
      def step(self, action):  # action = wybrany sąsiad
          # Reward:
          # +100  jeśli dotarło do Command Node (tier=1)
          # -10   za każdą krawędź powyżej progu (bottleneck)
          # -exp(1/battery) za routing przez niską baterię
          ...
      def reset(self):
          # Nowy losowy graf, losowe pozycje baterii
          ...
  ```
- [ ] Węzły tracą baterię każdy krok, krawędzie losowo zrywają się z `edge_drop_prob`

### Faza 3 (12h–18h) — trening DQN + ONNX export

**Trening (Python `ml/train.py`):**
- [ ] Agent PyTorch MLP:
  ```python
  class RoutingAgent(nn.Module):
      def __init__(self):
          super().__init__()
          self.net = nn.Sequential(
              nn.Linear(4, 64), nn.ReLU(),
              nn.Linear(64, 64), nn.ReLU(),
              nn.Linear(64, 1)   # Q-value dla danego sąsiada
          )
  ```
- [ ] Pętla Q-learning z epsilon-greedy exploration
- [ ] W&B logging: `wandb.log({'reward': r, 'epsilon': eps, 'loss': loss})`
- [ ] Hydra do uruchamiania z CLI: `python train.py graph.n_nodes=30 training.lr=0.0005`

**ONNX Export (`ml/export.py`):**
- [ ] Po zbieżności (reward rośnie stabilnie):
  ```python
  dummy_input = torch.randn(1, 4)
  torch.onnx.export(agent, dummy_input, 'nexus_router.onnx',
                    input_names=['neighbor_state'],
                    output_names=['q_value'],
                    opset_version=11)
  ```
- [ ] Kwantyzacja: `python -m onnxruntime.quantization.quantize nexus_router.onnx nexus_router_q.onnx`
- [ ] Skopiować `nexus_router_q.onnx` → `assets/models/` w projekcie React Native

### Faza 4 (18h–24h) — integracja ONNX w aplikacji

- [ ] `lib/mesh/rlRouter.ts`:
  ```typescript
  import { InferenceSession, Tensor } from 'onnxruntime-react-native';

  let session: InferenceSession | null = null;

  export async function initRLRouter() {
    session = await InferenceSession.create('nexus_router_q.onnx');
  }

  export async function pickNextHop(peers: Peer[], message: Message): Promise<Peer> {
    if (!session) return fallbackFlooding(peers, message); // bezpieczny fallback

    const scores = await Promise.all(peers.map(async (peer) => {
      const state = new Tensor('float32', [
        peer.battery / 100,
        message.priority / 4,
        peer.degree / MAX_DEGREE,
        message.hopCount / message.ttl,
      ], [1, 4]);
      const result = await session!.run({ neighbor_state: state });
      return { peer, score: result['q_value'].data[0] as number };
    }));

    return scores.sort((a, b) => b.score - a.score)[0].peer;
  }
  ```
- [ ] Podpiąć `pickNextHop` w miejsce flooding algorithm w `lanSimulation.ts`
- [ ] `meshStore.routingMode` = `'rl'` po pomyślnym `initRLRouter()`
- [ ] Jeśli ONNX nie ładuje → `routingMode = 'flooding'` (flooding jako zawsze-działający fallback)
- [ ] **Demo prep:** otworzyć W&B dashboard w przeglądarce — pokazać jury reward curve podczas pitchu

---

## Osoba 4 — AI + Bezpieczeństwo

> Budujesz **inteligencję i zaufanie** — chatbot, szyfrowanie, ochrona przed trollami.

### Faza 1 (pierwsze 4h)
- [ ] Zainstalować: `npm install @anthropic-ai/sdk tweetnacl tweetnacl-util llama.rn`
- [ ] **Online chatbot — Claude API** (`lib/ai/onlineChat.ts`):
  ```typescript
  const SYSTEM_PROMPT = `Jesteś asystentem kryzysowym Nexus.
  Pomagasz użytkownikom w sytuacjach awaryjnych: blackouty, powodzie, trzęsienia ziemi.
  Odpowiadaj zwięźle, praktycznie i spokojnie. Zawsze priorytetyzuj bezpieczeństwo życia.
  Gdy nie wiesz — odsyłaj do 112.`;

  export async function askOnline(message: string): Promise<string>
  ```
- [ ] Podstawowy UI chatbota (floating bubble od P1 wołający tę funkcję)

### Faza 2 (4h–12h)
- [ ] **Offline chatbot — llama.rn** (`lib/ai/offlineChat.ts`):
  - Pobierz model: TinyLlama Q4 (~650MB) lub Llama 3.2 1B Q4 (~1.1GB)
  - `initOfflineModel()` — ładuje model z `FileSystem.documentDirectory`
  - `askOffline(message)` — inference lokalna
  - System prompt skupiony na: pierwsza pomoc, blackout procedures, ewakuacja
  - Jeśli model za wolny na dostępnych telefonach → pre-loaded Q&A jako fallback
- [ ] Przełączanie online/offline w ChatBubble — wołaj `askOnline` lub `askOffline` w zależności od trybu

### Faza 3 (12h–20h)
- [ ] **Troll detection** (`lib/troll/detector.ts`):
  - Opcja A (szybka): keyword blacklist + regex patterns dla typowych fake alerts
  - Opcja B (lepsza): `@tensorflow-models/toxicity` — `model.classify([text])`
  - Zwraca `{ score: 0.0–1.0, flagged: boolean, reason?: string }`
  - P1 wyświetla `⚠️ Niezweryfikowana informacja` pod wiadomością jeśli `flagged=true`
- [ ] **Szyfrowanie rodzinne** (`lib/crypto/familyEncryption.ts`):
  ```typescript
  // tweetnacl secretbox — klucz symetryczny dla grupy rodzinnej
  export function encryptMessage(text: string, key: Uint8Array): string
  export function decryptMessage(cipher: string, key: Uint8Array): string | null
  export function generateFamilyKey(): Uint8Array
  ```
- [ ] **Wymiana klucza przez QR** (`components/QRKeyExchange.tsx`):
  - Generuj QR z kluczem rodzinnym
  - Skanowanie QR = dołącz do grupy rodzinnej
  - `react-native-qrcode-svg` + `expo-barcode-scanner`

### Faza 4 (20h–24h)
- [ ] Integracja troll detection z meshem P3 — każda wiadomość przez `detector.ts` przed wyświetleniem
- [ ] Integracja szyfrowania z komunikatorem P1 — zakładka "Family 🔒" używa encrypt/decrypt
- [ ] Demo flow: pokaż wiadomość flagowaną przez troll detection na żywo

---

## Interface Points — synchronizacja między osobami

> Te miejsca wymagają 5-minutowej rozmowy **przed** implementacją, żeby uniknąć konfliktów.

| Punkt | Kto | Co ustalić |
|-------|-----|------------|
| `meshStore.ts` | P1 + P3 | P3 tworzy store, P1 tylko czyta z niego — nigdy nie pisze |
| `authStore.ts` | P1 + P2 | P2 tworzy store, P1 tylko czyta `user` i `tier` |
| `MessageItem` props | P1 + P3 + P4 | Ustalić interface: `{ id, content, senderTier, trustScore, encrypted, hops }` |
| ChatBubble ↔ AI | P1 + P4 | P1 buduje UI bubble, P4 eksportuje `askOnline()` i `askOffline()` — P1 je woła |
| Troll detection hook | P3 + P4 | P4 eksportuje `checkMessage(text)`, P3 woła przed dodaniem wiadomości do store |
| Szyfrowanie ↔ zakładka Family | P1 + P4 | P4 eksportuje `encrypt/decrypt`, P1 woła przy wysyłaniu/odbieraniu w Family tab |

---

## Harmonogram synchronizacji

| Czas | Co |
|------|----|
| **Start** | 30 min: setup repo, wszyscy robią `git clone`, podział branchy (`feat/ui`, `feat/backend`, `feat/mesh`, `feat/ai`) |
| **+4h** | 15 min standup: czy Supabase działa? Czy Expo się odpala? Pokazać co jest na ekranie. |
| **+12h** | 30 min integracja: P1 + P2 spinają ekran komunikatora z Supabase realtime |
| **+16h** | 30 min integracja: P1 + P3 spinają toggle online/offline + wyświetlanie mesh messages |
| **+20h** | 30 min integracja: P4 spinają AI i szyfrowanie z P1 UI |
| **+22h** | Wszyscy razem: próba generalna demo (pełny flow z jury script) |
| **+24h** | Tylko bugfixy i polish — zero nowych ficzerów |

---

## Branche git

```bash
main          ← merge tylko gotowych, działających rzeczy
feat/ui       ← Osoba 1
feat/backend  ← Osoba 2
feat/mesh     ← Osoba 3
feat/ai       ← Osoba 4
```

Każda osoba pracuje na swoim branchu. Merge do `main` przez krótki PR review (druga osoba rzuca okiem — 5 min) przed synchronizacją.
