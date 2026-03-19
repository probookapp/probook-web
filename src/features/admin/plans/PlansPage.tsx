"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Select,
  Textarea,
} from "@/components/ui";
import {
  useAdminPlans,
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
} from "./hooks/usePlans";

type Plan = Record<string, unknown>;
type Translations = Record<string, string>;

const CURRENCIES = ["DZD", "EUR", "USD", "MAD"] as const;

interface PriceEntry {
  currency: string;
  monthly_price: string;
  yearly_price: string;
}

interface QuotaEntry {
  quota_key: string;
  limit_value: string;
}

const QUOTA_KEYS = ["max_users", "max_invoices_month", "storage_mb"] as const;

interface PlanFormState {
  slug: string;
  name: string;
  name_fr: string;
  name_ar: string;
  description: string;
  description_fr: string;
  description_ar: string;
  trial_days: string;
  sort_order: string;
  prices: PriceEntry[];
  quotas: QuotaEntry[];
}

const emptyForm: PlanFormState = {
  slug: "",
  name: "",
  name_fr: "",
  name_ar: "",
  description: "",
  description_fr: "",
  description_ar: "",
  trial_days: "0",
  sort_order: "0",
  prices: [{ currency: "DZD", monthly_price: "", yearly_price: "" }],
  quotas: [],
};

