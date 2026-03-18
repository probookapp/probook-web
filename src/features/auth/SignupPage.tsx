"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLocale } from "@/lib/navigation";
import { Button, Input } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/session-cleanup";
import Link from "next/link";

export function SignupPage() {
  const { t } = useTranslation("auth");
  const { setUser } = useAuthStore();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("signup.passwordTooShort"));
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_name: companyName,
          username,
          display_name: displayName,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("signup.error"));
        return;
      }

      await clearAllUserData(queryClient);
      setUser(data);
    } catch {
      setError(t("signup.error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
            <img src="/probook-icon.png" alt="Probook" className="h-9 w-9" />
            Probook
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            {t("signup.subtitle")}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            {t("signup.title")}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t("signup.companyName")}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoComplete="organization"
              autoFocus
              required
            />

            <Input
              label={t("signup.displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              required
            />

            <Input
              label={t("signup.username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />

            <div className="relative">
              <Input
                label={t("signup.password")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            <Input
              label={t("signup.confirmPassword")}
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t("signup.submit")}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("signup.haveAccount")}{" "}
            <Link
              href={`/${locale}/login`}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t("signup.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
