import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Download, Eye, RefreshCw, Save, Trash2, Undo2 } from 'lucide-react';
import type { ProjectDocument, ProjectDocuments, SaveDocumentsRequest } from '@workspace/api-client-react';
import { api, downloadProjectAttachment, fetchProjectAttachmentBlob } from '../../../adapter/api';

// Same contract as the generated getProjectDocuments / saveProjectDocuments; the original web routes through
// its own authenticated adapter (bearer session + base path) rather than the unconfigured generated client.
const docsPath = (projectId: string) => `/erp/${encodeURIComponent(projectId)}/documents`;
export const getDocuments = (projectId: string) => api<ProjectDocuments>(docsPath(projectId));
export const saveDocuments = (projectId: string, body: SaveDocumentsRequest) => api<ProjectDocuments>(docsPath(projectId), { method: 'POST', body });

type Row = ProjectDocument & { removed?: boolean };
interface Props {
  projectId: string;
  /** Latest known project revision; documents save with it and report the new one back. */
  revisionRef: MutableRefObject<number>;
  onRevision: (r: number) => void;
  onDirty: (d: boolean) => void;
  /** Parent calls this before its own save; null when nothing is pending. */
  saveRef: MutableRefObject<null | (() => Promise<boolean>)>;
  /** Bump to reload (e.g. after uploading new files through the older upload path). */
  reloadKey: number;
  disabled?: boolean;
}

const same = (a: Row[], b: ProjectDocument[]) => a.length === b.length && a.every((d, i) => !d.removed && d.id === b[i].id && d.title === b[i].title && d.category === b[i].category);

