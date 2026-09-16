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
  Warehouse,
  X,
  LogOut,
  Shield,
  Store,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { authApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/session-cleanup";
import type { PermissionKey } from "@/types";
import { Logo } from "@/components/shared/Logo";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";
import { translatedName } from "@/lib/translated-name";

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { t } = useTranslation("navigation");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { currentUser, hasPermission, clearUser } = useAuthStore();
  const { data: entitlements } = useEntitlements();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await authApi.logout();
    await clearAllUserData(queryClient);
    clearUser();
  };

  // Two different questions. `permission` is about this person — the cashier
  // has no business in the reports. `feature` is about the account — the offer
  // does not include multi-site stock. Failing the first hides the entry;
  // failing the second shows it unlit, because a customer cannot buy what
  // they never learn exists.
  const navigation: {
    name: string;
    href: string;
    icon: React.ElementType;
    permission?: PermissionKey;
    feature?: FeatureKey;
  }[] = [
    { name: t("dashboard"), href: "/dashboard", icon: LayoutDashboard, permission: "dashboard" },
    { name: t("clients"), href: "/clients", icon: Users, permission: "clients" },
    { name: t("products"), href: "/products", icon: Package, permission: "products" },
    { name: t("suppliers"), href: "/suppliers", icon: Factory, permission: "suppliers", feature: FEATURE_KEYS.PURCHASING },
    { name: t("locations"), href: "/locations", icon: Warehouse, permission: "products", feature: FEATURE_KEYS.MULTI_LOCATION },
    { name: t("quotes"), href: "/quotes", icon: FileText, permission: "quotes" },
    { name: t("invoices"), href: "/invoices", icon: Receipt, permission: "invoices" },
    { name: t("deliveryNotes"), href: "/delivery-notes", icon: Truck, permission: "delivery_notes", feature: FEATURE_KEYS.DELIVERY_NOTES },
    { name: t("phonebook"), href: "/phonebook", icon: BookUser, permission: "phonebook", feature: FEATURE_KEYS.PHONEBOOK },
    { name: t("reports"), href: "/reports", icon: BarChart3, permission: "reports" },
    { name: t("expenses"), href: "/expenses", icon: Wallet, permission: "expenses", feature: FEATURE_KEYS.EXPENSES },
    { name: t("purchases"), href: "/purchases", icon: ShoppingCart, permission: "purchases", feature: FEATURE_KEYS.PURCHASING },
    { name: t("settings"), href: "/settings", icon: Settings, permission: "settings" },
  ];

  const allowed = navigation.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  // Undefined while the request is in flight: an entry that drops out of the
  // list and comes back on every page load is worse than one that stays.
  const standing = (item: { feature?: FeatureKey }) =>
    item.feature ? entitlements?.[item.feature] ?? { included: true } : { included: true };

  const filteredNavigation = allowed.filter((item) => standing(item).included);

  /**
   * What the offer does not include, gathered at the foot of the rail under the
   * offer that would add it — rather than a padlock beside every entry. On the
   * entry offer that would have been six padlocks against seven live entries,
   * which reads as a crippled product instead of a smaller one.
   */
  const upsell = Object.values(
    allowed.reduce<Record<string, { name: string; sortOrder: number; items: typeof allowed }>>(
      (acc, item) => {
        const offer = standing(item).upgradeTo;
        if (standing(item).included || !offer) return acc;
        acc[offer.slug] ??= {
          // The offer's own name, in the reader's language. Plans are rows an
          // admin writes, not bundle keys, so they carry their translations.
          name: translatedName(offer.name, offer.nameTranslations, locale),
          sortOrder: offer.sortOrder,
          items: [],
        };
        acc[offer.slug].items.push(item);
        return acc;
      },
      {}
    )
  ).sort((a, b) => a.sortOrder - b.sortOrder);

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
      {/* Shorter above lg: in the drawer every row of the rail it spends on
          padding is a row of navigation pushed below the fold on a phone. */}
      <div className="px-4 py-3 lg:p-6 flex items-center justify-between">
        <div className="flex items-center justify-center gap-2.5 flex-1">
          <Logo className="h-7 w-7 text-white" title="Probook" />
          <h1 className="text-xl font-bold">Probook</h1>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("closeSidebar")}
            // 44px: the drawer only exists on touch-sized screens.
            className="p-3 -me-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 lg:hidden"
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

        {upsell.map((offer) => (
          <div key={offer.name} className="pt-4 mt-3 border-t border-gray-800">
            <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t("availableWith", { offer: offer.name })}
            </p>
            {offer.items.map((item) => (
              <Link
                key={item.href}
                href={`/${locale}/pricing`}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1 truncate">{item.name}</span>
                <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-800 space-y-3">
        {/* POS Mode Button */}
        {hasPermission("pos") && (entitlements?.[FEATURE_KEYS.POS]?.included ?? true) && (
          <button
            onClick={() => router.push("/pos")}
            // Outlined, not a green slab. Green is the "it worked" colour
            // everywhere else in the application; spending it on a navigation
            // button makes the rail argue with itself.
            className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium border border-white/25 text-white hover:bg-white/10 transition-colors"
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
              className="p-3 -me-2 lg:p-1.5 lg:me-0 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
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
