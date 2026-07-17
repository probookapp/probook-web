"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { LogIn, Eye, EyeOff, Shield } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useAdminAuthStore } from "@/stores/useAdminAuthStore";

export default function AdminLoginPage() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const { isAuthenticated, setAdmin, setLoading } = useAdminAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 2FA challenge step
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    // Check existing session
    const checkSession = async () => {
      try {
        const res = await fetch("/api/admin/auth/me");
        if (res.ok) {
          const data = await res.json();
          setAdmin(data);
        }
      } catch {
        // not authenticated
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [setAdmin, setLoading]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/admin");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("login.invalidCredentials"));
      }

      const data = await res.json();
      if (data?.requires_2fa && data?.challenge_token) {
        setChallengeToken(data.challenge_token);
        setTotpCode("");
        return;
      }

      setAdmin(data);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.loginFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_token: challengeToken, code: totpCode }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("login.twoFactor.invalidCode"));
      }

      const admin = await res.json();
      setAdmin(admin);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.loginFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel2fa = () => {
    setChallengeToken(null);
    setTotpCode("");
    setError("");
  };

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
            <Shield className="h-8 w-8 text-primary-600" />
            {t("login.title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            {t("login.subtitle")}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            {challengeToken ? t("login.twoFactor.heading") : t("login.heading")}
          </h2>

          {challengeToken ? (
            <form onSubmit={handleVerify2fa} className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("login.twoFactor.prompt")}
              </p>
              <Input
                label={t("login.twoFactor.code")}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                autoFocus
                required
              />

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                isLoading={isSubmitting}
                disabled={totpCode.length < 6}
              >
                <Shield className="h-4 w-4 mr-2" />
                {t("login.twoFactor.verify")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleCancel2fa}
              >
                {t("login.twoFactor.back")}
              </Button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t("login.username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />

            <div className="relative">
              <Input
                label={t("login.password")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              <LogIn className="h-4 w-4 mr-2" />
              {t("login.signIn")}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => router.push("/admin/forgot-password")}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {t("login.forgotPassword")}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
