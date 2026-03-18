import { useTranslation } from "react-i18next";
import {
  LogOut,
  History,
  DollarSign,
  Briefcase,
  ChevronDown,
  Trash2,
  Sun,
  Moon,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { usePosStore } from "../stores/usePosStore";
import { useTheme } from "@/components/providers/ThemeContext";

interface SessionControlsProps {
  onCloseSession: () => void;
  onTransactionHistory: () => void;
  onCashMovement: () => void;
}

export function SessionControls({
  onCloseSession,
  onTransactionHistory,
  onCashMovement,
}: SessionControlsProps) {
  const { t } = useTranslation("pos");
  const router = useRouter();
  const { clearCart, items } = usePosStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="px-3 py-1.5 text-sm font-medium bg-white/15 hover:bg-white/25 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("clearCart")}
          </button>
        )}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="px-3 py-1.5 text-sm font-medium bg-white/15 hover:bg-white/25 rounded-lg flex items-center gap-1.5 transition-colors"
        >
          {t("menu")}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showMenu ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-full mt-2 bg-(--color-bg-primary) text-(--color-text-primary) rounded-xl shadow-lg border border-(--color-border-primary) z-20 min-w-52 py-1 overflow-hidden">
            <button
              onClick={() => {
                setShowMenu(false);
                onTransactionHistory();
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-(--color-bg-secondary) text-left text-sm transition-colors"
            >
              <History className="h-4 w-4 text-(--color-text-secondary)" />
              {t("transactionHistory")}
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onCashMovement();
              }}
             
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-(--color-bg-secondary) text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DollarSign className="h-4 w-4 text-(--color-text-secondary)" />
              {t("cashMovement")}
            </button>
            <button
              onClick={toggleTheme}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-(--color-bg-secondary) text-left text-sm transition-colors"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4 text-(--color-text-secondary)" />
              ) : (
                <Moon className="h-4 w-4 text-(--color-text-secondary)" />
              )}
              {resolvedTheme === "dark" ? t("lightMode") : t("darkMode")}
            </button>
            <div className="my-1 border-t border-(--color-border-primary)" />
            <button
              onClick={() => {
                setShowMenu(false);
                router.push("/dashboard");
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-(--color-bg-secondary) text-left text-sm transition-colors"
            >
              <Briefcase className="h-4 w-4 text-(--color-text-secondary)" />
              {t("backToOffice")}
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onCloseSession();
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-(--color-bg-secondary) text-left text-sm text-red-600 dark:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t("closeSession")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
