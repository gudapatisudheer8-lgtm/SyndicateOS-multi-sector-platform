import { useRef, useState } from 'react';
import { FileText, Info, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { ProjectDocumentsManager } from './ProjectDocumentsManager';
import type { PlanUploadDocument, Project } from '../../types';
import { PlanDocumentUploader } from './PlanDocumentUploader';
import { ProjectPlotEditor, buildPlotEdits, plotEditErrors, type PlotRecord } from './ProjectPlotEditor';

export type Row = Record<string, any>;
export interface FieldDef {
  key: string; label: string; kind: string; required?: boolean; options?: string[];
  optionLabels?: Record<string, string>; min?: number; max?: number; decimalPlaces?: number;
  integer?: boolean; unit?: string; maxLength?: number; readOnly?: boolean; ui?: string;
  visibleWhen?: { field: string; values: string[] }; fields?: FieldDef[];
}
interface SectionDef { key: string; title: string; fields: FieldDef[] }

const LIVE_KINDS = ['account', 'partner', 'inventory'];
export const asFields = (x: unknown): FieldDef[] => (Array.isArray(x) ? x.filter((f) => f && typeof f.key === 'string' && typeof f.label === 'string') : []);
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export const isVisible = (f: FieldDef, row: Row) => {
  if (!f.visibleWhen) return true;
  const v = row[f.visibleWhen.field];
  return (f.visibleWhen.values || []).includes(v === undefined || v === null ? '' : String(v));
};

export function fieldError(f: FieldDef, raw: unknown): string | null {
  if (f.fields) return null;
  const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
  if (blank) return f.required && f.kind !== 'boolean' ? `${f.label} is required.` : null;
  if (f.kind === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${f.label} must be a number.`;
    if (f.integer && !Number.isInteger(n)) return `${f.label} must be a whole number.`;
    if (f.min !== undefined && n < f.min) return `${f.label} must be at least ${f.min}.`;
    if (f.max !== undefined && n > f.max) return `${f.label} must be at most ${f.max}.`;
    if (f.decimalPlaces !== undefined && Number(n.toFixed(f.decimalPlaces)) !== n) return `${f.label} allows at most ${f.decimalPlaces} decimal places.`;
  } else if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return `${f.label} must be a valid date.`;
  else if (f.kind === 'select' && f.options && !f.options.includes(String(raw))) return `Choose a valid ${f.label}.`;
  else if (f.maxLength !== undefined && String(raw).length > f.maxLength) return `${f.label} is limited to ${f.maxLength} characters.`;
  return null;
}

export function normalize(fields: FieldDef[], row: Row): Row {
  const out: Row = { ...row };
  for (const f of fields) {
    const v = row[f.key];
    if (f.fields) out[f.key] = Array.isArray(v) ? v.map((r: Row) => normalize(f.fields!, r || {})) : [];
    else if (f.kind === 'number') out[f.key] = v === '' || v === undefined || v === null ? null : Number(v);
  }
  return out;
}

export function collectErrors(fields: FieldDef[], row: Row, prefix = ''): string[] {
  const errs: string[] = [];
  for (const f of fields) {
    if (LIVE_KINDS.includes(f.kind) || !isVisible(f, row) || f.readOnly) continue;
    if (f.fields) {
      const rows: Row[] = Array.isArray(row[f.key]) ? row[f.key] : [];
      if (f.required && rows.length === 0) errs.push(`${prefix}${f.label}: add at least one row.`);
      rows.forEach((r, i) => errs.push(...collectErrors(f.fields!, r, `${prefix}${f.label} row ${i + 1}: `)));
    } else {
      const e = fieldError(f, row[f.key]);
      if (e) errs.push(prefix + e);
    }
  }
  return errs;
}

const inputCls = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-950 outline-none focus:border-amber-500 disabled:bg-gray-100 disabled:text-gray-500';

export function FieldInput({ f, row, onChange, disabled, idBase }: { f: FieldDef; row: Row; onChange: (v: any) => void; disabled: boolean; idBase: string }) {
  const id = `${idBase}-${f.key}`;
  const v = row[f.key];
  const err = fieldError(f, v);
  const ro = disabled || !!f.readOnly;
  if (LIVE_KINDS.includes(f.kind)) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-[11px] text-gray-600">
        <span className="font-bold text-gray-800">{f.label}</span> is maintained live in its own tab and is not recreated here.
      </div>
    );
  }
  if (f.fields) return <RowsEditor f={f} rows={Array.isArray(v) ? v : []} onChange={onChange} disabled={ro} idBase={id} />;
  let control;
  if (f.kind === 'boolean') {
    control = (
      <label htmlFor={id} className="flex items-center gap-2 text-xs font-semibold text-gray-800">
        <input id={id} data-testid={`input-${id}`} type="checkbox" checked={v === true} disabled={ro} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-amber-500" />
        {v === true ? 'Yes' : 'No'}
      </label>
    );
  } else if (f.kind === 'select') {
    control = (
      <select id={id} data-testid={`select-${id}`} value={v ?? ''} disabled={ro} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">{f.options?.length ? 'Select…' : 'No options configured'}</option>
        {(f.options || []).map((o) => <option key={o} value={o}>{f.optionLabels?.[o] || o}</option>)}
      </select>
    );
  } else if (f.kind === 'multiline') {
    control = <textarea id={id} data-testid={`input-${id}`} rows={3} value={v ?? ''} maxLength={f.maxLength} disabled={ro} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  } else {
    control = (
      <input id={id} data-testid={`input-${id}`} type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
        value={v ?? ''} min={f.min} max={f.max} maxLength={f.maxLength} disabled={ro}
        step={f.kind === 'number' ? (f.integer ? 1 : f.decimalPlaces !== undefined ? Math.pow(10, -f.decimalPlaces) : 'any') : undefined}
        onChange={(e) => onChange(e.target.value)} className={inputCls} />
    );
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[10px] font-black uppercase tracking-wider text-gray-500">
        {f.label}{f.unit ? ` (${f.unit})` : ''}{f.required ? <span className="text-red-600"> *</span> : null}{f.readOnly ? ' · read only' : ''}
      </label>
      {control}
      {err && <p className="mt-1 text-[11px] font-semibold text-red-700">{err}</p>}
    </div>
  );
}

function RowsEditor({ f, rows, onChange, disabled, idBase }: { f: FieldDef; rows: Row[]; onChange: (v: Row[]) => void; disabled: boolean; idBase: string }) {
  const sub = f.fields || [];
  const blank = () => Object.fromEntries(sub.map((s) => [s.key, s.kind === 'boolean' ? false : '']));
  return (
    <div className="sm:col-span-2 rounded-2xl border border-gray-200 bg-[#F9F8F4] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-gray-700">{f.label} ({rows.length})</span>
        <button type="button" data-testid={`button-add-row-${idBase}`} disabled={disabled} onClick={() => onChange([...rows, blank()])}
          className="flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
      </div>
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-3 text-center text-[11px] text-gray-500">No rows saved yet.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
            {sub.filter((s) => isVisible(s, r) && s.ui !== 'hidden').map((s) => (
              <FieldInput key={s.key} f={s} row={r} disabled={disabled} idBase={`${idBase}-${i}`}
                onChange={(val) => onChange(rows.map((x, j) => (j === i ? { ...x, [s.key]: val } : x)))} />
            ))}
            <div className="flex items-end justify-end">
              <button type="button" data-testid={`button-remove-row-${idBase}-${i}`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface EditProjectModalProps {
  project: Project;
  definition?: any;
  initialValues?: Record<string, any>;
  initialSettings?: Record<string, any>;
  plotResource?: any;
  plotRecords?: any[];
  onClose: () => void;
  onSave?: (projectId: string, values: Record<string, any>, settings: Record<string, any>, revision: number, plotEdits?: Array<{ recordId: string; revision: number; data: Record<string, any> }>) => Promise<boolean>;
  onUploadDocuments?: (projectId: string, documents: PlanUploadDocument[]) => Promise<boolean>;
}

/** Mount only while open (seeded once on mount; remount per project via key). */
export function EditProjectModal({ project, definition, initialValues, initialSettings, plotResource, plotRecords, onClose, onSave, onUploadDocuments }: EditProjectModalProps) {
  const projectId = project.id;
  const sections: SectionDef[] = Array.isArray(definition?.sections)
    ? definition.sections.filter((s: any) => s && typeof s.key === 'string').map((s: any) => ({ key: s.key, title: String(s.title ?? s.key), fields: asFields(s.fields) }))
    : [];
  const settingsFields = asFields(definition?.settingsFields);
  const allValueFields = sections.flatMap((s) => s.fields);

  const [values, setValues] = useState<Row>(() => clone(initialValues || {}));
  const [settings, setSettings] = useState<Row>(() => clone(initialSettings || {}));
  const revisionRef = useRef<number>(Number((project as any).__revision ?? 0));
  const [docsDirty, setDocsDirty] = useState(false);
  const [docsReload, setDocsReload] = useState(0);
  const docsSaveRef = useRef<null | (() => Promise<boolean>)>(null);
  const [plotSnapshot] = useState<PlotRecord[]>(() => (Array.isArray(plotRecords) ? clone(plotRecords) : []));
  const [plotDrafts, setPlotDrafts] = useState<Record<string, Row>>({});
  const [plotFields] = useState<FieldDef[]>(() => clone(asFields(plotResource?.fields)));
  const canManagePlots = plotResource?.canManage === true;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [newDocs, setNewDocs] = useState<PlanUploadDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = saving || uploading;

  const errors = [...collectErrors(allValueFields, values), ...collectErrors(settingsFields, settings), ...plotEditErrors(plotFields, plotSnapshot, plotDrafts)];
  const canSave = !!onSave && (sections.length + settingsFields.length > 0 || Object.keys(plotDrafts).length > 0);

  const handleSave = async () => {
    if (busy || !onSave) return;
    setSaveError('');
    if (errors.length) { setSaveError(errors[0]); return; }
    setSaving(true);
    try {
      if (docsSaveRef.current && !(await docsSaveRef.current())) { setSaveError('Document changes could not be saved, so details were not saved either. Fix the documents section and retry.'); return; }
      const ok = await onSave(projectId, normalize(allValueFields, values), normalize(settingsFields, settings), revisionRef.current, buildPlotEdits(plotFields, plotSnapshot, plotDrafts));
      if (ok) onClose();
      else setSaveError('Project details were not saved. Another editor may have changed this project, or a field was rejected. Close and reopen to load the latest version, then try again.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Project details were not saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (busy || !onUploadDocuments || newDocs.length === 0) return;
    setUploadMsg(null); setUploading(true);
    try {
      if (docsSaveRef.current && !(await docsSaveRef.current())) { setUploadMsg({ ok: false, text: 'Save or discard your document edits first; the upload was not started.' }); return; }
      const ok = await onUploadDocuments(projectId, newDocs);
      if (ok) { setUploadMsg({ ok: true, text: `${newDocs.length} document${newDocs.length > 1 ? 's' : ''} uploaded privately to ${project.name}.` }); setNewDocs([]); setDocsReload((n) => n + 1); }
      else setUploadMsg({ ok: false, text: 'Upload failed. Your selected files are kept; try again.' });
    } catch (e) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const requestClose = () => { if (busy) return; if (docsDirty && !window.confirm('Discard unsaved document changes?')) return; onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
      <div className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-[#FFFBF0] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="uppercase tracking-wider text-amber-700">Edit project</span>
              <span className="font-mono text-gray-400">{project.code}</span>
            </div>
            <h2 id="edit-project-title" className="mt-0.5 truncate text-lg font-black text-gray-950 sm:text-xl">{project.name}</h2>
          </div>
          <button type="button" data-testid="button-close-edit-project" onClick={requestClose} disabled={busy} aria-label="Close" className="rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-[11px] leading-relaxed text-sky-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Saving here updates project details and settings only. Live inventory, partners and project accounts are maintained in their own tabs and are never regenerated or recreated from this form.</p>
          </div>

          {sections.length === 0 && settingsFields.length === 0 && (
            <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">The project setup definition has not loaded yet, so details cannot be edited. Documents remain available below.</p>
          )}

          {sections.map((s) => {
            const visible = s.fields.filter((f) => isVisible(f, values) && f.ui !== 'hidden');
            return (
              <section key={s.key} className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">{s.title}</h3>
                {visible.length === 0 ? <p className="text-[11px] text-gray-500">No fields apply with the current selections.</p> : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {visible.map((f) => (
                      <FieldInput key={f.key} f={f} row={values} disabled={saving} idBase={`value-${s.key}`} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {settingsFields.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">Project settings</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {settingsFields.filter((f) => isVisible(f, settings) && f.ui !== 'hidden').map((f) => (
                  <FieldInput key={f.key} f={f} row={settings} disabled={saving} idBase="setting" onChange={(v) => setSettings((p) => ({ ...p, [f.key]: v }))} />
                ))}
              </div>
            </section>
          )}

          {(plotResource || plotSnapshot.length > 0) && (
            <ProjectPlotEditor fields={plotFields} records={plotSnapshot} drafts={plotDrafts} onChangeDrafts={setPlotDrafts}
              canManage={canManagePlots} disabled={busy} />
          )}

          <section className="space-y-3 rounded-2xl border border-gray-200 p-4">
            <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-800"><FileText className="h-4 w-4 text-amber-600" /> Plans &amp; documents</h3>
            <p className="text-[11px] text-gray-500">Private files saved to {project.name}.</p>
            <ProjectDocumentsManager projectId={projectId} revisionRef={revisionRef} onRevision={(r) => { revisionRef.current = r; }} onDirty={setDocsDirty}
              saveRef={docsSaveRef} reloadKey={docsReload} disabled={busy} />

            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-gray-600">Add new documents</p>
              <fieldset disabled={busy} className={busy ? 'pointer-events-none opacity-60' : ''}>
                <PlanDocumentUploader documents={newDocs} onChange={(d) => { setNewDocs(d); setUploadMsg(null); }} sector={project.sector} />
              </fieldset>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-gray-500">
                  {!onUploadDocuments ? 'Document upload is unavailable right now.' : newDocs.length === 0 ? 'Select files above, then upload.' : `${newDocs.length} file${newDocs.length > 1 ? 's' : ''} ready to upload.`}
                </p>
                <button type="button" data-testid="button-upload-documents" onClick={handleUpload} disabled={busy || !onUploadDocuments || newDocs.length === 0}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  <Upload className="h-4 w-4" />{uploading ? 'Uploading…' : 'Upload Documents'}
                </button>
              </div>
              {uploadMsg && <p role={uploadMsg.ok ? 'status' : 'alert'} className={`mt-2 text-xs font-semibold ${uploadMsg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{uploadMsg.text}</p>}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11px] font-semibold text-red-700" role="alert">{saveError || (errors.length ? `${errors.length} field issue${errors.length > 1 ? 's' : ''} to fix before saving.` : '')}</p>
          <div className="flex gap-2">
            <button type="button" data-testid="button-cancel-edit-project" onClick={requestClose} disabled={busy} className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-800 disabled:opacity-50 sm:flex-none">Cancel</button>
            <button type="button" data-testid="button-save-edit-project" onClick={handleSave} disabled={!canSave || saving || uploading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-[#FFB800] px-5 py-2.5 text-xs font-black text-gray-950 disabled:opacity-50 sm:flex-none">
              <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
