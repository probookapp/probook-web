"use client";

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useLocale } from '@/lib/navigation';
import { Button, Input } from '@/components/ui';
import Link from 'next/link';

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authApi.forgotPassword(email);
    } catch {
      // Always show success to avoid leaking info
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
            <img src="/probook-icon.png" alt="Probook" className="h-8 w-9" />
            Probook
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          {submitted ? (
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('forgotPassword.successTitle')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                {t('forgotPassword.successDescription')}
              </p>
              <Link
                href={`/${locale}/login`}
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('forgotPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('forgotPassword.title')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
                {t('forgotPassword.description')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label={t('forgotPassword.emailLabel')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  autoComplete="email"
                  autoFocus
                  required
                />

                <Button type="submit" className="w-full" isLoading={isLoading}>
                  <Mail className="h-4 w-4 mr-2" />
                  {t('forgotPassword.submit')}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm">
                <Link
                  href={`/${locale}/login`}
                  className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium inline-flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t('forgotPassword.backToLogin')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
