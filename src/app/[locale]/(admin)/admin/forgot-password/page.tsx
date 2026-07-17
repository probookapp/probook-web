"use client";

import { useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Mail, ArrowLeft, Shield } from "lucide-react";
import { Button, Input } from "@/components/ui";

export default function AdminForgotPasswordPage() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("forgotPassword.failed"));
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("forgotPassword.failed"));
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
            {t("forgotPassword.heading")}
          </h2>

          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("forgotPassword.sent")}
              </p>
              <Button variant="secondary" className="w-full" onClick={() => router.push("/admin/login")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("forgotPassword.backToLogin")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("forgotPassword.prompt")}
              </p>
              <Input
                label={t("forgotPassword.email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                <Mail className="h-4 w-4 mr-2" />
                {t("forgotPassword.send")}
              </Button>
              <button
                type="button"
                onClick={() => router.push("/admin/login")}
                className="w-full text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {t("forgotPassword.backToLogin")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
