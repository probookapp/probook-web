"use client";

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLocale } from '@/lib/navigation';
import { Button, Input } from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { clearAllUserData } from '@/lib/session-cleanup';
import Link from 'next/link';
import type { UserInfo } from '@/types';

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
        await clearAllUserData(queryClient);
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
      await clearAllUserData(queryClient);
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
    setError('');
  };

  if (requires2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/probook-icon.png" alt="Probook" className="h-8 w-9" />
              Probook
            </h1>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('twoFactorLogin.title')}
              </h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {t('twoFactorLogin.description')}
            </p>

            <form onSubmit={handle2FASubmit} className="space-y-4">
              <Input
                label={t('twoFactorLogin.codeLabel')}
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                placeholder={t('twoFactorLogin.codePlaceholder')}
                autoFocus
                autoComplete="one-time-code"
                required
              />

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <Button type="submit" className="w-full" isLoading={is2FALoading}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                {t('twoFactorLogin.submit')}
              </Button>
            </form>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="mt-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('twoFactorLogin.backToLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/probook-icon.png" alt="Probook" className="h-8 w-9" />
            Probook
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{t('login.subtitle')}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            {t('login.title')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('login.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
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
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex justify-end">
              <Link
                href={`/${locale}/forgot-password`}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <LogIn className="h-4 w-4 mr-2" />
              {t('login.submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('login.noAccount')}{' '}
            <Link
              href={`/${locale}/signup`}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t('login.signUp')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
