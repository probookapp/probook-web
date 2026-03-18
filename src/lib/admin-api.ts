import { adminApiCall } from "./admin-api-adapter";

// Admin Auth commands
export const adminAuthApi = {
  login: (input: { username: string; password: string }) =>
    adminApiCall<{ id: string; username: string; display_name: string; email: string; role: string }>("admin_login", { input }),
  logout: () => adminApiCall<void>("admin_logout"),
  getMe: () =>
    adminApiCall<{ id: string; username: string; display_name: string; email: string; role: string } | null>("admin_get_me"),
};

// Plans commands
export const adminPlansApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_plans"),
  getById: (id: string) => adminApiCall<unknown>("get_admin_plan", { id }),
  create: (input: Record<string, unknown>) => adminApiCall<unknown>("create_admin_plan", { input }),
  update: (input: Record<string, unknown>) => adminApiCall<unknown>("update_admin_plan", { input }),
  delete: (id: string) => adminApiCall<void>("delete_admin_plan", { id }),
};

// Tenants commands
export const adminTenantsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_tenants"),
  getById: (id: string) => adminApiCall<unknown>("get_admin_tenant", { id }),
  update: (input: Record<string, unknown>) => adminApiCall<unknown>("update_admin_tenant", { input }),
  delete: (id: string) => adminApiCall<void>("delete_admin_tenant", { id }),
  suspend: (id: string) => adminApiCall<unknown>("suspend_admin_tenant", { id }),
  activate: (id: string) => adminApiCall<unknown>("activate_admin_tenant", { id }),
  impersonate: (id: string) => adminApiCall<unknown>("impersonate_tenant", { id }),
  stopImpersonation: () => adminApiCall<void>("stop_impersonation"),
};

// Platform Admins commands
export const adminPlatformAdminsApi = {
  getAll: () => adminApiCall<unknown[]>("get_platform_admins"),
  create: (input: Record<string, unknown>) => adminApiCall<unknown>("create_platform_admin", { input }),
  update: (input: Record<string, unknown>) => adminApiCall<unknown>("update_platform_admin", { input }),
  delete: (id: string) => adminApiCall<void>("delete_platform_admin", { id }),
};

// Users commands
export const adminUsersApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_users"),
  disable: (id: string) => adminApiCall<unknown>("disable_admin_user", { id }),
  resetPassword: (id: string, input: Record<string, unknown>) =>
    adminApiCall<unknown>("reset_admin_user_password", { id, input }),
};

// Subscriptions commands
export const adminSubscriptionsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_subscriptions"),
  getById: (id: string) => adminApiCall<unknown>("get_admin_subscription", { id }),
  renew: (id: string, input: Record<string, unknown>) =>
    adminApiCall<unknown>("renew_admin_subscription", { id, input }),
  cancel: (id: string) => adminApiCall<unknown>("cancel_admin_subscription", { id }),
};

// Subscription Requests commands
export const adminSubscriptionRequestsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_subscription_requests"),
  approve: (id: string) => adminApiCall<unknown>("approve_subscription_request", { id }),
  reject: (id: string, input: Record<string, unknown>) =>
    adminApiCall<unknown>("reject_subscription_request", { id, input }),
};

// Coupons commands
export const adminCouponsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_coupons"),
  create: (input: Record<string, unknown>) => adminApiCall<unknown>("create_admin_coupon", { input }),
  update: (input: Record<string, unknown>) => adminApiCall<unknown>("update_admin_coupon", { input }),
  delete: (id: string) => adminApiCall<void>("delete_admin_coupon", { id }),
};

// Features commands
export const adminFeaturesApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_features"),
  create: (input: Record<string, unknown>) => adminApiCall<unknown>("create_admin_feature", { input }),
  update: (input: Record<string, unknown>) => adminApiCall<unknown>("update_admin_feature", { input }),
  getTenantFeatures: (tenantId: string) => adminApiCall<unknown[]>("get_tenant_features", { tenantId }),
  updateTenantFeatures: (tenantId: string, input: Record<string, unknown>) =>
    adminApiCall<unknown>("update_tenant_features", { tenantId, input }),
};

// Analytics commands
export const adminAnalyticsApi = {
  getOverview: () => adminApiCall<unknown>("get_admin_analytics_overview"),
  getSignups: (startDate?: string, endDate?: string) =>
    adminApiCall<unknown[]>("get_admin_analytics_signups", { startDate, endDate }),
  getRevenue: (startDate?: string, endDate?: string) =>
    adminApiCall<unknown[]>("get_admin_analytics_revenue", { startDate, endDate }),
  getSubscriptions: () => adminApiCall<unknown>("get_admin_analytics_subscriptions"),
};

// Audit Logs commands
export const adminAuditLogsApi = {
  getAll: (params?: { page?: number; limit?: number; action?: string; adminId?: string; tenantId?: string }) =>
    adminApiCall<unknown>("get_admin_audit_logs", params as Record<string, unknown>),
};

// Announcements commands
export const adminAnnouncementsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_announcements"),
  create: (input: Record<string, unknown>) =>
    adminApiCall<unknown>("create_admin_announcement", { input }),
  update: (input: Record<string, unknown>) =>
    adminApiCall<unknown>("update_admin_announcement", { input }),
  delete: (id: string) => adminApiCall<void>("delete_admin_announcement", { id }),
};

// Subscription Invoices commands
export const adminSubscriptionInvoicesApi = {
  getAll: (filters?: { status?: string }) =>
    adminApiCall<unknown[]>("get_admin_subscription_invoices", filters as Record<string, unknown>),
  getById: (id: string) => adminApiCall<unknown>("get_admin_subscription_invoice", { id }),
  markPaid: (id: string, input: Record<string, unknown>) =>
    adminApiCall<unknown>("mark_subscription_invoice_paid", { id, input }),
};

// Onboarding commands
export const adminOnboardingApi = {
  getAll: () => adminApiCall<unknown>("get_admin_onboarding"),
  getByTenant: (tenantId: string) =>
    adminApiCall<unknown>("get_admin_tenant_onboarding", { tenantId }),
};

// Data Requests commands
export const adminDataRequestsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_data_requests"),
  create: (input: Record<string, unknown>) =>
    adminApiCall<unknown>("create_admin_data_request", { input }),
  download: (id: string) => adminApiCall<unknown>("download_admin_data_request", { id }),
};

// Referrals commands
export const adminReferralsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_referrals"),
  getByTenant: (tenantId: string) =>
    adminApiCall<unknown[]>("get_admin_tenant_referrals", { tenantId }),
};

// System commands
export const adminSystemApi = {
  getHealth: () => adminApiCall<unknown>("get_admin_system_health"),
  getErrors: () => adminApiCall<unknown[]>("get_admin_system_errors"),
};

// Rate Limits commands
export const adminRateLimitsApi = {
  getAll: () => adminApiCall<unknown[]>("get_admin_rate_limits"),
};

// Tenant-facing Subscription commands
export const tenantSubscriptionApi = {
  getCurrent: () => adminApiCall<unknown>("get_current_subscription"),
  request: (input: Record<string, unknown>) =>
    adminApiCall<unknown>("request_subscription", { input }),
  getAvailablePlans: () => adminApiCall<unknown[]>("get_available_plans"),
  validateCoupon: (input: Record<string, unknown>) =>
    adminApiCall<unknown>("validate_coupon", { input }),
};

// Tenant-facing Announcements commands
export const tenantAnnouncementsApi = {
  getActive: () => adminApiCall<unknown[]>("get_active_announcements"),
  dismiss: (id: string) => adminApiCall<void>("dismiss_announcement", { id }),
};
