import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarketingBlueprint } from './MarketingBlueprint';
import {
  marketingApi, readStored, storeSession, clearStored, MarketingApiError,
  type MarketingSession, type MarketingInventory, type MarketingPlot, type InvitationInfo,
} from './marketingApi';

type Phase = 'loading' | 'missing' | 'invalid' | 'login' | 'pin' | 'inventory';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Retry.');
const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200';
const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600';
const btnPrimary = 'rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-400 disabled:opacity-60';

function Shell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      {header}
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      <h1 className="text-xl font-black text-slate-900">{title}</h1>
      {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function MarketingAccessPage({ invitation }: { invitation: string | null }) {
  const invite = invitation && invitation.trim() ? invitation.trim() : null;
  const [phase, setPhase] = useState<Phase>(invite ? 'loading' : 'missing');
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [session, setSession] = useState<MarketingSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const applySession = useCallback((s: MarketingSession) => {
    tokenRef.current = s.token;
    setSession(s);
    setPhase(s.mustChangePin ? 'pin' : 'inventory');
  }, []);
  const dropSession = useCallback((message?: string) => {
    tokenRef.current = null;
    clearStored();
    setSession(null);
    setPhase((p) => (p === 'missing' || p === 'invalid' ? p : 'login'));
    if (message) setNotice(message);
  }, []);

  useEffect(() => {
    const h = () => dropSession('Your session expired. Sign in again.');
    window.addEventListener('sos-marketing-session-expired', h);
    return () => window.removeEventListener('sos-marketing-session-expired', h);
  }, [dropSession]);

  useEffect(() => {
    if (!invite) { setPhase('missing'); return; }
    let live = true;
    setPhase('loading');
    (async () => {
      try {
        const i = await marketingApi.invitation(invite);
        if (!live) return;
        setInfo(i);
      } catch (e) {
        if (!live) return;
        if (e instanceof MarketingApiError && (e.status === 404 || e.status === 400 || e.status === 410 || e.status === 403)) {
          setNotice(e.message); setPhase('invalid');
        } else { setNotice(msg(e)); setPhase('invalid'); }
        return;
      }
      const st = readStored();
      if (st && st.invite !== invite) { clearStored(); st && setNotice('A previous sign-in for a different invitation was cleared. Sign in for this one.'); }
      else if (st) {
        try {
          const s = await marketingApi.session(invite, st.token);
          if (!live) return;
          applySession({ ...s, token: s.token || st.token });
          return;
        } catch (e) {
          if (!live) return;
          if (!(e instanceof MarketingApiError && e.status === 401)) setNotice(msg(e));
          else clearStored();
        }
      }
      if (live) setPhase('login');
    })();
    return () => { live = false; };
  }, [invite, applySession]);

  const logout = async () => {
    const t = tokenRef.current;
    dropSession();
    setNotice(null);
    if (t) { try { await marketingApi.logout(t); } catch { /* local session already cleared */ } }
  };

  if (phase === 'loading') {
    return <Shell><div className="mx-auto mt-10 h-40 max-w-md animate-pulse rounded-3xl bg-slate-200" /></Shell>;
  }
  if (phase === 'missing') {
    return <Shell><Card title="Invitation link needed" sub="Open the personal link your sales office sent you. This page cannot be used without it." children={null} /></Shell>;
  }
  if (phase === 'invalid') {
    return <Shell><Card title="This link is not valid" sub={notice || 'The invitation is invalid or no longer active. Ask the office for a fresh link.'} children={null} /></Shell>;
  }
  if (phase === 'login' && invite && info) {
    return <Shell><LoginCard invite={invite} info={info} notice={notice} onSession={(s) => { setNotice(null); applySession(s); }} /></Shell>;
  }
  if (phase === 'pin' && invite && session) {
    return (
      <Shell>
        <PinCard invite={invite} session={session} onDone={(s) => applySession(s)} onExpired={() => dropSession('Your session expired. Sign in again.')} onCancel={logout} />
      </Shell>
    );
  }
  if (phase === 'inventory' && invite && session) {
    return <Inventory invite={invite} session={session} tokenRef={tokenRef} onLogout={logout} onExpired={() => dropSession('Your session expired. Sign in again.')} />;
  }
  return null;
}

function LoginCard({ invite, info, notice, onSession }: { invite: string; info: InvitationInfo; notice: string | null; onSession: (s: MarketingSession) => void }) {
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const digits = mobile.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) { setErr('Enter your 10-digit mobile number.'); return; }
    // Sign-in accepts the stored temporary OR personal credential. Only a new
    // credential must match today's configured pinLength (enforced in PinCard/API).
    if (!/^\d+$/.test(pin)) { setErr('Enter your temporary PIN or your saved marketing PIN.'); return; }
    setBusy(true);
    try {
      const s = await marketingApi.login(invite, `+91${digits}`, pin);
      storeSession(invite, s.token);
      onSession(s);
    } catch (e2) { clearStored(); setErr(msg(e2)); } finally { setBusy(false); }
  };
  return (
    <Card title={info.projectName} sub={`${info.firmName} · Invitation for ${info.agentName}. Sign in with your mobile number and PIN.`}>
      {notice && <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">{notice}</p>}
      <form onSubmit={submit} className="space-y-4">
        <div><label className={labelCls}>Mobile number</label>
          <input className={inputCls} inputMode="tel" autoComplete="username" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit mobile" /></div>
        <div><label className={labelCls}>PIN</label>
          <input className={inputCls} type="password" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={12} /></div>
        {err && <p role="alert" className="text-xs font-bold text-rose-700">{err}</p>}
        <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Card>
  );
}

