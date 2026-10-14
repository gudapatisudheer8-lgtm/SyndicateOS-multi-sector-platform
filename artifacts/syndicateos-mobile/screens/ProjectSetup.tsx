import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { getProjectDocuments, saveProjectDocuments, type Project, type ProjectDocument, type WorkspaceInterfacesItem } from '@workspace/api-client-react';
import { Badge, Banner, Btn, Card, Chips, Confirm, CredentialSheet, Empty, Field, Label, Sheet } from '@/components/ui';
import { AccountCards, FacingMatrix, PartnerCards, inr, optLabel } from '@/components/SetupSimple';
import { useColors } from '@/hooks/useColors';
import { attachmentsSupported, fetchAttachmentBlob, pickFile, saveBlob, uploadAttachment, validateFile } from '@/lib/attachments';
import { newRequestId, useErp } from '@/lib/erp';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { LiveAccountsEditor, LiveMatrixEditor, livePayload, seedAccounts, seedMatrix, type AcctDraft, type Matrix } from '@/screens/ProjectLiveEdit';
import {
  CONFIRM_KEY, applyDefaults, buildSetup, emptyDraft, hydrate, isVisible, readAccess, readEntity, readSetupConfig, readSetupState,
  equalShares, inventoryPreview, updatePartnerAllocation, reconcilePartnerCapital, num0, rowErrors, validateAll, type NewAccess, type Row, type SetupConfig, type SetupDraft, type SetupField,
} from '@/lib/projectSetup';
import { errMessage } from '@/lib/session';
import { useRun } from '@/lib/workspace';

const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const setupStateOf = (p: Project) => readSetupState(p).state;

/* ---------- field renderer ---------- */
function SField({ f, row, onChange, error }: { f: SetupField; row: Row; onChange: (v: unknown) => void; error?: string }) {
  const c = useColors();
  if (!isVisible(f, row)) return null;
  if ((f as SetupField & { readOnly?: boolean }).readOnly) {
    const n = Number(row[f.key]);
    return <View style={{ marginBottom: 10 }}><Label>{f.label}{f.unit ? ` (${f.unit})` : ''} · calculated</Label><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', backgroundColor: c.muted, borderRadius: 10, padding: 10 }}>{Number.isFinite(n) && row[f.key] !== undefined && row[f.key] !== '' ? inr(n) : '-'}</Text></View>;
  }
  const label = f.label + (f.unit ? ` (${f.unit})` : '') + (f.required ? ' *' : '');
  const v = row[f.key];
  if (f.kind === 'select' && f.options) {
    return (
      <View>
        <Chips label={label} options={[...(f.required ? [] : [{ value: '', label: 'None' }]), ...f.options.map((o) => ({ value: o, label: optLabel(f, o) }))]} value={typeof v === 'string' ? v : ''} onChange={onChange} />
        {error ? <Text style={{ color: c.destructive, fontSize: 12, marginBottom: 8 }}>{error}</Text> : null}
      </View>
    );
  }
  if (f.kind === 'boolean') {
    return (
      <View>
        <Chips label={label} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} value={v === true ? 'yes' : v === false ? 'no' : ''} onChange={(x) => onChange(x === 'yes')} />
        {error ? <Text style={{ color: c.destructive, fontSize: 12, marginBottom: 8 }}>{error}</Text> : null}
      </View>
    );
  }
  const hint = [f.kind === 'date' ? 'YYYY-MM-DD' : '', f.min !== undefined ? `min ${f.min}` : '', f.max !== undefined ? `max ${f.max}` : '', f.maxLength ? `up to ${f.maxLength} characters` : ''].filter(Boolean).join(' · ');
  return <Field label={label} value={typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''} onChangeText={onChange} keyboardType={f.kind === 'number' ? 'numeric' : 'default'} multiline={f.kind === 'multiline'} height={f.kind === 'multiline' ? 90 : undefined} error={error} hint={hint || undefined} />;
}

function RowEditor({ title, fields, row, prefix, errs, onChange, onRemove, extra }: {
  title: string; fields: SetupField[]; row: Row; prefix: string; errs: Record<string, string>;
  onChange: (k: string, v: unknown) => void; onRemove: () => void; extra?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold' }}>{title}</Text>
        <Btn label="Remove" variant="ghost" icon="trash-2" onPress={onRemove} />
      </View>
      {fields.map((f) => <SField key={f.key} f={f} row={row} error={errs[`${prefix}.${f.key}`]} onChange={(v) => onChange(f.key, v)} />)}
      {extra}
    </Card>
  );
}


