import { create } from 'zustand';
import { Profile } from '../types';
import { MOCK_PROFILE } from '../lib/mock/mockData';

// ─────────────────────────────────────────────────────────────
//  AUTH STORE
//
//  Aktualnie działa na MOCK — wszystkie funkcje oznaczone
//  // [P2] zastąp prawdziwymi wywołaniami Supabase.
// ─────────────────────────────────────────────────────────────

interface AuthState {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  isLoggedIn: boolean;
  isLoading: boolean;

  // [P2] supabase.auth.signInWithPassword({ email, password })
  //      + supabase.from('profiles').select('*').eq('id', user.id).single()
  login: (email: string, password: string) => Promise<void>;

  // [P2] supabase.auth.signUp({ email, password })
  //      + supabase.from('profiles').insert({ id, username, tier: 4 })
  register: (email: string, password: string, username: string) => Promise<void>;

  // [P2] supabase.auth.signOut()
  logout: () => Promise<void>;

  // [P2] supabase.auth.getSession() — wywołaj przy starcie aplikacji w _layout.tsx
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  profile:   null,
  isLoggedIn: false,
  isLoading:  false,

  login: async (_email, _password) => {
    set({ isLoading: true });
    // [P2] ZASTĄP: const { data, error } = await supabase.auth.signInWithPassword(...)
    await new Promise(r => setTimeout(r, 400));
    set({
      user:      { id: MOCK_PROFILE.id, email: _email },
      profile:   MOCK_PROFILE,
      isLoggedIn: true,
      isLoading:  false,
    });
  },

  register: async (_email, _password, _username) => {
    set({ isLoading: true });
    // [P2] ZASTĄP: supabase.auth.signUp + profiles insert
    await new Promise(r => setTimeout(r, 400));
    set({
      user:      { id: MOCK_PROFILE.id, email: _email },
      profile:   { ...MOCK_PROFILE, username: _username },
      isLoggedIn: true,
      isLoading:  false,
    });
  },

  logout: async () => {
    // [P2] ZASTĄP: await supabase.auth.signOut()
    set({ user: null, profile: null, isLoggedIn: false });
  },

  restoreSession: async () => {
    set({ isLoading: true });
    // [P2] ZASTĄP:
    //   const { data: { session } } = await supabase.auth.getSession()
    //   if (session) { fetch profile, set state }
    await new Promise(r => setTimeout(r, 200));
    set({
      user:      { id: MOCK_PROFILE.id, email: 'demo@nexus.app' },
      profile:   MOCK_PROFILE,
      isLoggedIn: true,
      isLoading:  false,
    });
  },
}));