function PinCard({ invite, session, onDone, onExpired, onCancel }: { invite: string; session: MarketingSession; onDone: (s: MarketingSession) => void; onExpired: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const len = session.policy.pinLength;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    if (pin.length !== len) { setErr(`New PIN must be ${len} characters.`); return; }
    if (pin !== again) { setErr('The two PINs do not match.'); return; }
    setBusy(true);
    try {
      const s = await marketingApi.changePin(invite, pin, session.token);
      storeSession(invite, s.token);
      onDone(s);
    } catch (e2) {
      if (e2 instanceof MarketingApiError && e2.status === 401) onExpired(); else setErr(msg(e2));
    } finally { setBusy(false); }
  };
  return (
    <Card title="Set your own PIN" sub={`${session.agentName}, you must replace the temporary PIN before viewing plots.`}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className={labelCls}>New PIN ({len} characters)</label>
          <input className={inputCls} type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={len} /></div>
        <div><label className={labelCls}>Confirm new PIN</label>
          <input className={inputCls} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} maxLength={len} /></div>
        {err && <p role="alert" className="text-xs font-bold text-rose-700">{err}</p>}
        <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? 'Saving…' : 'Save PIN and continue'}</button>
        <button type="button" onClick={onCancel} className="w-full text-xs font-bold text-slate-600 underline">Log out</button>
      </form>
    </Card>
  );
}

