/**
 * SecretVoIP Mail — API client.
 * Talks to the Express backend (see /backend) at VITE_API_URL.
 * Never calls the upstream mail provider directly.
 */

const API_URL =
  (import.meta as any).env?.VITE_API_URL || "http://localhost:4000";

const TOKEN_KEY = "svm_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export interface ApiError extends Error {
  status: number;
  body?: unknown;
}

async function request<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    const err = new Error(
      (body as any)?.error || `Request failed (${res.status})`,
    ) as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export function downloadUrl(path: string): string {
  const token = getToken();
  // Stream via fetch then trigger browser download (token in header)
  return `${API_URL}${path}${token ? `?_t=${encodeURIComponent(token)}` : ""}`;
}

export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface MeUser {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "customer";
  status: "active" | "suspended";
  balance: number;
}

export interface Campaign {
  id: string;
  fromName: string;
  subject: string;
  total: number;
  accepted: number;
  failed: number;
  cost: number;
  status: "sending" | "completed" | "failed";
  createdAt: string;
  userEmail?: string;
  userName?: string;
}

export interface Recipient {
  email: string;
  accepted: boolean;
  error: string | null;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  html: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "customer";
  status: "active" | "suspended";
  balance: number;
  notes: string | null;
  createdAt: string;
}

export interface ErrorLogEntry {
  id: string;
  message: string;
  httpStatus: number | null;
  requestSummary: any;
  responseSummary: any;
  resolved: boolean;
  notes: string | null;
  createdAt: string;
  userEmail: string | null;
  campaignId: string | null;
}

export interface WalletTx {
  id: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  createdAt: string;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: MeUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<MeUser>("/api/me"),
  logout: () => {
    setToken(null);
  },

  // Dashboard
  customerStats: () =>
    request<{
      balance: number;
      sentToday: number;
      sentThisMonth: number;
      totalSpent: number;
      successRate: number;
      failureRate: number;
    }>("/api/me/stats"),

  // Email
  sendEmail: (payload: {
    fromName: string;
    subject: string;
    html: string;
    recipients: string[];
  }) =>
    request<{
      campaignId: string;
      sent: number;
      failed: number;
      total: number;
      charged: number;
      results: { email: string; ok: boolean; error?: string }[];
    }>("/api/email/send", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Campaigns
  campaigns: (opts: { all?: boolean } = {}) =>
    request<Campaign[]>(`/api/campaigns${opts.all ? "?all=1" : ""}`),
  campaign: (id: string) =>
    request<{ campaign: Campaign & { html: string; error: string | null }; recipients: Recipient[] }>(
      `/api/campaigns/${id}`,
    ),
  exportCampaignCsv: (id: string) =>
    downloadFile(`/api/campaigns/${id}/export.csv`, `campaign-${id}.csv`),

  // Templates
  templates: () => request<Template[]>("/api/templates"),
  createTemplate: (t: Pick<Template, "name" | "subject" | "html">) =>
    request<{ id: string }>("/api/templates", {
      method: "POST",
      body: JSON.stringify(t),
    }),
  updateTemplate: (id: string, t: Pick<Template, "name" | "subject" | "html">) =>
    request<{ ok: true }>(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(t),
    }),
  deleteTemplate: (id: string) =>
    request<{ ok: true }>(`/api/templates/${id}`, { method: "DELETE" }),

  // Admin
  adminOverview: () =>
    request<{
      customers: { total: number; suspended: number };
      campaigns: { total: number; accepted: number; failed: number; revenue: number; today: number };
      errors: { open: number };
    }>("/api/admin/overview"),
  adminCustomers: () => request<Customer[]>("/api/admin/customers"),
  adminCreateCustomer: (c: {
    email: string;
    fullName: string;
    password: string;
    balance: number;
    notes?: string;
  }) =>
    request<{ id: string }>("/api/admin/customers", {
      method: "POST",
      body: JSON.stringify(c),
    }),
  adminSetStatus: (id: string, status: "active" | "suspended") =>
    request<{ ok: true }>(`/api/admin/customers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  adminResetPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/admin/customers/${id}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  adminWalletOp: (id: string, amount: number, reason: string) =>
    request<{ ok: true; balance: number }>(
      `/api/admin/customers/${id}/wallet`,
      { method: "POST", body: JSON.stringify({ amount, reason }) },
    ),
  adminWalletHistory: (id: string) =>
    request<WalletTx[]>(`/api/admin/customers/${id}/wallet`),
  adminAudit: () =>
    request<
      {
        id: string;
        action: string;
        changes: any;
        createdAt: string;
        adminEmail: string | null;
        targetEmail: string | null;
      }[]
    >("/api/admin/audit"),
  adminErrors: () => request<ErrorLogEntry[]>("/api/admin/errors"),
  adminResolveError: (id: string, notes?: string) =>
    request<{ ok: true }>(`/api/admin/errors/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  adminDiagnostics: () =>
    request<{ db: boolean; uptimeSec: number; timestamp: string; latencyMs: number }>(
      "/api/admin/diagnostics",
    ),

  // Settings
  settings: () => request<Record<string, any>>("/api/settings"),
  publicSettings: () => request<Record<string, any>>("/api/settings/public"),
  updateSetting: (key: string, value: any) =>
    request<{ ok: true }>(`/api/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
};
