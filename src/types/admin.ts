// ========== Admin Dashboard Types ==========

// Platform Admin
export type PlatformAdminRole = 'super_admin' | 'support_agent';

export type PlatformAdmin = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: PlatformAdminRole;
  is_active: boolean;
};

// Tenant
export type TenantStatus = 'active' | 'suspended' | 'pending';

export type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
  subscriptions?: Subscription[];
  users_count?: number;
};

// Plans
export type Translations = Record<string, string>; // { fr: "...", ar: "..." }

export type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  name_translations: Translations | null;
  description_translations: Translations | null;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  features?: PlanFeature[];
  prices?: PlanPrice[];
  quotas?: PlanQuota[];
};

export type PlanPrice = {
  id: string;
  plan_id: string;
  currency: string;
  monthly_price: number;
  yearly_price: number;
};

export type PlanFeature = {
  id: string;
  plan_id: string;
  feature_id: string;
  feature?: FeatureFlag;
};

export type PlanQuota = {
  id: string;
  plan_id: string;
  quota_key: string;
  limit_value: number;
};

export type CreatePlanInput = {
  slug: string;
  name: string;
  description?: string | null;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
};

export type UpdatePlanInput = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
};

// Feature Flags
export type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  name_translations: Translations | null;
  description_translations: Translations | null;
  is_global: boolean;
  created_at: string;
  updated_at: string;
};

export type TenantFeature = {
  id: string;
  tenant_id: string;
  feature_id: string;
  enabled: boolean;
  feature?: FeatureFlag;
};

export type CreateFeatureFlagInput = {
  key: string;
  name: string;
  description?: string | null;
  is_global: boolean;
};

export type UpdateFeatureFlagInput = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  is_global: boolean;
};

// Subscriptions
export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'suspended' | 'cancelled';

export type Subscription = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: string;
  price_at_purchase: number;
  currency: string;
  coupon_id: string | null;
  discount_amount: number | null;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  plan?: Plan;
  tenant?: AdminTenant;
};

// Subscription Requests
export type SubscriptionRequestType = 'new' | 'upgrade' | 'downgrade' | 'renewal';
export type SubscriptionRequestStatus = 'pending' | 'approved' | 'rejected';

export type SubscriptionRequest = {
  id: string;
  tenant_id: string;
  request_type: SubscriptionRequestType;
  target_plan_id: string;
  billing_cycle: string;
  coupon_code: string | null;
  status: SubscriptionRequestStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  tenant?: AdminTenant;
};

export type ApproveSubscriptionInput = {
  admin_notes?: string | null;
};

export type RejectSubscriptionInput = {
  admin_notes?: string | null;
};

// Coupons
export type Coupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  currency: string;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  plan_restrictions?: CouponPlan[];
};

export type CouponPlan = {
  id: string;
  coupon_id: string;
  plan_id: string;
  plan?: Plan;
};

export type CreateCouponInput = {
  code: string;
  discount_type: string;
  discount_value: number;
  currency: string;
  max_uses?: number | null;
  expires_at?: string | null;
  is_active: boolean;
};

export type UpdateCouponInput = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  currency: string;
  max_uses?: number | null;
  expires_at?: string | null;
  is_active: boolean;
};

// Subscription Invoices
export type SubscriptionInvoice = {
  id: string;
  subscription_id: string;
  invoice_number: string;
  tenant_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  subscription?: Subscription;
};

// Audit Logs
export type AuditLog = {
  id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  tenant_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

// Announcements
export type Announcement = {
  id: string;
  title: string;
  body: string;
  body_html: string | null;
  target_type: string;
  target_id: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AnnouncementDismissal = {
  id: string;
  announcement_id: string;
  user_id: string;
  dismissed_at: string;
};

export type CreateAnnouncementInput = {
  title: string;
  body: string;
  body_html?: string | null;
  target_type: string;
  target_id?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
};

export type UpdateAnnouncementInput = {
  id: string;
  title: string;
  body: string;
  body_html?: string | null;
  target_type: string;
  target_id?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
};

// Onboarding
export type OnboardingStep = {
  id: string;
  tenant_id: string;
  step_key: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

// Referrals
export type ReferralCode = {
  id: string;
  tenant_id: string;
  code: string;
  is_active: boolean;
  created_at: string;
  referrals?: Referral[];
};

export type Referral = {
  id: string;
  referral_code_id: string;
  referred_tenant_id: string;
  status: string;
  converted_at: string | null;
  created_at: string;
};

// Data Requests
export type DataRequest = {
  id: string;
  tenant_id: string;
  request_type: string;
  status: string;
  requested_by: string;
  completed_at: string | null;
  file_path: string | null;
  notes: string | null;
  created_at: string;
  tenant?: AdminTenant;
};

export type CreateDataRequestInput = {
  tenant_id: string;
  request_type: string;
  notes?: string | null;
};

// Rate Limit Logs
export type RateLimitLog = {
  id: string;
  tenant_id: string;
  endpoint: string;
  count: number;
  window_start: string;
  flagged: boolean;
  created_at: string;
};

// Admin Analytics
export type AdminAnalyticsOverview = {
  total_tenants: number;
  active_tenants: number;
  total_users: number;
  new_signups_this_month: number;
  mrr: number;
  total_revenue: number;
  subscription_breakdown: Record<string, number>;
};
