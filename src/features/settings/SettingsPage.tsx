import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useRouter, useLocale, usePathname } from "@/lib/navigation";
import { Save, Image, Trash2, Sun, Moon, Monitor, Globe, Upload, Users } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { UserManagement } from "./components/UserManagement";
import { BackupSection } from "./components/BackupSection";
import { SecuritySection } from "./components/SecuritySection";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  Input,
  Textarea,
  Select,
} from "@/components/ui";
import {
  useCompanySettings,
  useUpdateCompanySettings,
  useUpdateAppSettings,
  useUploadLogo,
  useLogoBase64,
  useDeleteLogo,
} from "./hooks/useSettings";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTheme, type AppTheme } from "@/components/providers/ThemeContext";
import { useEffect, useRef, useState } from "react";
import { useDemoMode } from "@/components/providers/DemoModeProvider";

const createSettingsSchema = (t: (key: string) => string) => z.object({
  company_name: z.string().min(1, t("validation.companyNameRequired")),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email(t("validation.emailInvalid")).nullable().optional(),
  website: z.string().nullable().optional(),
  siret: z.string().nullable().optional(),
  vat_number: z.string().nullable().optional(),
  default_tax_rate: z.coerce.number().min(0).max(100),
  default_payment_terms: z.coerce.number().min(0),
  invoice_prefix: z.string().min(1, t("validation.invoicePrefixRequired")),
  quote_prefix: z.string().min(1, t("validation.quotePrefixRequired")),
  delivery_note_prefix: z.string().min(1, t("validation.deliveryNotePrefixRequired")).nullable().optional(),
  legal_mentions: z.string().nullable().optional(),
  bank_details: z.string().nullable().optional(),
  currency: z.string().optional().nullable(),
});

type SettingsFormData = z.output<ReturnType<typeof createSettingsSchema>>;

const taxRateOptions = [
  { value: "0", label: "0%" },
  { value: "5.5", label: "5.5%" },
  { value: "10", label: "10%" },
  { value: "20", label: "20%" },
];

