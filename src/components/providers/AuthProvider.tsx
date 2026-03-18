import { useEffect } from 'react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, clearUser, setLoading } = useAuthStore();

  useEffect(() => {
    const init = async () => {
      try {
        const user = await authApi.getCurrentUser();
        if (user) {
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
  }, [setUser, clearUser, setLoading]);

  return <>{children}</>;
}
