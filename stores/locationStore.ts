import { create } from 'zustand';

interface Coords { lat: number; lon: number }

interface LocationState {
  lastKnown: Coords | null;
  savedAt:   number | null;
  save: (lat: number, lon: number) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  lastKnown: null,
  savedAt:   null,
  save: (lat, lon) => set({ lastKnown: { lat, lon }, savedAt: Date.now() }),
}));
