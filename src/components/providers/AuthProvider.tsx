import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { getCacheScope } from '@/lib/query-persister';
import { clearAllUserData } from '@/lib/session-cleanup';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, clearUser, setLoading } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const init = async () => {
      try {
        const user = await authApi.getCurrentUser();
        if (user) {
          // Safety net: if the persisted caches are scoped to another user
          // (missed cleanup, or pre-namespacing data), purge and re-scope
          // before serving anything from them.
          if (getCacheScope() !== user.id) {
            await clearAllUserData(queryClient, user.id);
          }
          setUser(user);
        } else {
          clearUser();
        }
      } catch {
        clearUser();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [setUser, clearUser, setLoading, queryClient]);

  return <>{children}</>;
}
