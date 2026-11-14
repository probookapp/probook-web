import { useState } from "react";
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
  CircleHelp,
  Eye,
  EyeOff,
  SlidersHorizontal,
} from "lucide-react";
import { usePreferences } from "@/hooks/useTableColumns";
import { useTourStore } from "@/stores/useTourStore";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { authApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/session-cleanup";
import type { PermissionKey } from "@/types";
import { Logo } from "@/components/shared/Logo";
import { useEntitlements } from "@/hooks/useEntitlements";
import { runGuarded } from "@/hooks/useUnsavedChangesGuard";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";
import { translatedName } from "@/lib/translated-name";

/** The key of the rail in the account's saved preferences — keep it stable. */
const SIDEBAR_PREFS_KEY = "sidebar";

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
  const startTour = useTourStore((s) => s.start);
  const { prefs, save } = usePreferences();
  const [customizing, setCustomizing] = useState(false);

  // Clearing the local data takes a moment on a phone, and the button stayed
  // live meanwhile: a second tap reached the server with the session already
  // gone, got a 401, and that rejection went to Sentry (PROBOOK-WEB-V).
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await authApi.logout();
    } catch {
      // Offline or session already gone: the local data must go regardless,
      // or the next person on this device lands in the account.
    }
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
    /** False for what the rail cannot do without: home, and the way back to settings. */
    hideable?: boolean;
  }[] = [
    { name: t("dashboard"), href: "/dashboard", icon: LayoutDashboard, permission: "dashboard", hideable: false },
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
    { name: t("settings"), href: "/settings", icon: Settings, permission: "settings", hideable: false },
  ];

  const allowed = navigation.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  // Undefined while the request is in flight: an entry that drops out of the
  // list and comes back on every page load is worse than one that stays.
  const standing = (item: { feature?: FeatureKey }) =>
    item.feature ? entitlements?.[item.feature] ?? { included: true } : { included: true };

  const includedNavigation = allowed.filter((item) => standing(item).included);

  /**
   * The modules this person chose not to see. Hiding is tidying, not locking:
   * the routes stay reachable by URL, by links inside documents, by the tour.
   * Saved to the account (the same store as the column picker, under the
   * "sidebar" key), so the choice follows them from the office to the phone.
   * Stored as the path without its slash — the key format the store accepts.
   */
  const hiddenKeys = new Set(prefs[SIDEBAR_PREFS_KEY]?.hidden ?? []);
  const navKey = (item: { href: string }) => item.href.slice(1);
  const isHidden = (item: { href: string; hideable?: boolean }) =>
    item.hideable !== false && hiddenKeys.has(navKey(item));
  const isActiveItem = (item: { href: string }) => pathname.startsWith(`/${locale}${item.href}`);
  // The page on screen keeps its entry while you are on it: a rail with no
  // lit row reads as "where am I", not as "I hid this".
  const filteredNavigation = includedNavigation.filter((item) => !isHidden(item) || isActiveItem(item));
  const hiddenCount = includedNavigation.filter(isHidden).length;

  const toggleHidden = (item: { href: string }) => {
    const next = new Set(hiddenKeys);
    if (next.has(navKey(item))) next.delete(navKey(item));
    else next.add(navKey(item));
    save({ table: SIDEBAR_PREFS_KEY, hidden: [...next] });
  };

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
        {customizing && (
          <div className="px-1 pb-2">
            <p className="text-xs text-gray-400">{t("customize.hint")}</p>
          </div>
        )}
        {customizing &&
          includedNavigation.map((item) => {
            const locked = item.hideable === false;
            const hidden = isHidden(item);
            return (
              <button
                key={item.href}
                type="button"
                disabled={locked}
                onClick={() => toggleHidden(item)}
                aria-pressed={locked ? undefined : !hidden}
                aria-label={
                  locked
                    ? `${item.name} — ${t("customize.alwaysShown")}`
                    : t(hidden ? "customize.show" : "customize.hide", { name: item.name })
                }
                title={locked ? t("customize.alwaysShown") : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-start",
                  locked
                    ? "text-gray-500 cursor-default"
                    : hidden
                      ? "text-gray-500 hover:bg-gray-800/60 hover:text-gray-300"
                      : "text-gray-200 hover:bg-gray-800 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={cn("flex-1 truncate", hidden && "line-through")}>{item.name}</span>
                {locked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                ) : hidden ? (
                  <EyeOff className="h-4 w-4 shrink-0" />
                ) : (
                  <Eye className="h-4 w-4 shrink-0" />
                )}
              </button>
            );
          })}
        {customizing && (
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCustomizing(false)}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {t("customize.done")}
            </button>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => save({ table: SIDEBAR_PREFS_KEY, hidden: [] })}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                {t("customize.showAll")}
              </button>
            )}
          </div>
        )}
        {!customizing && filteredNavigation.map((item) => {
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
              // What the guided tour lights up (components/tour/OfficeTour.tsx).
              data-tour={`nav-${item.href.slice(1)}`}
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

        {!customizing && (
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            data-testid="sidebar-customize"
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-800/60 hover:text-gray-300 transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-start">
              {hiddenCount > 0 ? t("customize.openWithHidden", { count: hiddenCount }) : t("customize.open")}
            </span>
          </button>
        )}

        {!customizing && upsell.map((offer) => (
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
            onClick={() => runGuarded(() => router.push("/pos"))}
            data-tour="nav-pos"
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
              onClick={() => {
                onClose?.();
                startTour("office");
              }}
              data-tour="tour-help"
              className="p-3 lg:p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label={t("guidedTour")}
              title={t("guidedTour")}
            >
              <CircleHelp className="h-4 w-4" />
            </button>
            <button
              onClick={() => runGuarded(() => void handleLogout())}
              disabled={loggingOut}
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
