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

export interface MeUser {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "customer";
  status: "active" | "suspended";
  balance: number;
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

  // Email send (proxies upstream)
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
};
