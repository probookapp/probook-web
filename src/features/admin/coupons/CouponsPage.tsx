"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  useAdminCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
} from "./hooks/useCoupons";
import { useAdminPlans } from "../plans/hooks/usePlans";

type Coupon = Record<string, unknown>;
type PlanRestriction = { plan: { id: string; name: string; slug: string } };

interface CouponFormState {
  code: string;
  discount_type: string;
  discount_value: string;
  currency: string;
  max_uses: string;
  expires_at: string;
  is_active: boolean;
  plan_ids: string[];
}

const emptyForm: CouponFormState = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  currency: "DZD",
  max_uses: "",
  expires_at: "",
  is_active: true,
  plan_ids: [],
};

function formatDiscountValue(
  type: string,
  value: number,
  currency: string
): string {
  if (type === "percentage") {
    return `${value}%`;
  }
  return (
    (value / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    currency
  );
}

export function CouponsPage() {
  const { t } = useTranslation("admin");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<CouponFormState>(emptyForm);

  const { data: coupons, isLoading } = useAdminCoupons();
  const { data: plans } = useAdminPlans();
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    const restrictions = (coupon.plan_restrictions || []) as PlanRestriction[];
    setFormData({
      code: String(coupon.code || ""),
      discount_type: String(coupon.discount_type || "percentage"),
      discount_value:
        coupon.discount_type === "fixed"
          ? String(Number(coupon.discount_value || 0) / 100)
          : String(coupon.discount_value || ""),
      currency: String(coupon.currency || "DZD"),
      max_uses: coupon.max_uses != null ? String(coupon.max_uses) : "",
      expires_at: coupon.expires_at
        ? String(coupon.expires_at).slice(0, 10)
        : "",
      is_active: Boolean(coupon.is_active),
      plan_ids: restrictions.map((r) => r.plan.id),
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingCoupon(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const discountValue =
      formData.discount_type === "fixed"
        ? Math.round(parseFloat(formData.discount_value || "0") * 100)
        : parseInt(formData.discount_value || "0", 10);

    const input: Record<string, unknown> = {
      code: formData.code,
      discount_type: formData.discount_type,
      discount_value: discountValue,
      currency: formData.currency,
      max_uses: formData.max_uses ? parseInt(formData.max_uses, 10) : null,
      expires_at: formData.expires_at || null,
      is_active: formData.is_active,
      plan_ids: formData.plan_ids,
    };

    if (editingCoupon) {
      input.id = editingCoupon.id;
      await updateCoupon.mutateAsync(input);
    } else {
      await createCoupon.mutateAsync(input);
    }
    handleClose();
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(t("coupons.confirmDelete"))) return;
    await deleteCoupon.mutateAsync(String(coupon.id));
  };

  const togglePlanId = (planId: string) => {
    setFormData((prev) => ({
      ...prev,
      plan_ids: prev.plan_ids.includes(planId)
        ? prev.plan_ids.filter((id) => id !== planId)
        : [...prev.plan_ids, planId],
    }));
  };

  const updateField = (
    field: keyof CouponFormState,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const couponList = (coupons || []) as Coupon[];
  const planList = (plans || []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("coupons.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("coupons.subtitle")}
          </p>
        </div>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("coupons.create")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("coupons.code")}</TableHead>
                  <TableHead>{t("coupons.type")}</TableHead>
                  <TableHead>{t("coupons.value")}</TableHead>
                  <TableHead>{t("coupons.currency")}</TableHead>
                  <TableHead>{t("coupons.uses")}</TableHead>
                  <TableHead>{t("coupons.expires")}</TableHead>
                  <TableHead>{t("coupons.active")}</TableHead>
                  <TableHead>{t("coupons.plans")}</TableHead>
                  <TableHead>{t("coupons.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {couponList.map((coupon) => {
                  const restrictions = (coupon.plan_restrictions ||
                    []) as PlanRestriction[];
                  return (
                    <TableRow key={String(coupon.id)}>
                      <TableCell className="font-mono font-semibold">
                        {String(coupon.code || "-")}
                      </TableCell>
                      <TableCell>
                        {coupon.discount_type === "percentage"
                          ? t("coupons.percentage")
                          : t("coupons.fixed")}
                      </TableCell>
                      <TableCell>
                        {formatDiscountValue(
                          String(coupon.discount_type),
                          Number(coupon.discount_value || 0),
                          String(coupon.currency || "DZD")
                        )}
                      </TableCell>
                      <TableCell>{String(coupon.currency || "DZD")}</TableCell>
                      <TableCell>
                        {String(coupon.current_uses ?? 0)}
                        {coupon.max_uses != null
                          ? ` / ${coupon.max_uses}`
                          : ` / ${t("coupons.unlimited")}`}
                      </TableCell>
                      <TableCell>
                        {coupon.expires_at
                          ? new Date(
                              String(coupon.expires_at)
                            ).toLocaleDateString()
                          : t("coupons.never")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={coupon.is_active ? "success" : "default"}
                        >
                          {coupon.is_active
                            ? t("coupons.yes")
                            : t("coupons.no")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {restrictions.length > 0
                          ? restrictions.map((r) => r.plan.name).join(", ")
                          : t("coupons.allPlans")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenEdit(coupon)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(coupon)}
                            isLoading={deleteCoupon.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {couponList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500 dark:text-gray-400">
                      {t("coupons.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title={
          editingCoupon
            ? t("coupons.editTitle")
            : t("coupons.createTitle")
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="coupon-code"
              label={t("coupons.codeLabel")}
              value={formData.code}
              onChange={(e) => updateField("code", e.target.value)}
              required
              placeholder="e.g., SAVE20"
            />
            <Select
              name="coupon-discount-type"
              label={t("coupons.typeLabel")}
              value={formData.discount_type}
              onChange={(e) => updateField("discount_type", e.target.value)}
              options={[
                {
                  value: "percentage",
                  label: t("coupons.percentage"),
                },
                { value: "fixed", label: t("coupons.fixed") },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="coupon-discount-value"
              label={
                formData.discount_type === "percentage"
                  ? t("coupons.valuePercentLabel")
                  : t("coupons.valueFixedLabel")
              }
              type="number"
              step={formData.discount_type === "fixed" ? "0.01" : "1"}
              min="0"
              max={formData.discount_type === "percentage" ? "100" : undefined}
              value={formData.discount_value}
              onChange={(e) => updateField("discount_value", e.target.value)}
              required
            />
            <Select
              name="coupon-currency"
              label={t("coupons.currencyLabel")}
              value={formData.currency}
              onChange={(e) => updateField("currency", e.target.value)}
              options={[
                { value: "DZD", label: "DZD" },
                { value: "MAD", label: "MAD" },
                { value: "EUR", label: "EUR" },
                { value: "USD", label: "USD" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="coupon-max-uses"
              label={t("coupons.maxUsesLabel")}
              type="number"
              min="0"
              value={formData.max_uses}
              onChange={(e) => updateField("max_uses", e.target.value)}
              placeholder={t("coupons.unlimitedPlaceholder")}
            />
            <Input
              name="coupon-expires-at"
              label={t("coupons.expiresLabel")}
              type="date"
              value={formData.expires_at}
              onChange={(e) => updateField("expires_at", e.target.value)}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => updateField("is_active", e.target.checked)}
                className="rounded border-gray-300"
              />
              {t("coupons.isActiveLabel")}
            </label>
          </div>

          {/* Plan Restrictions */}
          {planList.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("coupons.planRestrictionsLabel")}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {t("coupons.planRestrictionsHelp")}
              </p>
              <div className="flex flex-wrap gap-2">
                {planList.map((plan) => {
                  const planId = String(plan.id);
                  const isSelected = formData.plan_ids.includes(planId);
                  return (
                    <button
                      key={planId}
                      type="button"
                      onClick={() => togglePlanId(planId)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                        isSelected
                          ? "bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:border-primary-400 dark:text-primary-300"
                          : "bg-gray-100 border-gray-300 text-gray-600 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {String(plan.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t("coupons.cancel")}
            </Button>
            <Button
              type="submit"
              isLoading={createCoupon.isPending || updateCoupon.isPending}
            >
              {editingCoupon
                ? t("coupons.update")
                : t("coupons.createSubmit")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
