"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { isApiError } from "@/lib/api-adapter";
import { useLocale } from "@/lib/navigation";
import { Button } from "@/components/ui";
import Link from "next/link";

/**
 * Machine-readable reason from the API, so the UI never guesses. Handles both
 * an ApiError (JSON body string) and the plain object thrown by the raw fetch
 * used for the logged-out resend.
 */
function errorDetail(err: unknown): { code?: string; retryAfter?: number } {
  if (isApiError(err)) {
    try {
      const parsed = JSON.parse(err.body) as { code?: string; retry_after?: number };
      return { code: parsed.code, retryAfter: parsed.retry_after };
    } catch {
      return {};
    }
  }
  const plain = err as { code?: string; retryAfter?: number };
  return { code: plain?.code, retryAfter: plain?.retryAfter };
}

export function VerifyEmailPage() {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    token ? "verifying" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resendStatus, setResendStatus] = useState<
    "idle" | "loading" | "success" | "throttled" | "error"
  >("idle");
  const [resendMessage, setResendMessage] = useState<string>("");
  // One submission per token: a link can be opened twice (in-app webview then
  // the real browser, a remount), and the second POST used to overwrite the
  // first one's success with "already used".
  const submittedToken = useRef<string | null>(null);

  const verifyToken = useCallback(async () => {
    if (!token) return;
    setStatus("verifying");
    try {
      await authApi.verifyEmail(token);
      setStatus("success");
    } catch (err) {
      const { code } = errorDetail(err);
      setErrorMessage(
        code === "TOKEN_EXPIRED"
          ? t("verifyEmail.expiredToken")
          : code === "EMAIL_TAKEN"
            ? t("verifyEmail.emailTaken")
            : t("verifyEmail.invalidToken")
      );
      setStatus("error");
    }
  }, [token, t]);

  useEffect(() => {
    if (token && submittedToken.current !== token) {
      submittedToken.current = token;
      // Intentional: kick off email verification on mount.
      verifyToken();
    }
  }, [token, verifyToken]);

  const handleResend = async () => {
    setResendStatus("loading");
    setResendMessage("");
    try {
      if (token) {
        // Token-based resend works without a session — verification links are
        // usually opened logged out, where the authenticated route would 401.
        const res = await fetch("/api/auth/verify-email/resend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            code?: string;
            retry_after?: number;
          };
          throw Object.assign(new Error("resend failed"), {
            code: body.code,
            retryAfter: body.retry_after,
          });
        }
      } else {
        await authApi.resendVerification();
      }
      setResendStatus("success");
      setResendMessage(t("verifyEmail.resendSuccess"));
    } catch (err) {
      const { code, retryAfter } = errorDetail(err);
      if (code === "THROTTLED" && retryAfter) {
        // Not a failure: a link is already in their inbox. Saying "couldn't
        // send" here sends people hunting for a fault that doesn't exist.
        setResendMessage(t("verifyEmail.resendThrottled", { seconds: retryAfter }));
        setResendStatus("throttled");
        return;
      }
      setResendMessage(
        code === "NO_EMAIL" ? t("verifyEmail.noEmail") : t("verifyEmail.resendError")
      );
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
                <p className="text-red-600 dark:text-red-400 font-medium text-center">
                  {errorMessage || t("verifyEmail.invalidToken")}
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
                    {resendMessage || t("verifyEmail.resendSuccess")}
                  </p>
                )}

                {resendStatus === "throttled" && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                    {resendMessage}
                  </p>
                )}

                {resendStatus === "error" && (
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">
                    {resendMessage || t("verifyEmail.resendError")}
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
