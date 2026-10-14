import React, { useEffect, useMemo, useState } from 'react';
import { guardLeave } from '@/lib/leaveGuard';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type {
  ConfigComponent,
  ConfigField,
  Project,
  SectorConfiguration,
  SessionAccount,
  Workspace,
  WorkspaceInterfacesItem,
} from '@workspace/api-client-react';
import { Badge, Btn, Banner, Card, Chips, CredentialSheet, Empty, Field, H1, Label, Sheet } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { errMessage, useAuth } from '@/lib/session';
import '@/screens/ErpBespoke';
import { ERP_KEYS, ErpComponent, registerNav, useLang } from '@/screens/ErpScreens';
import type { TKey } from '@/lib/i18n';
import { useRun } from '@/lib/workspace';
import { ProjectBar, ProjectSetup, setupStateOf } from '@/screens/ProjectSetup';
import { readSetupConfig } from '@/lib/projectSetup';

type Mode = 'live' | 'readonly' | 'preview';
type Raw = string | boolean | null;
type Access = { mobile: string; reused: boolean; temporaryCredential?: string; expiresAt?: string };

const STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));

const detailKey = (k: string) => k.slice('details.'.length);

/** Returns a problem description when the configured fields do not match the trusted command contract. */
function checkFields(fields: ConfigField[], required: string[], coreAllowed: string[], allowDetails: boolean): string | null {
  for (const r of required) if (!fields.some((f) => f.key === r)) return `Missing required field "${r}".`;
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) return `Duplicate field key "${f.key}".`;
    seen.add(f.key);
    const okCore = coreAllowed.includes(f.key);
    const okDetail = allowDetails && f.key.startsWith('details.') && f.key.length > 'details.'.length;
    if (!okCore && !okDetail) return `Field key "${f.key}" is not supported by this form.`;
  }
  return null;
}

function InvalidConfig({ what, problem }: { what: string; problem: string }) {
  return <Banner tone="error" title={`Invalid configuration: ${what}`} text={`${problem} The release must be corrected by the owner; nothing has been substituted.`} />;
}

function readField(f: ConfigField, p: Project | null): Raw {
  let v: unknown;
  if (!p) v = undefined;
  else if (f.key === 'name') v = p.name;
  else if (f.key === 'location') v = p.location;
  else v = p.details?.[detailKey(f.key)];
  if (f.kind === 'boolean') return typeof v === 'boolean' ? v : null;
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Returns [value, error]. Keeps 0, null and '' distinct. */
function parseField(f: ConfigField, raw: Raw): [unknown, string | null] {
  const k = f.constraints ?? {};
  const num = (x: unknown) => (typeof x === 'number' ? x : undefined);
  if (f.kind === 'boolean') {
    if (raw === null && f.required) return [null, `${f.label} is required.`];
    return [raw, null];
  }
  const t = typeof raw === 'string' ? raw : '';
  if (t.trim() === '') {
    if (f.required) return [null, `${f.label} is required.`];
    return [f.kind === 'text' ? t : null, null];
  }
  if (f.kind === 'number') {
    const n = Number(t);
    if (!Number.isFinite(n)) return [null, `${f.label} must be a number.`];
    if (num(k.min) !== undefined && n < (k.min as number)) return [null, `${f.label} must be at least ${k.min}.`];
    if (num(k.max) !== undefined && n > (k.max as number)) return [null, `${f.label} must be at most ${k.max}.`];
    return [n, null];
  }
  if (f.kind === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return [null, `${f.label} must be YYYY-MM-DD.`];
    return [t, null];
  }
  if (f.kind === 'select') {
    if (!f.options.some((o) => o.value === t)) return [null, `Choose a valid ${f.label}.`];
    return [t, null];
  }
  if (num(k.maxLength) !== undefined && t.length > (k.maxLength as number)) return [null, `${f.label} is limited to ${k.maxLength} characters.`];
  return [t, null];
}

function FieldInput({ f, value, onChange, error }: { f: ConfigField; value: Raw; onChange: (v: Raw) => void; error?: string }) {
  const c = useColors();
  const label = f.label + (f.required ? ' *' : '');
  if (f.kind === 'select') {
    return (
      <View>
        <Chips
          label={label}
          options={[...(f.required ? [] : [{ value: '', label: 'None' }]), ...f.options]}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v)}
        />
        {error ? <Text style={{ color: c.destructive, fontSize: 12, marginBottom: 8 }}>{error}</Text> : null}
      </View>
    );
  }
  if (f.kind === 'boolean') {
    return (
      <View>
        <Chips
          label={label}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            ...(f.required ? [] : [{ value: 'unset', label: 'Not set' }]),
          ]}
          value={value === true ? 'yes' : value === false ? 'no' : f.required ? '' : 'unset'}
          onChange={(v) => onChange(v === 'yes' ? true : v === 'no' ? false : null)}
        />
        {error ? <Text style={{ color: c.destructive, fontSize: 12, marginBottom: 8 }}>{error}</Text> : null}
      </View>
    );
  }
  const k = f.constraints ?? {};
  const hint = [
    f.kind === 'date' ? 'YYYY-MM-DD' : '',
    k.min !== undefined ? `min ${String(k.min)}` : '',
    k.max !== undefined ? `max ${String(k.max)}` : '',
    k.maxLength !== undefined ? `up to ${String(k.maxLength)} characters` : '',
  ].filter(Boolean).join(' · ');
  return (
    <Field
      label={label}
      value={typeof value === 'string' ? value : ''}
      onChangeText={onChange}
      keyboardType={f.kind === 'number' ? 'numeric' : 'default'}
      error={error}
      hint={hint || undefined}
    />
  );
}

