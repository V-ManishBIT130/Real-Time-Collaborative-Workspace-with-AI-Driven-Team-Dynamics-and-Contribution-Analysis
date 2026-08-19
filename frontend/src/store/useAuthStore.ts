import { create } from 'zustand';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL !== undefined
  ? import.meta.env.VITE_BACKEND_URL
  : (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:3001`);

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;

  register: (name: string, email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  loadUser: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('collab-lens-token'),
  isAuthenticated: false,
  loading: true, // starts true — we'll verify token on mount
  error: null,

  register: async (name, email, password) => {
    try {
      set({ loading: true, error: null });
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        set({ loading: false, error: data.error || 'Registration failed' });
        return false;
      }

      localStorage.setItem('collab-lens-token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        loading: false,
        error: null
      });
      return true;
    } catch (err) {
      set({ loading: false, error: 'Network error. Is the server running?' });
      return false;
    }
  },

  login: async (email, password) => {
    try {
      set({ loading: true, error: null });
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        set({ loading: false, error: data.error || 'Login failed' });
        return false;
      }

      localStorage.setItem('collab-lens-token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        loading: false,
        error: null
      });
      return true;
    } catch (err) {
      set({ loading: false, error: 'Network error. Is the server running?' });
      return false;
    }
  },

  loadUser: async () => {
    const token = get().token;
    if (!token) {
      set({ loading: false, isAuthenticated: false });
      return;
    }

    try {
      set({ loading: true });
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        // Token is invalid/expired — clear it
        localStorage.removeItem('collab-lens-token');
        set({ user: null, token: null, isAuthenticated: false, loading: false });
        return;
      }

      set({
        user: data.user,
        isAuthenticated: true,
        loading: false
      });
    } catch (err) {
      // Server unreachable — keep token but mark as not authenticated yet
      set({ loading: false, isAuthenticated: false });
    }
  },

  logout: () => {
    localStorage.removeItem('collab-lens-token');
    set({ user: null, token: null, isAuthenticated: false, loading: false, error: null });
  },

  clearError: () => set({ error: null })
}));
