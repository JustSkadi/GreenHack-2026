import { create } from 'zustand';

export interface Peer {
  deviceAddress: string;
  deviceName: string;
  battery?: number; // state for RL routing routing table
  degree?: number;  // degree of node connectivity
}

export interface MeshMessage {
  id: string;
  senderId: string;
  senderTier: number; // 1=gov, 2=inst, 3=comm, 4=user
  content: string;
  encrypted: boolean;
  groupId?: string;
  isPriority: boolean;
  trustScore: number;
  hops: string[]; // history of visited nodes to prevent loops
  ttl: number;
  timestamp: number;
}

interface MeshState {
  mode: 'online' | 'offline';
  peers: Peer[];
  connectedPeers: Peer[];
  routingMode: 'rl' | 'flooding';
  meshMessages: MeshMessage[];
  setMode: (mode: 'online' | 'offline') => void;
  setPeers: (peers: Peer[]) => void;
  addConnectedPeer: (peer: Peer) => void;
  removeConnectedPeer: (deviceAddress: string) => void;
  addMessage: (message: MeshMessage) => void;
  clearMessages: () => void;
}

export const useMeshStore = create<MeshState>((set) => ({
  mode: 'online',
  peers: [],
  connectedPeers: [],
  routingMode: 'flooding',
  meshMessages: [],
  setMode: (mode) => set({ mode }),
  setPeers: (peers) => set({ peers }),
  addConnectedPeer: (peer) =>
    set((state) => {
      // Avoid duplicates
      const exists = state.connectedPeers.some((p) => p.deviceAddress === peer.deviceAddress);
      if (exists) return state;
      return { connectedPeers: [...state.connectedPeers, peer] };
    }),
  removeConnectedPeer: (deviceAddress) =>
    set((state) => ({
      connectedPeers: state.connectedPeers.filter((p) => p.deviceAddress !== deviceAddress),
    })),
  addMessage: (message) =>
    set((state) => {
      // Avoid duplicate messages
      const exists = state.meshMessages.some((m) => m.id === message.id);
      if (exists) return state;
      return { meshMessages: [...state.meshMessages, message] };
    }),
  clearMessages: () => set({ meshMessages: [] }),
}));