interface Ctx {
  item: WorkspaceInterfacesItem;
  projects: Project[];
  selected: Project | null;
  select: (id: string | null) => void;
  role: SessionAccount['role'];
  mode: Mode;
}

function ProjectList({ ctx }: { ctx: Ctx }) {
  const c = useColors();
  if (!ctx.projects.length)
    return <Empty icon="folder" title="No projects yet" text="Projects in this sector will appear here once they exist." />;
  return (
    <View>
      {ctx.projects.map((p) => {
        const on = ctx.selected?.id === p.id;
        return (
          <Pressable key={p.id} onPress={() => ctx.select(on ? null : p.id)} accessibilityRole="button">
            <Card style={{ borderColor: on ? c.primary : c.border, borderWidth: on ? 2 : 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 16, flex: 1 }}>{p.name}</Text>
                <Badge text={p.status} tone={p.status === 'ACTIVE' ? 'ok' : 'muted'} />
              </View>
              <Text style={{ color: c.mutedForeground, marginTop: 4 }}>{p.location || 'No location'}</Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 6 }}>
                {p.partners.length} partner{p.partners.length === 1 ? '' : 's'} · {on ? 'selected' : 'tap to select'}
              </Text>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

function Summary({ ctx }: { ctx: Ctx }) {
  const c = useColors();
  const by = (s: string) => ctx.projects.filter((p) => p.status === s).length;
  const partners = ctx.projects.reduce((n, p) => n + p.partners.length, 0);
  const stats: [string, number][] = [
    ['Projects', ctx.projects.length],
    ['Active', by('ACTIVE')],
    ['Completed', by('COMPLETED')],
    ['Archived', by('ARCHIVED')],
    ['Partner links', partners],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
      {stats.map(([l, n]) => (
        <Card key={l} style={{ minWidth: 120, flexGrow: 1, marginBottom: 0 }}>
          <Text style={{ color: c.foreground, fontSize: 28, fontFamily: 'Inter_700Bold' }}>{n}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{l}</Text>
        </Card>
      ))}
    </View>
  );
}

function ReadOnlyNote() {
  return <Empty icon="lock" title="Read-only" text="This sector is disabled for the firm. Existing records stay visible, but changes are not available." />;
}

function PreviewNote() {
  return <Banner tone="warn" title="Preview only" text="This form shows the configured layout. Nothing is submitted from here." />;
}

function NeedProject() {
  return <Empty icon="mouse-pointer" title="Select a project first" text="Choose a project from the project list, then return here." />;
}

function PartnerList({ ctx }: { ctx: Ctx }) {
  const c = useColors();
  if (!ctx.selected) return <NeedProject />;
  const ps = ctx.selected.partners;
  return (
    <View>
      <Label>{`PARTNERS IN ${ctx.selected.name.toUpperCase()}`}</Label>
      {ps.length === 0 ? (
        <Empty icon="users" title="No partners on this project" />
      ) : (
        ps.map((p) => (
          <Card key={p.identityId} style={{ padding: 12 }}>
            <Text style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold' }}>{p.displayName}</Text>
            {p.mobile ? <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{p.mobile}</Text> : null}
          </Card>
        ))
      )}
    </View>
  );
}

function ProjectForm({ ctx, comp }: { ctx: Ctx; comp: ConfigComponent }) {
  const run = useRun();
  const editing = ctx.selected;
  const fields = comp.fields;
  const problem = useMemo(() => checkFields(fields, ['name'], ['name', 'location'], true), [fields]);
  const [vals, setVals] = useState<Record<string, Raw>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const key = editing ? `${editing.id}:${editing.revision}` : null;
  if (loadedFor !== key) {
    const init: Record<string, Raw> = {};
    fields.forEach((f) => (init[f.key] = readField(f, editing)));
    setVals(init);
    setStatus(editing?.status ?? null);
    setErrs({});
    setLoadedFor(key);
  }
  if (problem) return <InvalidConfig what="project form" problem={problem} />;
  if (ctx.mode === 'readonly') return <ReadOnlyNote />;
  const preview = ctx.mode === 'preview';
  if (!editing) {
    const sc = readSetupConfig(ctx.item.configuration);
    return sc.config
      ? <Empty icon="folder-plus" title="Add a project" text="Use Add Project in the project bar above. Projects are created through the complete setup flow." />
      : <Banner tone="error" title="Project setup is not configured" text={sc.error ?? ''} />;
  }
  const wanted = editing ? 'project.update' : 'project.create';
  const action = comp.actions.find((a) => a.key === wanted);
  const known = comp.actions.filter((a) => a.key !== 'project.create' && a.key !== 'project.update');

  const submit = async () => {
    if (preview) return;
    const e: Record<string, string> = {};
    const details: Record<string, unknown> = { ...(editing?.details ?? {}) };
    let name = '';
    let location: string | null = null;
    for (const f of fields) {
      const [v, err] = parseField(f, vals[f.key] ?? (f.kind === 'boolean' ? null : ''));
      if (err) e[f.key] = err;
      else if (f.key === 'name') name = String(v ?? '');
      else if (f.key === 'location') location = v === null || v === '' ? null : String(v);
      else details[detailKey(f.key)] = v;
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setMsg(null);
    try {
      if (editing) {
        await run('project.update', { projectId: editing.id, revision: editing.revision, name, location, status: status ?? editing.status, details });
        setMsg({ ok: true, text: 'Project updated.' });
      } else {
        await run('project.create', { sectorId: ctx.item.sectorId, name, location, details });
        setMsg({ ok: true, text: 'Project created.' });
        setVals({});
        setLoadedFor(undefined);
      }
    } catch (err) {
      setMsg({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 12 }}>
        {editing ? `Edit ${editing.name}` : 'New project'}
      </Text>
      {preview ? <PreviewNote /> : null}
      {editing ? <Btn label="Start a new project instead" variant="ghost" onPress={() => ctx.select(null)} /> : null}
      <View style={{ height: 12 }} />
      {fields.map((f) => (
        <FieldInput key={f.key} f={f} value={vals[f.key] ?? (f.kind === 'boolean' ? null : '')} error={errs[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} />
      ))}
      {editing ? <Chips label="Status" options={STATUSES} value={status ?? ''} onChange={setStatus} /> : null}
      {msg ? <Banner tone={msg.ok ? 'ok' : 'error'} title={msg.text} /> : null}
      {action ? (
        <Btn label={action.label} onPress={submit} loading={busy} disabled={preview} />
      ) : (
        <Banner tone="warn" title="Action not configured" text={`This interface does not include a ${wanted} action, so this form is read-only.`} />
      )}
      {known.length ? <Text style={{ color: '#718078', fontSize: 12, marginTop: 8 }}>Other configured actions are not supported yet: {known.map((a) => a.label).join(', ')}.</Text> : null}
    </Card>
  );
}

function PartnerForm({ ctx, comp }: { ctx: Ctx; comp: ConfigComponent }) {
  const run = useRun();
  const fields = comp.fields;
  const problem = useMemo(() => checkFields(fields, ['name', 'mobile'], ['name', 'mobile'], false), [fields]);
  const [vals, setVals] = useState<Record<string, Raw>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  if (problem) return <InvalidConfig what="partner form" problem={problem} />;
  if (ctx.mode === 'readonly') return <ReadOnlyNote />;
  if (!ctx.selected) return <NeedProject />;
  const preview = ctx.mode === 'preview';
  const action = comp.actions.find((a) => a.key === 'partner.add');

  const submit = async () => {
    if (preview) return;
    const e: Record<string, string> = {};
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const [v, err] = parseField(f, vals[f.key] ?? (f.kind === 'boolean' ? null : ''));
      if (err) e[f.key] = err;
      else out[f.key] = v;
    }
    setErrs(e);
    if (Object.keys(e).length || !ctx.selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await run('partner.add', { projectId: ctx.selected.id, name: out.name, mobile: out.mobile });
      setVals({});
      setMsg({ ok: true, text: 'Partner added.' });
      if (res.access) setAccess(res.access);
    } catch (err) {
      setMsg({ ok: false, text: errMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 12 }}>{ctx.selected.name}</Text>
      {preview ? <PreviewNote /> : null}
      {fields.map((f) => (
        <FieldInput key={f.key} f={f} value={vals[f.key] ?? (f.kind === 'boolean' ? null : '')} error={errs[f.key]} onChange={(v) => setVals((x) => ({ ...x, [f.key]: v }))} />
      ))}
      {msg ? <Banner tone={msg.ok ? 'ok' : 'error'} title={msg.text} /> : null}
      {action ? <Btn label={action.label} onPress={submit} loading={busy} disabled={preview} /> : <Banner tone="warn" title="Action not configured" text="This form has no partner.add action." />}
      <CredentialSheet access={access} onDone={() => setAccess(null)} />
    </Card>
  );
}

function ErpHost({ comp, ctx }: { comp: ConfigComponent; ctx: Ctx }) {
  const { account } = useAuth();
  if (!account) return null;
  if (ctx.mode === 'preview') return <PreviewNote />;
  return <ErpComponent compKey={comp.key as string} props={comp.props as Record<string, unknown>} ctx={{ project: ctx.selected, account }} />;
}

function Render({ comp, ctx }: { comp: ConfigComponent; ctx: Ctx }) {
  if (ERP_KEYS.includes(comp.key as string)) return <ErpHost comp={comp} ctx={ctx} />;
  switch (comp.key) {
    case 'summary': return <Summary ctx={ctx} />;
    case 'project-list': return <ProjectList ctx={ctx} />;
    case 'project-form': return <ProjectForm ctx={ctx} comp={comp} />;
    case 'partner-list': return <PartnerList ctx={ctx} />;
    case 'partner-form': return <PartnerForm ctx={ctx} comp={comp} />;
    default: return <Banner tone="warn" title="Unsupported component" text={`"${String(comp.key)}" is not in the component registry.`} />;
  }
}

/** activeFirmId: firm of the currently selected sector/project (null/undefined = shell falls back to the account firm). */
export type Frame = (p: { selectors?: React.ReactNode; nav?: React.ReactNode; content: React.ReactNode; activeFirmId?: string | null }) => React.ReactNode;
const defaultFrame: Frame = ({ selectors, nav, content }) => <View>{selectors}{nav}{content}</View>;

/** Exact current web top-bar labels, derived from the screen's ERP components (AccountantDashboard TopBarTab). */
function screenRole(sc: { key: string; components: ConfigComponent[] }): string | null {
  const keys = sc.components.map((x) => x.key as string);
  const res = sc.components.map((x) => String((x.props as Record<string, unknown> | undefined)?.resource ?? ''));
  if (keys.includes('erp-dashboard')) return 'dashboard';
  if (keys.includes('erp-equity')) return 'partners';
  if (keys.includes('erp-statement')) return 'statement';
  if (keys.includes('erp-pricing') || res.includes('units')) return 'construction';
  if (keys.includes('erp-layout') || res.includes('plots')) return 'open_plotting';
  if (keys.some((k) => /liquor/.test(k)) || res.some((r) => /liquor|vend/.test(r))) return 'liquor';
  if (keys.length && keys.every((k) => k === 'erp-resource') && res.every((r) => ['accounts', 'expenses', 'investments', 'drawings', 'transactions', 'settlements'].includes(r))) return 'removed';
  return null;
}
/**
 * Legacy components that V4__original_dashboard_configuration.sql attaches to the core screens but the current web app
 * does not render there (setup/edit/add happen in explicit dialogs; audit and bookings live inside the bespoke views).
 * Only these exact keys/resources are hidden; any other configured or custom component is kept. Config is untouched.
 */
const LEGACY: Record<string, { keys: string[]; resources: string[]; ifBespoke?: { key: string; resources: string[] } }> = {
  dashboard: { keys: ['erp-plan', 'project-form'], resources: ['documents', 'drawings'] },
  partners: { keys: ['partner-form'], resources: ['partner-profiles', 'investments'] },
  open_plotting: { keys: ['erp-plan'], resources: ['bookings'], ifBespoke: { key: 'erp-layout', resources: ['plots'] } },
  statement: { keys: ['erp-audit'], resources: [] },
};
export function visibleComponents(sc: { key: string; components: ConfigComponent[] }): ConfigComponent[] {
  const r = screenRole(sc);
  const rule = r ? LEGACY[r] : undefined;
  if (!rule) return sc.components;
  const bespoke = !!rule.ifBespoke && sc.components.some((x) => x.key === rule.ifBespoke!.key);
  return sc.components.filter((x) => {
    const k = x.key as string;
    if (rule.keys.includes(k)) return false;
    if (k !== 'erp-resource') return true;
    const res = String((x.props as Record<string, unknown> | undefined)?.resource ?? '');
    if (rule.resources.includes(res)) return false;
    return !(bespoke && rule.ifBespoke!.resources.includes(res));
  });
}
const ACCT_LABEL: Record<string, string> = { dashboard: 'Dashboard', partners: 'Partners & Equity', open_plotting: 'Open Plotting', construction: 'Apartments & Construction', liquor: 'Liquor Vends', statement: 'Project Statement' };
const PARTNER_LABEL: Record<string, TKey> = { dashboard: 'tabDashboard', open_plotting: 'tabPlots', statement: 'tabStatements' };

function InterfaceView({ item, projects, role, mode, setupItems = [], allProjects, selectedId, onPick, frame = defaultFrame, firmSelector, firmPicker }: { item: WorkspaceInterfacesItem; projects: Project[]; role: SessionAccount['role']; mode: Mode; setupItems?: WorkspaceInterfacesItem[]; allProjects?: Project[]; selectedId?: string | null; onPick?: (id: string) => void; frame?: Frame; firmSelector?: React.ReactNode; firmPicker?: React.ReactNode }) {
  const iface = item.configuration.interfaces.find((i) => i.role === role);
  const [screenKey, setScreenKey] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const { t } = useLang();
  const hasErp = !!iface?.screens.some((sc) => sc.components.some((x) => ERP_KEYS.includes(x.key as string)));
  const [setupOpen, setSetupOpen] = useState<'new' | 'edit' | null>(null);
  const pool = allProjects ?? projects;
  const pick = (id: string) => (id === selected?.id ? undefined : guardLeave(() => (onPick ? onPick(id) : setSelId(id))));
  const selected = projects.find((p) => p.id === (selectedId ?? selId)) ?? (hasErp && mode !== 'preview' ? projects.find((p) => setupStateOf(p) !== 'DRAFT') ?? projects[0] ?? null : null);
  const isAcct = role === 'ACCOUNTANT' && mode === 'live';
  const setupDefinition = readSetupConfig(item.configuration);
  const isDraft = !!selected && setupStateOf(selected) === 'DRAFT';
  // Approval queues and standalone accounts/expense tabs were removed from the current web app.
  const screens = (iface?.screens ?? []).filter((sc) => {
    const r = screenRole(sc);
    if (r === 'removed' || /approval/i.test(sc.label) || /approval/i.test(sc.key)) return false;
    if (role === 'PARTNER' && hasErp) return r === 'dashboard' || r === 'open_plotting' || r === 'statement';
    return true;
  });
  const tabLabel = (sc: { key: string; label: string; components: ConfigComponent[] }) => {
    const r = screenRole(sc);
    if (role === 'PARTNER' && r && PARTNER_LABEL[r]) return t(PARTNER_LABEL[r]);
    return (r && ACCT_LABEL[r]) || sc.label;
  };
  useEffect(() => {
    registerNav((i) => {
      const hit = screens.find((sc) => sc.components.some((x) => (i.kind === 'statement' || ['investments', 'expenses', 'drawings'].includes(i.kind) ? (x.key as string) === 'erp-statement' : i.kind === 'partner-profiles' ? (x.key as string) === 'erp-equity' : i.kind === 'plots' ? (x.key as string) === 'erp-layout' || ((x.key as string) === 'erp-resource' && (x.props as Record<string, unknown>)?.resource === 'plots') : (x.key as string) === 'erp-resource' && (x.props as Record<string, unknown>)?.resource === i.kind)));
      if (!hit) return false;
      setScreenKey(hit.key);
      return true;
    });
    return () => registerNav(null);
  });
  if (!iface || iface.screens.length === 0)
    return <>{frame({ selectors: firmSelector, activeFirmId: mode === 'preview' ? null : item.firmId, content: <Empty icon="layout" title="No screens configured" text={`Release "${item.configuration.label}" defines no ${role.toLowerCase()} interface.`} /> })}</>;
  const screen = screens.find((s) => s.key === screenKey) ?? screens[0] ?? iface.screens[0];
  const ctx: Ctx = { item, projects, selected, select: (id: string | null) => ((id ?? null) === (selected?.id ?? null) ? undefined : guardLeave(() => setSelId(id))), role, mode };
  const selectors = (
    <View style={{ gap: 6 }}>
      {firmSelector}
      {!hasErp ? firmPicker : null}
      {hasErp ? <ProjectBar firm={firmPicker} label={role === 'PARTNER' ? t('selectProject') : 'Project / Venture'} projects={pool} selected={selected} onSelect={pick} canAdd={isAcct && setupItems.length > 0} onAdd={() => setSetupOpen('new')} onEdit={isAcct ? () => setSetupOpen('edit') : undefined} setupDisabled={!!setupDefinition.error} /> : null}
    </View>
  );
  const nav = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {screens.map((s) => {
        const on = s.key === screen.key;
        return (
          <Pressable key={s.key} onPress={() => guardLeave(() => setScreenKey(s.key))} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? '#111827' : '#e5e7eb' }}>
            <Text style={{ color: on ? '#FFFFFF' : '#1f2937', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{tabLabel(s)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  const content = (
    <View>
      {mode === 'preview' ? <H1 sub={`${projects.length} project${projects.length === 1 ? '' : 's'}`}>{iface.title}</H1> : null}
      {hasErp && isAcct && setupDefinition.error ? <Banner tone="warn" title="Project setup unavailable in the assigned release" text={`Assigned release: ${item.configuration.label}. ${setupDefinition.error} Review this firm's sector assignment in the owner portal, then sign out and sign in again.`} /> : null}
      {hasErp && isAcct && projects.length === 0 ? <Empty icon="folder-plus" title="No projects yet" text="Add the first project to start recording partners, accounts and inventory." /> : null}
      {setupOpen && isAcct ? <ProjectSetup items={setupItems} initialSectorId={item.sectorId} existing={setupOpen === 'edit' ? selected : null} onClose={() => setSetupOpen(null)} onSaved={(id) => { pick(id); setSetupOpen(null); }} /> : null}
      {isDraft && hasErp ? <Banner tone="warn" title="Setup not finished" text="This project is a draft. Partners, accounts, inventory and money views appear after Create Project & Load Data. Use Resume setup above." /> : null}
      {visibleComponents(screen).length === 0 ? <Empty icon="box" title="This screen has no components" /> : null}
      {(isDraft && hasErp ? [] : visibleComponents(screen)).map((comp, i) => <Render key={`${screen.key}-${i}`} comp={comp} ctx={ctx} />)}
    </View>
  );
  return <>{frame({ selectors, nav: screens.length > 1 ? nav : null, content, activeFirmId: mode === 'preview' ? null : item.firmId })}</>;
}

function FirmPicker({ firms, value, onChange }: { firms: { id: string; name: string; code: string }[]; value: string; onChange: (id: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const cur = firms.find((f) => f.id === value);
  return (
    <View>
      <Pressable testID="firm-picker" onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Select firm, current ${cur?.name ?? 'none'}`} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        <Text style={{ color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 }}>FIRM</Text>
        <Text numberOfLines={1} style={{ color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{cur ? cur.name : 'Select firm'}</Text>
      </Pressable>
      <Sheet visible={open} title="Firms" onClose={() => setOpen(false)}>
        {firms.length === 1 ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 6 }}>You are assigned to one firm.</Text> : null}
        {firms.map((f) => (
          <Pressable key={f.id} onPress={() => { setOpen(false); onChange(f.id); }} accessibilityRole="button" style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.foreground, fontFamily: f.id === value ? 'Inter_700Bold' : 'Inter_400Regular' }}>{f.name} ({f.code})</Text>
          </Pressable>
        ))}
        <Btn label="Close" variant="ghost" onPress={() => setOpen(false)} />
      </Sheet>
    </View>
  );
}

export function SectorWorkspace({ ws, account, frame = defaultFrame }: { ws: Workspace; account: SessionAccount; frame?: Frame }) {
  const role = account.role;
  const projectsOf = (i: WorkspaceInterfacesItem) => ws.projects.filter((p) => p.firmId === i.firmId && p.sectorId === i.sectorId);
  // Disabled assignments stay visible (read-only) while they still hold historical projects.
  const items = ws.interfaces.filter((i) => i.configuration.interfaces.some((x) => x.role === role) && (i.enabled || projectsOf(i).length > 0));
  const [sel, setSel] = useState<string | null>(null);
  const [want, setWant] = useState<string | null>(null);
  if (items.length === 0)
    return <>{frame({ content: <Empty icon="inbox" title="No interface assigned" text="Your firm has no enabled sector interface for your role yet. The owner assigns sectors to firms." /> })}</>;
  const keyOf = (i: WorkspaceInterfacesItem) => `${i.firmId}:${i.sectorId}`;
  const wantProj = want ? ws.projects.find((p) => p.id === want) ?? null : null;
  const wantItem = wantProj ? items.find((i) => i.firmId === wantProj.firmId && i.sectorId === wantProj.sectorId) : undefined;
  const item = wantItem ?? items.find((i) => keyOf(i) === sel) ?? items[0];
  const firmPool = ws.projects.filter((p) => p.firmId === item.firmId && items.some((i) => i.firmId === p.firmId && i.sectorId === p.sectorId));
  const firmIds = Array.from(new Set(items.map((i) => i.firmId)));
  const firms = firmIds.map((id) => { const f = ws.firms.find((x) => x.id === id); return { id, name: f?.name ?? 'Firm', code: f?.clientCode ?? '' }; });
  const sectorsHere = items.filter((i) => i.firmId === item.firmId);
  const firmPicker = <FirmPicker firms={firms} value={item.firmId} onChange={(id) => { const first = items.find((i) => i.firmId === id); if (first && id !== item.firmId) guardLeave(() => { setSel(keyOf(first)); setWant(null); }); }} />;
  const firmSelector = (
    <View style={{ gap: 6 }}>
      {sectorsHere.length > 1 ? <Chips options={sectorsHere.map((i) => ({ value: keyOf(i), label: `${i.sectorName}${i.enabled ? '' : ' (read-only)'}` }))} value={keyOf(item)} onChange={(v) => { if (v !== keyOf(item)) guardLeave(() => { setSel(v); setWant(null); }); }} /> : null}
    </View>
  );
  return (
    <InterfaceView key={keyOf(item) + item.releaseId} item={item} projects={projectsOf(item)} allProjects={firmPool} selectedId={want} onPick={(id) => { const pr = ws.projects.find((x) => x.id === id); if (pr) setSel(`${pr.firmId}:${pr.sectorId}`); setWant(id); }} role={role} mode={item.enabled ? 'live' : 'readonly'} setupItems={ws.interfaces.filter((i) => i.enabled && i.firmId === item.firmId && i.configuration.interfaces.some((x) => x.role === role))} frame={frame} firmSelector={firmSelector} firmPicker={firmPicker} />
  );
}

/** Renders a fetched configuration for a role. Forms are preview-only and never run commands. */
export function PreviewInterface({ cfg, role, projects }: { cfg: SectorConfiguration; role: SessionAccount['role']; projects: Project[] }) {
  const item: WorkspaceInterfacesItem = { firmId: 'preview', sectorId: cfg.sectorId, releaseId: cfg.releaseId, sectorName: cfg.label, enabled: true, configuration: cfg };
  return <InterfaceView key={`${cfg.releaseId}:${cfg.revision}:${role}`} item={item} projects={projects.filter((p) => p.sectorId === cfg.sectorId)} role={role} mode="preview" />;
}
