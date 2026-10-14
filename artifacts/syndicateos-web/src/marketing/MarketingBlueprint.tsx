import React, { useEffect, useState } from 'react';
import type { MarketingBlueprint as Presentation } from '@workspace/api-client-react';
import { Blueprint3DView } from '../original/components/blueprint/Blueprint3DView';
import type { Geometry } from '../original/components/blueprint/blueprintGeometry';
import { marketingApi } from './marketingApi';

/** Uses only the invitation projection, never the financial ERP blueprint endpoint. */
export function MarketingBlueprint({ invite, token }: { invite: string; token: string }) {
  const [data, setData] = useState<Presentation | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    let running = false;
    const load = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const next = await marketingApi.blueprint(invite, token);
        if (live) { setData(next); setError(''); }
      } catch (e) {
        // Do not keep showing cached geometry after any failed authorization or refresh.
        if (live) { setData(null); setError(e instanceof Error ? e.message : 'Could not load the confirmed layout.'); }
      } finally { running = false; }
    };
    setData(null); setError('');
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    const visible = () => { if (document.hidden) setData(null); else void load(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', load);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', load);
    };
  }, [invite, token, reload]);

  let geometry: Geometry | null = null;
  if (data?.confirmed) {
    geometry = {
      ...data.confirmed,
      notes: '',
      // Renderer keys are local display identifiers, not private source/attachment IDs.
      parks: data.confirmed.parks.map((p, i) => ({ ...p, id: `park-${i}` })),
    };
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5" aria-label="Confirmed venture layout">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">Confirmed 3D layout</h2>
          <p className="text-xs text-slate-600">Read-only customer presentation · approved inventory statuses refresh automatically.</p>
        </div>
        <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold" onClick={() => setReload((n) => n + 1)}>Refresh layout</button>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error} Use Refresh layout to retry.</p>
        : !data ? <p role="status" className="p-6 text-center text-slate-600">Loading confirmed layout…</p>
        : !geometry ? <div className="rounded-xl bg-slate-50 p-8 text-center">
          <h3 className="font-bold">No confirmed layout yet</h3>
          <p className="mt-2 text-sm text-slate-600">Ask the project accountant to review and confirm the venture layout. Drafts and private original plans are not shared here.</p>
          <p className="mt-2 text-xs text-slate-500">Any published 3D plan is illustrative, not a survey or legal approval.</p>
        </div>
        : <Blueprint3DView geometry={geometry} plots={data.plots} />}
    </section>
  );
}
