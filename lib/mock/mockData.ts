import { Message, ChecklistItem, Profile, MapPin, Peer } from '../../types';

export const MOCK_PROFILE: Profile = {
  id: 'user-local-001',
  username: 'ty',
  tier: 4,
  verified: false,
  family_group_id: 'family-demo-001',
};

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'msg-001',
    sender_id: 'gov-001',
    sender_username: 'RZĄD RP',
    sender_tier: 1,
    content: 'WARNING: Evacuation ordered for sector B-7. Proceed to resilience centre at Marszałkowska 140.',
    encrypted: false,
    group_id: null,
    is_priority: true,
    trust_score: 1.0,
    hops: 0,
    routed_by_rl: false,
    created_at: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    id: 'msg-002',
    sender_id: 'hospital-001',
    sender_username: 'Szpital Bielański',
    sender_tier: 2,
    content: 'Running on generators. ER is open. Ambulances limited — call only for life-threatening emergencies.',
    encrypted: false,
    group_id: null,
    is_priority: false,
    trust_score: 1.0,
    hops: 1,
    routed_by_rl: true,
    created_at: new Date(Date.now() - 11 * 60000).toISOString(),
  },
  {
    id: 'msg-003',
    sender_id: 'leader-001',
    sender_username: 'lider_wola',
    sender_tier: 3,
    content: 'Water distribution point: Górczewska 17, near the school. Open until 20:00.',
    encrypted: false,
    group_id: null,
    is_priority: false,
    trust_score: 0.88,
    hops: 2,
    routed_by_rl: true,
    created_at: new Date(Date.now() - 18 * 60000).toISOString(),
  },
  {
    id: 'msg-004',
    sender_id: 'user-bad-001',
    sender_username: 'nieznajomy123',
    sender_tier: 4,
    content: 'Lidl on Wola is giving out free food, come quickly!!!',
    encrypted: false,
    group_id: null,
    is_priority: false,
    trust_score: 0.18,
    hops: 3,
    routed_by_rl: false,
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: 'msg-005',
    sender_id: 'family-member-001',
    sender_username: 'mama',
    sender_tier: 4,
    content: "I'm at the neighbours, all OK. We have a 3-day water supply.",
    encrypted: true,
    group_id: 'family-demo-001',
    is_priority: false,
    trust_score: 1.0,
    hops: 1,
    routed_by_rl: true,
    created_at: new Date(Date.now() - 35 * 60000).toISOString(),
  },
];