/** Authoritative active project documents with title/category edit, private view/download and association removal. */
export function ProjectDocumentsManager({ projectId, revisionRef, onRevision, onDirty, saveRef, reloadKey, disabled }: Props) {
  const [server, setServer] = useState<ProjectDocument[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [busy, setBusy] = useState<'' | 'load' | 'save' | string>('load');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const dirty = !!server && !same(rows, server);
  const onDirtyRef = useRef(onDirty); onDirtyRef.current = onDirty;
  useEffect(() => { onDirtyRef.current(dirty); }, [dirty]);

  const onRevisionRef = useRef(onRevision); onRevisionRef.current = onRevision;
  const load = useCallback(async () => {
    setBusy('load'); setMsg(null);
    try {
      const r = await getDocuments(projectId);
      setServer(r.documents); setRows(r.documents.map((d) => ({ ...d }))); setCanManage(r.canManage); setCategories(r.categories);
      if (r.revision > revisionRef.current) onRevisionRef.current(r.revision);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Documents could not load.' }); }
    finally { setBusy(''); }
  }, [projectId, revisionRef]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const persist = useCallback(async (): Promise<boolean> => {
    const list = rowsRef.current.filter((d) => !d.removed);
    const bad = list.find((d) => !d.title.trim() || !d.category);
    if (bad) { setMsg({ ok: false, text: `"${bad.fileName}" needs a title and category.` }); return false; }
    setBusy('save'); setMsg(null);
    try {
      const r = await saveDocuments(projectId, { revision: revisionRef.current, documents: list.map((d) => ({ id: d.id, title: d.title.trim(), category: d.category, attachmentId: d.attachmentId })) });
      setServer(r.documents); setRows(r.documents.map((d) => ({ ...d }))); onRevisionRef.current(r.revision);
      setMsg({ ok: true, text: 'Documents saved.' });
      return true;
    } catch (e) {
      const t = e instanceof Error ? e.message : 'Documents were not saved.';
      setMsg({ ok: false, text: `${t} Your document edits are kept here. If another editor changed the project, use Reload.` });
      return false;
    } finally { setBusy(''); }
  }, [projectId, revisionRef]);
  saveRef.current = dirty ? persist : null;

  const upd = (id: string, patch: Partial<Row>) => setRows((l) => l.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const view = async (d: Row) => {
    setBusy(`view:${d.id}`); setMsg(null);
    const w = window.open('', '_blank');
    try {
      const blob = await fetchProjectAttachmentBlob(projectId, d.attachmentId);
      const url = URL.createObjectURL(blob);
      if (w) { w.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      else { URL.revokeObjectURL(url); await downloadProjectAttachment(projectId, d.attachmentId); }
    } catch (e) { w?.close(); setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not open the document.' }); }
    finally { setBusy(''); }
  };
  const download = async (d: Row) => {
    setBusy(`dl:${d.id}`); setMsg(null);
    try { await downloadProjectAttachment(projectId, d.attachmentId); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Download failed.' }); }
    finally { setBusy(''); }
  };

  const off = !!disabled || busy === 'save' || busy === 'load';
  const ctl = 'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs disabled:opacity-60';
  const btn = 'flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50';

  if (!server) {
    return busy === 'load'
      ? <div className="space-y-2" aria-label="Loading documents"><div className="h-12 animate-pulse rounded-xl bg-gray-100" /><div className="h-12 animate-pulse rounded-xl bg-gray-100" /></div>
      : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{msg?.text ?? 'Documents could not load.'} <button type="button" className="ml-2 font-bold underline" onClick={() => void load()}>Retry</button></div>;
  }

  return (
    <div className="space-y-2" data-testid="project-documents-manager">
      <p className="text-[11px] text-gray-500">Removing a document detaches it from this project's active list. The private file stays stored, and receipts, postings or layout versions that cite it remain auditable. Nothing is permanently deleted.</p>
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-3 text-center text-[11px] text-gray-500">No active documents for this project yet.</p>}
      {rows.map((d) => (
        <div key={d.id} className={`grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-center ${d.removed ? 'opacity-50' : ''}`} data-testid={`row-doc-${d.id}`}>
          <div className="min-w-0">
            <input aria-label={`Title for ${d.fileName}`} className={`${ctl} w-full font-semibold`} value={d.title} disabled={off || !canManage || d.removed} onChange={(e) => upd(d.id, { title: e.target.value })} data-testid={`input-doc-title-${d.id}`} />
            <p className="mt-0.5 truncate text-[11px] text-gray-500">{d.fileName} · {Math.max(1, Math.round(d.size / 1024))} KB{d.removed ? ' · will be removed on save' : ''}</p>
          </div>
          <select aria-label={`Category for ${d.fileName}`} className={ctl} value={d.category} disabled={off || !canManage || d.removed} onChange={(e) => upd(d.id, { category: e.target.value })} data-testid={`select-doc-category-${d.id}`}>
            {!categories.some((c) => c.value === d.category) && <option value={d.category}>{d.category || 'Choose…'}</option>}
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btn} disabled={!!busy} onClick={() => void view(d)} data-testid={`button-view-doc-${d.id}`}><Eye size={14} />{busy === `view:${d.id}` ? 'Opening…' : 'View'}</button>
            <button type="button" className={btn} disabled={!!busy} onClick={() => void download(d)} data-testid={`button-download-doc-${d.id}`}><Download size={14} />{busy === `dl:${d.id}` ? '…' : 'Download'}</button>
            {canManage && (d.removed
              ? <button type="button" className={btn} disabled={off} onClick={() => upd(d.id, { removed: false })} data-testid={`button-restore-doc-${d.id}`}><Undo2 size={14} />Keep</button>
              : <button type="button" className={`${btn} text-red-700`} disabled={off} onClick={() => { if (window.confirm(`Remove "${d.title}" from this project's documents when you save? The private file and any finance or layout history that cites it are kept.`)) upd(d.id, { removed: true }); }} data-testid={`button-remove-doc-${d.id}`}><Trash2 size={14} />Remove</button>)}
          </div>
        </div>
      ))}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} data-testid="text-documents-message">{msg.text}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canManage ? <>
          <button type="button" className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={off || !dirty} onClick={() => void persist()} data-testid="button-save-documents"><Save size={14} />{busy === 'save' ? 'Saving…' : 'Save documents'}</button>
          {dirty && <button type="button" className={btn} disabled={off} onClick={() => setRows(server.map((d) => ({ ...d })))} data-testid="button-discard-documents">Discard document changes</button>}
        </> : <p className="text-[11px] text-gray-500">You can view these documents but not change them.</p>}
        <button type="button" className={btn} disabled={off} onClick={() => { if (!dirty || window.confirm('Reload documents? Unsaved document edits will be discarded.')) void load(); }} data-testid="button-reload-documents"><RefreshCw size={14} />Reload</button>
      </div>
    </div>
  );
}
