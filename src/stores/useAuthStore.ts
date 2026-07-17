import { create } from 'zustand';
import type { UserInfo, PermissionKey, PermissionAction } from '@/types';

interface AuthState {
  currentUser: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: UserInfo) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
  // Action-aware permission check. `action` defaults to 'view' so existing
  // callers of hasPermission(key) keep meaning "module is visible".
  hasPermission: (key: PermissionKey, action?: PermissionAction) => boolean;
  // Explicit alias for readability at call sites that gate a CRUD action.
  hasActionPermission: (key: PermissionKey, action: PermissionAction) => boolean;
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

  hasPermission: (key, action = 'view') => {
    const { currentUser } = get();
    if (!currentUser) return false;
    // Admins always have implicit full access to every module and action.
    if (currentUser.role === 'admin') return true;

    // Prefer the granular CRUD flags when available.
    const detail = currentUser.permission_details?.find((p) => p.key === key);
    if (detail) {
      switch (action) {
        case 'view':
          return detail.can_view;
        case 'create':
          return detail.can_create;
        case 'edit':
          return detail.can_edit;
        case 'delete':
          return detail.can_delete;
      }
    }

    // Back-compat fallback: only the legacy view list is known.
    if (action === 'view') return currentUser.permissions.includes(key);
    return false;
  },

  hasActionPermission: (key, action) => get().hasPermission(key, action),
}));
