import React, { useState, useRef, useEffect, useMemo } from 'react';
import { api, ApiError } from '../../../adapter/api';
import { MarketingRequestsPanel } from '../../../marketing/MarketingRequestsPanel';
import { Plot, Project, TenantFirm, MarketingBookingRequest } from '../../types';
import { formatINR } from '../../utils/formatters';
import { Share2, Copy, Check, X, Compass, Phone, User, Lock, MessageSquare } from 'lucide-react';

interface MarketingPlotPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  plots: Plot[];
  project?: Project;
  firm: TenantFirm;
  floorRate?: number;
  /** Kept for caller compatibility only. Staff never submit proposals; agents use their personal invite. */
  onSubmitProposal?: (plotId: number, proposal: MarketingBookingRequest) => void;
  onMarketingChanged?: () => void;
}

interface InvitePayload {
  invitationToken: string;
  created: boolean;
  requiresPinChange: boolean;
  temporaryPin?: string;
  activationExpiresAt?: string;
  url: string;
  mobile: string;
}

const normalizeMobile = (v: string): string | null => {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
};

const activationDeadlineText = (expiresAt?: string): string => {
  if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) return 'Activation deadline unavailable from this server. Ask the office to confirm it; update the API to display the exact deadline.';
  const date = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata', timeZoneName: 'short',
  }).format(new Date(expiresAt));
  return `Activate this link by ${date}. After activation, access remains available while the invitation, employee and project stay enabled. Sign-in sessions expire separately.`;
};