/* ---------- live project documents (READY projects) ---------- */
type LiveDoc = { id?: string; title: string; category: string; attachmentId: string; fileName: string; contentType: string; size: number };
function LiveDocuments({ projectId, cfg, revision, onRevision, onDirty, saveRef }: {
  projectId: string; cfg: SetupConfig; revision: number | null; onRevision: (r: number) => void; onDirty: (d: boolean) => void;
  saveRef: React.MutableRefObject<null | (() => Promise<boolean>)>;
}) {
  const c = useColors();
  const [docs, setDocs] = useState<LiveDoc[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [dirty, setDirtyL] = useState(false);
  const [busy, setBusyL] = useState<'' | 'load' | 'upload' | 'save'>('load');
  const [msg, setMsgL] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const revRef = useRef(revision); revRef.current = revision;
  const docsRef = useRef<LiveDoc[] | null>(null); docsRef.current = docs;
  const setDirty = (d: boolean) => { setDirtyL(d); onDirty(d); };
  const catField = cfg.documentFields.find((f) => f.key === 'category');
  const cats = catField?.options ?? [];
  const load = async () => {
    setBusyL('load'); setMsgL(null);
    try {
      const r = await getProjectDocuments(projectId);
      setDocs(r.documents.map((d: ProjectDocument) => ({ ...d }))); setCanManage(r.canManage); setDirty(false);
      if (revRef.current === null || r.revision > revRef.current) onRevision(r.revision);
    } catch (e) { setMsgL({ ok: false, text: errMessage(e) }); } finally { setBusyL(''); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [projectId]);
  const persist = async (): Promise<boolean> => {
    const list = docsRef.current; if (!list) return true;
    const bad = list.findIndex((d) => !d.title.trim() || !d.category);
    if (bad >= 0) { setMsgL({ ok: false, text: `Document ${bad + 1} needs a title and category.` }); return false; }
    setBusyL('save'); setMsgL(null);
    try {
      const r = await saveProjectDocuments(projectId, { revision: revRef.current ?? 0, documents: list.map((d) => ({ ...(d.id ? { id: d.id } : {}), title: d.title.trim(), category: d.category, attachmentId: d.attachmentId })) });
      setDocs(r.documents.map((d: ProjectDocument) => ({ ...d }))); onRevision(r.revision); setDirty(false);
      setMsgL({ ok: true, text: 'Documents saved.' });
      return true;
    } catch (e) { setMsgL({ ok: false, text: `${errMessage(e)} Your document changes are still here; retry or reload.` }); return false; } finally { setBusyL(''); }
  };
  saveRef.current = dirty ? persist : null;
  const upload = async () => {
    if (!attachmentsSupported) { setMsgL({ ok: false, text: 'Document upload is not available on this device.' }); return; }
    setBusyL('upload'); setMsgL(null);
    try {
      const f = await pickFile(DOC_TYPES.join(','));
      if (!f) return;
      const bad = validateFile({ type: f.type, size: f.size }) ?? (DOC_TYPES.includes(f.type.split(';')[0]) ? null : 'Only PDF, PNG, JPEG or WEBP documents are accepted.');
      if (bad) { setMsgL({ ok: false, text: bad }); return; }
      const att = await uploadAttachment(projectId, f, f.name);
      setDocs((l) => [...(l ?? []), { title: att.fileName.replace(/\.[^/.]+$/, ''), category: cats.includes('master_layout') ? 'master_layout' : cats[0] ?? '', attachmentId: att.id, fileName: att.fileName, contentType: att.contentType, size: att.size }]);
      setDirty(true);
      setMsgL({ ok: true, text: `${att.fileName} uploaded privately. Choose its category, then Save documents.` });
    } catch (e) { setMsgL({ ok: false, text: errMessage(e) }); } finally { setBusyL(''); }
  };
  const view = async (d: LiveDoc) => { try { saveBlob(await fetchAttachmentBlob(projectId, d.attachmentId), d.fileName); } catch (e) { setMsgL({ ok: false, text: errMessage(e) }); } };
  const upd = (i: number, k: 'title' | 'category', v: string) => { setDocs((l) => (l ?? []).map((d, j) => (j === i ? { ...d, [k]: v } : d))); setDirty(true); };
  if (!docs) return busy === 'load' ? <Banner tone="warn" title="Loading project documents" /> : <Banner tone="error" title="Documents could not load" text={msg?.text} action={{ label: 'Retry', onPress: () => void load() }} />;
  return (
    <View>
      <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 8 }}>Documents of this live project are managed here directly. Removing a document detaches it from the project list; the private file and any finance or layout history that cites it are kept for audit. Nothing is permanently deleted.</Text>
      {docs.length === 0 ? <Empty icon="file" title="No documents" text="Upload sanctioned plans, permits or layouts. They are stored privately against this project." /> : null}
      {docs.map((d, i) => (
        <Card key={d.id ?? d.attachmentId}>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 6 }}>{d.fileName} · {Math.max(1, Math.round(d.size / 1024))} KB{d.id ? '' : ' · not saved yet'}</Text>
          <Field label="Title *" value={d.title} onChangeText={(v) => upd(i, 'title', v)} editable={canManage} />
          <Chips label="Category *" options={cats.map((o) => ({ value: o, label: catField ? optLabel(catField, o) : o.replace(/_/g, ' ') }))} value={d.category} onChange={(v) => canManage && upd(i, 'category', v)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Btn label="View / download" icon="download" variant="ghost" onPress={() => void view(d)} />
            {canManage ? <Btn label="Remove from project" icon="trash-2" variant="ghost" onPress={() => setRemoving(i)} /> : null}
          </View>
        </Card>
      ))}
      {msg ? <Banner tone={msg.ok ? 'ok' : 'error'} title={msg.text} /> : null}
      {canManage ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn label="Upload document" icon="upload" variant="ghost" loading={busy === 'upload'} disabled={!!busy} onPress={() => void upload()} />
          <Btn label="Save documents" icon="save" loading={busy === 'save'} disabled={!!busy || !dirty} onPress={() => void persist()} />
          {dirty ? <Btn label="Discard document changes" variant="ghost" disabled={!!busy} onPress={() => void load()} /> : null}
        </View>
      ) : <Text style={{ color: c.mutedForeground, fontSize: 12 }}>You can view documents but not change them.</Text>}
      {removing !== null && docs[removing] ? <Confirm title="Remove this document from the project?" text={`"${docs[removing].title}" will no longer be listed once you Save documents. The private file and any receipts, postings or layout versions that reference it stay intact; this is not a permanent deletion.`} confirmLabel="Remove" danger onConfirm={() => { const i = removing; setRemoving(null); setDocs((l) => (l ?? []).filter((_, j) => j !== i)); setDirty(true); }} onCancel={() => setRemoving(null)} /> : null}
    </View>
  );
}

