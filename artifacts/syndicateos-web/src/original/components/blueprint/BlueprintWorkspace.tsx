import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Sparkles, Save, ShieldCheck, RefreshCw, FileText, Box, PencilRuler, AlertTriangle, Wand2, History as HistoryIcon } from 'lucide-react';
import type { Plot, PlanUploadDocument } from '../../types';
import { validatePlanFile } from '../../../adapter/planFile';
import { AttachmentViewer } from './AttachmentViewer';
import { registerLeaveGuard } from '../../../adapter/leaveGuard';
import { LayoutEditor } from './LayoutEditor';
import { Blueprint3DView } from './Blueprint3DView';
import { analyzeBlueprint, errorMessage, generateLayout, getBlueprint, saveBlueprint } from './blueprintApi';
import {
  SUPPORTED_TYPES, historyOf, layoutAdvisories, normalizeForEdit, unmatchedPlotNumbers, validateGeometry,
  type BlueprintState, type History,
} from './blueprintGeometry';

interface Props {
  projectId: string;
  plots: Plot[];
  onUploadDocuments?: (projectId: string, documents: PlanUploadDocument[]) => Promise<boolean>;
}

type Tab = 'original' | 'edit' | 'view3d';
type Busy = '' | 'analyze' | 'save' | 'confirm' | 'upload' | 'generate';