function Inventory({ invite, session, tokenRef, onLogout, onExpired }: {
  invite: string; session: MarketingSession; tokenRef: React.MutableRefObject<string | null>; onLogout: () => void; onExpired: () => void;
}) {
  const [view, setView] = useState<'inventory' | 'layout'>('inventory');
  const [inv, setInv] = useState<MarketingInventory | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [statusF, setStatusF] = useState('all');
  const [facingF, setFacingF] = useState('all');
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<MarketingPlot | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const d = await marketingApi.inventory(invite, t);
      setInv(d); setErr(null);
    } catch (e) {
      if (e instanceof MarketingApiError && e.status === 401) onExpired(); else setErr(msg(e));
    }
  }, [invite, tokenRef, onExpired]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const labels = (inv?.policy || session.policy).statusLabels || {};
  const statusLabel = (s: string) => labels[s] || s;
  const plots = inv?.plots || [];
  const statuses = useMemo(() => Array.from(new Set(plots.map((p) => p.status))), [plots]);
  const facings = useMemo(() => Array.from(new Set(plots.map((p) => p.facing).filter(Boolean))).sort(), [plots]);
  const shown = plots.filter((p) => {
    if (statusF !== 'all' && p.status !== statusF) return false;
    if (facingF !== 'all' && p.facing !== facingF) return false;
    const q = search.trim().toLowerCase();
    return !q || p.plotNumber.toLowerCase().includes(q) || (p.facing || '').toLowerCase().includes(q);
  });
  const count = (s: string) => plots.filter((p) => p.status === s).length;

  const header = (
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">{inv?.firm.name || session.firmName}</p>
          <h1 className="text-lg font-black">{inv?.project.name || session.projectName}</h1>
          <p className="text-xs text-slate-300">Verified agent: <strong className="text-white">{session.agentName}</strong> · {session.mobile}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold hover:bg-slate-800">Refresh</button>
          <button onClick={onLogout} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-amber-400">Log out</button>
        </div>
      </div>
    </header>
  );

  return (
    <Shell header={header}>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Marketing views">
        {(['inventory', 'layout'] as const).map((key) => <button key={key} type="button"
          aria-pressed={view === key} onClick={() => setView(key)}
          className={`rounded-xl border px-4 py-2 text-sm font-bold ${view === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
          {key === 'layout' ? '3D presentation' : 'Plot inventory'}
        </button>)}
      </nav>
      {view === 'layout' ? <MarketingBlueprint key={invite} invite={invite} token={session.token} /> : <>
      {success && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {err && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800">
          <span>{err}</span><button onClick={load} className="underline">Retry</button>
        </div>
      )}
      {!inv && !err && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200" />)}</div>}
      {inv && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setStatusF('all')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusF === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}>All ({plots.length})</button>
            {statuses.map((s) => (
              <button key={s} onClick={() => setStatusF(s)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusF === s ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-700 border border-slate-300'}`}>{statusLabel(s)} ({count(s)})</button>
            ))}
            <select value={facingF} onChange={(e) => setFacingF(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">
              <option value="all">All facings</option>
              {facings.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plot or facing" className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs" />
          </div>
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
              {plots.length === 0 ? 'No plots have been saved for this project yet.' : 'No plots match these filters.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {shown.map((p) => {
                const avail = p.status === 'available';
                return (
                  <div key={p.id} className={`flex flex-col rounded-2xl border bg-white p-3.5 ${avail ? 'border-amber-300' : 'border-slate-200 opacity-80'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-black">{p.plotNumber}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${avail ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>{statusLabel(p.status)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-700">{p.areaSqYards} Sq.Yds · {p.facing}</p>
                    {p.dimensions && <p className="text-[11px] text-slate-500">Dim: {p.dimensions}</p>}
                    {p.roadWidthFt != null && <p className="text-[11px] text-slate-500">Road: {p.roadWidthFt} ft</p>}
                    <div className="mt-auto pt-3">
                      {avail && p.ratePerSqYard != null && <p className="text-xs text-slate-600">Rate: <strong className="font-mono text-slate-900">{inr(p.ratePerSqYard)}</strong>/Sq.Yd</p>}
                      {avail && p.requestPending && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-amber-900">Booking request pending review</p>}
                      {avail && !p.requestPending && (
                        <button onClick={() => { setSuccess(null); setTarget(p); }} className={`${btnPrimary} mt-2 w-full !py-2 text-xs`}>Request booking</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </>}
      {target && inv && (
        <ProposalDialog
          invite={invite} inv={inv} plot={target} tokenRef={tokenRef}
          onClose={() => setTarget(null)} onExpired={onExpired} onReload={load}
          onSuccess={(m) => { setTarget(null); setSuccess(m); }}
        />
      )}
    </Shell>
  );
}

function ProposalDialog({ invite, inv, plot, tokenRef, onClose, onExpired, onReload, onSuccess }: {
  invite: string; inv: MarketingInventory; plot: MarketingPlot; tokenRef: React.MutableRefObject<string | null>;
  onClose: () => void; onExpired: () => void; onReload: () => Promise<void>; onSuccess: (m: string) => void;
}) {
  const defRate = plot.ratePerSqYard ?? inv.project.floorRatePerSqYard ?? null;
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [rate, setRate] = useState(defRate != null ? String(defRate) : '');
  const [advance, setAdvance] = useState('');
  const [hours, setHours] = useState(String(inv.policy.deadlineHours));
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const t = tokenRef.current;
    const digits = buyerPhone.replace(/\D/g, '').slice(-10);
    if (!t) { onExpired(); return; }
    if (!buyerName.trim()) { setErr('Enter the buyer name.'); return; }
    if (digits.length !== 10) { setErr('Enter a 10-digit buyer mobile number.'); return; }
    if (!(Number(rate) > 0)) { setErr('Enter a valid proposed rate.'); return; }
    if (advance.trim() === '' || !(Number(advance) >= 0)) { setErr('Enter the proposed token advance.'); return; }
    if (!(Number(hours) > 0)) { setErr('Enter a valid token deadline in hours.'); return; }
    setBusy(true);
    try {
      await marketingApi.propose(invite, t, {
        plotId: plot.id, buyerName: buyerName.trim(), buyerPhone: `+91${digits}`,
        proposedRatePerSqYard: Number(rate), proposedAdvanceAmount: Number(advance),
        tokenDeadlineHours: Number(hours), notes: notes.trim(),
      });
      onSuccess(`Booking request for plot ${plot.plotNumber} was sent for review.`);
      await onReload();
    } catch (e2) {
      if (e2 instanceof MarketingApiError && e2.status === 401) { onExpired(); return; }
      if (e2 instanceof MarketingApiError && e2.status === 409) {
        setErr(`${e2.message} The plot is no longer available for a new request.`);
        onReload();
      } else setErr(msg(e2));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[96dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600">Booking request</p>
            <h2 className="text-lg font-black">Plot {plot.plotNumber} · {plot.areaSqYards} Sq.Yds · {plot.facing}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-slate-500">✕</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls}>Buyer name *</label><input className={inputCls} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} /></div>
          <div><label className={labelCls}>Buyer mobile *</label><input className={inputCls} inputMode="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} /></div>
          <div><label className={labelCls}>Proposed rate (₹/Sq.Yd) *</label><input className={inputCls} type="number" min="1" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div><label className={labelCls}>Token advance (₹) *</label><input className={inputCls} type="number" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} /></div>
          <div><label className={labelCls}>Token deadline (hours) *</label><input className={inputCls} type="number" min="1" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
        </div>
        {Number(rate) > 0 && <p className="rounded-xl bg-slate-100 p-2.5 text-xs text-slate-700">Total at this rate: <strong className="font-mono">{inr(Number(rate) * plot.areaSqYards)}</strong></p>}
        <div><label className={labelCls}>Notes</label><textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        {err && <p role="alert" className="text-xs font-bold text-rose-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button>
          <button className={btnPrimary} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </div>
  );
}