/* ---------- setup flow ---------- */
interface Props {
  items: WorkspaceInterfacesItem[]; // enabled, accountant-assigned sectors
  initialSectorId: string;
  existing: Project | null;
  onClose: () => void;
  onSaved: (projectId: string) => void;
}

export function ProjectSetup({ items, initialSectorId, existing, onClose, onSaved }: Props) {
  const c = useColors();
  const run = useRun();
  const [sectorId, setSectorId] = useState(existing?.sectorId ?? initialSectorId);
  const [pendingSector, setPendingSector] = useState<string | null>(null);
  const item = items.find((i) => i.sectorId === sectorId) ?? items[0];
  const parsed = useMemo(() => readSetupConfig(item?.configuration), [item]);
  const cfg: SetupConfig | null = parsed.config;
  const withDefaults = (d: SetupDraft, k: SetupConfig): SetupDraft => ({ ...d, values: k.sections.reduce((v, s) => applyDefaults(s.fields, v), d.values), settings: applyDefaults(k.settingsFields, d.settings) });
  const [draft, setDraft] = useState<SetupDraft>(() => {
    if (!cfg) return emptyDraft();
    return withDefaults(existing ? hydrate(readSetupState(existing).data, cfg) : emptyDraft(), cfg);
  });
  const seeded = useRef<SetupConfig | null>(cfg);
  useEffect(() => {
    if (!cfg || seeded.current === cfg || existing) return;
    seeded.current = cfg;
    setDraft((d) => withDefaults(d, cfg));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);
  const [projectId, setProjectId] = useState<string | null>(existing?.id ?? null);
  const [revision, setRevision] = useState<number | null>(existing?.revision ?? null);
  const [state, setState] = useState(existing ? readSetupState(existing).state : undefined);
  const [view, setView] = useState<string>('identity');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'draft' | 'final' | 'upload'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [access, setAccess] = useState<NewAccess[]>([]);
  const [plan, setPlan] = useState<null | { title: string; text: string; apply: () => void }>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const finalReq = useRef<string | null>(null);
  const [docsDirty, setDocsDirty] = useState(false);
  const docsSave = useRef<null | (() => Promise<boolean>)>(null);
  const revisionRef = useRef<number | null>(existing?.revision ?? null);
  const lbl = (k: string, d: string) => cfg?.labels[k] ?? d;
  const erpQ = useErp(existing && readSetupState(existing).state === 'READY' ? existing.id : null);
  const erp = erpQ.data;
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [accts, setAccts] = useState<AcctDraft[] | null>(null);
  useEffect(() => { if (erp && !matrix) setMatrix(seedMatrix(erp)); if (erp && !accts) setAccts(seedAccounts(erp)); }, [erp, matrix, accts]);
  const hasPlots = !!erp?.resources.some((r) => r.kind === 'plots');

  const edit = (fn: (d: SetupDraft) => SetupDraft) => { setDraft(fn); setDirty(true); finalReq.current = null; setMsg(null); };
  const setRow = (key: 'groups' | 'partners' | 'accounts' | 'documents', i: number, k: string, v: unknown) =>
    edit((d) => ({ ...d, [key]: d[key].map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  const addRow = (key: 'groups' | 'partners' | 'accounts', fields: SetupField[]) => edit((d) => ({ ...d, [key]: [...d[key], applyDefaults(fields, {})] }));
  const delRow = (key: 'groups' | 'partners' | 'accounts' | 'documents', i: number) => edit((d) => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }));

  const sections = cfg ? [
    ...(cfg.sections.some((s) => s.fields.some((f) => f.key === 'name')) && items.length < 2 ? [] : [{ key: 'identity', title: 'Identity' }]),
    ...cfg.sections.map((s) => ({ key: `s:${s.key}`, title: s.title })),
    ...(cfg.inventory ? [{ key: 'plan', title: lbl('inventory', 'Physical plan') }] : []),
    { key: 'documents', title: 'Documents' },
    ...(cfg.partnerFields.length ? [{ key: 'partners', title: lbl('partners', 'Partners & equity') }] : []),
    ...(cfg.accountFields.length ? [{ key: 'accounts', title: lbl('accounts', 'Project accounts') }] : []),
    ...(cfg.settingsFields.some((f) => (f as SetupField & { ui?: string }).ui !== 'hidden') ? [{ key: 'settings', title: 'Settings' }] : []),
    ...(existing && state === 'READY' ? [{ key: 'live', title: 'Plots & bank accounts' }] : []),
    { key: 'review', title: 'Review' },
  ] : [];

  const ready = state === 'READY';
  const lockNote = ready ? <Banner tone="warn" title="Managed in the project tabs" text="This project is already live. Change partners, accounts and inventory from their own tabs so cleared records are never rewritten here. Only the details and settings above are saved." /> : null;
  const locked = (n: React.ReactNode) => (ready ? <View>{lockNote}<View pointerEvents="none" style={{ opacity: 0.55 }}>{n}</View></View> : n);
  const shareKey = cfg?.partnerFields.find((f) => f.key === 'fixedEquityPercent')?.key ?? null;
  const capKey = cfg?.partnerFields.find((f) => f.key === 'initialCapital')?.key ?? null;
  const budgetKey = typeof cfg?.rules.budgetField === 'string' ? (cfg.rules.budgetField as string) : null;
  const shareTotal = shareKey ? draft.partners.reduce((n, p) => n + num0(p[shareKey]), 0) : 0;
  const capTotal = capKey ? draft.partners.reduce((n, p) => n + num0(p[capKey]), 0) : 0;
  const shareTarget = typeof cfg?.rules.fixedEquityTotal === 'number' ? (cfg.rules.fixedEquityTotal as number) : null;
  const askEqual = () => {
    if (!shareKey || shareTarget === null || !draft.partners.length) return;
    const sh = equalShares(draft.partners.length, shareTarget);
    setPlan({ title: 'Split equity equally?', text: `Each partner's share will be overwritten: ${sh.map((x, i) => `${String(draft.partners[i].name || `Partner ${i + 1}`)} ${x}%`).join(', ')}.`, apply: () => edit((d) => reconcilePartnerCapital(cfg!, { ...d, partners: d.partners.map((p, i) => ({ ...p, [shareKey]: String(sh[i]) })) })) });
  };
  const askCapFromBudget = () => {
    if (!capKey || !budgetKey || !shareKey) return;
    const b = num0(draft.values[budgetKey]);
    setPlan({ title: 'Set capital from the budget?', text: `Each partner's committed capital becomes their share of the ${b.toLocaleString('en-IN')} budget. This is a plan only; no money is recorded.`, apply: () => edit((d) => ({ ...d, partners: d.partners.map((p) => ({ ...p, [capKey]: String(Math.round(((b * num0(p[shareKey])) / 100) * 100) / 100) })) })) });
  };
  const askBudgetFromCap = () => {
    if (!budgetKey || !capKey) return;
    setPlan({ title: 'Set budget from committed capital?', text: `The budget will become ${capTotal.toLocaleString('en-IN')}, the sum of committed capital.`, apply: () => edit((d) => ({ ...d, values: { ...d.values, [budgetKey]: String(capTotal) } })) });
  };
  const render = (f: SetupField, row: Row, error: string | undefined, onChange: (v: unknown) => void) => <SField key={f.key} f={f} row={row} error={error} onChange={onChange} />;
  const simple = (cfg as (SetupConfig & { presentation?: string }) | null)?.presentation === 'open-plotting-simple';
  const ca = cfg?.rules.capitalAllocation as { budgetField?: string; capitalField?: string; equityField?: string; totalPercent?: number } | undefined;
  const overflow = (): string | null => {
    if (!ca) return null;
    const eq = draft.partners.reduce((n, p) => n + num0(p[ca.equityField ?? '']), 0);
    const cap = draft.partners.reduce((n, p) => n + num0(p[ca.capitalField ?? '']), 0);
    const b = ca.budgetField ? num0(draft.values[ca.budgetField]) : 0;
    if (eq > (ca.totalPercent ?? 100) + 0.001) return `Partner equity totals ${eq}%, above ${ca.totalPercent ?? 100}%.`;
    if (b > 0 && cap > b + 0.001) return 'Planned partner capital exceeds the project budget.';
    return null;
  };
  const close = () => (dirty || docsDirty ? setConfirmClose(true) : onClose());
  const liveDocs = ready && !!projectId;
  const onDocsRevision = React.useCallback((r: number) => { revisionRef.current = r; setRevision(r); }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !(dirty || docsDirty)) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, docsDirty]);

  const save = async (): Promise<{ id: string; revision: number } | null> => {
    if (!cfg) return null;
    if (!String(draft.values.name ?? '').trim()) { setErrs((e) => ({ ...e, 'values.name': 'Project name is required.' })); setView('identity'); setMsg({ ok: false, text: 'Enter the project name to save a draft.' }); return null; }
    const ov = overflow(); if (ov) { setView('partners'); setMsg({ ok: false, text: ov }); return null; }
    const payload: Record<string, unknown> = buildSetup(cfg, draft);
    if (ready && existing) {
      const previous = readSetupState(existing).data;
      const snapshot = previous && typeof previous === 'object' ? previous as Record<string, unknown> : {};
      for (const key of ['groups', 'partners', 'accounts', 'documents']) payload[key] = Array.isArray(snapshot[key]) ? snapshot[key] : [];
    }
    const live = ready && existing && erp ? livePayload(erp, hasPlots && matrixDirty ? matrix : null, accts ?? []) : {};
    const res = await run('project.setup-save', {
      sectorId, reviewedReleaseId: item?.releaseId, ...(projectId ? { projectId, revision: revisionRef.current ?? revision } : {}), requestId: newRequestId(), setup: payload, ...live,
    });
    if (ready && erp) { setMatrixDirty(false); setMatrix(null); setAccts(null); void erpQ.refetch(); }
    const ent = readEntity(res);
    setProjectId(ent.id); setRevision(ent.revision); revisionRef.current = ent.revision; setState((ent.setupState as 'DRAFT' | 'READY' | undefined) ?? state); setDirty(false);
    return ent;
  };

  const saveDraft = async () => {
    setBusy('draft'); setMsg(null);
    try {
      if (docsSave.current && !(await docsSave.current())) { setView('documents'); setMsg({ ok: false, text: 'Documents could not be saved, so other changes were not saved either. Fix the documents section and retry.' }); return; }
      if (!dirty && ready) { setMsg({ ok: true, text: 'Changes saved.' }); return; }
      const ent = await save(); if (ent) setMsg({ ok: true, text: state === 'READY' ? 'Changes saved.' : 'Draft saved. You can resume it from the project list.' }); }
    catch (e) { setMsg({ ok: false, text: errMessage(e) }); } finally { setBusy(null); }
  };

  const finalize = async () => {
    if (!cfg) return;
    const e = validateAll(cfg, draft, 'name');
    const ov = overflow(); if (ov) e.partners = ov;
    setErrs(e);
    if (Object.keys(e).length) { setView('review'); setMsg({ ok: false, text: 'Fix the listed problems before creating the project.' }); return; }
    setBusy('final'); setMsg(null);
    try {
      const ent = await save();
      if (!ent) return;
      finalReq.current = finalReq.current ?? newRequestId();
      const res = await run('project.setup-finalize', { projectId: ent.id, revision: ent.revision, requestId: finalReq.current });
      const fin = readEntity(res);
      if (fin.setupState !== 'READY') throw new Error('The project was saved but not marked ready. Resume setup to retry.');
      setState("READY"); setRevision(fin.revision); revisionRef.current = fin.revision; setDoneId(fin.id);
      const acc = readAccess(res);
      if (acc.length) setAccess(acc); else onSaved(fin.id);
    } catch (er) { setMsg({ ok: false, text: errMessage(er) }); } finally { setBusy(null); }
  };

  const upload = async () => {
    if (!attachmentsSupported) { setMsg({ ok: false, text: 'Document upload is available in the web app.' }); return; }
    setBusy('upload'); setMsg(null);
    try {
      let id = projectId;
      if (!id) { const ent = await save(); if (!ent) return; id = ent.id; }
      const f = await pickFile(DOC_TYPES.join(','));
      if (!f) return;
      const bad = validateFile({ type: f.type, size: f.size }) ?? (DOC_TYPES.includes(f.type.split(';')[0]) ? null : 'Only PDF, PNG, JPEG or WEBP documents are accepted.');
      if (bad) { setMsg({ ok: false, text: bad }); return; }
      const att = await uploadAttachment(id, f, f.name);
      edit((d) => ({ ...d, documents: [...d.documents, { title: att.fileName, category: '', attachmentId: att.id }] }));
    } catch (e) { setMsg({ ok: false, text: errMessage(e) }); } finally { setBusy(null); }
  };

  const changeSector = (id: string) => {
    if (id === sectorId) return;
    const has = dirty || Object.keys(draft.values).length > 0 || draft.groups.length + draft.partners.length + draft.accounts.length > 0;
    if (has) setPendingSector(id); else setSectorId(id);
  };

  /* ----- body ----- */
  const body = (key: string): React.ReactNode => {
    if (!cfg) return null;
    const secVals = (fields: SetupField[]) => fields.map((f) => <SField key={f.key} f={f} row={draft.values} error={errs[`values.${f.key}`]} onChange={(v) => edit((d) => { const n = { ...d, values: { ...d.values, [f.key]: v } }; return ca && f.key === ca.budgetField && !ready ? reconcilePartnerCapital(cfg, n) : n; })} />);
    if (key === 'identity') {
      const nameInSection = cfg.sections.some((s) => s.fields.some((f) => f.key === 'name'));
      return (
        <Card>
          {!nameInSection ? <Field label="Project / venture name *" value={String(draft.values.name ?? '')} onChangeText={(v) => edit((d) => ({ ...d, values: { ...d.values, name: v } }))} error={errs['values.name']} /> : null}
          <Chips label="Sector" options={items.map((i) => ({ value: i.sectorId, label: i.sectorName }))} value={sectorId} onChange={(v) => (projectId ? undefined : changeSector(v))} />
          {projectId ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>The sector is fixed once a draft exists.</Text> : null}
        </Card>
      );
    }
    if (key.startsWith('s:')) { const s = cfg.sections.find((x) => `s:${x.key}` === key); return s ? <Card>{secVals(s.fields)}</Card> : null; }
    if (key === 'plan' && cfg.inventory) {
      const inv = cfg.inventory;
      const pv = inventoryPreview(cfg, draft.groups);
      return locked(
        <View>
          <Banner tone="warn" title="Planned groups are not inventory yet" text="Inventory is generated by the server when the project is created, from the count, area and rate you enter. Nothing is generated while this is a draft." />
          {pv ? <Card><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold' }}>Preview from entered groups</Text><Text style={{ color: c.mutedForeground }}>{pv.count.toLocaleString('en-IN')} to be generated · {pv.area.toLocaleString('en-IN')} total area{pv.value !== null ? ` · projected value ${pv.value.toLocaleString('en-IN')}` : ''}. An estimate; the server generates the real inventory.</Text></Card> : null}
          {errs.groups ? <Text style={{ color: c.destructive, marginBottom: 8 }}>{errs.groups}</Text> : null}
          {simple ? <FacingMatrix cfg={cfg} draft={draft} edit={edit} errs={errs} render={render} /> : null}
          {!simple ? draft.groups.map((g, i) => <RowEditor key={i} title={`${inv.kind || 'Group'} ${i + 1}`} fields={inv.fields} row={g} prefix={`groups.${i}`} errs={errs} onChange={(k, v) => setRow('groups', i, k, v)} onRemove={() => delRow('groups', i)} />) : null}
          {!simple && draft.groups.length < inv.maxRows ? <Btn label="Add group" icon="plus" variant="ghost" onPress={() => addRow('groups', inv.fields)} /> : (!simple ? <Text style={{ color: c.mutedForeground }}>Maximum of {inv.maxRows} rows reached.</Text> : null)}
        </View>
      );
    }
    if (key === 'documents' && ready && projectId) return null; // rendered persistently below so unsaved edits survive navigation
    if (key === 'documents') {
      return locked(
        <View>
          {draft.documents.length === 0 ? <Empty icon="file" title="No documents" text="Upload sanctioned plans, permits or blueprints. They are stored privately against this project." /> : null}
          {draft.documents.map((d, i) => (
            <Card key={i}>
              {cfg.documentFields.filter((f) => f.key !== 'attachmentId').map((f) => (
                <SField key={f.key} f={f} row={d} error={errs[`documents.${i}.${f.key}`]} onChange={(v) => setRow('documents', i, f.key, v)} />
              ))}
              <Btn label="Remove from draft" variant="ghost" icon="trash-2" onPress={() => delRow('documents', i)} />
            </Card>
          ))}
          {!cfg.documentFields.length ? <Banner tone="warn" title="Document configuration unavailable" text="The owner must configure document fields in this sector release before uploading." /> : null}
          <Btn label={projectId ? 'Upload document' : 'Save draft and upload'} icon="upload" loading={busy === 'upload'} disabled={!cfg.documentFields.length} onPress={upload} />
          {!attachmentsSupported ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 6 }}>Document upload is only available in the web app.</Text> : null}
        </View>
      );
    }
    if (key === 'partners') {
      return locked(
        <View>
          {shareKey ? <Card><Text style={{ color: shareTarget !== null && Math.abs(shareTotal - shareTarget) > 0.001 && draft.partners.length ? c.destructive : c.foreground, fontFamily: 'Inter_700Bold' }}>Shares {shareTotal}%{shareTarget !== null ? ` of ${shareTarget}%` : ''}{capKey ? ` · Committed capital ${capTotal.toLocaleString('en-IN')}` : ''}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <Btn label="Split Equity Equally" variant="ghost" disabled={!draft.partners.length || shareTarget === null} onPress={askEqual} />
              {ca ? <Btn label="Recalculate capital" variant="ghost" disabled={!draft.partners.length} onPress={() => edit((d) => reconcilePartnerCapital(cfg, d))} /> : null}
              {!simple && budgetKey && capKey ? <Btn label="Sync Capital from Cost" variant="ghost" disabled={!draft.partners.length} onPress={askCapFromBudget} /> : null}
              {!simple && budgetKey && capKey ? <Btn label="Sync Cost from Capital" variant="ghost" disabled={!draft.partners.length} onPress={askBudgetFromCap} /> : null}
            </View></Card> : null}
          {errs.partners ? <Text style={{ color: c.destructive, marginBottom: 8 }}>{errs.partners}</Text> : null}
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 8 }}>Committed capital is a plan, not money received. Login access is issued only when the project is created.</Text>
          {simple ? <PartnerCards cfg={cfg} draft={draft} edit={edit} errs={errs} render={render} update={(i, k, v) => edit((d) => updatePartnerAllocation(cfg, d, i, k, v))} /> : null}
          {!simple ? draft.partners.map((p, i) => <RowEditor key={i} title={String(p.name || `Partner ${i + 1}`)} fields={cfg.partnerFields} row={p} prefix={`partners.${i}`} errs={errs} onChange={(k, v) => setRow('partners', i, k, v)} onRemove={() => delRow('partners', i)} />) : null}
          {typeof cfg.rules.maxPartners !== 'number' || draft.partners.length < cfg.rules.maxPartners ? <Btn label="Add partner" icon="user-plus" variant="ghost" onPress={() => (cfg.rules.autoAllocateFirstPartner === true && ca && draft.partners.length === 0 ? edit((d) => reconcilePartnerCapital(cfg, { ...d, partners: [applyDefaults(cfg.partnerFields, { [ca.equityField ?? '']: String(ca.totalPercent ?? 100) })] })) : addRow('partners', cfg.partnerFields))} /> : null}
        </View>
      );
    }
    if (key === 'accounts') {
      const hasNo = cfg.accountFields.some((f) => f.key === 'accountNumber');
      return locked(
        <View>
          {errs.accounts ? <Text style={{ color: c.destructive, marginBottom: 8 }}>{errs.accounts}</Text> : null}
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 8 }}>These accounts belong only to this project. Balances come from posted entries, never from a typed number.</Text>
          {simple ? <AccountCards cfg={cfg} draft={draft} edit={edit} errs={errs} render={render} /> : null}
          {!simple ? draft.accounts.map((a, i) => (
            <RowEditor key={i} title={String(a.name || a.displayName || `Account ${i + 1}`)} fields={cfg.accountFields} row={a} prefix={`accounts.${i}`} errs={errs} onChange={(k, v) => setRow('accounts', i, k, v)} onRemove={() => delRow('accounts', i)}
              extra={hasNo ? <Field label="Confirm account number *" value={String(a[CONFIRM_KEY] ?? '')} onChangeText={(v) => setRow('accounts', i, CONFIRM_KEY, v)} error={errs[`accounts.${i}.${CONFIRM_KEY}`]} /> : null} />
          )) : null}
          {typeof cfg.rules.maxAccounts !== 'number' || draft.accounts.length < cfg.rules.maxAccounts ? <Btn label="Add account" icon="plus" variant="ghost" onPress={() => addRow('accounts', cfg.accountFields)} /> : null}
        </View>
      );
    }
    if (key === 'settings') {
      return <Card>{cfg.settingsFields.filter((f) => (f as SetupField & { ui?: string }).ui !== 'hidden').map((f) => <SField key={f.key} f={f} row={draft.settings} error={errs[`settings.${f.key}`]} onChange={(v) => edit((d) => ({ ...d, settings: { ...d.settings, [f.key]: v } }))} />)}</Card>;
    }
    if (key === 'live') {
      if (!erp) return <Banner tone={erpQ.isError ? 'error' : 'warn'} title={erpQ.isError ? 'Saved plots and accounts could not load' : 'Loading saved plots and accounts'} text={erpQ.isError ? errMessage(erpQ.error) : undefined} />;
      return (
        <View>
          {hasPlots && matrix ? <LiveMatrixEditor matrix={matrix} onChange={(m) => { setMatrix(m); setMatrixDirty(true); setDirty(true); }} /> : null}
          {accts ? <LiveAccountsEditor erp={erp} accts={accts} onChange={(a) => { setAccts(a); setDirty(true); }} /> : null}
        </View>
      );
    }
    if (key === 'review') {
      const list = Object.entries(errs);
      return (
        <View>
          <Card>
            <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 6 }}>{String(draft.values.name || 'Unnamed project')}</Text>
            {[['Sector', item?.sectorName ?? ''], ['Groups', String(draft.groups.length)], ['Documents', String(draft.documents.length)], ['Partners', String(draft.partners.length)], ['Accounts', String(draft.accounts.length)]].map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}><Text style={{ color: c.mutedForeground }}>{k}</Text><Text style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold' }}>{v}</Text></View>
            ))}
          </Card>
          <Btn label="Check for problems" variant="ghost" icon="check-circle" onPress={() => {
            const checked = validateAll(cfg, draft, 'name');
            setErrs(checked);
            setMsg({ ok: !Object.keys(checked).length, text: Object.keys(checked).length ? 'Please fix the highlighted fields before creating the project.' : 'No problems found. Ready to create the project.' });
          }} />
          {list.length ? <Banner tone="error" title={`${list.length} problem${list.length === 1 ? '' : 's'} to fix`} text={list.slice(0, 12).map(([, m]) => m).join('\n')} /> : null}
        </View>
      );
    }
    return null;
  };

  const curView = view === 'all' || sections.some((s) => s.key === view) ? view : sections[0]?.key ?? 'all';
  const shown = curView === 'all' ? sections.map((s) => s.key) : [curView];
  const idx = sections.findIndex((s) => s.key === curView);

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: c.card, width: '100%', maxWidth: 1040, alignSelf: 'center' }}>
        <View style={{ padding: 16, paddingTop: 24, borderBottomWidth: 1, borderColor: c.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>{existing ? `Edit ${existing.name}` : cfg?.title ?? 'Add Project'}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>{state ? <Badge text={state === 'READY' ? 'Ready' : 'Draft'} tone={state === 'READY' ? 'ok' : 'warn'} /> : <Badge text="Not saved" tone="muted" />}{dirty || docsDirty ? <Badge text="Unsaved changes" tone="bad" /> : null}</View>
            </View>
            <Btn label="Close" variant="ghost" icon="x" onPress={close} />
          </View>
          {cfg ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[{ key: 'all', title: 'All sections' }, ...sections].map((s) => (
                  <Pressable key={s.key} onPress={() => setView(s.key)} accessibilityRole="tab" style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: curView === s.key ? c.primary : c.muted }}>
                    <Text style={{ color: curView === s.key ? c.primaryForeground : c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{s.title}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} bottomOffset={90} keyboardShouldPersistTaps="handled">
          {!cfg ? <Banner tone="error" title="Project setup is not configured" text={parsed.error ?? ''} /> : null}
          {shown.map((k) => (k === 'documents' && liveDocs ? null : (
            <View key={k} style={{ marginBottom: 16 }}>
              {curView === 'all' ? <Label>{(sections.find((s) => s.key === k)?.title ?? '').toUpperCase()}</Label> : null}
              {body(k)}
            </View>
          )))}
          {liveDocs && cfg && projectId ? (
            <View style={{ marginBottom: 16, display: shown.includes('documents') ? 'flex' : 'none' }}>
              {curView === 'all' ? <Label>DOCUMENTS</Label> : null}
              <LiveDocuments projectId={projectId} cfg={cfg} revision={revision} onRevision={onDocsRevision} onDirty={setDocsDirty} saveRef={docsSave} />
            </View>
          ) : null}
        </KeyboardAwareScrollViewCompat>
        <View style={{ padding: 12, borderTopWidth: 1, borderColor: c.border, gap: 8 }}>
          {msg ? <Banner tone={msg.ok ? 'ok' : 'error'} title={msg.text} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {curView !== 'all' && idx > 0 ? <Btn label="Back" variant="ghost" onPress={() => setView(sections[idx - 1].key)} /> : null}
            {curView !== 'all' && idx >= 0 && idx < sections.length - 1 ? <Btn label="Next" variant="ghost" onPress={() => setView(sections[idx + 1].key)} /> : null}
            <Btn label={state === 'READY' ? 'Save changes' : 'Save Draft'} variant="ghost" loading={busy === 'draft'} disabled={!cfg || !!busy} onPress={saveDraft} />
            {state !== 'READY' ? <Btn label="Create Project & Load Data" loading={busy === 'final'} disabled={!cfg || !!busy} onPress={finalize} /> : null}
          </View>
        </View>
      </View>
      {plan ? <Confirm title={plan.title} text={plan.text} confirmLabel="Apply" onConfirm={() => { plan.apply(); setPlan(null); }} onCancel={() => setPlan(null)} /> : null}
      {confirmClose ? <Confirm title="Discard unsaved changes?" text="Changes since the last save will be lost. A saved draft is kept." confirmLabel="Discard" danger onConfirm={onClose} onCancel={() => setConfirmClose(false)} /> : null}
      {pendingSector ? <Confirm title="Change sector?" text="Fields from the current sector may not apply to the new one. Everything entered so far will be cleared." confirmLabel="Change sector" danger onConfirm={() => { setSectorId(pendingSector); setDraft(emptyDraft()); setErrs({}); setPendingSector(null); setDirty(false); }} onCancel={() => setPendingSector(null)} /> : null}
      <CredentialSheet access={access[0] ?? null} onDone={() => { const rest = access.slice(1); setAccess(rest); if (!rest.length && doneId) onSaved(doneId); }} />
    </Modal>
  );
}

/* ---------- project bar: searchable dropdown + add/resume ---------- */
export function ProjectBar({ firm, projects, selected, onSelect, canAdd, onAdd, onEdit, label, setupDisabled = false }: {
  projects: Project[]; selected: Project | null; onSelect: (id: string) => void; canAdd: boolean; onAdd: () => void; onEdit?: () => void; label: string; setupDisabled?: boolean; firm?: React.ReactNode;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const code = (p: Project) => { const x = (p.details as Record<string, unknown> | undefined)?.projectCode ?? (p.details as Record<string, unknown> | undefined)?.code; return typeof x === 'string' && x ? x : ''; };
  const list = projects.filter((p) => `${p.name} ${code(p)}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={{ gap: 4, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
        {firm ? <View style={{ flexBasis: 0, flexGrow: 2, minWidth: 0 }}>{firm}</View> : null}
        <Pressable testID="project-picker" onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.name ?? 'none selected'}`} style={{ flexBasis: 0, flexGrow: 3, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
            <Text style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }} numberOfLines={1}>{selected ? `${selected.name}${code(selected) ? ` · ${code(selected)}` : ''}` : 'Select a project'}</Text>
          </View>
          <Feather name="chevron-down" size={14} color={c.mutedForeground} />
        </Pressable>
        {onEdit && selected ? <Pressable testID="project-edit" onPress={onEdit} disabled={setupDisabled} accessibilityRole="button" accessibilityLabel={setupStateOf(selected) === 'DRAFT' ? 'Resume setup' : 'Edit project setup'} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: setupDisabled ? 0.5 : 1 }}>
          <Feather name="edit-2" size={14} color={c.foreground} />
          <Text style={{ color: c.foreground, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>{setupStateOf(selected) === 'DRAFT' ? 'Resume' : 'Edit'}</Text>
        </Pressable> : null}
      </View>
      <Sheet visible={open} title="Projects" onClose={() => setOpen(false)}>
        <Field label="Search by name or code" value={q} onChangeText={setQ} />
        <ScrollView style={{ maxHeight: 320 }}>
          {list.length === 0 ? <Text style={{ color: c.mutedForeground }}>No project matches.</Text> : list.map((p) => (
            <Pressable key={p.id} onPress={() => { setOpen(false); setQ(''); onSelect(p.id); }} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: c.border, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ color: c.foreground, flex: 1 }}>{p.name}{code(p) ? ` · ${code(p)}` : ''}</Text>
              {setupStateOf(p) === 'DRAFT' ? <Badge text="Draft" tone="warn" /> : null}
            </Pressable>
          ))}
        </ScrollView>
        {canAdd ? <View style={{ marginTop: 8 }}><Btn label="Add Project" icon="plus" onPress={() => { setOpen(false); onAdd(); }} disabled={setupDisabled} /></View> : null}
        <Btn label="Close" variant="ghost" onPress={() => setOpen(false)} />
      </Sheet>
      {canAdd ? <Pressable testID="project-add" onPress={onAdd} disabled={setupDisabled} accessibilityRole="button" accessibilityLabel="Add Project" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 4, opacity: setupDisabled ? 0.5 : 1 }}>
        <Feather name="plus" size={14} color={c.primary} /><Text style={{ color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 12 }}>Add Project</Text>
      </Pressable> : null}
    </View>
  );
}

export { rowErrors };
