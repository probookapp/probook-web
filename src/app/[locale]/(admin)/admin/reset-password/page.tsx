"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { KeyRound, Shield } from "lucide-react";
import { Button, Input } from "@/components/ui";

export default function AdminResetPasswordPage() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("resetPassword.mismatch"));
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("resetPassword.failed"));
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("resetPassword.failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
            <Shield className="h-8 w-8 text-primary-600" />
            {t("login.title")}
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            {t("resetPassword.heading")}
          </h2>

          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-green-600 dark:text-green-400">{t("resetPassword.success")}</p>
              <Button className="w-full" onClick={() => router.push("/admin/login")}>
                {t("resetPassword.goToLogin")}
              </Button>
            </div>
          ) : !token ? (
            <p className="text-sm text-red-600 dark:text-red-400">{t("resetPassword.noToken")}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t("resetPassword.newPassword")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                autoFocus
                required
              />
              <Input
                label={t("resetPassword.confirmPassword")}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                <KeyRound className="h-4 w-4 mr-2" />
                {t("resetPassword.submit")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
