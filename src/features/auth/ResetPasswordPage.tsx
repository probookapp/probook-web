"use client";

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, ArrowLeft } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useLocale } from '@/lib/navigation';
import { Button, Input, PasswordToggle } from '@/components/ui';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthCard, AuthShell } from "./AuthShell";

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError(t('resetPassword.tokenRequired'));
      return;
    }

    if (password.length < 8) {
      setError(t('resetPassword.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }

    setIsLoading(true);

    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
    } catch {
      setError(t('resetPassword.invalidToken'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
          <AuthCard className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">
              {t('resetPassword.tokenRequired')}
            </p>
            <Link
              href={`/${locale}/forgot-password`}
              className="inline-block py-3 -my-3 text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t('forgotPassword.title')}
            </Link>
          </AuthCard>
        </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell>
          <AuthCard className="text-center">
            <p className="text-green-600 dark:text-green-400 mb-4">
              {t('resetPassword.success')}
            </p>
            <Link
              href={`/${locale}/login`}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium inline-flex min-h-10 items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('forgotPassword.backToLogin')}
            </Link>
          </AuthCard>
        </AuthShell>
    );
  }

  return (
    <AuthShell>

        <AuthCard>
          <h1 className="text-xl font-semibold text-(--color-text-primary) mb-2">
            {t('resetPassword.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
            {t('resetPassword.description')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label={t('resetPassword.passwordLabel')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="pe-10"
                minLength={8}
                autoFocus
                required
              />
              <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            </div>

            <div className="relative">
              <Input
                label={t('resetPassword.confirmPasswordLabel')}
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="pe-10"
                required
              />
              <PasswordToggle shown={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <KeyRound className="h-4 w-4" />
              {t('resetPassword.submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm">
            <Link
              href={`/${locale}/login`}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium inline-flex min-h-10 items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('forgotPassword.backToLogin')}
            </Link>
          </p>
        </AuthCard>
      </AuthShell>
  );
}