/** Optional original plan + project-generated movable layout + confirmed colored 3D presentation. */
export const BlueprintWorkspace: React.FC<Props> = ({ projectId, plots, onUploadDocuments }) => {
  const [state, setState] = useState<BlueprintState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');

  // Local editing copy (with undo/redo); never overwritten by a refresh while dirty.
  const [hist, setHist] = useState<History | null>(null);
  const [savedPresent, setSavedPresent] = useState<History['present'] | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [editSourceId, setEditSourceId] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<Busy>('');
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = !!hist && hist.present !== savedPresent;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const projectPlots = useMemo(() => plots.filter((p) => p.projectId === projectId), [plots, projectId]);
  const inventoryNumbers = useMemo(() => projectPlots.map((p) => p.plotNumber), [projectPlots]);
  const inventory = useMemo(() => projectPlots.map((p) => ({ number: p.plotNumber })), [projectPlots]);

  const applyState = useCallback((s: BlueprintState, force: boolean) => {
    setState(s);
    setTab((t) => t ?? (s.canManage ? 'edit' : 'view3d'));
    setSelectedId((cur) => (cur && s.attachments.some((a) => a.id === cur) ? cur : s.sourceAttachmentId || s.confirmedAttachmentId || s.attachments[0]?.id || ''));
    if (force || !dirtyRef.current) {
      const seed = s.draft ?? s.confirmed;
      const g = seed ? normalizeForEdit(seed) : null;
      setHist(g ? historyOf(g) : null);
      setSavedPresent(g);
      setEditRevision(s.revision);
      setEditSourceId(s.draft ? s.sourceAttachmentId ?? null : s.confirmedAttachmentId ?? null);
      setAck(false);
      setConflict(false);
    }
  }, []);

  const load = useCallback(async (force = false) => {
    setLoading(true); setLoadError('');
    try { applyState(await getBlueprint(projectId), force); }
    catch (e) { setLoadError(errorMessage(e, 'Could not load the layout workspace.')); }
    finally { setLoading(false); }
  }, [projectId, applyState]);

  useEffect(() => { void load(true); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    return registerLeaveGuard(() => 'You have unsaved layout edits. Leave and discard them? The last saved layout is kept.');
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const run = async (kind: Exclude<Busy, ''>, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(kind); setActionError([]); setNotice('');
    try { await fn(); }
    catch (e) {
      const msg = errorMessage(e, 'The request failed. Please try again.');
      const status = (e as { status?: number })?.status;
      if (status === 409 || /revision|conflict|stale|fingerprint|changed/i.test(msg)) setConflict(true);
      setActionError([msg]);
    }
    finally { busyRef.current = false; setBusy(''); }
  };

  const handleUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !onUploadDocuments) return;
    void run('upload', async () => {
      if (!SUPPORTED_TYPES.includes(file.type)) throw new Error('Select a PDF, PNG, JPEG or WebP plan.');
      await validatePlanFile(file);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error(`Could not read "${file.name}". Select it again.`));
        r.readAsDataURL(file);
      });
      const doc: PlanUploadDocument = {
        id: `doc-${crypto.randomUUID()}`, fileName: file.name, fileType: file.type, fileSize: file.size,
        uploadedAt: new Date().toISOString(), dataUrl, title: file.name.replace(/\.[^/.]+$/, ''), category: 'master_layout',
      };
      const ok = await onUploadDocuments(projectId, [doc]);
      if (!ok) throw new Error('Upload failed. The file was not stored; try again.');
      setNotice(`${file.name} uploaded privately as a master layout document.`);
      const s = await getBlueprint(projectId);
      applyState(s, false);
      const added = s.attachments.find((a) => a.fileName === file.name);
      if (added) setSelectedId(added.id);
    });
  };

  const handleGenerate = () => {
    if (!state) return;
    const replacing = dirty || !!state.draft;
    if (replacing && !window.confirm(dirty ? 'Generate a new layout from project data? Your unsaved edits will be discarded. The confirmed 3D presentation is not changed.' : 'Generate a new draft from project data? It replaces the current saved draft (the confirmed 3D presentation is kept).')) return;
    void run('generate', async () => {
      const s = await generateLayout(projectId, state.revision);
      applyState(s, true);
      setTab('edit');
      setNotice('Layout generated from saved plot inventory, facing groups, approach road and open-space settings. Placement is schematic; review and move blocks before confirming.');
    });
  };

  const handleAnalyze = () => {
    if (!state || !selectedId) return;
    if ((dirty || state.draft) && !window.confirm('Run the optional AI draft? It replaces the current draft. The confirmed 3D presentation is kept.')) return;
    void run('analyze', async () => {
      const s = await analyzeBlueprint(projectId, selectedId, state.revision);
      applyState(s, true);
      setTab('edit');
      setNotice('AI draft ready. Review every plot, road and vertex before confirming.');
    });
  };

  const handleReset = () => {
    if (!state || !dirty) return;
    if (!window.confirm('Discard all unsaved layout edits and return to the last saved version?')) return;
    applyState(state, true);
  };

  const handleSave = (confirm: boolean) => {
    if (!state || !hist || editRevision === null) return;
    const g = hist.present;
    const errs = validateGeometry(g, inventoryNumbers, confirm);
    if (confirm && !ack) errs.push('Tick the review acknowledgement before confirming.');
    if (errs.length) { setActionError(errs); return; }
    void run(confirm ? 'confirm' : 'save', async () => {
      const s = await saveBlueprint(projectId, { attachmentId: editSourceId || null, revision: editRevision, geometry: g, confirm, reviewAcknowledged: confirm ? ack : false });
      applyState(s, true);
      setNotice(confirm ? 'Layout confirmed. The 3D presentation now shows this version.' : 'Draft saved. The confirmed presentation is unchanged until you confirm.');
      if (confirm) setTab('view3d');
    });
  };

  const switchTab = (t: Tab) => setTab(t);

  const g = hist?.present ?? null;
  const unmatched = useMemo(() => (g ? unmatchedPlotNumbers(g, inventoryNumbers) : new Set<string>()), [g, inventoryNumbers]);
  const advisories = useMemo(() => (g ? layoutAdvisories(g, inventory) : []), [g, inventory]);
  const blocking = useMemo(() => (g ? validateGeometry(g, inventoryNumbers, false) : []), [g, inventoryNumbers]);
  const selected = state?.attachments.find((a) => a.id === selectedId);
  const canManage = !!state?.canManage;
  const staleRevision = dirty && state && editRevision !== null && state.revision !== editRevision;
  const activeTab: Tab = tab === 'edit' && !canManage ? 'view3d' : tab ?? 'view3d';

  const tabBtn = (t: Tab, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button type="button" role="tab" aria-selected={activeTab === t} onClick={() => switchTab(t)} data-testid={`tab-blueprint-${t}`}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${activeTab === t ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  );

  if (loading && !state) {
    return <div className="space-y-3" aria-label="Loading layout workspace"><div className="h-10 rounded-xl bg-stone-200 animate-pulse" /><div className="h-80 rounded-2xl bg-stone-100 animate-pulse" /></div>;
  }
  if (loadError && !state) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center space-y-3" role="alert">
        <p className="text-sm font-semibold text-red-800">{loadError}</p>
        <button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"><RefreshCw className="w-3.5 h-3.5" /> Retry</button>
      </div>
    );
  }
  if (!state) return null;

  const btn = 'inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold disabled:opacity-50 hover:bg-amber-50';

  return (
    <div className="space-y-4" data-testid="blueprint-workspace">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div role="tablist" aria-label="Layout steps" className="flex flex-wrap gap-1 bg-stone-50 border border-stone-200 rounded-2xl p-1">
          {tabBtn('original', 'Original plan (optional)', FileText)}
          {canManage && tabBtn('edit', 'Edit layout', PencilRuler)}
          {tabBtn('view3d', '3D presentation', Box)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${state.status === 'CONFIRMED' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : state.status === 'DRAFT' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-stone-100 border-stone-300 text-stone-700'}`} data-testid="status-blueprint">
            {state.status === 'CONFIRMED' ? 'Confirmed' : state.status === 'DRAFT' ? (state.confirmed ? 'Draft in progress · confirmed version kept' : 'Draft awaiting confirmation') : 'No layout yet'} · rev {state.revision}
          </span>
          {dirty && <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full border bg-red-50 border-red-300 text-red-800" data-testid="status-unsaved">Unsaved edits</span>}
        </div>
      </div>

      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{notice}</p>}
      {canManage && state.needsReconciliation && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950" data-testid="banner-reconcile">
          <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> Plot inventory or setup changed since this layout was drawn. Manual positions are kept; regenerate when you want a fresh starter, or place missing plots before confirming.</span>
          <button type="button" disabled={!!busy} onClick={handleGenerate} className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white shrink-0">Regenerate from project data</button>
        </div>
      )}
      {canManage && (state.warnings?.length ?? 0) > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" data-testid="text-generation-warnings"><summary className="font-bold cursor-pointer">Generation notes ({state.warnings!.length})</summary>{state.warnings!.map((w, i) => <p key={i}>{w}</p>)}</details>
      )}
      {actionError.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-0.5" data-testid="text-blueprint-errors">
          {actionError.map((m, i) => <p key={i} className="font-semibold">{m}</p>)}
          {conflict && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white" onClick={() => { if (!dirty || window.confirm('Reload the latest saved layout? Your unsaved edits will be discarded.')) void load(true); }} data-testid="button-reload-latest">Reload latest</button>
              {canManage && <button type="button" className="rounded-lg border border-stone-400 bg-white px-3 py-1.5 font-bold text-stone-900" onClick={handleGenerate}>Regenerate from project data</button>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'original' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {state.attachments.length > 0 && (
              <select aria-label="Plan document" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="max-w-[260px] rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs font-semibold" data-testid="select-blueprint-attachment">
                {state.attachments.map((a) => <option key={a.id} value={a.id}>{a.fileName}</option>)}
              </select>
            )}
            {canManage && onUploadDocuments && (
              <>
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => handleUpload(e.target.files)} aria-label="Upload plan document" data-testid="input-upload-blueprint" />
                <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className={btn} data-testid="button-upload-blueprint">
                  <Upload className="w-3.5 h-3.5" />{busy === 'upload' ? 'Uploading…' : 'Upload plan'}
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-stone-600">An original plan is an optional reference. Layouts are generated from saved project data and never require an upload. Only master layout, floor plan, elevation and structural documents appear here.</p>
          {selected ? <AttachmentViewer key={selected.id} projectId={projectId} attachment={selected} onImageAspect={() => undefined} /> : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-[#FBF8F1] p-10 text-center">
              <FileText className="w-8 h-8 text-amber-700 mx-auto" />
              <p className="mt-2 text-sm font-bold text-stone-900">No plan document on file</p>
              <p className="text-xs text-stone-600">{canManage ? 'Optional: upload the approved layout as PDF, PNG, JPEG or WebP for reference. It is stored privately.' : 'No reference plan has been shared for this project.'}</p>
            </div>
          )}
          {canManage && selected && (
            <details className="rounded-xl border border-stone-200 bg-white p-3 text-xs">
              <summary className="font-bold cursor-pointer text-stone-800">Advanced: optional AI tracing (billed)</summary>
              <p className="mt-2 text-stone-600">Sends only the selected plan to the configured AI provider and uses billed credits. Ordinary layouts never need this.</p>
              <button type="button" disabled={!!busy} onClick={handleAnalyze} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 px-3 py-2 text-xs font-black text-stone-950 border border-amber-600/30 disabled:opacity-50" data-testid="button-analyze-blueprint">
                <Sparkles className="w-3.5 h-3.5" />{busy === 'analyze' ? 'Analyzing…' : 'Trace with AI (billed)'}
              </button>
            </details>
          )}
        </div>
      )}

      {activeTab === 'edit' && canManage && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!!busy} onClick={handleGenerate} className="inline-flex items-center gap-1.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 px-3 py-2 text-xs font-black text-stone-950 border border-amber-600/30 disabled:opacity-50" data-testid="button-generate-layout">
              <Wand2 className="w-3.5 h-3.5" />{busy === 'generate' ? 'Generating…' : g ? 'Regenerate from project data' : 'Generate layout'}
            </button>
            <button type="button" disabled={!!busy || !dirty} onClick={handleReset} className={btn} data-testid="button-reset-layout"><HistoryIcon className="w-3.5 h-3.5" />Reset to last saved</button>
            <span className="text-[11px] text-stone-500">Generation uses saved inventory and settings only. No AI, no charges.</span>
          </div>
          {staleRevision && (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> A newer revision ({state.revision}) exists. Your unsaved edits are based on revision {editRevision}; saving will be rejected.</span>
              <button type="button" onClick={() => { if (window.confirm('Discard your edits and load the newer revision?')) applyState(state, true); }} className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white">Discard edits and load newer</button>
            </div>
          )}
          {state.status === 'DRAFT' && state.confirmed && <p className="text-[11px] text-stone-600">The previously confirmed layout stays in the 3D presentation until this draft is confirmed.</p>}
          {!hist ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-[#FBF8F1] p-8 text-center space-y-3" data-testid="empty-layout">
              <Wand2 className="w-8 h-8 text-amber-700 mx-auto" />
              <p className="text-sm font-bold text-stone-900">No layout drawn yet</p>
              <p className="text-xs text-stone-600 max-w-md mx-auto">Generate a starter from this project's live plots: one block per numbered plot, grouped by facing, with the approach road and open space from setup. Recorded dimensions are kept; placement is marked schematic.</p>
              <button type="button" disabled={!!busy} onClick={handleGenerate} className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50" data-testid="button-generate-empty">{busy === 'generate' ? 'Generating…' : 'Generate layout'}</button>
            </div>
          ) : (
            <>
              <LayoutEditor history={hist} setHistory={(u) => setHist((h) => (h ? (typeof u === 'function' ? u(h) : u) : h))} unmatched={unmatched} advisories={advisories} disabled={!!busy} />
              {blocking.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="text-blocking">
                  <p className="font-black">Must fix before saving ({blocking.length})</p>
                  {blocking.slice(0, 8).map((m, i) => <p key={i}>{m}</p>)}
                </div>
              )}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3">
                <label className="flex items-start gap-2 text-xs text-stone-800 max-w-xl">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-amber-600" data-testid="checkbox-review-ack" />
                  <span>I reviewed plot placement, roads, open space and warnings. This drawing is illustrative; it does not change inventory, facing, bookings, prices or money.</span>
                </label>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button type="button" disabled={!!busy || blocking.length > 0} onClick={() => handleSave(false)} className={`${btn} px-4 py-2.5`} data-testid="button-save-blueprint-draft">
                    <Save className="w-3.5 h-3.5" />{busy === 'save' ? 'Saving…' : 'Save draft'}
                  </button>
                  <button type="button" disabled={!!busy || !ack || blocking.length > 0} onClick={() => handleSave(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40" data-testid="button-confirm-blueprint">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />{busy === 'confirm' ? 'Confirming…' : 'Confirm layout'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'view3d' && (
        state.confirmed && state.confirmed.plots.length > 0 ? (
          <Blueprint3DView key={`3d-${state.revision}`} geometry={state.confirmed} plots={projectPlots} />
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-[#FBF8F1] p-10 text-center" data-testid="empty-3d">
            <Box className="w-8 h-8 text-amber-700 mx-auto" />
            <p className="mt-2 text-sm font-bold text-stone-900">No confirmed layout yet</p>
            <p className="text-xs text-stone-600 max-w-md mx-auto">{canManage ? 'Generate and arrange the layout in Edit layout, then confirm it to publish the 3D presentation.' : 'The project team has not published a confirmed layout yet.'}</p>
          </div>
        )
      )}
    </div>
  );
};
