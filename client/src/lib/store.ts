import { create } from 'zustand';

export type Role = 'owner' | 'accountant' | 'godown_manager' | 'gatekeeper' | 'collection_staff' | 'driver';

interface User {
  id: number;
  username: string;
  role: Role;
  display_name: string;
  linked_driver_id?: number | null;
}

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  permissions: string[];
  setAuth: (token: string, user: User, permissions?: string[]) => void;
  logout: () => void;
  isOwner: () => boolean;
  hasRole: (...roles: Role[]) => boolean;
  hasPermission: (perm: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: !!localStorage.getItem('ni_token'),
  token: localStorage.getItem('ni_token'),
  user: (() => {
    try { return JSON.parse(localStorage.getItem('ni_user') || 'null'); } catch { return null; }
  })(),
  permissions: (() => {
    try { return JSON.parse(localStorage.getItem('ni_perms') || '[]'); } catch { return []; }
  })(),
  setAuth: (token, user, permissions = []) => {
    localStorage.setItem('ni_token', token);
    localStorage.setItem('ni_user', JSON.stringify(user));
    localStorage.setItem('ni_perms', JSON.stringify(permissions));
    set({ isAuthenticated: true, token, user, permissions });
  },
  logout: () => {
    localStorage.removeItem('ni_token');
    localStorage.removeItem('ni_user');
    localStorage.removeItem('ni_perms');
    set({ isAuthenticated: false, token: null, user: null, permissions: [] });
  },
  isOwner: () => get().user?.role === 'owner',
  hasRole: (...roles) => {
    const user = get().user;
    if (!user) return false;
    return user.role === 'owner' || roles.includes(user.role);
  },
  hasPermission: (perm) => {
    const state = get();
    if (state.user?.role === 'owner') return true;
    return state.permissions.includes(perm);
  },
  refreshPermissions: async () => {
    const { token, user } = get();
    if (!token || !user) return;
    try {
      const res = await fetch(`${(import.meta.env.VITE_API_URL || '/api')}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const perms: string[] = data.permissions ?? [];
      localStorage.setItem('ni_perms', JSON.stringify(perms));
      set({ permissions: perms });
    } catch { /* stale permissions are better than crashing */ }
  },
}));

interface ToastState {
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));

interface MobileNavState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useMobileNavStore = create<MobileNavState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

type Theme = 'light' | 'dark';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = readStoredTheme();
  applyTheme(initial);
  return {
    theme: initial,
    setTheme: (theme) => {
      localStorage.setItem('theme', theme);
      applyTheme(theme);
      set({ theme });
    },
    toggle: () => set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
      return { theme: next };
    }),
  };
});
