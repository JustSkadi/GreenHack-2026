import { create } from 'zustand';

export type AppMode = 'idoklady' | 'nexus';

interface AppModeState {
  mode: AppMode | null;
  idokladyLoggedIn: boolean;
  nexusLoggedIn: boolean;
  loginIdoklady: () => void;
  loginNexus: () => void;
  switchTo: (mode: AppMode) => void;
  goHome: () => void;
}

export const useAppModeStore = create<AppModeState>((set) => ({
  mode: 'idoklady',
  idokladyLoggedIn: true,
  nexusLoggedIn: false,
  loginIdoklady: () => set({ idokladyLoggedIn: true, mode: 'idoklady' }),
  loginNexus:    () => set({ nexusLoggedIn: true,    mode: 'nexus'    }),
  switchTo:      (mode) => set({ mode }),
  goHome:        () => set({ mode: null }),
}));
