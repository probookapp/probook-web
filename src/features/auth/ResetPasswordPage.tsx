"use client";

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, ArrowLeft } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useLocale } from '@/lib/navigation';
import { Button, Input, PasswordToggle } from '@/components/ui';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from "@/components/shared/Logo";

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
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">
              {t('resetPassword.tokenRequired')}
            </p>
            <Link
              href={`/${locale}/forgot-password`}
              className="inline-block py-3 -my-3 text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
            >
              {t('forgotPassword.title')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 text-center">
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
            <Logo className="h-9 w-9" title="Probook" />
            Probook
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {t('resetPassword.title')}
          </h2>
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
        </div>
      </div>
    </div>
  );
}
