import { create } from 'zustand';

interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: string;
}

interface AdminAuthState {
  currentAdmin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAdmin: (admin: AdminUser) => void;
  clearAdmin: () => void;
  setLoading: (loading: boolean) => void;
  isSuperAdmin: () => boolean;
}

export const useAdminAuthStore = create<AdminAuthState>()((set, get) => ({
  currentAdmin: null,
  isAuthenticated: false,
  isLoading: true,

  setAdmin: (admin) => {
    set({ currentAdmin: admin, isAuthenticated: true });
  },

  clearAdmin: () => {
    set({ currentAdmin: null, isAuthenticated: false });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  isSuperAdmin: () => {
    const { currentAdmin } = get();
    if (!currentAdmin) return false;
    return currentAdmin.role === 'super_admin';
  },
}));
