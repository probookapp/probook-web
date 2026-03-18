import { create } from 'zustand';
import type { UserInfo, PermissionKey } from '@/types';

interface AuthState {
  currentUser: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: UserInfo) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
  hasPermission: (key: PermissionKey) => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => {
    set({ currentUser: user, isAuthenticated: true });
  },

  clearUser: () => {
    set({ currentUser: null, isAuthenticated: false });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  hasPermission: (key) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.permissions.includes(key);
  },
}));
