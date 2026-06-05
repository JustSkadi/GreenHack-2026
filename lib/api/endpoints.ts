// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINTS.TS — kontrakt między P1 (Frontend) a P2 (Backend)
//
//  Szukaj "// [P2]" w całym projekcie aby znaleźć każde miejsce
//  gdzie potrzebna jest implementacja backendu.
//
//  Domyślnie cały projekt działa na MOCK_DATA — wystarczy podmienić
//  funkcje oznaczone [P2] na prawdziwe wywołania Supabase.
// ═══════════════════════════════════════════════════════════════════════

// ─── AUTH ───────────────────────────────────────────────────────────────

// [P2] supabase.auth.signUp({ email, password }) + INSERT INTO profiles
export const AUTH_REGISTER = 'supabase.auth.signUp';

// [P2] supabase.auth.signInWithPassword({ email, password })
export const AUTH_LOGIN = 'supabase.auth.signInWithPassword';

// [P2] supabase.auth.signOut()
export const AUTH_LOGOUT = 'supabase.auth.signOut';

// [P2] supabase.auth.getSession() — sprawdzenie aktywnej sesji przy starcie
export const AUTH_SESSION = 'supabase.auth.getSession';

// [P2] supabase.from('profiles').select('*').eq('id', userId).single()
export const PROFILE_GET = 'profiles:select:single';

// ─── MESSAGES ───────────────────────────────────────────────────────────

// [P2] supabase.from('messages').select('*, profiles(username, tier)').order('created_at')
//      Filtruj wg group_id: null = global, uuid = rodzina
export const MESSAGES_LIST = 'messages:select:list';

// [P2] supabase.from('messages').insert({ sender_id, content, group_id, is_priority, trust_score })
export const MESSAGES_SEND = 'messages:insert';

// [P2] supabase.channel('room:global').on('postgres_changes', { event: 'INSERT', table: 'messages' }, cb)
//      Osobny kanał dla rodziny: 'room:family:<family_group_id>'
export const MESSAGES_REALTIME_GLOBAL  = 'supabase:channel:room:global';
export const MESSAGES_REALTIME_FAMILY  = 'supabase:channel:room:family:<id>';
export const MESSAGES_REALTIME_BROADCASTS = 'supabase:channel:room:broadcasts';

// ─── CHECKLIST ──────────────────────────────────────────────────────────

// [P2] supabase.from('checklist_items').select('*').eq('user_id', userId)
export const CHECKLIST_GET = 'checklist_items:select:list';

// [P2] supabase.from('checklist_items').insert({ user_id, category, item, expiry_date, ... })
export const CHECKLIST_CREATE = 'checklist_items:insert';

// [P2] supabase.from('checklist_items').update({ checked, expiry_date, ... }).eq('id', itemId)
export const CHECKLIST_UPDATE = 'checklist_items:update';

// [P2] supabase.from('checklist_items').delete().eq('id', itemId)
export const CHECKLIST_DELETE = 'checklist_items:delete';

// ─── MAP PINS ────────────────────────────────────────────────────────────

// [P2] supabase.from('map_pins').select('*') — tabela do dodania w schemacie
//      Lub: statyczne JSON z rządu/NGO pobierane przy onlinie i cache w MMKV
export const MAP_PINS_GET = 'map_pins:select:list';

// ─── TROLL / TRUST ───────────────────────────────────────────────────────

// [P2] Nie wymaga Supabase — P4 dostarcza checkMessage(text): { score, flagged }
//      Wynik zapisz w polu trust_score wiadomości przed wysłaniem do Supabase
export const TROLL_CHECK = 'lib/troll/detector:checkMessage';

// ─── POWIADOMIENIA O DATACH WAŻNOŚCI ─────────────────────────────────────

// [P2] expo-background-fetch + expo-task-manager + expo-notifications
//      Zadanie działa codziennie, sprawdza checklist_items gdzie expiry_date <= now + 7d
export const EXPIRY_CHECK_TASK = 'expo:background-task:CHECK_EXPIRY';

// ─── MESH (P3) ───────────────────────────────────────────────────────────

// [P3] meshStore.peers — lista urządzeń w sieci WiFi Direct / LAN sim
export const MESH_PEERS = 'meshStore:peers';

// [P3] meshStore.sendMeshMessage(content, priority, tier) → P1 tylko wywołuje
export const MESH_SEND = 'meshStore:sendMeshMessage';

// ─── AI (P4) ─────────────────────────────────────────────────────────────

// [P4] lib/ai/onlineChat:askOnline(message) → string — Claude API
export const AI_ONLINE  = 'lib/ai/onlineChat:askOnline';

// [P4] lib/ai/offlineChat:askOffline(message) → string — llama.rn
export const AI_OFFLINE = 'lib/ai/offlineChat:askOffline';

// [P4] lib/crypto/familyEncryption:encryptMessage / decryptMessage
export const CRYPTO_ENCRYPT = 'lib/crypto/familyEncryption:encryptMessage';
export const CRYPTO_DECRYPT = 'lib/crypto/familyEncryption:decryptMessage';
