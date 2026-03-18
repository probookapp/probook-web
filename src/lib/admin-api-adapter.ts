import { API_BASE_URL } from "./config";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface EndpointDef {
  method: HttpMethod;
  path: string | ((args: Record<string, unknown>) => string);
  /** Extract body from args (default: send full args as body for POST/PUT) */
  body?: (args: Record<string, unknown>) => unknown;
  /** Extract query params from args for GET requests */
  query?: (args: Record<string, unknown>) => Record<string, string>;
}

// Maps command names to REST API endpoints
const COMMAND_MAP: Record<string, EndpointDef> = {
  // Admin Auth
  admin_login: { method: "POST", path: "/api/admin/auth/login", body: (a) => a.input },
  admin_logout: { method: "POST", path: "/api/admin/auth/logout" },
  admin_get_me: { method: "GET", path: "/api/admin/auth/me" },

  // Plans
  get_admin_plans: { method: "GET", path: "/api/admin/plans" },
  get_admin_plan: { method: "GET", path: (a) => `/api/admin/plans/${a.id}` },
  create_admin_plan: { method: "POST", path: "/api/admin/plans", body: (a) => a.input },
  update_admin_plan: {
    method: "PUT",
    path: (a) => `/api/admin/plans/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_admin_plan: { method: "DELETE", path: (a) => `/api/admin/plans/${a.id}` },

  // Tenants
  get_admin_tenants: { method: "GET", path: "/api/admin/tenants" },
  get_admin_tenant: { method: "GET", path: (a) => `/api/admin/tenants/${a.id}` },
  update_admin_tenant: {
    method: "PUT",
    path: (a) => `/api/admin/tenants/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_admin_tenant: { method: "DELETE", path: (a) => `/api/admin/tenants/${a.id}` },
  suspend_admin_tenant: {
    method: "POST",
    path: (a) => `/api/admin/tenants/${a.id}/suspend`,
  },
  activate_admin_tenant: {
    method: "POST",
    path: (a) => `/api/admin/tenants/${a.id}/activate`,
  },
  impersonate_tenant: {
    method: "POST",
    path: (a) => `/api/admin/tenants/${a.id}/impersonate`,
  },
  stop_impersonation: {
    method: "POST",
    path: "/api/admin/tenants/stop-impersonation",
  },

  // Platform Admins
  get_platform_admins: { method: "GET", path: "/api/admin/platform-admins" },
  create_platform_admin: {
    method: "POST",
    path: "/api/admin/platform-admins",
    body: (a) => a.input,
  },
  update_platform_admin: {
    method: "PUT",
    path: (a) => `/api/admin/platform-admins/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_platform_admin: {
    method: "DELETE",
    path: (a) => `/api/admin/platform-admins/${a.id}`,
  },

  // Users
  get_admin_users: { method: "GET", path: "/api/admin/users" },
  disable_admin_user: {
    method: "POST",
    path: (a) => `/api/admin/users/${a.id}/disable`,
  },
  reset_admin_user_password: {
    method: "POST",
    path: (a) => `/api/admin/users/${a.id}/reset-password`,
    body: (a) => a.input,
  },

  // Subscriptions
  get_admin_subscriptions: { method: "GET", path: "/api/admin/subscriptions" },
  get_admin_subscription: {
    method: "GET",
    path: (a) => `/api/admin/subscriptions/${a.id}`,
  },
  renew_admin_subscription: {
    method: "POST",
    path: (a) => `/api/admin/subscriptions/${a.id}/renew`,
    body: (a) => a.input,
  },
  cancel_admin_subscription: {
    method: "POST",
    path: (a) => `/api/admin/subscriptions/${a.id}/cancel`,
  },

  // Subscription Requests
  get_admin_subscription_requests: {
    method: "GET",
    path: "/api/admin/subscription-requests",
  },
  approve_subscription_request: {
    method: "POST",
    path: (a) => `/api/admin/subscription-requests/${a.id}/approve`,
  },
  reject_subscription_request: {
    method: "POST",
    path: (a) => `/api/admin/subscription-requests/${a.id}/reject`,
    body: (a) => a.input,
  },

  // Coupons
  get_admin_coupons: { method: "GET", path: "/api/admin/coupons" },
  create_admin_coupon: {
    method: "POST",
    path: "/api/admin/coupons",
    body: (a) => a.input,
  },
  update_admin_coupon: {
    method: "PUT",
    path: (a) => `/api/admin/coupons/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_admin_coupon: { method: "DELETE", path: (a) => `/api/admin/coupons/${a.id}` },

  // Features
  get_admin_features: { method: "GET", path: "/api/admin/features" },
  create_admin_feature: {
    method: "POST",
    path: "/api/admin/features",
    body: (a) => a.input,
  },
  update_admin_feature: {
    method: "PUT",
    path: (a) => `/api/admin/features/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  get_tenant_features: {
    method: "GET",
    path: (a) => `/api/admin/features/tenant/${a.tenantId}`,
  },
  update_tenant_features: {
    method: "PUT",
    path: (a) => `/api/admin/features/tenant/${a.tenantId}`,
    body: (a) => a.input,
  },

  // Analytics
  get_admin_analytics_overview: {
    method: "GET",
    path: "/api/admin/analytics/overview",
  },
  get_admin_analytics_signups: {
    method: "GET",
    path: "/api/admin/analytics/signups",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.startDate) q.startDate = String(a.startDate);
      if (a.endDate) q.endDate = String(a.endDate);
      return q;
    },
  },
  get_admin_analytics_revenue: {
    method: "GET",
    path: "/api/admin/analytics/revenue",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.startDate) q.startDate = String(a.startDate);
      if (a.endDate) q.endDate = String(a.endDate);
      return q;
    },
  },
  get_admin_analytics_subscriptions: {
    method: "GET",
    path: "/api/admin/analytics/subscriptions",
  },

  // Audit Logs
  get_admin_audit_logs: {
    method: "GET",
    path: "/api/admin/audit-logs",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.page) q.page = String(a.page);
      if (a.limit) q.limit = String(a.limit);
      if (a.action) q.action = String(a.action);
      if (a.adminId) q.adminId = String(a.adminId);
      if (a.tenantId) q.tenantId = String(a.tenantId);
      return q;
    },
  },

  // Announcements
  get_admin_announcements: { method: "GET", path: "/api/admin/announcements" },
  create_admin_announcement: {
    method: "POST",
    path: "/api/admin/announcements",
    body: (a) => a.input,
  },
  update_admin_announcement: {
    method: "PUT",
    path: (a) => `/api/admin/announcements/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_admin_announcement: {
    method: "DELETE",
    path: (a) => `/api/admin/announcements/${a.id}`,
  },

  // Subscription Invoices
  get_admin_subscription_invoices: {
    method: "GET",
    path: "/api/admin/subscription-invoices",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.status) q.status = String(a.status);
      return q;
    },
  },
  get_admin_subscription_invoice: {
    method: "GET",
    path: (a) => `/api/admin/subscription-invoices/${a.id}`,
  },
  mark_subscription_invoice_paid: {
    method: "POST",
    path: (a) => `/api/admin/subscription-invoices/${a.id}/mark-paid`,
    body: (a) => a.input,
  },

  // Onboarding
  get_admin_onboarding: { method: "GET", path: "/api/admin/onboarding" },
  get_admin_tenant_onboarding: {
    method: "GET",
    path: (a) => `/api/admin/onboarding/tenant/${a.tenantId}`,
  },

  // Data Requests
  get_admin_data_requests: { method: "GET", path: "/api/admin/data-requests" },
  create_admin_data_request: {
    method: "POST",
    path: "/api/admin/data-requests",
    body: (a) => a.input,
  },
  download_admin_data_request: {
    method: "GET",
    path: (a) => `/api/admin/data-requests/${a.id}/download`,
  },

  // Referrals
  get_admin_referrals: { method: "GET", path: "/api/admin/referrals" },
  get_admin_tenant_referrals: {
    method: "GET",
    path: (a) => `/api/admin/referrals/tenant/${a.tenantId}`,
  },

  // System
  get_admin_system_health: { method: "GET", path: "/api/admin/system/health" },
  get_admin_system_errors: { method: "GET", path: "/api/admin/system/errors" },

  // Rate Limits
  get_admin_rate_limits: { method: "GET", path: "/api/admin/rate-limits" },

  // Tenant-facing Subscription
  get_current_subscription: { method: "GET", path: "/api/subscription/current" },
  request_subscription: {
    method: "POST",
    path: "/api/subscription/request",
    body: (a) => a.input,
  },
  get_available_plans: { method: "GET", path: "/api/subscription/plans" },
  validate_coupon: {
    method: "POST",
    path: "/api/subscription/validate-coupon",
    body: (a) => a.input,
  },

  // Tenant-facing Announcements
  get_active_announcements: { method: "GET", path: "/api/announcements" },
  dismiss_announcement: {
    method: "POST",
    path: (a) => `/api/announcements/${a.id}/dismiss`,
  },
};

/**
 * Unified admin API call.
 * Maps command names to REST endpoints and uses fetch.
 * No offline queueing - admin dashboard requires connectivity.
 */
export async function adminApiCall<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const endpoint = COMMAND_MAP[command];
  if (!endpoint) {
    throw new Error(`Unknown command: ${command}. No REST mapping found.`);
  }

  const path =
    typeof endpoint.path === "function"
      ? endpoint.path(args || {})
      : endpoint.path;

  let url = `${API_BASE_URL}${path}`;

  // Append query parameters for GET requests
  if (endpoint.query && args) {
    const params = endpoint.query(args);
    const searchParams = new URLSearchParams(params);
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const fetchOpts: RequestInit = {
    method: endpoint.method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  };

  if (
    (endpoint.method === "POST" || endpoint.method === "PUT") &&
    args
  ) {
    const bodyData = endpoint.body ? endpoint.body(args) : args;
    if (bodyData !== undefined) {
      fetchOpts.body = JSON.stringify(bodyData);
    }
  }

  const res = await fetch(url, fetchOpts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  // Handle empty responses (204 No Content, or empty body)
  const contentType = res.headers.get("content-type");
  if (
    res.status === 204 ||
    !contentType ||
    !contentType.includes("application/json")
  ) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
