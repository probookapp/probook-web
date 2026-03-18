"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { useLocale } from "@/lib/navigation";
import { Button } from "@/components/ui";
import Link from "next/link";

export function VerifyEmailPage() {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    token ? "verifying" : "idle"
  );
  const [resendStatus, setResendStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const verifyToken = useCallback(async () => {
    if (!token) return;
    setStatus("verifying");
    try {
      await authApi.verifyEmail(token);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      verifyToken();
    }
  }, [token, verifyToken]);

  const handleResend = async () => {
    setResendStatus("loading");
    try {
      await authApi.resendVerification();
      setResendStatus("success");
    } catch {
      setResendStatus("error");
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
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 text-center">
            {t("verifyEmail.title")}
          </h2>

          <div className="flex flex-col items-center space-y-4">
            {status === "verifying" && (
              <>
                <Loader2 className="h-12 w-12 text-primary-600 animate-spin" />
                <p className="text-gray-600 dark:text-gray-300">
                  {t("verifyEmail.verifying")}
                </p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="text-green-600 dark:text-green-400 font-medium">
                  {t("verifyEmail.success")}
                </p>
                <Link href={`/${locale}/dashboard`}>
                  <Button className="mt-4">
                    {t("verifyEmail.goToDashboard")}
                  </Button>
                </Link>
              </>
            )}

            {status === "error" && (
              <>
                <XCircle className="h-12 w-12 text-red-500" />
                <p className="text-red-600 dark:text-red-400 font-medium">
                  {t("verifyEmail.invalidToken")}
                </p>
              </>
            )}

            {status === "idle" && (
              <>
                <Mail className="h-12 w-12 text-primary-600 dark:text-primary-400" />
                <p className="text-gray-600 dark:text-gray-300 text-center">
                  {t("verifyEmail.description")}
                </p>
              </>
            )}

            {(status === "idle" || status === "error") && (
              <div className="w-full mt-4 space-y-3">
                <Button
                  onClick={handleResend}
                  className="w-full"
                  variant="secondary"
                  isLoading={resendStatus === "loading"}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {t("verifyEmail.resend")}
                </Button>

                {resendStatus === "success" && (
                  <p className="text-sm text-green-600 dark:text-green-400 text-center">
                    {t("verifyEmail.resendSuccess")}
                  </p>
                )}

                {resendStatus === "error" && (
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">
                    {t("verifyEmail.resendError")}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            <Link
              href={`/${locale}/login`}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t("verifyEmail.goToLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