const currencyOptions = [
  { value: "EUR", label: "EUR - Euro (\u20AC)" },
  { value: "USD", label: "USD - US Dollar ($)" },
  { value: "GBP", label: "GBP - British Pound (\u00A3)" },
  { value: "DZD", label: "DZD - Dinar alg\u00E9rien (\u062F.\u062C)" },
  { value: "MAD", label: "MAD - Dirham marocain (\u062F.\u0645.)" },
  { value: "TND", label: "TND - Dinar tunisien (\u062F.\u062A)" },
  { value: "CAD", label: "CAD - Dollar canadien (CA$)" },
  { value: "CHF", label: "CHF - Franc suisse (CHF)" },
];

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const settingsSchema = createSettingsSchema(t);
  const { data: settings, isLoading } = useCompanySettings();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: logoBase64 } = useLogoBase64();
  const updateSettings = useUpdateCompanySettings();
  const uploadLogo = useUploadLogo();
  const deleteLogo = useDeleteLogo();
  const updateAppSettings = useUpdateAppSettings();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme and language settings
  const { language, setCurrency } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();

  const handleLanguageChange = async (newLang: string) => {
    if (!isDemoMode) {
      await updateAppSettings.mutateAsync({ appLanguage: newLang, appTheme: theme });
    }
    // Navigate to the same page under the new locale
    const resolvedLang = newLang === 'system'
      ? (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en')
      : newLang;
    const validLang = ['fr', 'en', 'ar'].includes(resolvedLang) ? resolvedLang : 'en';
    const newPath = pathname.replace(`/${locale}`, `/${validLang}`);
    window.location.href = newPath;
  };

  const handleThemeChange = async (newTheme: AppTheme) => {
    setTheme(newTheme);
    if (!isDemoMode) {
      await updateAppSettings.mutateAsync({ appLanguage: language, appTheme: newTheme });
    }
  };

  const handleUploadLogo = () => {
    fileInputRef.current?.click();
  };

  const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
    } catch {
      toast.error(t("messages.logoUploadFailed"));
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteLogo = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (confirm(t("messages.deleteLogoConfirm"))) {
      await deleteLogo.mutateAsync();
    }
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema) as Resolver<SettingsFormData>,
    defaultValues: {
      company_name: "",
      address: "",
      city: "",
      postal_code: "",
      country: "",
      phone: "",
      email: "",
      website: "",
      siret: "",
      vat_number: "",
      default_tax_rate: 0,
      default_payment_terms: 30,
      invoice_prefix: "INV-",
      quote_prefix: "QT-",
      delivery_note_prefix: "DN-",
      legal_mentions: "",
      bank_details: "",
      currency: "EUR",
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        company_name: settings.company_name,
        address: settings.address ?? "",
        city: settings.city ?? "",
        postal_code: settings.postal_code ?? "",
        country: settings.country ?? "",
        phone: settings.phone ?? "",
        email: settings.email ?? "",
        website: settings.website ?? "",
        siret: settings.siret ?? "",
        vat_number: settings.vat_number ?? "",
        default_tax_rate: settings.default_tax_rate,
        default_payment_terms: settings.default_payment_terms,
        invoice_prefix: settings.invoice_prefix,
        quote_prefix: settings.quote_prefix,
        delivery_note_prefix: settings.delivery_note_prefix ?? "DN-",
        legal_mentions: settings.legal_mentions ?? "",
        bank_details: settings.bank_details ?? "",
        currency: settings.currency ?? "EUR",
      });
    }
  }, [settings, reset]);

  const onSubmit = async (data: SettingsFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await updateSettings.mutateAsync(data);
    if (data.currency) {
      setCurrency(data.currency);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
      </div>

      {/* User Management (Admin only) */}
      {currentUser?.role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t("userManagement.title", { ns: "auth" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UserManagement />
          </CardContent>
        </Card>
      )}

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("appearance.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language Selection */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t("appearance.language")}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'fr', label: 'Fran\u00E7ais', flag: (
                  <svg className="h-5 w-5 rounded-sm" viewBox="0 0 640 480">
                    <rect width="213.3" height="480" fill="#002654"/>
                    <rect x="213.3" width="213.4" height="480" fill="#fff"/>
                    <rect x="426.7" width="213.3" height="480" fill="#ce1126"/>
                  </svg>
                )},
                { value: 'en', label: 'English', flag: (
                  <svg className="h-5 w-5 rounded-sm" viewBox="0 0 640 480">
                    <rect width="640" height="480" fill="#012169"/>
                    <path d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0h75z" fill="#fff"/>
                    <path d="m424 281 216 159v40L369 281h55zm-184 20 6 35L54 480H0l240-179zM640 0v3L391 191l2-44L590 0h50zM0 0l239 176h-60L0 42V0z" fill="#C8102E"/>
                    <path d="M241 0v480h160V0H241zM0 160v160h640V160H0z" fill="#fff"/>
                    <path d="M0 193v96h640v-96H0zM273 0v480h96V0h-96z" fill="#C8102E"/>
                  </svg>
                )},
                { value: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', flag: (
                  <svg className="h-5 w-5 rounded-sm" viewBox="0 0 640 480">
                    <rect width="640" height="480" fill="#006c35"/>
                    <path d="M170 195h300v90H170z" fill="#fff"/>
                    <text x="320" y="270" textAnchor="middle" fill="#fff" fontSize="48" fontFamily="serif">\u0644\u0627 \u0625\u0644\u0647 \u0625\u0644\u0627 \u0627\u0644\u0644\u0647</text>
                  </svg>
                )},
              ].map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => handleLanguageChange(lang.value)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    locale === lang.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="shrink-0">{lang.flag}</span>
                  <span className="text-sm font-medium">{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Theme Selection */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t("appearance.theme")}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'system' as AppTheme, label: t("appearance.systemTheme"), icon: Monitor },
                { value: 'light' as AppTheme, label: t("appearance.lightTheme"), icon: Sun },
                { value: 'dark' as AppTheme, label: t("appearance.darkTheme"), icon: Moon },
              ].map((themeOption) => (
                <button
                  key={themeOption.value}
                  type="button"
                  onClick={() => handleThemeChange(themeOption.value)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    theme === themeOption.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <themeOption.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{themeOption.label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("branding.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 sm:w-32 sm:h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-800 overflow-hidden">
              {logoBase64 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoBase64}
                  alt={t("branding.logoAlt")}
                  className="w-full h-full object-contain"
                />
              ) : (
                // eslint-disable-next-line jsx-a11y/alt-text -- Lucide icon, not an HTML img
                <Image className="h-12 w-12 text-gray-400" />
              )}
            </div>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                {t("branding.logoDescription")}
                <br />
                {t("branding.acceptedFormats")}
              </p>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleLogoFileSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUploadLogo}
                  isLoading={uploadLogo.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {logoBase64 ? t("branding.changeLogo") : t("branding.uploadLogo")}
                </Button>
                {logoBase64 && (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDeleteLogo}
                    isLoading={deleteLogo.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("branding.delete")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("company.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t("company.nameRequired")}
                autoComplete="organization"
                {...register("company_name")}
                error={errors.company_name?.message}
              />
              <Input
                label={t("company.email")}
                type="email"
                autoComplete="email"
                {...register("email")}
                error={errors.email?.message}
              />
              <Input
                label={t("company.phone")}
                autoComplete="tel"
                {...register("phone")}
                error={errors.phone?.message}
              />
              <Input
                label={t("company.website")}
                autoComplete="url"
                {...register("website")}
                error={errors.website?.message}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("company.addressTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label={t("company.address")}
              autoComplete="street-address"
              {...register("address")}
              error={errors.address?.message}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label={t("company.postalCode")}
                autoComplete="postal-code"
                {...register("postal_code")}
                error={errors.postal_code?.message}
              />
              <Input
                label={t("company.city")}
                autoComplete="address-level2"
                {...register("city")}
                error={errors.city?.message}
              />
              <Input
                label={t("company.country")}
                autoComplete="country-name"
                {...register("country")}
                error={errors.country?.message}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("legal.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t("company.siret")}
                {...register("siret")}
                error={errors.siret?.message}
              />
              <Input
                label={t("company.vatNumber")}
                {...register("vat_number")}
                error={errors.vat_number?.message}
              />
            </div>
            <Textarea
              label={t("legal.legalMentions")}
              placeholder={t("legal.legalMentionsPlaceholder")}
              {...register("legal_mentions")}
              error={errors.legal_mentions?.message}
            />
            <Textarea
              label={t("legal.bankDetails")}
              placeholder={t("legal.bankDetailsPlaceholder")}
              {...register("bank_details")}
              error={errors.bank_details?.message}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("billing.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Select
                label={t("billing.currency")}
                options={currencyOptions}
                {...register("currency")}
              />
              <Select
                label={t("billing.defaultVatRate")}
                options={taxRateOptions}
                {...register("default_tax_rate")}
                error={errors.default_tax_rate?.message}
              />
              <Input
                label={t("billing.defaultPaymentTerms")}
                type="number"
                {...register("default_payment_terms")}
                error={errors.default_payment_terms?.message}
              />
              <Input
                label={t("billing.invoicePrefix")}
                {...register("invoice_prefix")}
                error={errors.invoice_prefix?.message}
              />
              <Input
                label={t("billing.quotePrefix")}
                {...register("quote_prefix")}
                error={errors.quote_prefix?.message}
              />
              <Input
                label={t("billing.deliveryNotePrefix")}
                {...register("delivery_note_prefix")}
                error={errors.delivery_note_prefix?.message}
              />
            </div>
          </CardContent>
          <CardFooter>
            <div className="flex items-center gap-4 w-full">
              {saveSuccess && (
                <span className="text-green-600 text-sm">
                  {t("messages.saveSuccess")}
                </span>
              )}
              <div className="flex-1" />
              <Button type="submit" isLoading={updateSettings.isPending} disabled={!isDirty}>
                <Save className="h-4 w-4 mr-2" />
                {t("buttons.save")}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      {/* Security: 2FA & Sessions */}
      <SecuritySection totpEnabled={false} />

      {/* Backup & Restore (Admin only) */}
      {currentUser?.role === 'admin' && <BackupSection />}
    </div>
  );
}
