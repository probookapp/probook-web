"use client";

import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Gift, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLocale } from "@/lib/navigation";
import { Button, Input, PasswordToggle, Select } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/session-cleanup";
import { MetaPixel, trackMetaEvent } from "@/components/analytics/MetaPixel";
import { FISCAL_PROFILE_IDS, DEFAULT_FISCAL_PROFILE, type FiscalProfileId } from "@/lib/fiscal-profiles";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AuthCard, AuthShell } from "./AuthShell";

type Field = "companyName" | "displayName" | "email" | "username" | "password";

/** "ali.benali+shop@mail.dz" → "ali.benali": a username nobody had to invent. */
function usernameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split("+")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 30);
}

/** 0 too short, 1 weak, 2 fair, 3 strong. A hint, not a rule: the rule is 8 characters. */
function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < 8) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 12 && classes >= 3) return 3;
  if (classes >= 3 || (password.length >= 12 && classes >= 2)) return 2;
  return 1;
}

const STRENGTH_KEYS = ["tooShort", "weak", "fair", "strong"] as const;
const STRENGTH_BAR = ["bg-gray-300 dark:bg-gray-600", "bg-red-500", "bg-amber-500", "bg-green-600"];

export function SignupPage() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { setUser } = useAuthStore();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  // Until the person types their own, the username follows the email.
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState<FiscalProfileId>(DEFAULT_FISCAL_PROFILE);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const strength = passwordStrength(password);

  const clearFieldError = (field: Field) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const handleEmailChange = (value: string) => {
    setEmail(value);
    clearFieldError("email");
    if (!usernameEdited) {
      setUsername(usernameFromEmail(value));
      clearFieldError("username");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errors: Partial<Record<Field, string>> = {};
    if (password.length < 8) errors.password = t("signup.passwordTooShort");
    if (username.trim().length < 3) errors.username = t("signup.usernameTooShort");
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
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
          email,
          username,
          // A username the person never looked at may be taken: the server
          // then picks a free variant instead of refusing the sign-up.
          username_auto: !usernameEdited,
          display_name: displayName,
          password,
          fiscal_profile: country,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "EMAIL_TAKEN") {
          setFieldErrors({ email: t("signup.emailTaken") });
        } else if (res.status === 409) {
          setFieldErrors({ username: t("signup.usernameTaken") });
        } else {
          setError(data.error || t("signup.error"));
        }
        return;
      }

      // Report the signup conversion to Meta. Measured for every signup (incl.
      // visitors from the WhatsApp campaign) even though the campaign optimizes
      // for the Contact event, not this one.
      trackMetaEvent("CompleteRegistration");

      await clearAllUserData(queryClient, data.id);
      setUser(data);
    } catch {
      setError(t("signup.error"));
    } finally {
      setIsLoading(false);
    }
  };

  const legalLink = "font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 underline-offset-2 hover:underline";

  return (
    <AuthShell subtitle={t("signup.subtitle")}>
      <MetaPixel />
      <AuthCard>
        <h1 className="text-xl font-semibold text-(--color-text-primary)">{t("signup.title")}</h1>
        <p className="mt-3 mb-6 flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2.5 text-sm text-primary-800 dark:bg-primary-950 dark:text-primary-200">
          <Gift className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">{t("signup.trialBadge")}</strong> {t("signup.trialDetail")}
          </span>
        </p>

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
            label={t("signup.email")}
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            autoComplete="email"
            error={fieldErrors.email}
            required
          />

          <div>
            <Input
              label={t("signup.username")}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameEdited(true);
                clearFieldError("username");
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              error={fieldErrors.username}
              required
            />
            {!fieldErrors.username && (
              <p className="mt-1 text-xs text-(--color-text-tertiary)">{t("signup.usernameHint")}</p>
            )}
          </div>

          <div>
            <div className="relative">
              <Input
                label={t("signup.password")}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError("password");
                }}
                autoComplete="new-password"
                className="pe-10"
                aria-describedby="password-strength"
                required
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            </div>
            {fieldErrors.password ? (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fieldErrors.password}</p>
            ) : (
              <div id="password-strength" className="mt-2" aria-live="polite">
                <div className="flex gap-1" aria-hidden="true">
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        password && strength >= step ? STRENGTH_BAR[strength] : "bg-gray-200 dark:bg-gray-700"
                      )}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-(--color-text-tertiary)">
                  {password ? t(`signup.strength.${STRENGTH_KEYS[strength]}`) : t("signup.strength.hint")}
                </p>
              </div>
            )}
          </div>

          <Select
            label={t("signup.country")}
            value={country}
            onChange={(e) => setCountry(e.target.value as FiscalProfileId)}
            options={FISCAL_PROFILE_IDS.map((id) => ({ value: id, label: tc(`fiscalProfiles.${id}`) }))}
          />
          <p className="-mt-2 text-xs text-(--color-text-tertiary)">{t("signup.countryHint")}</p>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            <UserPlus className="h-4 w-4" />
            {t("signup.submit")}
          </Button>

          <p className="text-center text-xs text-(--color-text-tertiary)">
            <Trans
              t={t}
              i18nKey="signup.legal"
              components={{
                terms: <Link href={`/${locale}/terms`} target="_blank" className={legalLink} />,
                privacy: <Link href={`/${locale}/privacy`} target="_blank" className={legalLink} />,
              }}
            />
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-(--color-text-secondary)">
          {t("signup.haveAccount")}{" "}
          <Link
            href={`/${locale}/login`}
            className="inline-block py-3 -my-3 text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
          >
            {t("signup.signIn")}
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}
