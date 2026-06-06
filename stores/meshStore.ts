import { create } from 'zustand';
import { Message, Peer, MeshMode, RoutingMode, MessageGroup } from '../types';
import { useAuthStore } from './authStore';
import { MOCK_MESSAGES, MOCK_PEERS } from '../lib/mock/mockData';

// ─────────────────────────────────────────────────────────────
//  MESH STORE — P1 czyta, P3 pisze
//
//  P1: NIGDY nie pisze do tego store bezpośrednio poza
//  setMode() i sendMessage(). Reszta należy do P3.
// ─────────────────────────────────────────────────────────────

interface MeshState {
  mode: MeshMode;
  peers: Peer[];
  messages: {
    global: Message[];
    family: Message[];
    broadcasts: Message[];
  };
  routingMode: RoutingMode;
  activePriorityMessage: Message | null;

  setMode:   (mode: MeshMode) => void;
  addPeer:   (peer: Peer) => void;
  removePeer:(id: string) => void;

  // [P2] Online: supabase.from('messages').insert(...)
  // [P3] Offline: meshStore.sendMeshMessage(content, priority, tier)
  sendMessage: (content: string, group: MessageGroup, isPriority?: boolean) => void;

  // Wywoływane przez P2 (realtime subscription) lub P3 (mesh receive)
  addMessage: (msg: Message) => void;

  dismissPriority: () => void;
}

const splitMessages = (msgs: Message[]) => {
  // Dla uproszczenia (gdybyśmy pobierali z DB)
  return {
    global:     msgs.filter(m => (!m.group_id || (m.group_id !== 'family-demo-001')) && !m.is_priority),
    family:     msgs.filter(m => m.group_id === 'family-demo-001'),
    broadcasts: msgs.filter(m => m.is_priority),
  };
};

export const useMeshStore = create<MeshState>((set, get) => ({
  mode:        'online',
  peers:       [],
  messages:    splitMessages(MOCK_MESSAGES),
  routingMode: 'flooding',
  activePriorityMessage: null,

  setMode: (mode) => set({ mode }),

  addPeer:    (peer) => set(s => ({ peers: [...s.peers.filter(p => p.id !== peer.id), peer] })),
  removePeer: (id)  => set(s => ({ peers: s.peers.filter(p => p.id !== id) })),

  sendMessage: (content, group, isPriority = false) => {
    const { mode } = get();
    if (mode === 'online') {
      // [P2] ZASTĄP:
      //   await supabase.from('messages').insert({
      //     sender_id: authStore.user.id,
      //     content,
      //     group_id: group === 'family' ? authStore.profile.family_group_id : null,
      //     is_priority: isPriority,
      //     trust_score: await checkMessage(content), // P4
      //   })
      //   Realtime subscription doda ją automatycznie przez addMessage()
    } else {
      // Offline: Wyślij przez Wi-Fi Direct Mesh
      const { sendMeshMessage } = require('../lib/mesh/wifiDirect');
      const profile = useAuthStore.getState().profile;
      
      const mock: Message = {
        id:              `msg-${Date.now()}`,
        sender_id:       profile?.id || 'user-local-001',
        sender_username: profile?.username || 'Ja',
        sender_tier:     profile?.tier || 4,
        content,
        encrypted:       group === 'family',
        group_id:        (group === 'family') ? (profile?.family_group_id || 'family-demo-001') : (group !== 'global' && group !== 'broadcasts' ? group : null),
        is_priority:     isPriority,
        trust_score:     1.0,
        hops:            0,
        routed_by_rl:    false,
        created_at:      new Date().toISOString(),
      };
      
      sendMeshMessage(mock);
      get().addMessage(mock);
      return; // kończymy, żeby nie dodawać drugi raz na dole
    }

    // Mock: dodaj lokalnie
    const mock: Message = {
      id:              `msg-${Date.now()}`,
      sender_id:       'user-local-001',
      sender_username: 'ty',
      sender_tier:     4,
      content,
      encrypted:       group === 'family',
      group_id:        (group === 'family') ? 'family-demo-001' : (group !== 'global' && group !== 'broadcasts' ? group : null),
      is_priority:     isPriority,
      trust_score:     1.0,
      hops:            0,
      routed_by_rl:    false,
      created_at:      new Date().toISOString(),
    };
    get().addMessage(mock);
  },

  addMessage: (msg) => {
    set(s => {
      const newMessages = { ...s.messages };
      const profile = useAuthStore.getState().profile;
      const isFamily = msg.group_id === 'family-demo-001' || (profile && msg.group_id === profile.family_group_id);

      if (msg.is_priority) {
        newMessages.broadcasts = [msg, ...s.messages.broadcasts];
      } else if (msg.group_id && isFamily) {
        newMessages.family = [msg, ...s.messages.family];
      } else {
        newMessages.global = [msg, ...s.messages.global];
      }
      return {
        messages: newMessages,
        activePriorityMessage: msg.is_priority ? msg : s.activePriorityMessage,
      };
    });
  },

  dismissPriority: () => set({ activePriorityMessage: null }),
}));
