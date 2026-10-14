import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Role, TenantFirm, Project, Plot, LayoutCalculation, ProjectExpense, ApartmentUnit, ApartmentPricingMatrix,
  SyndicatePartner, FieldExpenseLog, EquitySplitMode, LedgerMode, LiquorDailySettlement, PartnerStockDraw,
  FirmAccount, FirmAccountTransaction, AuthenticatedAppUser, DrawingRequest,
} from './original/types';
import { Header } from './original/components/Header';
import { RegistrationNotificationLauncher } from './original/components/RegistrationNotificationLauncher';
import { disablePush } from './adapter/browserPush';
import { HeaderSlotProvider } from './original/components/HeaderSlot';
import { ProductionAuthGate } from './original/components/auth/ProductionAuthGate';
import { SuperAdminView } from './original/components/superadmin/SuperAdminView';
import { AccountantDashboard } from './original/components/accountant/AccountantDashboard';
import { FieldPartnerMobileView } from './original/components/fieldpartner/FieldPartnerMobileView';
import type { IndividualInvestmentData } from './original/components/modals/IndividualInvestmentModal';
import { Building2, Smartphone } from 'lucide-react';
import { api, getToken, clearSession, toAppUser, newRequestId, normalizeClientMobile } from './adapter/api';
import { confirmLeave } from './adapter/leaveGuard';
import { useConfig, sectorUiCode, masterNumber } from './adapter/config';
import { MasterEditor } from './adapter/MasterEditor';
import { loadAll, erpSave, command, pickConfigured, describeAccess, referBackFinancial, resubmitFinancial, type LoadedData } from './adapter/erp';
import { referBackInput, resubmitInput } from './adapter/financialCorrections';
import type { UnifiedProjectTransaction } from './original/components/accountant/ProjectStatementModule';
import { NOTIFICATIONS_REFRESH_EVENT } from './original/components/NotificationBell';
import { investmentInput, drawingInput, bookingInput } from './adapter/financialInput';
import { ProjectPlanSaver } from './adapter/projectPlans';
import { ProjectEditorSaver, projectEditContext, projectEditPayload } from './adapter/projectEditing';
import { projectFormSeed, projectFormPayload } from './adapter/projectFormEditing';
import { MarketingAccessPage } from './marketing/MarketingAccessPage';
import { expenseInput } from './adapter/expenseInput';

const EMPTY_LAYOUT: LayoutCalculation = { totalExtentValue: 0, unit: 'Acres', roadWidth: 30, openSpacePercent: 10, floorRatePerSqYard: 0 };
const EMPTY_MATRIX: ApartmentPricingMatrix = { baseSqFtRate: 0, eastPremium: 0, northPremium: 0, cornerPremium: 0, floorRisePerFloor: 0, carParkingFee: 0, amenitiesFee: 0, floorRatePerSqFt: 0 };

