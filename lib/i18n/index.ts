import { create } from 'zustand';

export type Lang = 'en' | 'cs';

const en = {
  // tabs
  tab_sos:    'SOS',
  tab_comm:   'COMM',
  tab_list:   'LIST',
  tab_map:    'MAP',

  // mesh status
  status_online:  'ONLINE',
  status_offline: 'OFFLINE MESH',

  // SOS
  sos_label:         'EMERGENCY',
  sos_number:        '112',
  sos_hint_idle:     'tap to send emergency SMS',
  sos_hint_calling:  'SMS app opened...',
  sos_no_location:   'no saved location (go online to cache GPS)',
  sos_legal:         'SMS includes your last GPS location\nsaved automatically while online',

  // communicator
  comm_tab_all:       'ALL',
  comm_tab_family:    'FAMILY 🔒',
  comm_tab_alerts:    'ALERTS',
  comm_placeholder:   'message...',
  comm_placeholder_family: 'family message (encrypted)...',
  comm_broadcast_note: 'only Tier 1–2 can send priority alerts',
  comm_offline_bar:   'MESH MODE — text only · encryption active in Family tab',
  comm_empty:         'no messages',

  // checklist
  checklist_title:    'CRISIS CHECKLIST',
  checklist_add:      '+ ADD',
  modal_title:        'NEW ITEM',
  field_category:     'CATEGORY',
  field_desc:         'DESCRIPTION',
  field_expiry:       'EXPIRY DATE (optional)',
  field_expiry_fmt:   'YYYY-MM-DD',
  btn_cancel:         'CANCEL',
  btn_add:            'ADD',
  expiry_expired:     'EXPIRED',
  expiry_today:       'EXPIRES TODAY',
  expiry_soon:        (d: number) => `EXPIRES: ${d}d`,
  expiry_ok:          (d: number) => `ok · ${d}d`,

  // categories (display labels — keys stay EN in DB)
  cat_WATER:          'WATER',
  cat_FOOD:           'FOOD',
  cat_MEDICAL:        'MEDICAL',
  cat_POWER:          'POWER',
  cat_DOCUMENTS:      'DOCUMENTS',

  // map
  map_legend:         'LEGEND',
  map_offline_notice: 'cached tiles · data from last sync',
  pin_hospital:       'Hospital',
  pin_water:          'Water point',
  pin_food:           'Food',
  pin_charging:       'Charging',
  pin_shelter:        'Shelter',
  pin_mesh_node:      'Mesh node',
  pin_outage:         'Power outage',

  // chat
  chat_title:         'CRISIS ASSISTANT',
  chat_placeholder:   'ask a question...',
  chat_welcome:       "I'm the Nexus crisis assistant. Ask about first aid, blackout procedures, evacuation.",
  chat_loading:       'thinking...',
  chat_role_user:     'YOU',
  chat_role_ai:       'AI',
  chat_error_quota:   'Too many requests — please wait a moment.',
  chat_error_generic: 'Something went wrong. Try again.',

  // message item
  msg_unverified:     (score: number) => `⚠  unverified  ·  trust score: ${score}%`,
};

const cs: typeof en = {
  tab_sos:    'SOS',
  tab_comm:   'KOMUN',
  tab_list:   'SEZNAM',
  tab_map:    'MAPA',

  status_online:  'ONLINE',
  status_offline: 'OFFLINE MESH',

  sos_label:         'POMOC',
  sos_number:        '112',
  sos_hint_idle:     'klepněte pro odeslání tísňové SMS',
  sos_hint_calling:  'SMS aplikace otevřena...',
  sos_no_location:   'poloha neuložena (připojte se k internetu)',
  sos_legal:         'SMS obsahuje vaši poslední GPS polohu\nuloženou automaticky při připojení',

  comm_tab_all:       'VŠICHNI',
  comm_tab_family:    'RODINA 🔒',
  comm_tab_alerts:    'UPOZORNĚNÍ',
  comm_placeholder:   'zpráva...',
  comm_placeholder_family: 'zpráva rodině (šifrovaná)...',
  comm_broadcast_note: 'pouze Tier 1–2 může odesílat prioritní upozornění',
  comm_offline_bar:   'MESH REŽIM — pouze text · šifrování aktivní v záložce Rodina',
  comm_empty:         'žádné zprávy',

  checklist_title:    'KRIZOVÝ SEZNAM',
  checklist_add:      '+ PŘIDAT',
  modal_title:        'NOVÁ POLOŽKA',
  field_category:     'KATEGORIE',
  field_desc:         'POPIS',
  field_expiry:       'DATUM EXPIRACE (volitelné)',
  field_expiry_fmt:   'RRRR-MM-DD',
  btn_cancel:         'ZRUŠIT',
  btn_add:            'PŘIDAT',
  expiry_expired:     'PROŠLÉ',
  expiry_today:       'VYPRŠÍ DNES',
  expiry_soon:        (d: number) => `VYPRŠÍ: ${d}d`,
  expiry_ok:          (d: number) => `ok · ${d}d`,

  cat_WATER:          'VODA',
  cat_FOOD:           'JÍDLO',
  cat_MEDICAL:        'LÉKÁRNIČKA',
  cat_POWER:          'NAPÁJENÍ',
  cat_DOCUMENTS:      'DOKUMENTY',

  map_legend:         'LEGENDA',
  map_offline_notice: 'dlaždice z cache · data z poslední synchronizace',
  pin_hospital:       'Nemocnice',
  pin_water:          'Výdej vody',
  pin_food:           'Jídlo',
  pin_charging:       'Nabíjení',
  pin_shelter:        'Úkryt',
  pin_mesh_node:      'Mesh uzel',
  pin_outage:         'Výpadek proudu',

  chat_title:         'KRIZOVÝ ASISTENT',
  chat_placeholder:   'položte otázku...',
  chat_welcome:       'Jsem krizový asistent Nexus. Ptejte se na první pomoc, postupy při výpadku proudu, evakuaci.',
  chat_loading:       'přemýšlím...',
  chat_role_user:     'VY',
  chat_role_ai:       'AI',
  chat_error_quota:   'Příliš mnoho požadavků — chvíli počkejte.',
  chat_error_generic: 'Něco se pokazilo. Zkuste to znovu.',

  msg_unverified:     (score: number) => `⚠  neověřeno  ·  skóre důvěry: ${score}%`,
};

const translations = { en, cs } as const;

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useI18n = create<I18nState>((set) => ({
  lang:    'en',
  setLang: (lang) => set({ lang }),
}));

export function useT() {
  const lang = useI18n(s => s.lang);
  return translations[lang];
}
