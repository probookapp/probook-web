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
import { useLocale } from "@/lib/navigation";
import { formatPriceTag, yearlyMonthsFree } from "@/lib/price-tag";
import { translatedName, type Translations } from "@/lib/translated-name";
import { OfferComposer } from "@/components/shared/OfferComposer";
import { OfferContents, OfferPrice } from "@/components/shared/OfferDetails";

interface PlanPrice {
  currency: string;
  monthly_price: number;
  yearly_price: number;
}

interface PlanFeatureItem {
  feature: {
    key: string;
    name: string;
    description?: string;
    name_translations?: Record<string, string> | null;
    /** À la carte price per month, null when not sold separately. */
    unit_price?: number | null;
  };
}

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  name_translations?: Translations;
  description_translations?: Translations;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  /** The catalogue's own currency, before per-visitor resolution. */
  base_currency?: string;
  trial_days: number;
  is_active: boolean;
  features: PlanFeatureItem[];
  prices?: PlanPrice[];
  quotas?: { quota_key: string; limit_value: number }[];
  sort_order: number;
}

interface PlansResponse {
  plans: Plan[];
  /** One extra seat, in the same currency as the offers above. */
  seat_price?: number;
  detected_currency: string | null;
  detected_country: string | null;
}

interface CouponResult {
  valid: boolean;
  code: string;
  discount_type: string;
  /** A percentage, or a fixed amount already expressed in `currency`. */
  discount_value: number;
  /** The currency the offers are billed in. */
  currency: string;
  /** The offers the coupon applies to; null when it applies to all of them. */
  eligible_plan_ids: string[] | null;
  description?: string;
}

interface SubscriptionStatus {
  status: string | null;
  pending_request?: boolean;
  rejected_request?: boolean;
  rejection_reason?: string | null;
}

