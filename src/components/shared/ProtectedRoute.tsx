"use client";

import { useEffect } from 'react';
import { useRouter } from '@/lib/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import type { PermissionKey } from '@/types';

const routePermissions: { path: string; permission: PermissionKey }[] = [
  { path: '/dashboard', permission: 'dashboard' },
  { path: '/clients', permission: 'clients' },
  { path: '/products', permission: 'products' },
  { path: '/suppliers', permission: 'suppliers' },
  { path: '/quotes', permission: 'quotes' },
  { path: '/invoices', permission: 'invoices' },
  { path: '/delivery-notes', permission: 'delivery_notes' },
  { path: '/phonebook', permission: 'phonebook' },
  { path: '/reports', permission: 'reports' },
  { path: '/expenses', permission: 'expenses' },
  { path: '/settings', permission: 'settings' },
];

interface ProtectedRouteProps {
  permission: PermissionKey;
  children: React.ReactNode;
}

export function ProtectedRoute({ permission, children }: ProtectedRouteProps) {
  const { hasPermission } = useAuthStore();
  const router = useRouter();

  const permitted = hasPermission(permission);
  const firstPermitted = !permitted ? routePermissions.find((r) => hasPermission(r.permission)) : null;

  useEffect(() => {
    if (!permitted && firstPermitted) {
      router.replace(firstPermitted.path);
    }
  }, [permitted, firstPermitted, router]);

  if (!permitted) return null;
  return <>{children}</>;
}
