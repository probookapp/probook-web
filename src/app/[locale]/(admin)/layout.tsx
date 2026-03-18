"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "@/lib/navigation";
import { useAdminAuthStore } from "@/stores/useAdminAuthStore";
import { AdminLayout } from "@/components/admin-layout";

export default function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, setAdmin, setLoading, clearAdmin } =
    useAdminAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname.endsWith("/admin/login");

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/admin/auth/me");
        if (res.ok) {
          const data = await res.json();
          setAdmin(data);
        } else {
          clearAdmin();
        }
      } catch {
        clearAdmin();
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [setAdmin, clearAdmin, setLoading]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isLoginPage) {
      router.replace("/admin/login");
    }
  }, [isLoading, isAuthenticated, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