export function SubscriptionWall({ subscriptionStatus, onRequestSuccess }: { subscriptionStatus?: SubscriptionStatus; onRequestSuccess?: () => void }) {
  const { t } = useTranslation("admin");
  // The composer is shared with the public pricing page, so its wording lives
  // in `common` rather than being duplicated per namespace.
  const { t: tCommon } = useTranslation("common");
  // The yearly badge says what the pricing page says, from the same keys.
  const { t: tPages } = useTranslation("pages");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"yearly" | "monthly">("yearly");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState("");
  // Email-verification gate: shown when a subscription request is refused
  // because the account's email isn't verified yet.
  const [needsEmailVerify, setNeedsEmailVerify] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyEmailError, setVerifyEmailError] = useState("");
  const [verifyEmailSent, setVerifyEmailSent] = useState(false);
  const [verifyEmailSending, setVerifyEmailSending] = useState(false);
  // Set when a submit is refused because a request is already pending, so we can
  // switch to the "in review" notice instead of a generic failure toast.
  const [localPending, setLocalPending] = useState(false);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => tenantSubscriptionApi.getAvailablePlans() as unknown as Promise<PlansResponse>,
  });

  const plans = plansData?.plans;
  // The currency the offers were actually quoted in — not the one the visitor
  // was guessed to want, which has no price when no rate covers it.
  const quotedCurrency = plans?.[0]?.currency;
  const monthsFree = yearlyMonthsFree(plans);
  const formatPrice = (amount: number, currency: string) =>
    formatPriceTag(amount, currency, locale);

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
      // Intentional: default the selection once plans load.
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  const currentStatus = subscriptionStatus?.status || null;
  const hasPendingRequest = subscriptionStatus?.pending_request || currentStatus === "pending" || localPending;
  const isTrial = currentStatus === "trial";
  const wallTitle = isTrial ? t("subscriptionWall.trialTitle") : t("subscriptionWall.title");

  const getStatusMessage = (status: string | null): { message: string; icon: React.ReactNode; variant: "warning" | "danger" | "default" } => {
    switch (status) {
      case "trial":
        return {
          message: t("subscriptionWall.trialMessage"),
          icon: <Clock className="h-6 w-6" />,
          variant: "default",
        };
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
      case "trial_expired":
        return {
          message: t("subscriptionWall.trialExpiredMessage"),
          icon: <Clock className="h-6 w-6" />,
          variant: "warning",
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
      const result = await validateCoupon.mutateAsync({
        code: couponCode.trim(),
        plan_id: selectedPlanId,
        billing_cycle: billingCycle,
        currency: quotedCurrency,
      });
      if (result.valid) {
        setAppliedCoupon(result);
      } else {
        setCouponError(t("subscriptionWall.invalidCoupon"));
      }
    } catch {
      setCouponError(t("subscriptionWall.invalidCoupon"));
    }
  };

  const handleSubscribe = async (
    custom?: { feature_keys: string[]; seats: number }
  ) => {
    if (!custom && !selectedPlanId) return;
    const input: Record<string, unknown> = {
      billing_cycle: billingCycle,
      request_type: "new",
      currency: quotedCurrency,
    };
    // Either a listed offer or a composed one, never both: the server mints the
    // private offer for a composition and refuses a request carrying the two.
    if (custom) {
      input.custom = custom;
    } else {
      input.plan_id = selectedPlanId;
    }
    // Only where it applies: a coupon restricted to one offer, carried onto
    // another, would be silently dropped at approval after being shown here.
    if (appliedCoupon?.valid && couponAppliesTo(custom ? null : selectedPlanId)) {
      input.coupon_code = appliedCoupon.code;
    }
    try {
      await subscribeRequest.mutateAsync(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // The request route refuses with EMAIL_NOT_VERIFIED until ownership is
      // confirmed — surface the inline "verify your email" step instead.
      if (msg.includes("EMAIL_NOT_VERIFIED")) {
        setNeedsEmailVerify(true);
      } else if (msg.includes("PENDING_REQUEST_EXISTS")) {
        // A request already exists — show the "in review" notice, not a failure.
        setLocalPending(true);
        queryClient.invalidateQueries({ queryKey: ["current-subscription"] });
      }
    }
  };

  const handleSendVerification = async () => {
    if (!verifyEmail.trim()) return;
    setVerifyEmailError("");
    setVerifyEmailSending(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: verifyEmail.trim() }),
      });
      if (!res.ok) {
        setVerifyEmailError(t("subscriptionWall.verifyEmailError"));
        return;
      }
      setVerifyEmailSent(true);
    } catch {
      setVerifyEmailError(t("subscriptionWall.verifyEmailError"));
    } finally {
      setVerifyEmailSending(false);
    }
  };

  /** Whether the applied coupon covers an offer; null stands for a composed one. */
  const couponAppliesTo = (planId: string | null): boolean => {
    if (!appliedCoupon?.valid) return false;
    if (!appliedCoupon.eligible_plan_ids) return true;
    return planId !== null && appliedCoupon.eligible_plan_ids.includes(planId);
  };

  // The same arithmetic the approval bills with (lib/plan-pricing): a
  // percentage rounded down, a fixed amount never more than the price.
  const calculateDiscountedPrice = (planId: string, price: number): number | null => {
    if (!appliedCoupon || !couponAppliesTo(planId)) return null;
    const discount =
      appliedCoupon.discount_type === "percentage"
        ? Math.floor((price * appliedCoupon.discount_value) / 100)
        : appliedCoupon.discount_value;
    return price - Math.min(Math.max(0, discount), price);
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
            {wallTitle}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-lg mx-auto">
            {statusInfo.message}
          </p>
          {currentStatus && (
            <div className="mt-3">
              <Badge
                variant={
                  currentStatus === "active" ? "success" :
                  currentStatus === "pending" || currentStatus === "trial_expired" ? "warning" :
                  currentStatus === "expired" || currentStatus === "suspended" ? "danger" :
                  "default"
                }
              >
                {currentStatus === "trial_expired"
                  ? t("subscriptionWall.statusTrialExpired")
                  : currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
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

        {/* Rejected Request Notice */}
        {!hasPendingRequest && !subscribeRequest.isSuccess && subscriptionStatus?.rejected_request && (
          <Card className="mb-8 border-red-300 dark:border-red-700">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  {t("subscriptionWall.rejectedTitle")}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {subscriptionStatus.rejection_reason || t("subscriptionWall.rejectedDescription")}
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

        {/* Email verification gate */}
        {needsEmailVerify && (
          <Card className="mb-8 border-amber-300 dark:border-amber-700">
            <CardContent className="py-4">
              {verifyEmailSent ? (
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-200">
                      {t("subscriptionWall.verifyEmailSentTitle")}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {t("subscriptionWall.verifyEmailSentDescription")}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      {t("subscriptionWall.verifyEmailTitle")}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {t("subscriptionWall.verifyEmailDescription")}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      name="verify-email"
                      type="email"
                      placeholder={t("subscriptionWall.verifyEmailPlaceholder")}
                      value={verifyEmail}
                      onChange={(e) => {
                        setVerifyEmail(e.target.value);
                        setVerifyEmailError("");
                      }}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleSendVerification}
                      isLoading={verifyEmailSending}
                      disabled={!verifyEmail.trim()}
                    >
                      {t("subscriptionWall.verifyEmailSend")}
                    </Button>
                  </div>
                  {verifyEmailError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{verifyEmailError}</p>
                  )}
                </>
              )}
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
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors before:absolute before:-inset-2.5 ${
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
                <span className="absolute start-full top-1/2 -translate-y-1/2 ms-2 whitespace-nowrap">
                  <Badge variant="success">
                    {monthsFree > 0
                      ? tPages("pricing.monthsFree", { count: monthsFree })
                      : t("subscriptionWall.saveWithYearly")}
                  </Badge>
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
                const amount = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
                const discountedPrice = calculateDiscountedPrice(plan.id, amount);

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
                          {translatedName(plan.name, plan.name_translations, locale)}
                        </h3>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>

                      {plan.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          {translatedName(plan.description, plan.description_translations, locale)}
                        </p>
                      )}

                      {/* The pricing page's own price and contents, so an offer reads
                          the same in the shop window and at the till. */}
                      <OfferPrice
                        amount={discountedPrice ?? amount}
                        original={discountedPrice !== null ? amount : null}
                        currency={plan.currency}
                        billingCycle={billingCycle}
                        figureClassName="text-3xl"
                      />

                      {plan.trial_days > 0 && (
                        <p className="mt-2 text-sm text-primary-600 dark:text-primary-400">
                          {t("subscriptionWall.trialDays", { days: plan.trial_days })}
                        </p>
                      )}

                      <OfferContents plan={plan} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Composing comes after the offers, from a button of its own. */}
            {plans && plans.length > 0 && (
              <OfferComposer
                plans={plans}
                billingCycle={billingCycle}
                currency={plans[0].currency}
                seatPrice={plansData?.seat_price}
                onSubmit={(composition) => handleSubscribe(composition)}
                isSubmitting={subscribeRequest.isPending}
                submitLabel={tCommon("composer.submit")}
              />
            )}

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
                {/* A code kept to other offers is still a good code: say which
                    ones, rather than calling it invalid or applying nothing. */}
                {appliedCoupon?.valid && !couponAppliesTo(selectedPlanId) && (
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                    {t("subscriptionWall.couponOtherOffers", {
                      offers: (plans ?? [])
                        .filter((p) => appliedCoupon.eligible_plan_ids?.includes(p.id))
                        .map((p) => translatedName(p.name, p.name_translations, locale))
                        .join(", "),
                    })}
                  </p>
                )}
                {appliedCoupon?.valid && couponAppliesTo(selectedPlanId) && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    <span>
                      {t("subscriptionWall.couponApplied")} {appliedCoupon.discount_type === "percentage"
                        ? t("subscriptionWall.percentOff", { value: appliedCoupon.discount_value })
                        : t("subscriptionWall.amountOff", { amount: formatPrice(appliedCoupon.discount_value, appliedCoupon.currency) })}
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
                // Wrapped: passing the handler straight to onClick would hand it
                // the click event as the composition argument.
                onClick={() => handleSubscribe()}
                isLoading={subscribeRequest.isPending}
                disabled={!selectedPlanId}
                className="px-12"
              >
                {t("subscriptionWall.subscribeNow")}
              </Button>
              {subscribeRequest.isError && !needsEmailVerify && !localPending && (
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
