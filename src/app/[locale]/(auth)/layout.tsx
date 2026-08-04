"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { useRouter, usePathname, useLocale } from "@/lib/navigation";
import { useEffect } from "react";

// Pages in this group that a signed-in user must still be able to open. A
// verification link is normally clicked in the same browser the account was
// created in; bouncing to the dashboard there means the page never mounts, the
// token is never submitted, and the link silently does nothing.
const ALLOWED_WHILE_AUTHENTICATED = ["/verify-email"];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  // usePathname keeps the [locale] prefix (/en/verify-email).
  const pathWithoutLocale = pathname.replace(`/${locale}`, "") || "/";
  const bounce =
    isAuthenticated && !ALLOWED_WHILE_AUTHENTICATED.includes(pathWithoutLocale);

  useEffect(() => {
    if (!isLoading && bounce) {
      router.replace("/dashboard");
    }
  }, [isLoading, bounce, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (bounce) {
    return null;
  }

  return <>{children}</>;
}