function App() {
  const config = useConfig();
  const loadConfigRef = useRef(config.load);
  loadConfigRef.current = config.load;
  const clearConfigRef = useRef(config.clear);
  clearConfigRef.current = config.clear;
  const entry: 'owner' | 'client' = /\/owner\/?$/.test(window.location.pathname) ? 'owner' : 'client';
  const [currentUser, setCurrentUser] = useState<AuthenticatedAppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [ledgerMode, setLedgerMode] = useState<LedgerMode>('internal_syndicate');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [stickyNotice, setStickyNotice] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const projectPlanSaver = useRef(new ProjectPlanSaver());
  const projectEditorSaver = useRef(new ProjectEditorSaver());
  useEffect(() => {
    projectPlanSaver.current.clear();
    projectEditorSaver.current.clear();
  }, [currentUser]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 5000);
  }, []);

  const currentRole: Role = currentUser?.role === 'super_admin' ? 'super_admin'
    : currentUser?.role === 'accountant' ? 'accountant' : 'field_partner';

  const reload = useCallback(async (role: string) => {
    try {
      const session = getToken();
      const d = await loadAll(role);
      if (!session || getToken() !== session) return false;
      setData(d);
      setLoadError(null);
      setSelectedFirmId((prev) => prev || d.firms[0]?.id || '');
      setSelectedProjectId((prev) => prev || d.projects[0]?.id || '');
      if (d.loadErrors.length) showToast(`Some project ledgers could not load: ${d.loadErrors.join('; ')}`);
      return d.loadErrors.length === 0;
    } catch (e: any) {
      setLoadError(e.message);
      return false;
    }
  }, [showToast]);

  useEffect(() => {
    if (!currentUser) return;
    let refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try { await reload(currentUser.role); } finally { refreshing = false; }
    };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('sos-registration-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('sos-registration-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [currentUser, reload]);

  useEffect(() => {
    const onNotice = (e: Event) => setStickyNotice(String((e as CustomEvent).detail));
    window.addEventListener('sos-notice', onNotice);
    return () => window.removeEventListener('sos-notice', onNotice);
  }, []);

  // Restore session from bearer token
  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    api<any>('/auth/me')
      .then(async (acc) => { const u = toAppUser(acc.account ?? acc); setCurrentUser(u); if (await loadConfigRef.current()) await reload(u.role); })
      .catch(() => { clearSession(); setCurrentUser(null); })
      .finally(() => setBooting(false));
  }, [reload]);

  useEffect(() => {
    const changed = () => { if (currentUser) void reload(currentUser.role); };
    window.addEventListener('sos-marketing-changed', changed);
    return () => window.removeEventListener('sos-marketing-changed', changed);
  }, [currentUser, reload]);

  useEffect(() => {
    const onExpired = () => {
      clearConfigRef.current(); setCurrentUser(null); setData(null); setSelectedFirmId(''); setSelectedProjectId('');
      setStickyNotice(null); setToastMessage('Your session expired. Sign in again.');
    };
    window.addEventListener('sos-session-expired', onExpired);
    return () => window.removeEventListener('sos-session-expired', onExpired);
  }, []);

  const handleLoginSuccess = (user: AuthenticatedAppUser) => {
    setCurrentUser(user);
    if (user.firmId) setSelectedFirmId(user.firmId);
    void loadConfigRef.current().then((ok) => { if (ok) void reload(user.role); });
  };

  const handleSignOut = async () => {
    if (!confirmLeave()) return;
    try { await disablePush(); }
    catch (e: any) { setStickyNotice(`Could not disable this browser's background alerts before sign-out: ${e.message}. Retry sign-out while connected.`); return; }
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
    clearSession();
    clearConfigRef.current();
    setStickyNotice(null);
    setCurrentUser(null);
    setData(null);
    setSelectedFirmId('');
    setSelectedProjectId('');
  };

  // Every mutation: await backend, then reload. On failure, show the real error and keep state.
  // Resolves true only after the backend accepted the change; false on any error.
  const run = useCallback(async (label: string, fn: () => Promise<any>): Promise<boolean> => {
    try {
      await fn();
    } catch (e: any) {
      showToast(`✕ ${label} failed: ${e.message}`);
      return false;
    }
    if (currentUser && !await reload(currentUser.role)) {
      showToast(`${label} was saved, but the updated workspace could not load. Refresh to see the saved data; do not submit it again.`);
      // The mutation persisted. Close the form to prevent a duplicate submission,
      // while clearly withholding a successful refresh claim.
      return true;
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
    showToast(`✓ ${label}`);
    return true;
  }, [currentUser, reload, showToast]);

  const unsupported = (what: string): false => { showToast(`✕ Not supported by backend: ${what}`); return false; };

  const firms = data?.firms ?? [];
  const projects = data?.projects ?? [];
  const currentFirm = firms.find((f) => f.id === selectedFirmId) || null;
  const erpOf = (projectId?: string) => (projectId ? data?.erpByProject[projectId] : undefined);
  const activeProjectId = projects.find((p) => p.id === selectedProjectId && p.firmId === selectedFirmId)?.id
    || projects.find((p) => p.firmId === selectedFirmId)?.id || '';
  const metaOf = (id: string) => data?.meta.get(id);


  // ---------- Owner ----------
  const sectorCodeOf = (sectorId: any, fallback?: string) =>
    (data?.workspace?.sectors || []).find((x: any) => String(x.id) === String(sectorId))?.code || fallback || '';
  const firmMetadata = (f: any) => Object.fromEntries(Object.entries({
    gstin: f.gstin?.trim().toUpperCase(), panNumber: f.panNumber?.trim().toUpperCase(), reraNumber: f.reraNumber?.trim(),
    officeAddress: f.officeAddress?.trim(), proprietorPhone: (f.proprietorPhone || f.managingPartnerPhone)?.trim(),
    location: f.location?.trim(), state: f.state,
  }).filter(([, v]) => v));

  const handleAddFirm = (f: TenantFirm) => run(`Firm ${f.name} provisioned`, async () => {
    const ws = data?.workspace;
    const assignments = f.sectors.map((s) => {
      const sector = (ws?.sectors || []).find((x: any) => sectorUiCode(x.code) === s);
      const release = sector?.releases?.find((r: any) => r.state === 'PUBLISHED');
      if (!sector || !release) throw new Error(`No published sector release for ${s}.`);
      return { sectorId: sector.id, releaseId: release.id };
    });
    if (!f.accountantName || !f.accountantPhone) throw new Error('Accountant name and mobile are required.');
    const r: any = await command('firm.create', {
      clientCode: f.code, name: f.name, accountantMobile: normalizeClientMobile(f.accountantPhone),
      accountantName: f.accountantName, assignments, ...firmMetadata(f),
    });
    const notice = describeAccess(r?.access);
    if (notice) setStickyNotice(`${f.name} (${f.code}) accountant — ${notice}`);
  });

  const handleUpdateFirm = (f: TenantFirm) => run(`Firm ${f.name} updated`, () =>
    command('firm.update', { firmId: f.id, clientCode: f.code.trim().toUpperCase(), name: f.name, status: f.status === 'active' ? 'ACTIVE' : 'SUSPENDED', revision: (firms.find((x) => x.id === f.id) as any)?.__revision, ...firmMetadata(f) }));

  const handleToggleFirmStatus = (firmId: string) => {
    const f = firms.find((x) => x.id === firmId) as any;
    if (!f) return Promise.resolve(false);
    return run(`Firm ${f.name} status changed`, () =>
      command('firm.update', { firmId, name: f.name, status: f.status === 'active' ? 'SUSPENDED' : 'ACTIVE', revision: f.__revision, ...firmMetadata(f) }));
  };

  const handleResetAccountantPin = (firmId: string) => run('Accountant temporary PIN issued', async () => {
    const firm = firms.find((f) => f.id === firmId);
    const registered = data?.workspace?.firms?.find((f: any) => String(f.id) === firmId);
    const accountant = registered?.accountants?.find((a: any) =>
      a.mobile === normalizeClientMobile(firm?.accountantPhone || ''));
    if (!accountant?.identityId) throw new Error('The registered accountant could not be identified. Reload the owner console.');
    const result: any = await command('credentials.reset', { identityId: accountant.identityId });
    const notice = describeAccess(result.access);
    if (!notice) throw new Error('The server did not return a temporary PIN.');
    setStickyNotice(`${firm?.name} (${firm?.code}) accountant — ${notice}`);
  });

  const handleUpdateFirmFlags = () => unsupported('feature flags are configured through sector releases, not per-firm toggles.');

  // ---------- Accountant: projects & partners ----------
  const DERIVED = ['id', 'firmId', 'projectId', 'plotNumber', 'unitNumber', 'status', 'buyerName', 'buyerPhone', 'advanceReceived', 'currentMilestone', 'roadWidthFt'];
  const buildGroups = (def: any, rows: any[], prefix: string) => {
    if (!rows.length) return [];
    if (!def.inventory?.fields) throw new Error('This sector release has no inventory builder. Remove generated plots/units or ask the owner to configure one.');
    const m = def.inventory.mappings || {};
    const aliases: Record<string, string> = { areaSqYards: m.area, sftArea: m.area, ratePerSqYard: m.rate, floorNumber: 'floor', ratePerSqFt: m.rate };
    const startDefault = def.inventory.fields.find((f: any) => f.key === 'startNumber')?.default ?? 1;
    const groups: any[] = [];
    let last = '';
    rows.forEach((row, i) => {
      const rest = Object.fromEntries(Object.entries(row).filter(([k]) => !DERIVED.includes(k)));
      const sig = JSON.stringify(rest);
      if (sig === last && groups.length) { groups[groups.length - 1][m.count] += 1; return; }
      last = sig;
      groups.push({ ...pickConfigured(def.inventory.fields, rest, 'Inventory', aliases), [m.count]: 1, startNumber: def.rules?.inventoryNumbering === 'sequential' ? startDefault : i + 1, ...(prefix ? { numberPrefix: prefix } : {}) });
    });
    return groups;
  };

  const handleAddProject = (p: Project, initialPlots?: Plot[], initialUnits?: ApartmentUnit[], initialAccounts?: FirmAccount[]) => run(`Project ${p.name} created`, async () => {
    const ifaces = (data?.workspace?.interfaces || []).filter((i: any) => String(i.firmId) === p.firmId);
    const match = ifaces.find((i: any) => sectorUiCode(sectorCodeOf(i.sectorId, i.sectorName)) === p.sector);
    if (!match) throw new Error('No sector assignment for this firm matches the project sector.');
    const def = match.configuration?.projectSetup;
    if (!def?.sections) throw new Error('The owner has not published a project setup form for this sector.');
    const { id: _id, firmId: _f, partners, sector: _s, status: stage, code, ...rest } = p as any;
    const allFields = def.sections.flatMap((sec: any) => sec.fields || []);
    const { floorPlans, plotDistribution, layoutAmenities, amenities, planDocuments, autoGenerateInventory,
      plotsCount: _pc, totalResidentialSft: _tr, totalAmenitiesSft: _ta, totalBuiltUpAreaSft: _tb, flatsPerFloor: _fp, ...flat } = rest;
    const hasField = (k: string) => allFields.some((f: any) => f.key === k);
    const roadDeduction = hasField('roadDeductionPercent') && flat.roadWidth ? masterNumber('road_widths', String(flat.roadWidth), 'deductionPercent') : undefined;
    const values = pickConfigured(allFields, { ...flat, roadWidth: flat.roadWidth === undefined ? undefined : String(flat.roadWidth), roadDeductionPercent: roadDeduction, projectCode: code, developmentStage: stage }, 'Project setup');
    const partnerRows = (partners || []).map((sh: any) => pickConfigured(def.partnerFields || [], {
      name: sh.name, mobile: normalizeClientMobile(String(sh.phone)),
      fixedEquityPercent: sh.equityPercent, initialCapital: sh.initialCapital, roleDescription: sh.roleInProject,
    }, 'Project partner'));
    const plotRows = (initialPlots || []) as any[];
    const unitRows = (initialUnits || []) as any[];
    const groups = buildGroups(def, plotRows.length ? plotRows : unitRows, '');
    // An untouched zero-count matrix is not project configuration. Actual plots
    // are sent as inventory groups; never discard an unconfigured nonempty plan.
    const hasDistributedPlots = Object.entries(plotDistribution || {}).some(
      ([key, value]) => key.endsWith('PlotsCount') && Number(value) > 0);
    const planKeys = groups.length ? {} : {
      floorPlans, plotDistribution: hasDistributedPlots ? plotDistribution : undefined,
    };
    const settings = pickConfigured(def.settingsFields || [], { layoutAmenities, amenities, ...planKeys, autoGenerateInventory: autoGenerateInventory ?? groups.length > 0 }, 'Project settings');
    const accounts = (initialAccounts || []).map((a) => pickConfigured(def.accountFields || [], {
      bankName: a.bankName, accountName: a.accountName, accountNumber: a.accountNumber, ifscCode: a.ifscCode,
      branchName: a.branchName, accountType: a.accountType, openingBalance: a.openingBalance, isPrimary: a.isPrimary,
      notes: a.notes, city: a.city, upiId: a.upiId, authorizedSignatories: a.authorizedSignatories,
      openingBalanceDate: a.createdDate,
    }, 'Project account'));
    const setup = { values, settings, groups, documents: [], accounts, partners: partnerRows };
    const localDraftKey = `${p.id}:${String(code).trim().toUpperCase()}`;
    const existing = (data?.workspace?.projects || []).find((row: any) =>
      String(row.firmId) === p.firmId &&
      String(row.details?.projectCode || '').trim().toUpperCase() === String(code).trim().toUpperCase());
    let existingDraft: { id: string; revision: number } | undefined;
    if (existing && !projectPlanSaver.current.hasDraft(localDraftKey)) {
      if (existing.setupState !== 'DRAFT') throw new Error('A finalized project already uses this code. Open that project instead of creating it again.');
      if (String(existing.sectorId) !== String(match.sectorId)) throw new Error('The unfinished project with this code belongs to another sector. Use a different code.');
      if (!window.confirm(`An unfinished project already uses code "${code}". Continue that saved draft with the details in this form? No second project will be created.`)) {
        throw new Error('Draft recovery cancelled. No project was created or changed.');
      }
      existingDraft = { id: String(existing.id), revision: Number(existing.revision) };
    }
    const created: any = await projectPlanSaver.current.create(localDraftKey, match.sectorId, setup, planDocuments || [], existingDraft);
    if (!created?.entity?.id) throw new Error('The server did not confirm the finalized project.');
    setSelectedProjectId(String(created.entity.id));
    const notice = describeAccess(created.entity.access);
    if (notice) setStickyNotice(`${p.name} partners — ${notice}`);
  });

  const handleUpdateProjectSetup = (projectId: string, values: Record<string, any>,
    settings: Record<string, any>, revision: number,
    plotEdits: Array<{ recordId: string; revision: number; data: Record<string, any> }> = []) =>
    run(plotEdits.length ? 'Project details and plot changes saved' : 'Project details saved', async () => {
    const context = projectEditContext(data?.workspace, erpOf(projectId), projectId);
    if (!context || String(context.project.firmId) !== selectedFirmId || projectId !== activeProjectId) {
      throw new Error('Select an authorized project before editing its details.');
    }
    const erp = erpOf(projectId);
    if (plotEdits.length && !(erp?.resources || []).some((resource: any) => resource.kind === 'plots' && resource.canManage))
      throw new Error('You do not have permission to edit this project’s plots.');
    for (const edit of plotEdits) {
      const record = (erp?.records || []).find((row: any) => String(row.id) === edit.recordId && row.kind === 'plots');
      if (!record || record.status !== 'approved' || record.data?.status !== 'available')
        throw new Error('A selected plot is no longer available for editing. Close and reopen the project.');
    }
    await projectEditorSaver.current.save(projectEditPayload(context.project, context.definition, values, settings, revision, plotEdits));
  });

  const handleUploadProjectDocuments = (projectId: string, documents: import('./original/types').PlanUploadDocument[]) =>
    run('Project documents uploaded', async () => {
      const project = projects.find((row) => row.id === projectId && row.firmId === selectedFirmId);
      if (!project || projectId !== activeProjectId) throw new Error('Select a project before uploading its documents.');
      await projectEditorSaver.current.uploadDocuments(projectId, erpOf(projectId), documents);
    });

  const handleSaveProjectForm = (project: Project, accounts: FirmAccount[] = []) => run('Project changes saved', async () => {
    const context = projectEditContext(data?.workspace, erpOf(project.id), project.id);
    if (!context || project.firmId !== selectedFirmId || project.id !== activeProjectId)
      throw new Error('Select an authorized project before saving its details.');
    const oldRoad = context.values.roadWidth;
    const deduction = String(oldRoad) !== String(project.roadWidth) &&
      context.definition.sections.some((section: any) => section.fields?.some((f: any) => f.key === 'roadDeductionPercent'))
        ? masterNumber('road_widths', String(project.roadWidth), 'deductionPercent') : undefined;
    const payload = projectFormPayload(project, context, erpOf(project.id), accounts, pickConfigured, deduction);
    await projectEditorSaver.current.save(payload);
  });

  const handleAddPartnerMember = (m: SyndicatePartner) => run(`Partner ${m.name} added`, async () => {
    if (!activeProjectId) throw new Error('Select a project first.');
    const res = (erpOf(activeProjectId)?.resources || []).find((r: any) => r.kind === 'partner-profiles');
    const profile = res ? pickConfigured(res.fields, { roleDescription: m.roleDescription, initialCapital: m.initialCapital, fixedEquityPercent: m.fixedEquityPercent }, res.title || 'Partner profile') : undefined;
    const r: any = await command('partner.add', { requestId: newRequestId(), projectId: activeProjectId, name: m.name, mobile: normalizeClientMobile(m.phone), ...(profile && Object.keys(profile).length ? { profile } : {}) });
    const notice = describeAccess(r?.access);
    if (notice) setStickyNotice(`${m.name} — ${notice}`);
  });

  const handleUpdatePartner = (p: SyndicatePartner): Promise<boolean> => {
    const targetProject = (p as any).__projectId || activeProjectId;
    const prev: any = data?.partners.find((x) => x.id === p.id && (x as any).__projectId === targetProject);
    if (!prev) return Promise.resolve(unsupported('partner is not a saved backend record.'));
    const projectId = prev.__projectId as string;
    if ((p as any).__resetCredential) {
      return run(`Credential for ${p.name} reset`, async () => {
        const r: any = await command('credentials.reset', { identityId: p.id, projectId });
        const notice = describeAccess(r?.access);
        if (notice) setStickyNotice(`${p.name} — ${notice}`);
      });
    }
    const wantEnabled = p.userStatus ? p.userStatus === 'active' : undefined;
    if (wantEnabled !== undefined && wantEnabled !== (prev.userStatus === 'active')) {
      return run(`Partner ${p.name} ${wantEnabled ? 'activated' : 'deactivated'}`, () =>
        command('partner.status', { projectId, partnerId: p.id, revision: prev.__revision, enabled: wantEnabled, requestId: newRequestId(), profileRevision: prev.__profileRevision }));
    }
    return run(`Partner ${p.name} updated`, () => {
      const res = (erpOf(projectId)?.resources || []).find((r: any) => r.kind === 'partner-profiles');
      const profile = res ? pickConfigured(res.fields, {
        roleDescription: p.roleDescription, initialCapital: p.initialCapital, fixedEquityPercent: p.fixedEquityPercent,
        dailySpendingLimit: p.dailySpendingLimit, officialDeclaredCapital: p.officialDeclaredCapital,
      }, res.title || 'Partner profile') : undefined;
      if (!profile) throw new Error('This project has no configured partner profile form.');
      return command('partner.update', { projectId, partnerId: p.id, revision: prev.__revision, name: p.name, profile, requestId: newRequestId(), profileRevision: prev.__profileRevision });
    });
  };

  // ---------- Inventory ----------
  const handleUpdatePlot = (plot: Plot) => {
    const id = plot.__recordId || data?.plotIds.get(plot.id); const meta = id ? metaOf(id) : undefined;
    if (!meta) return unsupported('plot is not a saved backend record.');
    if (plot.bookingPaymentRequestId && meta.projectId !== activeProjectId)
      return unsupported('the selected project changed. Reopen the plot in the current project before collecting money.');
    const prev = data?.plots.find((x) => x.id === plot.id);
    if (prev?.pendingBookingId) return unsupported('this plot has a historical unposted booking receipt. Correct & resubmit it from the project statement before changing its booking.');
    if (plot.marketingRequest && plot.marketingRequest.status !== prev?.marketingRequest?.status) {
      return unsupported('marketing booking requests are not reviewed. Holds are placed automatically by the server; record actual received money as a booking instead.');
    }
    if (plot.bookingPaymentRequestId ||
        ((prev?.status === 'available' || prev?.status === 'blocked') && plot.status === 'reserved' && plot.buyerName)) {
      return run(`Payment for plot ${plot.plotNumber} recorded`, () => erpSave(
        erpOf(meta.projectId), meta.projectId, 'bookings', bookingInput(plot, meta.id), undefined, plot.bookingPaymentRequestId));
    }
    return run(`Plot ${plot.plotNumber} saved`, () => erpSave(erpOf(meta.projectId), meta.projectId, 'plots', plot, meta));
  };

  const handleUpdateApartmentUnit = (u: ApartmentUnit) => {
    const meta = metaOf(u.id);
    if (!meta) return unsupported('unit is not a saved backend record.');
    return run(`Unit ${u.unitNumber} saved`, () => erpSave(erpOf(meta.projectId), meta.projectId, 'units', u, meta));
  };

  const saveSettings = (label: string, settings: Record<string, any>) => run(label, () => {
    if (!activeProjectId) throw new Error('Select a project first.');
    const revision = erpOf(activeProjectId)?.settings?.revision;
    if (!Number.isInteger(revision) || revision < 0) throw new Error('Project settings are still loading. Retry when the project finishes loading.');
    return command('erp.settings', { projectId: activeProjectId, revision, settings });
  });
  const handleUpdateLayoutCalc = (c: LayoutCalculation) => saveSettings('Layout calculation saved', { layoutCalculation: c });
  const handleUpdatePricingMatrix = (m: ApartmentPricingMatrix) => saveSettings('Pricing matrix saved', { pricingMatrix: m });
  const handleToggleSplitMode = (mode: EquitySplitMode) => saveSettings('Equity split mode saved', { equitySplitMode: mode });
  // Ledger mode is a view filter in the original UI (not persisted business data).
  const handleToggleLedgerMode = (mode: LedgerMode) => setLedgerMode(mode);

  // ---------- Budgets ----------
  const handleAddProjectExpense = (e: ProjectExpense) => {
    const pid = e.projectId || activeProjectId;
    return run(`Budget head ${e.category} saved`, () => erpSave(erpOf(pid), pid, 'budgets', e));
  };
  const handleUpdateProjectExpense = (e: ProjectExpense) => {
    const meta = metaOf(e.id);
    if (!meta) return unsupported('budget head is not a saved backend record.');
    return run(`Budget head ${e.category} updated`, () => erpSave(erpOf(meta.projectId), meta.projectId, 'budgets', e, meta));
  };

  // ---------- Treasury ----------
  const handleAddFirmAccount = (a: FirmAccount) => {
    const pid = a.linkedProjectId && a.linkedProjectId !== 'all' ? a.linkedProjectId : activeProjectId;
    return run(`Account ${a.accountName} recorded`, () => erpSave(erpOf(pid), pid, 'accounts', a));
  };
  const handleAddAccountTransaction = (accountId: string, tx: FirmAccountTransaction) => {
    const meta = metaOf(accountId);
    if (!meta) return unsupported('account is not a saved backend record.');
    return run('Ledger transaction recorded', () => erpSave(erpOf(meta.projectId), meta.projectId, 'transactions', { ...tx, accountId }));
  };

  // ---------- Expenses ----------
  const handleSubmitFieldExpense = (e: FieldExpenseLog, bankAccountId?: string) => {
    const pid = e.projectId || activeProjectId;
    return run('Expense recorded', () => erpSave(erpOf(pid), pid, 'expenses', expenseInput(e, bankAccountId)));
  };
  // No approvals: entries post when saved. Mistakes are fixed by Refer Back
  // (reversal appended server-side) or Correct & Resubmit (posted replacement).
  const projectOfEntry = (entry: UnifiedProjectTransaction) =>
    projects.find((p) => p.firmId === selectedFirmId && p.financialStatement?.some((t) => t.id === entry.id))?.id || activeProjectId;
  const handleReferBackFinancial = (entry: UnifiedProjectTransaction, reason: string, requestId: string) => {
    if (!reason.trim()) { showToast('Enter a reason to refer this entry back.'); return Promise.resolve(false); }
    if (!Number.isInteger(entry.revision)) return Promise.resolve(unsupported('this entry has no revision; reload and try again.'));
    return run(entry.affectsCash ? 'Entry referred back; reversal recorded' : 'Entry referred back',
      () => referBackFinancial(referBackInput(projectOfEntry(entry), entry.id, entry.revision as number, requestId, reason)));
  };
  const handleResubmitFinancial = (entry: UnifiedProjectTransaction, payload: Record<string, any>, requestId: string) => {
    if (!Number.isInteger(entry.revision)) return Promise.resolve(unsupported('this entry has no revision; reload and try again.'));
    return run('Corrected entry recorded',
      () => resubmitFinancial(resubmitInput(projectOfEntry(entry), entry.id, entry.revision as number, requestId, payload)));
  };

  // ---------- Investments ----------
  const handleRecordIndividualInvestment = (d: IndividualInvestmentData) => run('Investment recorded', () => {
    const meta = metaOf(d.accountId);
    const pid = meta?.projectId || activeProjectId;
    return erpSave(erpOf(pid), pid, 'investments', investmentInput(d));
  });

  // ---------- Drawings ----------
  const handleSubmitDrawing = (d: DrawingRequest) => {
    const pid = d.projectId || activeProjectId;
    return run('Drawing recorded', () => erpSave(erpOf(pid), pid, 'drawings', drawingInput(d)));
  };

  // ---------- Liquor ----------
  const handleAddLiquorSettlement = (s: LiquorDailySettlement) => run('Counter settlement recorded', () => erpSave(erpOf(activeProjectId), activeProjectId, 'settlements', s));
  const handleAddStockDraw = (d: PartnerStockDraw) => run('Stock draw recorded', () => erpSave(erpOf(activeProjectId), activeProjectId, 'stock-draws', d));

  if (booting) {
    return <div className="min-h-screen bg-[#FDFCF7]" />;
  }
  if (!currentUser) {
    return <ProductionAuthGate entry={entry} onLoginSuccess={handleLoginSuccess} />;
  }

  if (config.status === 'unavailable') {
    return (
      <div className="min-h-screen bg-[#FDFCF7] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-10 border border-red-200 text-center max-w-lg shadow-xl space-y-4">
          <h3 className="text-base font-black text-gray-950">Business configuration unavailable</h3>
          <p className="text-xs text-gray-600 leading-relaxed">{config.error}</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => void config.load().then((ok) => { if (ok) void reload(currentUser.role); })} className="px-4 py-2 bg-[#FFB800] text-gray-950 rounded-full text-xs font-black">Retry</button>
            <button onClick={handleSignOut} className="px-4 py-2 border border-stone-300 rounded-full text-xs font-bold">Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  const partnerSession = currentUser.role === 'field_partner' && currentUser.firmId
    ? { firmId: currentUser.firmId, partnerId: currentUser.id } : null;
  const selectedProjectSetup = projectEditContext(data?.workspace, erpOf(activeProjectId), activeProjectId);
  const selectProjectGuarded = (id: string) => { if (id !== selectedProjectId && !confirmLeave()) return; setSelectedProjectId(id); };
  const selectFirm = (firmId: string) => {
    if (!firms.some((firm) => firm.id === firmId)) return;
    if (firmId !== selectedFirmId && !confirmLeave()) return;
    setSelectedFirmId(firmId);
    setSelectedProjectId(projects.find((project) => project.firmId === firmId)?.id || '');
  };

  return (
    <HeaderSlotProvider>
    <div className="min-h-screen bg-[#FDFCF7] text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      <Header
        currentRole={currentRole}
        onRoleChange={() => unsupported('role switching; sign in with that role’s credentials.')}
        firms={firms}
        selectedFirmId={selectedFirmId}
        onFirmChange={selectFirm}
        pendingExpensesCount={0}
        firmAccountsCount={(data?.accounts ?? []).length}
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onAccountUpdated={(user) => {
          setCurrentUser(user);
          void reload(user.role);
          showToast('Your PIN was changed. Other sessions have been signed out.');
        }}
      />

      {currentUser && currentRole !== 'super_admin' && data && <RegistrationNotificationLauncher
        identityKey={`${currentUser.id}:${currentUser.role}:${currentUser.firmId}`}
        firm={data.firms.find((firm) => firm.id === selectedFirmId)} projects={data.projects} plots={data.plots}
        accounts={data.accounts} onSelectProject={selectProjectGuarded} onUpdatePlot={handleUpdatePlot}
      />}
      {(loadError || stickyNotice) && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 space-y-2">
          {loadError && (
            <div className="bg-white border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-xs font-bold flex items-center gap-3">
              <span>Could not load workspace: {loadError}</span>
              <button onClick={() => reload(currentUser.role)} className="ml-auto px-3 py-1 bg-[#FFB800] text-gray-950 rounded-full font-black">Retry</button>
            </div>
          )}
          {stickyNotice && (
            <div className="bg-white border border-amber-300 rounded-2xl px-4 py-3 text-xs font-bold text-gray-900 flex items-center gap-3">
              <span className="font-mono break-all">{stickyNotice}</span>
              <button onClick={() => setStickyNotice(null)} className="ml-auto text-gray-500">✕</button>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!data && !loadError ? (
          <div className="bg-white rounded-3xl p-10 border border-amber-300 text-center max-w-lg mx-auto my-12 shadow-xl space-y-4 animate-pulse">
            <div className="w-12 h-12 rounded-2xl bg-[#FFB800] text-gray-950 flex items-center justify-center mx-auto shadow-md">
              <Building2 className="w-6 h-6 animate-bounce" />
            </div>
            <h3 className="text-base font-black text-gray-950">Synchronizing Firm Workspace...</h3>
          </div>
        ) : null}

        {data && currentRole === 'super_admin' && (
          <SuperAdminView
            firms={firms}
            onAddFirm={handleAddFirm}
            onUpdateFirm={handleUpdateFirm}
            onToggleFirmStatus={handleToggleFirmStatus}
            onResetAccountantPin={handleResetAccountantPin}
            issuedAccessNotice={stickyNotice}
            onUpdateFirmFlags={handleUpdateFirmFlags}
            onSwitchRole={() => unsupported('owners cannot enter firm consoles; sign in as the firm accountant.')}
          />
        )}
        {data && currentRole === 'super_admin' && <MasterEditor onNotify={showToast} />}

        {data && currentRole === 'accountant' && (currentFirm ? (
          <AccountantDashboard
            onSubmitDrawing={handleSubmitDrawing}
            onReferBackFinancial={handleReferBackFinancial}
            onResubmitFinancial={handleResubmitFinancial}
            key={currentFirm.id}
            firm={currentFirm}
            firms={firms}
            onSelectFirm={selectFirm}
            projects={projects.filter((p) => p.firmId === currentFirm.id)}
            selectedProjectId={activeProjectId}
            onSelectProject={selectProjectGuarded}
            onAddProject={handleAddProject}
            projectSetupDefinition={selectedProjectSetup?.definition}
            projectSetupValues={selectedProjectSetup?.values}
            projectSetupSettings={selectedProjectSetup?.settings}
            onUpdateProjectSetup={handleUpdateProjectSetup}
            onSaveProjectForm={handleSaveProjectForm}
            projectEditSeed={selectedProjectSetup && projects.find((p) => p.id === activeProjectId)
              ? { ...projectFormSeed(projects.find((p) => p.id === activeProjectId)!, selectedProjectSetup, erpOf(activeProjectId)),
                  __plotRevisions: (erpOf(activeProjectId)?.records || []).filter((r: any) => r.kind === 'plots')
                    .map((r: any) => ({ recordId: r.id, revision: r.revision })) } as Project
              : undefined}
            onUploadProjectDocuments={handleUploadProjectDocuments}
            onProjectDocumentsChanged={() => { if (currentUser) void reload(currentUser.role); }}
            projectPlotResource={(erpOf(activeProjectId)?.resources || []).find((resource: any) => resource.kind === 'plots')}
            projectPlotRecords={(erpOf(activeProjectId)?.records || []).filter((record: any) => record.kind === 'plots')}
            plots={data.plots}
            onUpdatePlot={handleUpdatePlot}
            layoutCalc={data.settings.layoutCalc ?? EMPTY_LAYOUT}
            onUpdateLayoutCalc={handleUpdateLayoutCalc}
            projectExpenses={data.projectExpenses}
            onAddProjectExpense={handleAddProjectExpense}
            onUpdateProjectExpense={handleUpdateProjectExpense}
            apartmentUnits={data.units}
            onUpdateApartmentUnit={handleUpdateApartmentUnit}
            pricingMatrix={data.settings.pricingMatrix ?? EMPTY_MATRIX}
            onUpdatePricingMatrix={handleUpdatePricingMatrix}
            partners={data.partners}
            onUpdatePartner={handleUpdatePartner}
            onAddPartnerMember={handleAddPartnerMember}
            splitMode={data.settings.splitMode ?? 'fixed'}
            onToggleSplitMode={handleToggleSplitMode}
            fieldExpenses={data.fieldExpenses}
            onEnrollExpense={handleSubmitFieldExpense}
            ledgerMode={ledgerMode}
            onToggleLedgerMode={handleToggleLedgerMode}
            auditLogs={data.audit}
            liquorSettlements={data.settlements}
            onAddLiquorSettlement={handleAddLiquorSettlement}
            partnerStockDraws={data.stockDraws}
            onAddStockDraw={handleAddStockDraw}
            firmAccounts={data.accounts}
            onAddFirmAccount={handleAddFirmAccount}
            onAddAccountTransaction={handleAddAccountTransaction}
            individualInvestments={data.investments}
            onRecordIndividualInvestment={handleRecordIndividualInvestment}
          />
        ) : (
          <div className="bg-white rounded-3xl p-10 border border-red-200 text-center max-w-lg mx-auto my-12 shadow-xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto shadow-md">
              <Building2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-gray-950">Tenant Firm Not Found</h3>
            <p className="text-xs text-gray-600 leading-relaxed">Your firm is not active or not visible to this account.</p>
          </div>
        ))}

        {data && currentRole === 'field_partner' && (currentFirm ? (
          <FieldPartnerMobileView
            onReferBackFinancial={handleReferBackFinancial}
            onResubmitFinancial={handleResubmitFinancial}
            firm={currentFirm}
            firms={firms}
            currentUser={currentUser}
            onSelectFirm={(firmId) => {
              if (firmId !== selectedFirmId && !confirmLeave()) return;
              setSelectedFirmId(firmId);
              setSelectedProjectId(projects.find((p) => p.firmId === firmId)?.id || '');
            }}
            partners={data.partners}
            plots={data.plots}
            apartmentUnits={data.units}
            fieldExpenses={data.fieldExpenses}
            onSubmitExpense={handleSubmitFieldExpense}
            drawingRequests={data.drawings}
            onSubmitDrawing={handleSubmitDrawing}
            onBlockedAction={unsupported}
            session={partnerSession}
            onLogin={() => undefined}
            onLogout={handleSignOut}
            onUpdatePlot={handleUpdatePlot}
            projects={projects}
            selectedProjectId={activeProjectId}
            onSelectProject={selectProjectGuarded}
            layoutCalc={data.settings.layoutCalc ?? EMPTY_LAYOUT}
            onUpdateLayoutCalc={handleUpdateLayoutCalc}
            projectExpenses={data.projectExpenses}
            onAddProjectExpense={handleAddProjectExpense}
            onUpdateProjectExpense={handleUpdateProjectExpense}
            firmAccounts={data.accounts}
            partnerStockDraws={data.stockDraws}
            onAddAccountTransaction={handleAddAccountTransaction}
            onAddStockDraw={handleAddStockDraw}
            ledgerMode={ledgerMode}
            onUpdatePartner={handleUpdatePartner}
            individualInvestments={data.investments}
            onRecordIndividualInvestment={handleRecordIndividualInvestment}
          />
        ) : (
          <div className="bg-white rounded-3xl p-10 border border-amber-300 text-center max-w-lg mx-auto my-12 shadow-xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFB800] text-gray-950 flex items-center justify-center mx-auto shadow-md">
              <Smartphone className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-gray-950">No Syndicate Firm Available</h3>
          </div>
        ))}
      </main>

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#111827] border border-amber-500/80 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs max-w-md animate-fade-in">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FFB800] animate-ping shrink-0" />
          <span className="font-bold text-gray-100">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-gray-400 hover:text-white ml-auto">✕</button>
        </div>
      )}
    </div>
    </HeaderSlotProvider>
  );
}

function AppEntry() {
  const params = new URLSearchParams(window.location.search);
  if (/\/marketing\/?$/.test(window.location.pathname) || params.get('portal') === 'marketing') {
    return <MarketingAccessPage invitation={params.get('invite')} />;
  }
  return <App />;
}

export default AppEntry;
