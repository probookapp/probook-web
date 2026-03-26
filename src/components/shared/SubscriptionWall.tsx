"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Tag, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { tenantSubscriptionApi } from "@/lib/admin-api";

interface PlanPrice {
  currency: string;
  monthly_price: number;
  yearly_price: number;
}

interface PlanFeatureItem {
  feature: { name: string; description?: string; name_translations?: Record<string, string> | null };
}

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_days: number;
  is_active: boolean;
  features: PlanFeatureItem[];
  prices?: PlanPrice[];
  sort_order: number;
}

interface PlansResponse {
  plans: Plan[];
  detected_currency: string | null;
  detected_country: string | null;
}

interface CouponResult {
  valid: boolean;
  code: string;
  discount_type: string;
  discount_value: number;
  description?: string;
}

interface SubscriptionStatus {
  status: string | null;
  pending_request?: boolean;
}

function formatPrice(amount: number, currency: string): string {
  return (amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " " + currency;
}


export function SubscriptionWall({ subscriptionStatus, onRequestSuccess }: { subscriptionStatus?: SubscriptionStatus; onRequestSuccess?: () => void }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"yearly" | "monthly">("yearly");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState("");

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => tenantSubscriptionApi.getAvailablePlans() as unknown as Promise<PlansResponse>,
  });

  const plans = plansData?.plans;
  const detectedCurrency = plansData?.detected_currency;

  const subscribeRequest = useMutation({
    mutationFn: (input: Record<string, unknown>) => tenantSubscriptionApi.request(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-subscription"] });
      onRequestSuccess?.();
    },
  });

  const validateCoupon = useMutation({
    mutationFn: (input: Record<string, unknown>) => tenantSubscriptionApi.validateCoupon(input) as Promise<CouponResult>,
  });

  useEffect(() => {
    if (plans && plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  const currentStatus = subscriptionStatus?.status || null;
  const hasPendingRequest = subscriptionStatus?.pending_request || currentStatus === "pending";

  const getStatusMessage = (status: string | null): { message: string; icon: React.ReactNode; variant: "warning" | "danger" | "default" } => {
    switch (status) {
      case "pending":
        return {
          message: t("subscriptionWall.pendingMessage"),
          icon: <Clock className="h-6 w-6" />,
          variant: "warning",
        };
      case "expired":
        return {
          message: t("subscriptionWall.expiredMessage"),
          icon: <AlertTriangle className="h-6 w-6" />,
          variant: "danger",
        };
      case "suspended":
        return {
          message: t("subscriptionWall.suspendedMessage"),
          icon: <AlertTriangle className="h-6 w-6" />,
          variant: "danger",
        };
      default:
        return {
          message: t("subscriptionWall.defaultMessage"),
          icon: <AlertTriangle className="h-6 w-6" />,
          variant: "default",
        };
    }
  };

  const statusInfo = getStatusMessage(currentStatus);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError("");
    setAppliedCoupon(null);
    try {
      const result = await validateCoupon.mutateAsync({ code: couponCode.trim() });
      if (result.valid) {
        setAppliedCoupon(result);
      } else {
        setCouponError(t("subscriptionWall.invalidCoupon"));
      }
    } catch {
      setCouponError(t("subscriptionWall.invalidCoupon"));
    }
  };

  const handleSubscribe = async () => {
    if (!selectedPlanId) return;
    const input: Record<string, unknown> = {
      plan_id: selectedPlanId,
      billing_cycle: billingCycle,
      request_type: "new",
      currency: detectedCurrency || "DZD",
    };
    if (appliedCoupon?.valid) {
      input.coupon_code = appliedCoupon.code;
    }
    await subscribeRequest.mutateAsync(input);
  };

  const calculateDiscountedPrice = (price: number): number | null => {
    if (!appliedCoupon?.valid) return null;
    if (appliedCoupon.discount_type === "percentage") {
      return price - (price * appliedCoupon.discount_value) / 100;
    }
    if (appliedCoupon.discount_type === "fixed") {
      return Math.max(0, price - appliedCoupon.discount_value);
    }
    return null;
  };

  if (plansLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-4xl">
        {/* Status Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-4">
            {statusInfo.icon}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t("subscriptionWall.title")}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-lg mx-auto">
            {statusInfo.message}
          </p>
          {currentStatus && (
            <div className="mt-3">
              <Badge
                variant={
                  currentStatus === "active" ? "success" :
                  currentStatus === "pending" ? "warning" :
                  currentStatus === "expired" || currentStatus === "suspended" ? "danger" :
                  "default"
                }
              >
                {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
              </Badge>
            </div>
          )}
        </div>

        {/* Pending Request Notice */}
        {hasPendingRequest && (
          <Card className="mb-8 border-yellow-300 dark:border-yellow-700">
            <CardContent className="flex items-center gap-3 py-4">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {t("subscriptionWall.pendingTitle")}
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {t("subscriptionWall.pendingDescription")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success Notice */}
        {subscribeRequest.isSuccess && (
          <Card className="mb-8 border-green-300 dark:border-green-700">
            <CardContent className="flex items-center gap-3 py-4">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">
                  {t("subscriptionWall.successTitle")}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {t("subscriptionWall.successDescription")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plans Grid */}
        {!hasPendingRequest && !subscribeRequest.isSuccess && (
          <>
            {/* Billing Cycle Toggle */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
                {t("subscriptionWall.monthly")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={billingCycle === "yearly"}
                onClick={() => setBillingCycle(billingCycle === "yearly" ? "monthly" : "yearly")}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  billingCycle === "yearly" ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    billingCycle === "yearly" ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="relative">
                <span className={`text-sm font-medium ${billingCycle === "yearly" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
                  {t("subscriptionWall.yearly")}
                </span>
                <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap">
                  <Badge variant="success">{t("subscriptionWall.saveWithYearly")}</Badge>
                </span>
              </span>
            </div>

            <div className={`grid gap-6 mb-8 ${
              plans && plans.length === 1
                ? "grid-cols-1 max-w-md mx-auto"
                : plans && plans.length === 2
                ? "grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto"
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            }`}>
              {plans?.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const price = billingCycle === "yearly"
                  ? { amount: plan.yearly_price, currency: plan.currency }
                  : { amount: plan.monthly_price, currency: plan.currency };
                const discountedPrice = calculateDiscountedPrice(price.amount);

                return (
                  <Card
                    key={plan.id}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? "ring-2 ring-primary-500 border-primary-500"
                        : "hover:border-gray-400 dark:hover:border-gray-500"
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {plan.name}
                        </h3>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>

                      {plan.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          {plan.description}
                        </p>
                      )}

                      <div className="mb-4">
                        {discountedPrice !== null ? (
                          <div>
                            <span className="text-sm line-through text-gray-400">
                              {formatPrice(price.amount, price.currency)}
                            </span>
                            <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                              {formatPrice(discountedPrice, price.currency)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {formatPrice(price.amount, price.currency)}
                          </div>
                        )}
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {billingCycle === "yearly" ? t("subscriptionWall.perYear") : t("subscriptionWall.perMonth")}
                        </span>
                      </div>

                      {plan.trial_days > 0 && (
                        <p className="text-sm text-primary-600 dark:text-primary-400 mb-4">
                          {t("subscriptionWall.trialDays", { days: plan.trial_days })}
                        </p>
                      )}

                      {plan.features && plan.features.length > 0 && (
                        <ul className="space-y-2">
                          {plan.features.map((f, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                              <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                              <span>{f.feature?.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Coupon Section */}
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("subscriptionWall.haveCoupon")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    name="coupon-code"
                    placeholder={t("subscriptionWall.couponPlaceholder")}
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponError("");
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleApplyCoupon}
                    isLoading={validateCoupon.isPending}
                    disabled={!couponCode.trim()}
                  >
                    {t("subscriptionWall.apply")}
                  </Button>
                </div>
                {couponError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{couponError}</p>
                )}
                {appliedCoupon?.valid && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    <span>
                      {t("subscriptionWall.couponApplied")} {appliedCoupon.discount_type === "percentage"
                        ? t("subscriptionWall.percentOff", { value: appliedCoupon.discount_value })
                        : t("subscriptionWall.amountOff", { amount: formatPrice(appliedCoupon.discount_value, "MAD") })}
                      {appliedCoupon.description && ` - ${appliedCoupon.description}`}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subscribe Button */}
            <div className="text-center">
              <Button
                size="lg"
                onClick={handleSubscribe}
                isLoading={subscribeRequest.isPending}
                disabled={!selectedPlanId}
                className="px-12"
              >
                {t("subscriptionWall.subscribeNow")}
              </Button>
              {subscribeRequest.isError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {t("subscriptionWall.submitError")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