export const MarketingPlotPortalModal: React.FC<MarketingPlotPortalModalProps> = ({
  isOpen,
  onClose,
  plots,
  project,
  firm,
  floorRate,
  onMarketingChanged,
}) => {
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'blocked' | 'booked' | 'sold'>('all');
  const [facingFilter, setFacingFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [issuedPin, setIssuedPin] = useState<string | null>(null);
  const [visibleInvite, setVisibleInvite] = useState<InvitePayload | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // In-memory only, never persisted. Holds the full server payload so a first share never loses the PIN.
  const inviteCache = useRef<Map<string, InvitePayload>>(new Map());
  const inviteLock = useRef(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const pinTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearTimeout(copyTimer.current);
    window.clearTimeout(pinTimer.current);
    inviteCache.current.clear();
  }, []);
  useEffect(() => {
    if (!isOpen) {
      inviteCache.current.clear();
      setIssuedPin(null);
      setVisibleInvite(null);
      setInviteError(null);
      setManualUrl(null);
    }
  }, [isOpen]);

  const facings = useMemo(() => Array.from(new Set(plots.map((p) => p.facing).filter(Boolean))).sort(), [plots]);

  if (!isOpen) return null;

  const hasFloor = typeof floorRate === 'number' && floorRate > 0;
  const rateText = (r?: number) => (typeof r === 'number' && r > 0 ? `${formatINR(r)}/Sq.Yd` : hasFloor ? `${formatINR(floorRate as number)}/Sq.Yd` : 'Not specified');

  const buildUrl = (token: string) =>
    new URL(`${import.meta.env.BASE_URL}marketing?invite=${encodeURIComponent(token)}`, window.location.origin).href;

  const obtainInvite = async (): Promise<InvitePayload | null> => {
    if (inviteLock.current) return null;
    setInviteError(null);
    const name = agentName.trim();
    const mobile = normalizeMobile(agentPhone);
    if (!project?.id) { setInviteError('Select a project before sharing a portal link.'); return null; }
    if (!name) { setInviteError('Agent name is required to create a personal link.'); return null; }
    if (!mobile) { setInviteError('Enter a valid 10-digit Indian mobile number for the agent.'); return null; }
    const key = `${project.id}|${name.toLowerCase()}|${mobile}`;
    const cached = inviteCache.current.get(key);
    if (cached && (!cached.activationExpiresAt || Date.parse(cached.activationExpiresAt) > Date.now())) { showPin(cached); return cached; }
    inviteLock.current = true;
    setInvitePending(true);
    try {
      const r = await api<{ invitationToken: string; created: boolean; requiresPinChange: boolean; temporaryPin?: string; activationExpiresAt?: string }>(
        '/marketing/invitations', { method: 'POST', body: { projectId: project.id, agentName: name, mobile } });
      if (!r?.invitationToken) throw new ApiError(0, 'UNEXPECTED_RESPONSE', 'The server did not return an invitation.');
      if (r.activationExpiresAt !== undefined && (typeof r.activationExpiresAt !== 'string' || !Number.isFinite(Date.parse(r.activationExpiresAt))))
        throw new ApiError(0, 'UNEXPECTED_RESPONSE', 'The server returned an invalid invitation activation deadline.');
      const payload: InvitePayload = { ...r, url: buildUrl(r.invitationToken), mobile };
      inviteCache.current.set(key, payload);
      showPin(payload);
      return payload;
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not create the invitation.');
      return null;
    } finally {
      inviteLock.current = false;
      setInvitePending(false);
    }
  };

  function showPin(p: InvitePayload) {
    setVisibleInvite(p);
    window.clearTimeout(pinTimer.current);
    if (p.requiresPinChange && p.temporaryPin) {
      setIssuedPin(p.temporaryPin);
      pinTimer.current = window.setTimeout(() => setIssuedPin(null), 90000);
    } else setIssuedPin(null);
  }

  const handleCopyLink = async () => {
    setCopiedLink(false);
    setManualUrl(null);
    const inv = await obtainInvite();
    if (!inv) return;
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopiedLink(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setManualUrl(inv.url);
      setInviteError('Your browser blocked copying. Copy the personal link below manually.');
    }
  };

  const handleOpenWhatsApp = async () => {
    setManualUrl(null);
    const inv = await obtainInvite();
    if (!inv) return;
    const access = inv.requiresPinChange
      ? (inv.temporaryPin
          ? `Your temporary PIN: ${inv.temporaryPin}\nYou must set your own new PIN the first time you sign in.`
          : 'Use the temporary PIN given by the office. You must set your own new PIN the first time you sign in.')
      : 'Sign in with your mobile number and your existing PIN.';
    const text = encodeURIComponent(
      `*${project?.name || 'Project'} - Plot Inventory & Booking Requests*\n\n` +
       `Your personal link:\n${inv.url}\n\n${access}\n\n${activationDeadlineText(inv.activationExpiresAt)}\n\nPromoted by ${firm?.name}.`
    );
    const opened = window.open(`https://api.whatsapp.com/send?phone=${inv.mobile.replace(/\D/g, '')}&text=${text}`, '_blank', 'noopener');
    if (!opened) {
      setManualUrl(inv.url);
      setInviteError('Your browser blocked the WhatsApp window. Copy the personal link below and send it manually.');
    }
  };

  const filteredPlots = plots.filter((plot) => {
    if (statusFilter === 'available' && plot.status !== 'available') return false;
    if (statusFilter === 'blocked' && plot.status !== 'blocked') return false;
    if (statusFilter === 'booked' && plot.status !== 'reserved') return false;
    if (statusFilter === 'sold' && plot.status !== 'sold') return false;
    if (facingFilter !== 'all' && plot.facing !== facingFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const hit = plot.plotNumber.toLowerCase().includes(q) || plot.facing.toLowerCase().includes(q) ||
        plot.blockName?.toLowerCase().includes(q) || plot.blockedByAgent?.toLowerCase().includes(q) ||
        plot.marketingRequest?.agentName?.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const count = (s: Plot['status']) => plots.filter((p) => p.status === s).length;
  const pill = (active: boolean, on: string, off: string) =>
    `px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${active ? on : off}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl shadow-2xl max-w-7xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-5 border-b border-indigo-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                {project?.name || 'Project'} — Marketing &amp; Channel Partner Portal
              </h2>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Promoted by <strong className="text-white">{firm?.name}</strong>. Invite each agent with a personal link; agents submit booking requests themselves.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button type="button" onClick={handleCopyLink} disabled={invitePending}
              className="disabled:opacity-60 flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer">
              {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{invitePending ? 'Creating link…' : copiedLink ? 'Link Copied!' : 'Copy Portal Link'}</span>
            </button>
            <button type="button" onClick={handleOpenWhatsApp} disabled={invitePending} title="Send to the agent on WhatsApp"
              className="disabled:opacity-60 flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer">
              <MessageSquare className="w-4 h-4 text-emerald-200" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
            <button type="button" onClick={onClose} aria-label="Close"
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {visibleInvite && <p data-testid="marketing-expiry" className="px-4 py-3 text-xs text-indigo-100 bg-slate-800 border-b border-slate-700">{activationDeadlineText(visibleInvite.activationExpiresAt)}</p>}
        {(inviteError || issuedPin || manualUrl) && (
          <div role="alert" className={`px-4 py-2.5 text-xs font-bold border-b space-y-2 ${inviteError ? 'bg-rose-950 text-rose-200 border-rose-800' : 'bg-amber-950 text-amber-200 border-amber-700'}`}>
            <div className="flex items-start justify-between gap-3">
              <span>
                {inviteError ? inviteError : null}
                {issuedPin && (
                  <span className="block">
                    New agent temporary PIN (shown briefly, share privately): <span className="font-mono text-base text-amber-300 tracking-widest">{issuedPin}</span>. The agent must change it at first sign-in.
                  </span>
                )}
              </span>
              <button type="button" onClick={() => { setInviteError(null); setIssuedPin(null); setManualUrl(null); }} className="text-white/80 hover:text-white px-1">✕</button>
            </div>
            {manualUrl && (
              <input readOnly value={manualUrl} onFocus={(e) => e.currentTarget.select()}
                className="w-full bg-slate-950 text-white font-mono text-[11px] rounded-lg border border-slate-600 px-2 py-1.5 outline-none" />
            )}
          </div>
        )}

        <MarketingRequestsPanel projectId={project?.id} onMarketingChanged={onMarketingChanged} />

        {/* Agent details (required for a personal invite) */}
        <div className="bg-slate-800/80 px-4 sm:px-6 py-3 border-b border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Agent to invite:</span>
            <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <input type="text" required placeholder="Agent / Broker Name (required)" value={agentName}
                onChange={(e) => { setAgentName(e.target.value); setVisibleInvite(null); setIssuedPin(null); setManualUrl(null); }} className="bg-transparent text-white font-bold text-xs outline-none w-48" />
            </div>
            <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <input type="text" required inputMode="tel" placeholder="+91 Mobile (required)" value={agentPhone}
                onChange={(e) => { setAgentPhone(e.target.value); setVisibleInvite(null); setIssuedPin(null); setManualUrl(null); }} className="bg-transparent text-white font-bold text-xs outline-none w-36" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/60 px-3 py-1 rounded-xl border border-amber-600/40">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span><strong>Privacy:</strong> agents never see sold or booked prices.</span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-900/60 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setStatusFilter('all')} className={pill(statusFilter === 'all', 'bg-white text-slate-950', 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>All Plots ({plots.length})</button>
            <button onClick={() => setStatusFilter('available')} className={pill(statusFilter === 'available', 'bg-emerald-500 text-slate-950', 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/80')}>Available ({count('available')})</button>
            <button onClick={() => setStatusFilter('blocked')} className={pill(statusFilter === 'blocked', 'bg-amber-400 text-slate-950', 'bg-amber-950/60 text-amber-300 border border-amber-800/80')}>Blocked ({count('blocked')})</button>
            <button onClick={() => setStatusFilter('booked')} className={pill(statusFilter === 'booked', 'bg-orange-500 text-white', 'bg-orange-950/60 text-orange-300 border border-orange-800/80')}>Token Booked ({count('reserved')})</button>
            <button onClick={() => setStatusFilter('sold')} className={pill(statusFilter === 'sold', 'bg-rose-600 text-white', 'bg-rose-950/60 text-rose-300 border border-rose-800/80')}>Sold ({count('sold')})</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={facingFilter} onChange={(e) => setFacingFilter(e.target.value)}
              className="bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold outline-none cursor-pointer">
              <option value="all">All Facings</option>
              {facings.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input type="text" placeholder="Search Plot #, Facing..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-1.5 text-xs placeholder-slate-500 outline-none w-44" />
          </div>
        </div>

        {/* Staff inventory */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="bg-slate-950/60 rounded-2xl p-3 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            <span>Staff view of saved inventory. Agents submit booking requests from their personal link.</span>
            <span className="text-[11px] text-slate-400">Project floor rate: <strong className="text-amber-400 font-mono">{hasFloor ? `${formatINR(floorRate as number)}/Sq.Yd` : 'Not specified'}</strong></span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredPlots.map((plot) => {
              const isAvailable = plot.status === 'available';
              const isBlocked = plot.status === 'blocked';
              const isReserved = plot.status === 'reserved';
              const pending = plot.marketingRequest?.status === 'pending';
              const tone = isAvailable ? 'border-emerald-500/50 bg-emerald-950/30' : isBlocked ? 'border-amber-500/50 bg-amber-950/40' : isReserved ? 'border-orange-500/40 bg-orange-950/40' : 'border-rose-900/60 bg-rose-950/40';
              const badge = isAvailable ? 'bg-emerald-500 text-slate-950' : isBlocked ? 'bg-amber-400 text-slate-950' : isReserved ? 'bg-orange-500 text-white' : 'bg-rose-600 text-white';
              return (
                <div key={plot.id} className={`rounded-2xl p-3 border text-left flex flex-col justify-between ${tone}`}>
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-mono font-black text-white text-sm">{plot.plotNumber}</span>
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${badge}`}>
                        {isAvailable ? 'Available' : isBlocked ? 'Blocked' : isReserved ? 'Booked' : 'Sold'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold mb-1">
                      <span>{plot.areaSqYards} Sq.Yds</span>
                      <span className="text-[10px] text-slate-400 font-medium">{plot.facing}</span>
                    </div>
                    {plot.dimensions && <div className="text-[10px] text-slate-400 font-mono">Dim: {plot.dimensions}</div>}
                  </div>
                  <div className="pt-2 border-t border-slate-700/60 mt-2 text-[10px] text-slate-300 space-y-0.5">
                    {isAvailable ? (
                      <>
                        <div>Rate: <strong className="text-amber-400 font-mono">{rateText(plot.ratePerSqYard)}</strong></div>
                        {pending && <div className="text-amber-300 font-bold">Request noted (no hold): {plot.marketingRequest?.agentName}</div>}
                      </>
                    ) : isBlocked ? (
                      <>
                        <div className="font-bold text-amber-300">Blocked for token</div>
                        <div className="truncate">Agent: {plot.blockedByAgent || plot.marketingRequest?.agentName || '—'}</div>
                        <div className="truncate">Client: {plot.blockedForBuyer || plot.marketingRequest?.buyerName || '—'}</div>
                      </>
                    ) : isReserved ? (
                      <div className="font-bold text-orange-300">Token confirmed</div>
                    ) : (
                      <div className="font-bold text-rose-300">Sold</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPlots.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Compass className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="font-bold">{plots.length === 0 ? 'No plots are saved for this project yet.' : 'No plots match the selected filters.'}</p>
              {plots.length > 0 && (
                <button onClick={() => { setStatusFilter('all'); setFacingFilter('all'); setSearchQuery(''); }} className="mt-2 text-xs text-indigo-400 hover:underline">
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 text-xs text-slate-400 shrink-0">
          {firm?.accountantPhone
            ? <>Support: <strong className="text-white font-mono">{firm.accountantPhone}</strong></>
            : 'For support, contact the project accountant.'}
        </div>
      </div>
    </div>
  );
};
