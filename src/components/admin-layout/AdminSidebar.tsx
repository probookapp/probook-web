import Link from "next/link";
import { useRouter, usePathname, useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/session-cleanup";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  ClipboardList,
  Package,
  Ticket,
  ToggleLeft,
  Megaphone,
  Receipt,
  ScrollText,
  Share2,
  Database,
  Activity,
  ShieldCheck,
  X,
  LogOut,
  Shield,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuthStore } from "@/stores/useAdminAuthStore";
import { useTheme } from "@/components/providers/ThemeContext";

interface AdminSidebarProps {
  onClose?: () => void;
}

type NavItem = { key: string; href: string; icon: React.ElementType; indent?: boolean };
type NavSection = { section?: string; items: NavItem[] };

const navigationSections: NavSection[] = [
  {
    items: [
      { key: "dashboard", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    section: "sidebar.sectionTenants",
    items: [
      { key: "tenants", href: "/admin/tenants", icon: Building2 },
      { key: "users", href: "/admin/users", icon: Users },
    ],
  },
  {
    section: "sidebar.sectionBilling",
    items: [
      { key: "subscriptions", href: "/admin/subscriptions", icon: CreditCard },
      { key: "requests", href: "/admin/subscriptions/requests", icon: ClipboardList, indent: true },
      { key: "plans", href: "/admin/plans", icon: Package },
      { key: "coupons", href: "/admin/coupons", icon: Ticket },
      { key: "invoices", href: "/admin/subscription-invoices", icon: Receipt },
    ],
  },
  {
    section: "sidebar.sectionPlatform",
    items: [
      { key: "platformAdmins", href: "/admin/platform-admins", icon: ShieldCheck },
      { key: "features", href: "/admin/features", icon: ToggleLeft },
      { key: "announcements", href: "/admin/announcements", icon: Megaphone },
      { key: "auditLogs", href: "/admin/audit-logs", icon: ScrollText },
      { key: "referrals", href: "/admin/referrals", icon: Share2 },
      { key: "dataRequests", href: "/admin/data-requests", icon: Database },
      { key: "systemHealth", href: "/admin/system", icon: Activity },
    ],
  },
];

export function AdminSidebar({ onClose }: AdminSidebarProps) {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const pathname = usePathname();
  const { currentAdmin, clearAdmin } = useAdminAuthStore();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    await clearAllUserData(queryClient);
    clearAdmin();
    router.push("/admin/login");
  };

  const initials = currentAdmin?.display_name
    ? currentAdmin.display_name
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
          <Shield className="h-7 w-7 text-primary-400" />
          <h1 className="text-xl font-bold">{t("login.title")}</h1>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("sidebar.closeSidebar")}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navigationSections.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? "pt-4" : ""}>
            {section.section && (
              <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {t(section.section)}
              </p>
            )}
            {section.items.map((item) => {
              const localizedHref = `/${locale}${item.href}`;
              const isActive =
                item.href === "/admin"
                  ? pathname === localizedHref
                  : pathname.startsWith(localizedHref);
              return (
                <Link
                  key={item.href}
                  href={`/${locale}${item.href}`}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    item.indent && "ml-4",
                    isActive
                      ? "bg-primary-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" />
                  {t(`sidebar.${item.key}`)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={locale}
            onChange={(e) => {
              const newLocale = e.target.value;
              if (newLocale !== locale) {
                const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
                window.location.href = newPath;
              }
            }}
            className="flex-1 bg-gray-800 text-gray-300 text-xs rounded-lg px-2.5 py-1.5 border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-primary-500 cursor-pointer"
            aria-label={t("sidebar.changeLanguage")}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label={t("sidebar.toggleTheme")}
            title={t("sidebar.toggleTheme")}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
        {currentAdmin && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {currentAdmin.display_name}
              </p>
              <div className="flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-yellow-400" />
                <p className="text-xs text-gray-400 capitalize">
                  {currentAdmin.role.replace("_", " ")}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label={t("sidebar.logout")}
              title={t("sidebar.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