function formatPrice(amount: number, currency: string): string {
  return (amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " " + currency;
}

function getTr(obj: unknown, key: string): string {
  if (obj && typeof obj === "object" && key in (obj as Translations)) {
    return (obj as Translations)[key] || "";
  }
  return "";
}

export function PlansPage() {
  const { t } = useTranslation("admin");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanFormState>(emptyForm);

  const { data: plans, isLoading } = useAdminPlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: Plan) => {
    setEditingPlan(plan);
    const planPrices = (plan.prices || []) as { currency: string; monthly_price: number; yearly_price: number }[];
    const prices: PriceEntry[] = planPrices.length > 0
      ? planPrices.map((p) => ({
          currency: p.currency,
          monthly_price: String(p.monthly_price / 100),
          yearly_price: String(p.yearly_price / 100),
        }))
      : [{
          currency: String(plan.currency || "DZD"),
          monthly_price: String(plan.monthly_price != null ? Number(plan.monthly_price) / 100 : ""),
          yearly_price: String(plan.yearly_price != null ? Number(plan.yearly_price) / 100 : ""),
        }];

    const planQuotas = (plan.quotas || []) as { quota_key: string; limit_value: number }[];
    const quotas: QuotaEntry[] = planQuotas.map((q) => ({
      quota_key: q.quota_key,
      limit_value: String(q.limit_value),
    }));

    setFormData({
      slug: String(plan.slug || ""),
      name: String(plan.name || ""),
      name_fr: getTr(plan.name_translations, "fr"),
      name_ar: getTr(plan.name_translations, "ar"),
      description: String(plan.description || ""),
      description_fr: getTr(plan.description_translations, "fr"),
      description_ar: getTr(plan.description_translations, "ar"),
      trial_days: String(plan.trial_days ?? "0"),
      sort_order: String(plan.sort_order ?? "0"),
      prices,
      quotas,
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingPlan(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameTranslations: Translations = {};
    if (formData.name_fr) nameTranslations.fr = formData.name_fr;
    if (formData.name_ar) nameTranslations.ar = formData.name_ar;

    const descriptionTranslations: Translations = {};
    if (formData.description_fr) descriptionTranslations.fr = formData.description_fr;
    if (formData.description_ar) descriptionTranslations.ar = formData.description_ar;

    // Use first price entry as the plan's default price
    const defaultPrice = formData.prices[0];

    const prices = formData.prices.map((p) => ({
      currency: p.currency,
      monthly_price: Math.round(parseFloat(p.monthly_price || "0") * 100),
      yearly_price: Math.round(parseFloat(p.yearly_price || "0") * 100),
    }));

    const quotas = formData.quotas
      .filter((q) => q.quota_key && q.limit_value)
      .map((q) => ({
        quota_key: q.quota_key,
        limit_value: parseInt(q.limit_value, 10),
      }));

    const input: Record<string, unknown> = {
      slug: formData.slug,
      name: formData.name,
      description: formData.description,
      name_translations: Object.keys(nameTranslations).length > 0 ? nameTranslations : null,
      description_translations: Object.keys(descriptionTranslations).length > 0 ? descriptionTranslations : null,
      monthly_price: Math.round(parseFloat(defaultPrice?.monthly_price || "0") * 100),
      yearly_price: Math.round(parseFloat(defaultPrice?.yearly_price || "0") * 100),
      currency: defaultPrice?.currency || "DZD",
      trial_days: parseInt(formData.trial_days || "0", 10),
      sort_order: parseInt(formData.sort_order || "0", 10),
      prices,
      quotas,
    };

    if (editingPlan) {
      input.id = editingPlan.id;
      await updatePlan.mutateAsync(input);
    } else {
      await createPlan.mutateAsync(input);
    }
    handleClose();
  };

  const handleDeactivate = async (plan: Plan) => {
    await updatePlan.mutateAsync({
      id: plan.id,
      is_active: !plan.is_active,
    });
  };

  const addPriceRow = () => {
    const usedCurrencies = formData.prices.map((p) => p.currency);
    const available = CURRENCIES.find((c) => !usedCurrencies.includes(c));
    if (!available) return;
    setFormData((prev) => ({
      ...prev,
      prices: [...prev.prices, { currency: available, monthly_price: "", yearly_price: "" }],
    }));
  };

  const removePriceRow = (index: number) => {
    if (formData.prices.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      prices: prev.prices.filter((_, i) => i !== index),
    }));
  };

  const updatePrice = (index: number, field: keyof PriceEntry, value: string) => {
    setFormData((prev) => ({
      ...prev,
      prices: prev.prices.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  };

  const getQuotaLabel = (key: string) => t(`plans.quotaKeys.${key}`, key);

  const addQuotaRow = () => {
    const usedKeys = formData.quotas.map((q) => q.quota_key);
    const available = QUOTA_KEYS.find((k) => !usedKeys.includes(k));
    if (!available) return;
    setFormData((prev) => ({
      ...prev,
      quotas: [...prev.quotas, { quota_key: available, limit_value: "" }],
    }));
  };

  const removeQuotaRow = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      quotas: prev.quotas.filter((_, i) => i !== index),
    }));
  };

  const updateQuota = (index: number, field: keyof QuotaEntry, value: string) => {
    setFormData((prev) => ({
      ...prev,
      quotas: prev.quotas.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const planList = (plans || []) as Plan[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("plans.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("plans.subtitle")}</p>
        </div>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("plans.newPlan")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {planList.map((plan) => {
          const features = (plan.features || []) as Record<string, unknown>[];
          const prices = (plan.prices || []) as { currency: string; monthly_price: number; yearly_price: number }[];
          const quotas = (plan.quotas || []) as { quota_key: string; limit_value: number }[];
          return (
            <Card key={String(plan.id)}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {String(plan.name || "-")}
                  </h3>
                  <Badge variant={plan.is_active ? "success" : "default"}>
                    {plan.is_active ? t("plans.active") : t("plans.inactive")}
                  </Badge>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  {t("plans.slug")}: {String(plan.slug || "-")}
                </p>

                {plan.description ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {String(plan.description)}
                  </p>
                ) : null}

                <div className="space-y-2 mb-4">
                  {prices.length > 0 ? (
                    prices.map((pp) => (
                      <div key={pp.currency} className="space-y-0.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">{t("plans.monthly")} ({pp.currency})</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(pp.monthly_price, pp.currency)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">{t("plans.yearly")} ({pp.currency})</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(pp.yearly_price, pp.currency)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("plans.monthly")}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {plan.monthly_price != null
                            ? formatPrice(Number(plan.monthly_price), String(plan.currency || "DZD"))
                            : "-"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("plans.yearly")}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {plan.yearly_price != null
                            ? formatPrice(Number(plan.yearly_price), String(plan.currency || "DZD"))
                            : "-"}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t("plans.trialDays")}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {String(plan.trial_days ?? "0")}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t("plans.features")}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {features.length}
                    </span>
                  </div>
                  {quotas.map((q) => {
                    return (
                      <div key={q.quota_key} className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{getQuotaLabel(q.quota_key)}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {q.limit_value.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(plan)} className="flex-1">
                    <Pencil className="h-4 w-4 mr-1" />
                    {t("plans.edit")}
                  </Button>
                  <Button
                    variant={plan.is_active ? "danger" : "primary"}
                    size="sm"
                    onClick={() => handleDeactivate(plan)}
                    isLoading={updatePlan.isPending}
                    className="flex-1"
                  >
                    <Power className="h-4 w-4 mr-1" />
                    {plan.is_active ? t("plans.deactivate") : t("plans.activate")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {planList.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
            {t("plans.noPlans")}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title={editingPlan ? t("plans.editPlan") : t("plans.createPlan")}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="plan-slug"
              label={t("plans.form.slug")}
              value={formData.slug}
              onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
              required
              disabled={!!editingPlan}
              placeholder={t("plans.form.slugPlaceholder")}
            />
            <Input
              name="plan-name"
              label={`${t("plans.form.name")} (EN)`}
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
              placeholder={t("plans.form.namePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="plan-name-fr"
              label={`${t("plans.form.name")} (FR)`}
              value={formData.name_fr}
              onChange={(e) => setFormData((prev) => ({ ...prev, name_fr: e.target.value }))}
              placeholder="Nom du plan"
            />
            <Input
              name="plan-name-ar"
              label={`${t("plans.form.name")} (AR)`}
              value={formData.name_ar}
              onChange={(e) => setFormData((prev) => ({ ...prev, name_ar: e.target.value }))}
              placeholder="اسم الخطة"
              dir="rtl"
            />
          </div>

          <Textarea
            name="plan-description"
            label={`${t("plans.form.description")} (EN)`}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
            placeholder={t("plans.form.descriptionPlaceholder")}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Textarea
              name="plan-description-fr"
              label={`${t("plans.form.description")} (FR)`}
              value={formData.description_fr}
              onChange={(e) => setFormData((prev) => ({ ...prev, description_fr: e.target.value }))}
              rows={2}
              placeholder="Description du plan"
            />
            <Textarea
              name="plan-description-ar"
              label={`${t("plans.form.description")} (AR)`}
              value={formData.description_ar}
              onChange={(e) => setFormData((prev) => ({ ...prev, description_ar: e.target.value }))}
              rows={2}
              placeholder="وصف الخطة"
              dir="rtl"
            />
          </div>

          {/* Multi-currency pricing */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("plans.form.pricing")}
              </label>
              {formData.prices.length < CURRENCIES.length && (
                <Button type="button" variant="secondary" size="sm" onClick={addPriceRow}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("plans.form.addCurrency")}
                </Button>
              )}
            </div>
            {formData.prices.map((price, idx) => (
              <div key={idx} className="flex items-end gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <div className="w-24 shrink-0">
                  <Select
                    name={`price-currency-${idx}`}
                    label={idx === 0 ? t("plans.form.currency") : ""}
                    value={price.currency}
                    onChange={(e) => updatePrice(idx, "currency", e.target.value)}
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    name={`price-monthly-${idx}`}
                    label={idx === 0 ? t("plans.form.monthlyPrice") : ""}
                    type="number"
                    step="0.01"
                    min="0"
                    value={price.monthly_price}
                    onChange={(e) => updatePrice(idx, "monthly_price", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    name={`price-yearly-${idx}`}
                    label={idx === 0 ? t("plans.form.yearlyPrice") : ""}
                    type="number"
                    step="0.01"
                    min="0"
                    value={price.yearly_price}
                    onChange={(e) => updatePrice(idx, "yearly_price", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {formData.prices.length > 1 && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removePriceRow(idx)}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Quotas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("plans.quotas")}
              </label>
              {formData.quotas.length < QUOTA_KEYS.length && (
                <Button type="button" variant="secondary" size="sm" onClick={addQuotaRow}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("plans.addQuota")}
                </Button>
              )}
            </div>
            {formData.quotas.map((quota, idx) => (
              <div key={idx} className="flex items-end gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex-1">
                  <Select
                    name={`quota-key-${idx}`}
                    label={idx === 0 ? t("plans.quota") : ""}
                    value={quota.quota_key}
                    onChange={(e) => updateQuota(idx, "quota_key", e.target.value)}
                    options={QUOTA_KEYS.map((k) => ({ value: k, label: getQuotaLabel(k) }))}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    name={`quota-value-${idx}`}
                    label={idx === 0 ? t("plans.limit") : ""}
                    type="number"
                    min="0"
                    value={quota.limit_value}
                    onChange={(e) => updateQuota(idx, "limit_value", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => removeQuotaRow(idx)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {formData.quotas.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">{t("plans.noQuotas")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="plan-trial-days"
              label={t("plans.form.trialDays")}
              type="number"
              min="0"
              value={formData.trial_days}
              onChange={(e) => setFormData((prev) => ({ ...prev, trial_days: e.target.value }))}
            />
            <Input
              name="plan-sort-order"
              label={t("plans.form.sortOrder")}
              type="number"
              min="0"
              value={formData.sort_order}
              onChange={(e) => setFormData((prev) => ({ ...prev, sort_order: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t("plans.cancel")}
            </Button>
            <Button type="submit" isLoading={createPlan.isPending || updatePlan.isPending}>
              {editingPlan ? t("plans.updatePlan") : t("plans.createPlan")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
