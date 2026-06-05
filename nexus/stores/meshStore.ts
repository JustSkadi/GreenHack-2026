import { create } from 'zustand';
import { generateKeyPair } from '../lib/mesh/cryptoAsym';

export interface Peer {
  deviceAddress: string;
  deviceName: string;
  degree?: number;
  latency?: number;
  phoneNumber?: string;
  battery?: number;
  publicKey?: string;
}

export interface MeshMessage {
  id: string;
  senderId: string;
  recipientId: string; // Adresat wiadomości
  senderTier: number;
  content: string;
  encrypted: boolean;
  groupId?: string;
  isPriority: boolean;
  trustScore: number;
  hops: string[];
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
  updatePeerLatency: (deviceAddress: string, latency: number) => void;
  myPhoneNumber: string;
  myPublicKey: string;
  mySecretKey: string;
  setMyPhoneNumber: (phone: string) => void;
  updatePeerProfile: (deviceAddress: string, phoneNumber?: string, battery?: number, publicKey?: string) => void;
}

const initialKeys = generateKeyPair();

export const useMeshStore = create<MeshState>((set) => ({
  mode: 'online',
  peers: [],
  connectedPeers: [],
  routingMode: 'flooding',
  meshMessages: [],
  myPhoneNumber: '',
  myPublicKey: initialKeys.publicKey,
  mySecretKey: initialKeys.secretKey,
  setMyPhoneNumber: (phone) => set({ myPhoneNumber: phone }),
  setMode: (mode) => set({ mode }),
  setPeers: (peers) => set({ peers }),
  addConnectedPeer: (peer) =>
    set((state) => {
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
      const exists = state.meshMessages.some((m) => m.id === message.id);
      if (exists) return state;
      return { meshMessages: [...state.meshMessages, message] };
    }),
  clearMessages: () => set({ meshMessages: [] }),
  updatePeerLatency: (deviceAddress, latency) =>
    set((state) => ({
      connectedPeers: state.connectedPeers.map((p) =>
        p.deviceAddress === deviceAddress ? { ...p, latency } : p
      ),
      peers: state.peers.map((p) =>
        p.deviceAddress === deviceAddress ? { ...p, latency } : p
      ),
    })),
  updatePeerProfile: (deviceAddress, phoneNumber, battery, publicKey) =>
    set((state) => {
      const peerExists = state.connectedPeers.find((p) => p.deviceAddress === deviceAddress);
      if (peerExists) {
        return {
          connectedPeers: state.connectedPeers.map((p) =>
            p.deviceAddress === deviceAddress
              ? {
                  ...p,
                  phoneNumber: phoneNumber !== undefined ? phoneNumber : p.phoneNumber,
                  battery: battery !== undefined ? battery : p.battery,
                  publicKey: publicKey !== undefined ? publicKey : p.publicKey,
                }
              : p
          ),
        };
      }
      return state;
    }),
}));
