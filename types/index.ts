export type UserTier = 1 | 2 | 3 | 4;

export interface Profile {
  id: string;
  username: string;
  tier: UserTier;
  verified: boolean;
  family_group_id: string | null;
}

export interface Message {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_tier: UserTier;
  content: string;
  encrypted: boolean;
  group_id: string | null;
  is_priority: boolean;
  trust_score: number;
  hops: number;
  routed_by_rl: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  user_id: string;
  category: string;
  item: string;
  checked: boolean;
  expiry_date: string | null;
  quantity_current: number | null;
  quantity_target: number | null;
}

export interface Peer {
  id: string;
  username: string;
  battery: number;
  tier: UserTier;
  degree: number;
  hops_to_command: number;
  last_seen: number;
}

export interface MapPin {
  id: string;
  type: 'hospital' | 'water' | 'food' | 'charging' | 'shelter' | 'mesh_node' | 'outage';
  coordinate: { latitude: number; longitude: number };
  title: string;
  description?: string;
}

export type MeshMode = 'online' | 'offline';
export type RoutingMode = 'rl' | 'flooding';

export type MessageGroup = 'global' | 'family' | 'broadcasts';
