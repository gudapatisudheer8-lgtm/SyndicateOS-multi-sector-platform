/** Personal marketing invitations use the existing staff API; credentials live in memory only. */
export interface InviteResponse {
  invitationToken: string;
  created: boolean;
  requiresPinChange: boolean;
  temporaryPin?: string;
  /** Server-issued first-use deadline, not a fixed expiry of activated access. */
  activationExpiresAt?: string;
}
export interface InvitePayload extends InviteResponse { url: string; mobile: string }
export interface InviteRequest { projectId: string; agentName: string; mobile: string }

export function normalizeAgentMobile(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

const previewHost = (host: string) => host.endsWith('.replit.dev');
const expoHost = (host: string) => host.includes('.expo.');
function configuredOrigin(domain?: string): URL | null {
  if (!domain?.trim()) return null;
  // EXPO_PUBLIC_DOMAIN is the same bare, public API hostname used by native-api.ts and eas.json.
  if (domain !== domain.trim() || /[/:?#@\\\s]/.test(domain)) throw new Error('The application domain is not configured correctly.');
  const url = new URL(`https://${domain}`);
  if (!url.hostname || expoHost(url.hostname)) throw new Error('Configure the main application domain, not the Expo preview domain.');
  return url;
}

/** Web runs at / on the existing EC2 release; its registered Preview base is /syndicateos-web/. */
export function marketingPortalEntry(input: { platform: string; domain?: string; origin?: string; development: boolean }): string {
  if (input.platform === 'web') {
    if (!input.origin) throw new Error('The web marketing portal location is unavailable.');
    const origin = new URL(input.origin);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
        !['http:', 'https:'].includes(origin.protocol)) throw new Error('The web application origin is invalid.');
    if (previewHost(origin.hostname)) {
      const main = configuredOrigin(input.domain) ?? (!expoHost(origin.hostname) ? origin : null);
      if (!main || !previewHost(main.hostname)) throw new Error('The main Preview application domain is required before sharing.');
      return new URL('/syndicateos-web/marketing', main).href;
    }
    if (origin.protocol !== 'https:' && !input.development) throw new Error('Marketing invitations require a secure application URL.');
    return new URL('/marketing', origin).href;
  }
  const origin = configuredOrigin(input.domain);
  if (!origin) throw new Error('The application domain is required before sharing a marketing invitation.');
  return new URL(previewHost(origin.hostname) ? '/syndicateos-web/marketing' : '/marketing', origin).href;
}

export function invitationExpiryText(activationExpiresAt?: string): string {
  if (!activationExpiresAt || !Number.isFinite(Date.parse(activationExpiresAt))) {
    return 'Activation deadline unavailable from this server. Ask the office to confirm it; update the API to display the exact deadline.';
  }
  const deadline = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata', timeZoneName: 'short',
  }).format(new Date(activationExpiresAt));
  return `Activate this link by ${deadline}. After activation, access remains available while the invitation, employee and project stay enabled. Sign-in sessions expire separately.`;
}

export function invitationMessage({ projectName, firmName, invite }: { projectName: string; firmName: string; invite: InvitePayload }): string {
  const access = invite.requiresPinChange
    ? invite.temporaryPin
      ? `Your temporary PIN: ${invite.temporaryPin}\nYou must set your own new PIN the first time you sign in.`
      : 'Use the temporary PIN given by the office. You must set your own new PIN the first time you sign in.'
    : 'Sign in with your mobile number and your existing PIN.';
  return `${projectName} - Plot Inventory & Booking Requests\n\nYour personal link:\n${invite.url}\n\n${access}\n\n${invitationExpiryText(invite.activationExpiresAt)}\n\nPromoted by ${firmName}.`;
}

export class InvitationCancelledError extends Error {
  constructor() { super('Invitation sharing was closed or the selected project changed.'); this.name = 'InvitationCancelledError'; }
}

/**
 * Scope one instance to a keyed project/account dialog. Deduplicate rapid taps and retain the full
 * first response across sharing/copy failures. Closing the scope clears all private payloads.
 */
export class InvitationMemory {
  private cache = new Map<string, InvitePayload>();
  private pending = new Map<string, Promise<InvitePayload>>();
  private projectId: string | null = null;
  private disposed = false;
  constructor(private readonly now: () => number = Date.now) {}

  async obtain(
    input: { projectId: string; agentName: string; mobile: string; portalEntry: string },
    create: (body: InviteRequest) => Promise<InviteResponse>,
  ): Promise<InvitePayload> {
    if (this.disposed) throw new InvitationCancelledError();
    const agentName = input.agentName.trim(), mobile = normalizeAgentMobile(input.mobile);
    if (!input.projectId) throw new Error('Select a project before sharing a portal link.');
    if (!agentName || agentName.length > 100) throw new Error('Enter an agent name of 1 to 100 characters.');
    if (!mobile) throw new Error('Enter a valid 10-digit Indian mobile number for the agent.');
    const entry = new URL(input.portalEntry);
    if (!['https:', 'http:'].includes(entry.protocol) || entry.username || entry.password ||
        entry.search || entry.hash || !entry.pathname.endsWith('/marketing') || expoHost(entry.hostname)) {
      throw new Error('The marketing portal location is not configured correctly.');
    }
    if (this.projectId && this.projectId !== input.projectId) throw new InvitationCancelledError();
    this.projectId = input.projectId;
    const key = JSON.stringify([input.projectId, agentName.toLowerCase(), mobile, entry.href]);
    const cached = this.cache.get(key);
    // A deliberate Share/Copy after the deadline gets a fresh link; never create on sheet open.
    // This does not revoke an old link that has already been activated.
    if (cached && (!cached.activationExpiresAt || Date.parse(cached.activationExpiresAt) > this.now())) return cached;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = (async () => {
      const response = await create({ projectId: input.projectId, agentName, mobile });
      if (this.disposed) throw new InvitationCancelledError();
      if (!response || !/^[A-Za-z0-9_-]{43}$/.test(response.invitationToken) ||
          typeof response.created !== 'boolean' || typeof response.requiresPinChange !== 'boolean') {
        throw new Error('The server did not return a valid personal invitation.');
      }
      if (response.activationExpiresAt !== undefined &&
          (typeof response.activationExpiresAt !== 'string' || !Number.isFinite(Date.parse(response.activationExpiresAt)))) {
        throw new Error('The server returned an invalid invitation activation deadline.');
      }
      const payload: InvitePayload = {
        invitationToken: response.invitationToken, created: response.created,
        requiresPinChange: response.requiresPinChange, mobile,
        url: `${entry.href}?invite=${encodeURIComponent(response.invitationToken)}`,
        ...(response.activationExpiresAt ? { activationExpiresAt: response.activationExpiresAt } : {}),
        ...(response.requiresPinChange && response.temporaryPin && /^\d{4,12}$/.test(response.temporaryPin)
          ? { temporaryPin: response.temporaryPin } : {}),
      };
      this.cache.set(key, payload);
      return payload;
    })();
    this.pending.set(key, request);
    try { return await request; }
    finally { if (this.pending.get(key) === request) this.pending.delete(key); }
  }

  dispose(): void { this.disposed = true; this.cache.clear(); this.pending.clear(); }
}