export const MOCK_CHECKLIST: ChecklistItem[] = [
  { id: 'c-01', user_id: 'user-local-001', category: 'WATER', item: '3L of water per person / day × 3 days', checked: true,  expiry_date: null, quantity_current: 9, quantity_target: 9 },
  { id: 'c-02', user_id: 'user-local-001', category: 'WATER', item: 'Water purification tablets',            checked: false, expiry_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], quantity_current: 0, quantity_target: 1 },
  { id: 'c-03', user_id: 'user-local-001', category: 'WATER', item: 'LifeStraw filter',                      checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },
  { id: 'c-04', user_id: 'user-local-001', category: 'WATER', item: 'Bucket with lid (water collection)',    checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },

  { id: 'c-05', user_id: 'user-local-001', category: 'FOOD', item: 'Canned goods × 9 units',            checked: true,  expiry_date: null, quantity_current: 9, quantity_target: 9 },
  { id: 'c-06', user_id: 'user-local-001', category: 'FOOD', item: 'Dry goods (rice, pasta, grains)',    checked: true,  expiry_date: null, quantity_current: 1, quantity_target: 1 },
  { id: 'c-07', user_id: 'user-local-001', category: 'FOOD', item: 'Manual can opener',                  checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },
  { id: 'c-08', user_id: 'user-local-001', category: 'FOOD', item: 'Food supply for 72h minimum',        checked: false, expiry_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0], quantity_current: 0, quantity_target: 1 },

  { id: 'c-09', user_id: 'user-local-001', category: 'MEDICAL', item: 'First aid kit',                   checked: true,  expiry_date: null, quantity_current: 1, quantity_target: 1 },
  { id: 'c-10', user_id: 'user-local-001', category: 'MEDICAL', item: '14-day prescription medication',  checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },
  { id: 'c-11', user_id: 'user-local-001', category: 'MEDICAL', item: 'Thermometer (non-contact)',       checked: true,  expiry_date: null, quantity_current: 1, quantity_target: 1 },

  { id: 'c-12', user_id: 'user-local-001', category: 'POWER', item: 'Power bank 20 000 mAh (charged)',   checked: true,  expiry_date: null, quantity_current: 1, quantity_target: 1 },
  { id: 'c-13', user_id: 'user-local-001', category: 'POWER', item: 'Battery-powered DAB/FM radio',      checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },
  { id: 'c-14', user_id: 'user-local-001', category: 'POWER', item: 'Torch + spare batteries',           checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },

  { id: 'c-15', user_id: 'user-local-001', category: 'DOCUMENTS', item: 'Copies of ID / passport',       checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },
  { id: 'c-16', user_id: 'user-local-001', category: 'DOCUMENTS', item: 'Emergency contacts (printed)',   checked: false, expiry_date: null, quantity_current: 0, quantity_target: 1 },
  { id: 'c-17', user_id: 'user-local-001', category: 'DOCUMENTS', item: 'Cash reserve (min. 100 EUR)',    checked: true,  expiry_date: null, quantity_current: 1, quantity_target: 1 },
];

export const MOCK_PEERS: Peer[] = [
  { id: 'peer-001', username: 'node_A',  battery: 82, tier: 4, degree: 3, hops_to_command: 2, last_seen: Date.now() },
  { id: 'peer-002', username: 'node_B',  battery: 45, tier: 4, degree: 2, hops_to_command: 3, last_seen: Date.now() - 5000 },
  { id: 'peer-003', username: 'node_C',  battery: 91, tier: 3, degree: 4, hops_to_command: 1, last_seen: Date.now() - 2000 },
  { id: 'peer-004', username: 'relay_D', battery: 100, tier: 2, degree: 5, hops_to_command: 0, last_seen: Date.now() },
];

export const MOCK_MAP_PINS: MapPin[] = [
  { id: 'pin-01', type: 'hospital',    coordinate: { latitude: 50.0756, longitude: 14.4518 }, title: 'FN Vinohrady',        description: 'SOR czynny, generator' },
  { id: 'pin-02', type: 'water',       coordinate: { latitude: 50.0875, longitude: 14.4213 }, title: 'Punkt wody',          description: 'Staré Město, do 20:00' },
  { id: 'pin-03', type: 'food',        coordinate: { latitude: 50.0878, longitude: 14.4558 }, title: 'Punkt jedzenia',      description: 'Žižkov, centrum odporności' },
  { id: 'pin-04', type: 'shelter',     coordinate: { latitude: 50.0753, longitude: 14.4380 }, title: 'Centrum odporności',  description: 'nám. Míru, piętro 2' },
  { id: 'pin-05', type: 'charging',    coordinate: { latitude: 50.0705, longitude: 14.4008 }, title: 'Ładowarnia Smíchov',  description: 'Zasilanie solarne' },
  { id: 'pin-06', type: 'mesh_node',   coordinate: { latitude: 50.0830, longitude: 14.4320 }, title: 'Węzeł mesh #4',       description: '3 hopy do centrum' },
  { id: 'pin-07', type: 'mesh_node',   coordinate: { latitude: 50.0633, longitude: 14.4352 }, title: 'Węzeł mesh #7',       description: '1 hop do centrum' },
  { id: 'pin-08', type: 'outage',      coordinate: { latitude: 50.0740, longitude: 14.4490 }, title: 'Strefa bez prądu',    description: 'Vinohrady, sektor B-7' },
];
