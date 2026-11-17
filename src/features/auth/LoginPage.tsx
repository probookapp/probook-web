"use client";

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, ShieldCheck, ArrowLeft } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLocale } from '@/lib/navigation';
import { Button, Input, PasswordToggle } from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { clearAllUserData } from '@/lib/session-cleanup';
import Link from 'next/link';
import type { UserInfo } from '@/types';
import { AuthCard, AuthShell } from "./AuthShell";

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { setUser } = useAuthStore();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAChallengeToken, setTwoFAChallengeToken] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  // Backup codes are 10 hex characters, not 6 digits: they get a plain keyboard.
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [is2FALoading, setIs2FALoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await authApi.login({ username, password });

      if ('requires_2fa' in result && result.requires_2fa) {
        setRequires2FA(true);
        setTwoFAChallengeToken(result.challenge_token);
      } else {
        await clearAllUserData(queryClient, (result as UserInfo).id);
        setUser(result as UserInfo);
      }
    } catch (err) {
      setError(typeof err === 'string' ? err : t('login.invalidCredentials'));
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIs2FALoading(true);

    try {
      const user = await authApi.totpVerify(twoFAChallengeToken, twoFACode);
      await clearAllUserData(queryClient, user.id);
      setUser(user);
    } catch (err) {
      setError(typeof err === 'string' ? err : t('login.invalidCredentials'));
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleBackToLogin = () => {
    setRequires2FA(false);
    setTwoFAChallengeToken('');
    setTwoFACode('');
    setUseBackupCode(false);
    setError('');
  };

  if (requires2FA) {
    return (
      <AuthShell>
          <AuthCard>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary-600" />
              <h1 className="text-xl font-semibold text-(--color-text-primary)">
                {t('twoFactorLogin.title')}
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {t('twoFactorLogin.description')}
            </p>

            <form onSubmit={handle2FASubmit} className="space-y-4">
              <Input
                label={t('twoFactorLogin.codeLabel')}
                value={twoFACode}
                onChange={(e) =>
                  setTwoFACode(useBackupCode ? e.target.value.trim() : e.target.value.replace(/\D/g, ''))
                }
                placeholder={useBackupCode ? undefined : t('twoFactorLogin.codePlaceholder')}
                inputMode={useBackupCode ? 'text' : 'numeric'}
                pattern={useBackupCode ? undefined : '[0-9]{6}'}
                maxLength={useBackupCode ? 10 : 6}
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                autoComplete="one-time-code"
                required
              />

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <Button type="submit" className="w-full" isLoading={is2FALoading}>
                <ShieldCheck className="h-4 w-4" />
                {t('twoFactorLogin.submit')}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setTwoFACode('');
              }}
              className="mt-4 block text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              {useBackupCode ? t('twoFactorLogin.useAppCode') : t('twoFactorLogin.useBackupCode')}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="mt-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('twoFactorLogin.backToLogin')}
            </button>
          </AuthCard>
        </AuthShell>
    );
  }

  return (
    <AuthShell subtitle={t('login.subtitle')}>
        <AuthCard>
          <h1 className="text-xl font-semibold text-(--color-text-primary) mb-6">
            {t('login.title')}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('login.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
            />

            <div className="relative">
              <Input
                label={t('login.password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pe-10"
                required
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex justify-end">
              <Link
                href={`/${locale}/forgot-password`}
                className="inline-flex min-h-10 items-center text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <LogIn className="h-4 w-4" />
              {t('login.submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('login.noAccount')}{' '}
            <Link
              href={`/${locale}/signup`}
              className="inline-block py-3 -my-3 text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t('login.signUp')}
            </Link>
          </p>
        </AuthCard>
      </AuthShell>
  );
}
