import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ToastContainer } from "@/components/ui";
import { OfflineIndicator } from "./OfflineIndicator";

interface LayoutProps {
  children: ReactNode;
  topBanner?: ReactNode;
}

export function Layout({ children, topBanner }: LayoutProps) {
  const { t } = useTranslation("common");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-gray-100 dark:bg-gray-900">
      {/* Toast notifications */}
      <ToastContainer />
      <OfflineIndicator />

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* The rail is a drawer below lg, pinned beside the page from lg up. The
          closed offset only exists below lg, so from lg up there is nothing to
          override. */}
      <div
        className={`
          fixed inset-y-0 start-0 z-50 w-56 lg:w-64 transform transition-transform duration-200 ease-in-out lg:relative
          ${isSidebarOpen ? "translate-x-0" : "max-lg:-translate-x-full"}
        `}
      >
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile header with hamburger. The safe-area padding is zero unless the
            page is laid out under a notch, where it keeps the button tappable. */}
        <div className="sticky top-0 z-30 flex items-center gap-2 bg-gray-100 dark:bg-gray-900 px-2 sm:px-4 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5 lg:hidden border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label={t("nav.openMenu")}
            aria-expanded={isSidebarOpen}
            className="p-2.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Probook</span>
        </div>
        {topBanner}
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
