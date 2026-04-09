import Link from "next/link";
import { useRouter, usePathname, useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Receipt,
  Truck,
  BookUser,
  BarChart3,
  Settings,
  Wallet,
  ShoppingCart,
  Factory,
  X,
  LogOut,
  Shield,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { authApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/session-cleanup";
import type { PermissionKey } from "@/types";

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { t } = useTranslation("navigation");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { currentUser, hasPermission, clearUser } = useAuthStore();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await authApi.logout();
    await clearAllUserData(queryClient);
    clearUser();
  };

  const navigation: { name: string; href: string; icon: React.ElementType; permission?: PermissionKey }[] = [
    { name: t("dashboard"), href: "/dashboard", icon: LayoutDashboard, permission: "dashboard" },
    { name: t("clients"), href: "/clients", icon: Users, permission: "clients" },
    { name: t("products"), href: "/products", icon: Package, permission: "products" },
    { name: t("suppliers"), href: "/suppliers", icon: Factory, permission: "suppliers" },
    { name: t("quotes"), href: "/quotes", icon: FileText, permission: "quotes" },
    { name: t("invoices"), href: "/invoices", icon: Receipt, permission: "invoices" },
    { name: t("deliveryNotes"), href: "/delivery-notes", icon: Truck, permission: "delivery_notes" },
    { name: t("phonebook"), href: "/phonebook", icon: BookUser, permission: "phonebook" },
    { name: t("reports"), href: "/reports", icon: BarChart3, permission: "reports" },
    { name: t("expenses"), href: "/expenses", icon: Wallet, permission: "expenses" },
    { name: t("purchases"), href: "/purchases", icon: ShoppingCart, permission: "purchases" },
    { name: t("settings"), href: "/settings", icon: Settings, permission: "settings" },
  ];

  const filteredNavigation = navigation.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  const initials = currentUser?.display_name
    ? currentUser.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <aside className="w-56 lg:w-64 h-full bg-gray-900 dark:bg-gray-950 text-white flex flex-col">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center justify-center gap-2.5 flex-1">
          <img src="/probook-icon.png" alt="Probook" className="h-7 w-7" />
          <h1 className="text-xl font-bold">Probook</h1>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("closeSidebar")}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {filteredNavigation.map((item) => {
          const localizedHref = `/${locale}${item.href}`;
          const isActive =
            item.href === "/"
              ? pathname === `/${locale}`
              : pathname.startsWith(localizedHref);
          return (
            <Link
              key={item.href}
              href={localizedHref}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800 space-y-3">
        {/* POS Mode Button */}
        {hasPermission("pos") && (
          <button
            onClick={() => router.push("/pos")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
          >
            <Store className="h-5 w-5" />
            {t("posMode")}
          </button>
        )}
        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {currentUser.display_name}
              </p>
              <div className="flex items-center gap-1.5">
                {currentUser.role === "admin" && (
                  <Shield className="h-3 w-3 text-yellow-400" />
                )}
                <p className="text-xs text-gray-400">
                  {currentUser.role === "admin" ? t("admin") : t("employee")}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label={t("logout")}
              title={t("logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <p className="text-xs text-gray-500">{t("footer.poweredBy")}</p>
      </div>
    </aside>
  );
}
