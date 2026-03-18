import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { ToastContainer } from "@/components/ui";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useTranslation("admin");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Toast notifications */}
      <ToastContainer />

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, visible on lg+ */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-56 lg:w-64 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <AdminSidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile header with hamburger */}
        <div className="sticky top-0 z-30 flex items-center gap-4 bg-gray-100 dark:bg-gray-900 px-4 py-3 lg:hidden border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label={t("layout.openMenu")}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{t("login.title")}</span>
        </div>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
