// Dedicated client for the private marketing-agent portal. It never uses the staff api()
// adapter or bearer token; it has its own sessionStorage key and header.
import type { MarketingBlueprint } from '@workspace/api-client-react';
export interface MarketingPolicy { pinLength: number; deadlineHours: number; statusLabels: Record<string, string> }
export interface InvitationInfo { projectName: string; firmName: string; agentName: string; policy: MarketingPolicy }
export interface MarketingSession {
  token: string; mustChangePin: boolean; agentName: string; mobile: string;
  policy: MarketingPolicy; projectName: string; firmName: string;
}
export interface MarketingPlot {
  id: string; plotNumber: string; areaSqYards: number; facing: string; dimensions?: string | null;
  roadWidthFt?: number | null; status: string; ratePerSqYard?: number | null; requestPending: boolean;
}
export interface MarketingInventory {
  project: { id: string; name: string; code: string; floorRatePerSqYard?: number | null };
  firm: { name: string };
  agent: { name: string; mobile: string };
  plots: MarketingPlot[];
  policy: MarketingPolicy;
}
export interface ProposalInput {
  plotId: string; buyerName: string; buyerPhone: string; proposedRatePerSqYard: number;
  proposedAdvanceAmount: number; tokenDeadlineHours: number; notes: string;
}

export class MarketingApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

const KEY = 'sos_marketing_session';
const BASE = '/api/marketing/access';
const url = (p: string) => new URL(`${BASE}${p}`, window.location.origin).href;

interface Stored { invite: string; token: string }
export function readStored(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.invite === 'string' && typeof v.token === 'string' ? v : null;
  } catch { return null; }
}
export function storeSession(invite: string, token: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ invite, token }));
    if (readStored()?.token !== token) throw new Error('verify');
  } catch {
    try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    throw new MarketingApiError(0, 'STORAGE_UNAVAILABLE', 'This browser blocked session storage, so you cannot be signed in securely. Enable site storage and try again.');
  }
}
export function clearStored() { try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ } }

async function call<T>(path: string, o: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (o.token) headers['X-Marketing-Session'] = o.token;
  let body: string | undefined;
  if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
  let res: Response;
  try {
    // Same-origin cookies are needed by the preview proxy, not by Spring authentication.
    // Application authority comes exclusively from this client's X-Marketing-Session.
    res = await fetch(url(path), { method: o.method || (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', redirect: 'manual' });
  } catch {
    throw new MarketingApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and retry.');
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new MarketingApiError(0, 'REDIRECT', 'The request was redirected and has not completed. Reload the link and retry.');
  }
  const text = await res.text();
  let data: any = null;
  let parsed = true;
  try { data = text ? JSON.parse(text) : null; } catch { parsed = false; }
  if (res.ok && text && !parsed) throw new MarketingApiError(res.status, 'UNEXPECTED_RESPONSE', 'The server returned a web page instead of data. Reload and retry.');
  if (!res.ok) {
    if (res.status === 401 && o.token) {
      clearStored();
      window.dispatchEvent(new CustomEvent('sos-marketing-session-expired'));
    }
    throw new MarketingApiError(res.status, data?.error || `HTTP_${res.status}`, data?.message || `Request failed (HTTP ${res.status}).`);
  }
  return data as T;
}

const q = (invite: string) => `?invite=${encodeURIComponent(invite)}`;

export const marketingApi = {
  invitation: (invite: string) => call<InvitationInfo>(`/invitation${q(invite)}`),
  login: (invite: string, mobile: string, pin: string) =>
    call<MarketingSession>('/login', { body: { invite, mobile, pin } }),
  session: (invite: string, token: string) => call<MarketingSession>(`/session${q(invite)}`, { token }),
  changePin: (invite: string, newPin: string, token: string) =>
    call<MarketingSession>('/pin', { body: { invite, newPin }, token }),
  inventory: (invite: string, token: string) => call<MarketingInventory>(`/inventory${q(invite)}`, { token }),
  blueprint: (invite: string, token: string) => call<MarketingBlueprint>(`/blueprint${q(invite)}`, { token }),
  propose: (invite: string, token: string, p: ProposalInput) =>
    call<{ id: string; status: string }>('/proposals', { token, body: { invite, ...p, requestId: crypto.randomUUID() } }),
  logout: (token: string) => call<{ ok: boolean }>('/logout', { method: 'POST', token }),
};
