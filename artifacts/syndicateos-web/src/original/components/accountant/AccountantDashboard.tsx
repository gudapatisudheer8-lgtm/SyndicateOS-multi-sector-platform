import { MasterOptions, masterNumber } from '../../../adapter/config';
import { confirmLeave } from '../../../adapter/leaveGuard';
import React, { useState, useEffect } from 'react';
import {
  TenantFirm,
  Project,
  Plot,
  LayoutCalculation,
  ProjectExpense,
  ApartmentUnit,
  ApartmentPricingMatrix,
  SyndicatePartner,
  FieldExpenseLog,
  EquitySplitMode,
  LedgerMode,
  AuditLogEntry,
  LiquorDailySettlement,
  PartnerStockDraw,
  FirmAccount,
  FirmAccountTransaction,
  IndividualInvestmentRecord,
  PlanUploadDocument
} from '../../types';
import { OpenPlottingModule } from './OpenPlottingModule';
import { ConstructionModule } from './ConstructionModule';
import { SyndicateEquityModule } from './SyndicateEquityModule';
import { LiquorVendSettlementModule } from './LiquorVendSettlementModule';
import { ProjectStatementModule, type UnifiedProjectTransaction } from './ProjectStatementModule';
import { HeaderSlot } from '../HeaderSlot';
import { AddProjectModal } from '../modals/AddProjectModal';
import { FirmAccountsBar } from './FirmAccountsBar';
import { AddFirmAccountModal } from '../modals/AddFirmAccountModal';
import { FirmAccountStatementModal } from '../modals/FirmAccountStatementModal';
import { RecordLedgerTransactionModal } from '../modals/RecordLedgerTransactionModal';
import { EnrollExpenseModal } from '../modals/EnrollExpenseModal';
import { IndividualInvestmentModal, IndividualInvestmentData } from '../modals/IndividualInvestmentModal';
import {
  Compass,
  Building,
  PieChart,
  Wine,
  Hammer,
  ShieldCheck,
  CheckCircle2,
  FolderOpen,
  PlusCircle,
  Coins,
  MapPin,
  TrendingUp,
  LayoutDashboard,
  Receipt,
  Landmark,
  ArrowRight,
  Sparkles,
  Layers,
  AlertCircle,
  FileCheck,
  Building2,
  Calendar,
  Check,
  X,
  CreditCard,
  FileText,
  Plus,
  Search,
  Filter,
  Clock,
  User,
  Tag,
  Printer,
  ChevronRight,
  CheckSquare,
  Pencil
} from 'lucide-react';
import { formatINR, formatIndianCompact } from '../../utils/formatters';

interface AccountantDashboardProps {
  firm: TenantFirm;
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onAddProject: (newProject: Project, initialPlots?: Plot[], initialUnits?: ApartmentUnit[], initialAccounts?: FirmAccount[]) => boolean | Promise<boolean>;
  plots: Plot[];
  onUpdatePlot: (plot: Plot) => void | boolean | Promise<boolean>;
  onApproveBooking?: (receiptId: string) => boolean | Promise<boolean>;
  layoutCalc: LayoutCalculation;
  onUpdateLayoutCalc: (calc: LayoutCalculation) => void | boolean | Promise<boolean>;
  projectExpenses: ProjectExpense[];
  onAddProjectExpense: (expense: ProjectExpense) => void | boolean | Promise<boolean>;
  onUpdateProjectExpense: (expense: ProjectExpense) => void | boolean | Promise<boolean>;
  apartmentUnits: ApartmentUnit[];
  onUpdateApartmentUnit: (unit: ApartmentUnit) => void | boolean | Promise<boolean>;
  pricingMatrix: ApartmentPricingMatrix;
  onUpdatePricingMatrix: (matrix: ApartmentPricingMatrix) => void | boolean | Promise<boolean>;
  partners: SyndicatePartner[];
  onUpdatePartner: (partner: SyndicatePartner) => void | boolean | Promise<boolean>;
  onAddPartnerMember?: (partner: SyndicatePartner) => void | boolean | Promise<boolean>;
  splitMode: EquitySplitMode;
  onToggleSplitMode: (mode: EquitySplitMode) => void | boolean | Promise<boolean>;
  fieldExpenses: FieldExpenseLog[];
  onApproveExpense?: (expenseId: string, signoff?: string) => void;
  onRejectExpense?: (expenseId: string) => void;
  ledgerMode: LedgerMode;
  onToggleLedgerMode: (mode: LedgerMode) => void;
  auditLogs: AuditLogEntry[];
  liquorSettlements: LiquorDailySettlement[];
  onAddLiquorSettlement: (settlement: LiquorDailySettlement) => void | boolean | Promise<boolean>;
  partnerStockDraws: PartnerStockDraw[];
  onAddStockDraw: (draw: PartnerStockDraw) => void | boolean | Promise<boolean>;
  firmAccounts?: FirmAccount[];
  onAddFirmAccount?: (account: FirmAccount) => void | boolean | Promise<boolean>;
  onAddAccountTransaction?: (accountId: string, tx: FirmAccountTransaction) => void | boolean | Promise<boolean>;
  onEnrollExpense?: (expense: FieldExpenseLog, bankAccountId?: string) => void | boolean | Promise<boolean>;
  individualInvestments?: IndividualInvestmentRecord[];
  onRecordIndividualInvestment?: (data: IndividualInvestmentData) => void | boolean | Promise<boolean>;
  onApproveIndividualInvestment?: (investmentId: string, approverName: string) => void;
  onRejectIndividualInvestment?: (investmentId: string, reason?: string) => void;
  onSignOut?: () => void;
  onSubmitDrawing?: (data: any) => void | boolean | Promise<boolean>;
  onReferBackFinancial?: (entry: UnifiedProjectTransaction, reason: string, requestId: string) => Promise<boolean>;
  onResubmitFinancial?: (entry: UnifiedProjectTransaction, data: Record<string, any>, requestId: string) => Promise<boolean>;
  firms?: TenantFirm[];
  onSelectFirm?: (firmId: string) => void;
  projectSetupDefinition?: any;
  projectSetupValues?: Record<string, any>;
  projectSetupSettings?: Record<string, any>;
  onUpdateProjectSetup?: (projectId: string, values: Record<string, any>, settings: Record<string, any>, revision: number, plotEdits?: Array<{ recordId: string; revision: number; data: Record<string, any> }>) => Promise<boolean>;
  projectPlotResource?: any;
  projectPlotRecords?: any[];
  projectEditSeed?: Project;
  onSaveProjectForm?: (project: Project, accounts?: FirmAccount[]) => Promise<boolean>;
  onUploadProjectDocuments?: (projectId: string, documents: PlanUploadDocument[]) => Promise<boolean>;
  onProjectDocumentsChanged?: () => void;
}

export type TopBarTab =
  | 'dashboard'
  | 'partners'
  | 'open_plotting'
  | 'construction'
  | 'liquor_infra'
  | 'accounts'
  | 'expenses'
  | 'project_statement';

export const AccountantDashboard: React.FC<AccountantDashboardProps> = ({
  firm,
  projects,
  selectedProjectId,
  onSelectProject,
  onAddProject,
  plots,
  onUpdatePlot,
  onApproveBooking,
  layoutCalc,
  onUpdateLayoutCalc,
  projectExpenses,
  onAddProjectExpense,
  onUpdateProjectExpense,
  apartmentUnits,
  onUpdateApartmentUnit,
  pricingMatrix,
  onUpdatePricingMatrix,
  partners,
  onUpdatePartner,
  onAddPartnerMember,
  splitMode,
  onToggleSplitMode,
  fieldExpenses,
  onApproveExpense,
  onRejectExpense,
  onEnrollExpense = () => {},
  ledgerMode,
  onToggleLedgerMode,
  auditLogs,
  liquorSettlements,
  onAddLiquorSettlement,
  partnerStockDraws,
  onAddStockDraw,
  firmAccounts = [],
  onAddFirmAccount = () => {},
  onAddAccountTransaction = () => {},
  individualInvestments = [],
  onRecordIndividualInvestment,
  onApproveIndividualInvestment,
  onRejectIndividualInvestment,
  onSubmitDrawing,
  onReferBackFinancial,
  onResubmitFinancial,
  firms = [],
  onSelectFirm,
  projectSetupDefinition,
  projectSetupValues,
  projectSetupSettings,
  onUpdateProjectSetup,
  onUploadProjectDocuments,
  onProjectDocumentsChanged,
  projectPlotResource,
  projectPlotRecords,
  projectEditSeed,
  onSaveProjectForm,
}) => {
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [addProjectSession, setAddProjectSession] = useState(0);
  // Modal states
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [isAddFirmAccountModalOpen, setIsAddFirmAccountModalOpen] = useState(false);
  const [statementAccount, setStatementAccount] = useState<FirmAccount | null>(null);
  const [isRecordTxModalOpen, setIsRecordTxModalOpen] = useState(false);
  const [isEnrollExpenseModalOpen, setIsEnrollExpenseModalOpen] = useState(false);
  const [isIndividualInvestmentModalOpen, setIsIndividualInvestmentModalOpen] = useState(false);
  const [selectedVoucherForSlip, setSelectedVoucherForSlip] = useState<FieldExpenseLog | null>(null);

  const openAddProject = () => {
    setAddProjectSession((n) => n + 1);
    setIsAddProjectModalOpen(true);
  };

  // Expenses Tab specific filter states
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [expenseSubTab, setExpenseSubTab] = useState<'all' | 'pending' | 'approved' | 'budget_matrix'>('all');

  // Top Bar Tab state
  const [activeTab, setActiveTab] = useState<TopBarTab>('dashboard');
  const guardedTab = (t: TopBarTab) => { if (t !== activeTab && !confirmLeave()) return; setActiveTab(t); };

  // Filter projects belonging strictly to this firm AND matching firm's active business sectors
  const firmActiveProjects = projects.filter(
    (p) => p.firmId === firm.id && firm.sectors.includes(p.sector)
  );

  // Derive the active project strictly from active sector projects
  const activeProject: Project | null =
    firmActiveProjects.find((p) => p.id === selectedProjectId) ||
    firmActiveProjects[0] ||
    null;

  // Edit target is pinned to the project chosen when opening; closes if it leaves this firm or selection changes.
  const editingProject: Project | null =
    editProjectId && activeProject && activeProject.id === editProjectId ? activeProject : null;
  useEffect(() => {
    if (editProjectId && (!activeProject || activeProject.id !== editProjectId)) setEditProjectId(null);
  }, [editProjectId, activeProject?.id]);

  // If a tab belongs to a sector that is removed from the firm, gracefully fall back to dashboard
  useEffect(() => {
    if (activeTab === 'open_plotting' && !firm.sectors.includes('real_estate_open_plotting')) {
      setActiveTab('dashboard');
    } else if (activeTab === 'construction' && !firm.sectors.includes('real_estate_construction')) {
      setActiveTab('dashboard');
    } else if (
      activeTab === 'liquor_infra' &&
      !firm.sectors.includes('liquor_vends') &&
      !firm.sectors.includes('custom_infra')
    ) {
      setActiveTab('dashboard');
    }
  }, [firm.sectors, activeTab]);

  // Keep selectedProjectId in sync with firm's active business sectors
  useEffect(() => {
    if (activeProject && !firm.sectors.includes(activeProject.sector)) {
      if (firmActiveProjects.length > 0 && firmActiveProjects[0].id !== selectedProjectId) {
        onSelectProject(firmActiveProjects[0].id);
      }
    }
  }, [firm.sectors, activeProject?.sector, firmActiveProjects, selectedProjectId, onSelectProject]);

  // Filter Inventory strictly for the selected project
  const activePlots = activeProject
    ? plots.filter((p) => p.projectId === activeProject.id)
    : [];

  const activeUnits = activeProject
    ? apartmentUnits.filter((u) => u.projectId === activeProject.id)
    : [];

  const activeProjectExpenses = activeProject
    ? projectExpenses.filter((pe) => pe.projectId === activeProject.id)
    : [];

  // Dynamic Respective Partners for THIS project (partners vary from project to project)
  const activeProjectPartners: SyndicatePartner[] =
    activeProject && activeProject.partners && activeProject.partners.length > 0
      ? activeProject.partners.map((ps) => {
          const master = partners.find(
            (p) => String(p.id) === String(ps.partnerId) || p.name.trim().toLowerCase() === ps.name.trim().toLowerCase()
          );
          // Look up verified individual investments enrolled for this partner
          const partnerApprovedInvs = (individualInvestments || []).filter(
            (inv) =>
              (String(inv.partnerId) === String(ps.partnerId) ||
                inv.partnerName.trim().toLowerCase() === ps.name.trim().toLowerCase()) &&
              inv.status === 'approved' &&
              (!inv.firmId || inv.firmId === firm.id) &&
              (!activeProject || !inv.projectId || inv.projectId === activeProject.id)
          );
          const totalInvsRecorded = partnerApprovedInvs.reduce((sum, i) => sum + i.amount, 0);

          const actualInv =
            activeProject.financialStatement ? (ps.actualInvested ?? 0) : totalInvsRecorded > 0
              ? totalInvsRecorded
              : ps.actualInvested !== undefined
              ? ps.actualInvested
              : (master?.actualInvested !== undefined ? master.actualInvested : 0);

          return {
            id: ps.partnerId,
            firmId: firm.id,
            name: ps.name,
            phone: ps.phone,
            roleDescription: ps.roleInProject || (master ? master.roleDescription : 'Syndicate Partner'),
            avatarColor: ps.avatarColor || (master ? master.avatarColor : 'bg-indigo-600'),
            initialCapital: ps.initialCapital || 0,
            actualInvested: actualInv,
            fixedEquityPercent: ps.equityPercent || 0,
            drawings: ps.drawings ?? (master ? master.drawings : 0),
            shareOfFieldExpenses: ps.shareOfFieldExpenses ?? (master ? master.shareOfFieldExpenses : 0),
            userRole: ps.roleInProject.toLowerCase().includes('managing')
              ? 'managing_partner'
              : (master?.userRole || 'field_partner'),
            userStatus: (master?.userStatus as any) || (ps as any).userStatus || 'active',
            pinCode: master?.pinCode || (ps as any).pinCode || '',
            mustChangePin: master?.mustChangePin ?? (ps as any).mustChangePin ?? (master?.pinCode === '9999' || (ps as any).pinCode === '9999'),
            dailySpendingLimit: master?.dailySpendingLimit || 50000,
          };
        })
      : [];

  // Layout Calculations
  const activeLayoutCalc: LayoutCalculation = activeProject
    ? {
        totalExtentValue: activeProject.extentValue || 0,
        unit:
          activeProject.extentUnit === 'Units / Flats'
            ? 'Acres'
            : (activeProject.extentUnit as 'Acres' | 'Guntas / Cents' | 'Sq. Yards') || 'Acres',
        roadWidth: (activeProject.roadWidth ?? masterNumber('layout_defaults', 'road_width') ?? 0) as any,
        openSpacePercent: activeProject.openSpacePercent ?? masterNumber('layout_defaults', 'open_space_percent') ?? 0,
        floorRatePerSqYard: activeProject.floorRatePerSqYard || 0,
      }
    : {
        totalExtentValue: 0,
        unit: 'Acres',
        roadWidth: 0 as any,
        openSpacePercent: 0,
        floorRatePerSqYard: 0,
      };

  const activeProjectTotalCapital = activeProjectPartners.reduce((acc, p) => acc + (p.initialCapital || 0), 0);
  const activeProjectTotalActualInvested = activeProjectPartners.reduce(
    (acc, p) => acc + (p.actualInvested !== undefined ? p.actualInvested : 0),
    0
  );
  const activeProjectCost = activeProject?.totalEstimatedOutlay || 0;
  const isProjectCostInSync = activeProjectCost > 0 ? Math.abs(activeProjectTotalCapital - activeProjectCost) < 100 : true;
  const pendingExpensesCount = fieldExpenses.filter((e) => e.status === 'pending').length;

  // ==========================================
  // DASHBOARD KPI CALCULATIONS FOR QUICK VIEW
  // ==========================================
  const isPlotSector = activeProject ? activeProject.sector === 'real_estate_open_plotting' : false;
  const isConstructionSector = activeProject ? activeProject.sector === 'real_estate_construction' : false;

  // Plots inventory stats
  const totalPlotsCount = activePlots.length;
  const availablePlotsCount = activePlots.filter((p) => p.status === 'available').length;
  const bookedPlotsCount = activePlots.filter((p) => p.status === 'reserved').length;
  const soldPlotsCount = activePlots.filter((p) => p.status === 'sold').length;

  const totalPlotsSellableValue = activePlots.reduce((sum, p) => {
    const rate = p.ratePerSqYard || (activeProject ? activeProject.floorRatePerSqYard : 0) || 0;
    return sum + p.areaSqYards * rate;
  }, 0);
  const totalPlotAdvancesCollected = activePlots.reduce((sum, p) => sum + (p.advanceReceived || 0), 0);

  // Construction units stats
  const totalUnitsCount = activeUnits.length;
  const availableUnitsCount = activeUnits.filter((u) => u.status === 'available').length;
  const bookedUnitsCount = activeUnits.filter((u) => u.status === 'booked').length;
  const registeredUnitsCount = activeUnits.filter((u) => u.status === 'registered').length;

  const totalUnitsSellableValue = activeUnits.reduce((sum, u) => {
    const rate =
      (u.baseRate || (activeProject ? activeProject.baseSqFtRate : 4600) || 4600) + (u.facingPremium || 0) + (u.floorRise || 0);
    return sum + u.sftArea * rate + (u.parkingFee || 0) + (u.amenitiesFee || 0);
  }, 0);
  const totalUnitAdvancesCollected = activeUnits.reduce((sum, u) => sum + (u.advanceReceived || 0), 0);

  // Unified figures for the active project
  const totalInventoryCount = isPlotSector ? totalPlotsCount : isConstructionSector ? totalUnitsCount : 0;
  const availableInventoryCount = isPlotSector ? availablePlotsCount : isConstructionSector ? availableUnitsCount : 0;
  const bookedInventoryCount = isPlotSector ? bookedPlotsCount : isConstructionSector ? bookedUnitsCount : 0;
  const soldInventoryCount = isPlotSector ? soldPlotsCount : isConstructionSector ? registeredUnitsCount : 0;

  const totalActualEstimatedValue = !activeProject
    ? 0
    : isPlotSector
    ? totalPlotsSellableValue
    : isConstructionSector
    ? totalUnitsSellableValue
    : 0;

  const totalAdvancesCollected = isPlotSector ? totalPlotAdvancesCollected : totalUnitAdvancesCollected;
  const totalPendingReceivables = Math.max(0, totalActualEstimatedValue - totalAdvancesCollected);
  const projectedSurplus = activeProject ? totalActualEstimatedValue - activeProjectCost : 0;
  const projectedRoiPercent =
    activeProjectCost > 0 ? Math.round((projectedSurplus / activeProjectCost) * 100) : 0;

  // Bank and Cash accounts are both strictly scoped to the active project.
  const projectAccounts = activeProject
    ? firmAccounts.filter(
        (acc) =>
          acc.firmId === firm.id &&
          acc.linkedProjectId === activeProject.id
      )
    : [];
  const totalProjectLiquidity = projectAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);

  // Posted cash-only breakdown from the server financial statement (affectsCash entries only).
  // Categories follow FinancialStatementService: partner_capital, plot_booking_advance / flat_booking_advance,
  // opening_balance, field_* (expenses), partner_draw. Internal transfers net to zero and are excluded.
  const cashBreakdown = (() => {
    const st = activeProject?.financialStatement;
    if (!Array.isArray(st)) return null;
    const b = { opening: 0, investments: 0, receipts: 0, otherIn: 0, expenses: 0, drawings: 0, otherOut: 0, net: 0 };
    for (const t of st) {
      if (t.affectsCash !== true) continue;
      const cat = String(t.category || '');
      if (cat === 'inter_account_transfer') continue;
      const amt = Number(t.amount) || 0;
      const signed = t.type === 'credit' ? amt : -amt;
      b.net += signed;
      if (cat === 'opening_balance') b.opening += signed;
      else if (cat === 'partner_capital') b.investments += signed;
      else if (cat === 'plot_booking_advance' || cat === 'flat_booking_advance') b.receipts += signed;
      else if (cat.startsWith('field_') || (t as any).kind === 'expenses') b.expenses -= signed;
      else if (cat === 'partner_draw') b.drawings -= signed;
      else if (signed >= 0) b.otherIn += signed;
      else b.otherOut -= signed;
    }
    return b;
  })();
  const canEditProject = !!activeProject && !!onSaveProjectForm && projectEditSeed?.id === activeProject.id && projectEditSeed?.firmId === firm.id;
  const salesTab: TopBarTab = activeProject?.sector === 'real_estate_construction' && firm.sectors.includes('real_estate_construction') ? 'construction' : 'open_plotting';
  const kpiCardCls = 'group text-left w-full bg-white rounded-3xl p-5 border border-gray-200 shadow-sm hover:border-amber-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition-all flex flex-col justify-between cursor-pointer';

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* Project treasury controls live in the shared sticky Header (one combined bar). */}
      <HeaderSlot position="brand">
        <div className="text-[9px] leading-tight font-black uppercase tracking-wider text-amber-700 truncate"
          title={[activeProject?.name, firm.name, firm.location, firm.accountantName ? `Accountant: ${firm.accountantName}` : ''].filter(Boolean).join(' · ')}>
          Project treasury <span className="font-mono text-stone-400 normal-case">{firm.code}</span>
        </div>
      </HeaderSlot>
      <HeaderSlot>
        <div className="flex flex-wrap items-center gap-2 min-w-0 lg:justify-end" data-testid="header-project-treasury">
          {firms.length > 0 && (
            <label htmlFor="accountant-firm-select" className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-stone-300 min-w-0 flex-1 basis-[10rem] sm:max-w-[220px]">
              <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="sr-only">Firm</span>
              <select
                id="accountant-firm-select"
                data-testid="select-firm"
                value={firm.id}
                disabled={!onSelectFirm}
                title={`Firm: ${firm.name}`}
                onChange={(e) => { setEditProjectId(null); setIsAddProjectModalOpen(false); onSelectFirm?.(e.target.value); }}
                className="w-full min-w-0 text-xs font-black text-slate-900 bg-transparent border-0 focus:ring-0 cursor-pointer p-0 pr-4 outline-none truncate disabled:cursor-default"
              >
                {!firms.some((f) => f.id === firm.id) && <option value={firm.id}>{firm.name} ({firm.code})</option>}
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-stone-300 min-w-0 flex-1 basis-[12rem] sm:max-w-[300px]">
            <FolderOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="sr-only">Select project</span>
            <select
              id="accountant-project-select"
              data-testid="select-project"
              value={selectedProjectId}
              title={activeProject ? `Project: ${activeProject.name}` : 'Select project'}
              onChange={(e) => onSelectProject(e.target.value)}
              className="w-full min-w-0 text-xs font-black text-slate-900 bg-transparent border-0 focus:ring-0 cursor-pointer p-0 pr-4 outline-none truncate"
            >
              {firmActiveProjects.length > 0 ? (
                firmActiveProjects.map((proj) => (
                  <option key={proj.id} value={proj.id}>{proj.name} ({proj.code})</option>
                ))
              ) : (
                <option value="">No Active Projects in Enabled Sectors</option>
              )}
            </select>
          </label>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-edit-project"
              data-testid="button-edit-project"
              type="button"
              disabled={!canEditProject}
              title={!activeProject ? 'Select a project to edit' : canEditProject ? `Edit ${activeProject.name}` : 'Project details are still loading'}
              onClick={() => canEditProject && activeProject && setEditProjectId(activeProject.id)}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-stone-50 text-slate-900 font-black text-xs border border-stone-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              id="btn-add-project"
              data-testid="button-add-project"
              type="button"
              onClick={() => openAddProject()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-slate-950 font-black text-xs border border-amber-500/40"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Project</span>
            </button>
          </div>
        </div>
      </HeaderSlot>

      {/* ======================================================== */}
      {/* 2. TOP SIDE BARS / NAVIGATION TABS (SPLIT SECTIONS)      */}
      {/* ======================================================== */}
      <div data-testid="module-navigation" style={{ top: 'var(--sos-header-height, 0px)' }} className="sticky z-30 bg-white p-2 sm:p-2.5 rounded-3xl shadow-sm border border-gray-200">
        <nav aria-label="Syndicate Top Bars" className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          {/* Bar 1: Dashboard & KPIs */}
          <button
            id="topbar-dashboard"
            onClick={() => guardedTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'dashboard'
                ? 'bg-[#111827] text-white shadow-md'
                : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-[#FFB800]" />
            <span>Dashboard</span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                activeTab === 'dashboard' ? 'bg-amber-400 text-gray-950' : 'bg-gray-200 text-gray-800'
              }`}
            >
              KPIs
            </span>
          </button>

          {/* Bar 2: Partners Info & Equity */}
          <button
            id="topbar-partners"
            onClick={() => guardedTab('partners')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'partners'
                ? 'bg-[#111827] text-white shadow-md'
                : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100'
            }`}
          >
            <PieChart className="w-4 h-4 text-[#FFB800]" />
            <span>Partners &amp; Equity</span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                activeTab === 'partners' ? 'bg-amber-400 text-gray-950' : 'bg-gray-200 text-gray-800'
              }`}
            >
              {activeProjectPartners.length}
            </span>
          </button>

          {/* Bar 3: Sector Engine (Open Plotting) */}
          {firm.sectors.includes('real_estate_open_plotting') && firm.featureFlags?.enablePlotGrid !== false && (
            <button
              id="topbar-open-plotting"
              onClick={() => guardedTab('open_plotting')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 ${
                activeTab === 'open_plotting'
                  ? 'bg-[#111827] text-white shadow-md'
                  : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100'
              }`}
            >
              <Compass className="w-4 h-4 text-[#FFB800]" />
              <span>Open Plotting</span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  activeTab === 'open_plotting' ? 'bg-amber-400 text-gray-950' : 'bg-gray-200 text-gray-800'
                }`}
              >
                {activePlots.length} Plots
              </span>
            </button>
          )}

          {/* Bar 4: Sector Engine (Apartments & Construction) */}
          {firm.sectors.includes('real_estate_construction') && firm.featureFlags?.enableApartmentMatrix !== false && (
            <button
              id="topbar-construction"
              onClick={() => guardedTab('construction')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 ${
                activeTab === 'construction'
                  ? 'bg-[#111827] text-white shadow-md'
                  : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100'
              }`}
            >
              <Building className="w-4 h-4 text-[#FFB800]" />
              <span>Apartments &amp; Construction</span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  activeTab === 'construction' ? 'bg-amber-400 text-gray-950' : 'bg-gray-200 text-gray-800'
                }`}
              >
                {activeUnits.length} Units
              </span>
            </button>
          )}

          {/* Bar 5: Liquor Vends / Custom Infra */}
          {(firm.sectors.includes('liquor_vends') || firm.sectors.includes('custom_infra')) && (
            <button
              id="topbar-liquor-infra"
              onClick={() => guardedTab('liquor_infra')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 ${
                activeTab === 'liquor_infra'
                  ? 'bg-[#111827] text-white shadow-md'
                  : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100'
              }`}
            >
              {firm.sectors.includes('liquor_vends') ? (
                <>
                  <Wine className="w-4 h-4 text-[#FFB800]" />
                  <span>Liquor Vends</span>
                </>
              ) : (
                <>
                  <Hammer className="w-4 h-4 text-[#FFB800]" />
                  <span>Custom Infra</span>
                </>
              )}
            </button>
          )}

          {/* Bar 8: Project Statement */}
          <button
            id="topbar-project-statement"
            onClick={() => guardedTab('project_statement')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 ${
              activeTab === 'project_statement'
                ? 'bg-[#111827] text-white shadow-md'
                : 'text-gray-700 hover:text-gray-950 hover:bg-gray-100'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Project Statement</span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                activeTab === 'project_statement' ? 'bg-emerald-400 text-gray-950' : 'bg-gray-200 text-gray-800'
              }`}
            >
              Passbook
            </span>
          </button>
        </nav>
      </div>

      {/* ======================================================== */}
      {/* 3. CONTENT AREA FOR ACTIVE TOP BAR                      */}
      {/* ======================================================== */}

      {/* ---------------------------------------------------- */}
      {/* TAB 1: DASHBOARD (ALL QUICK VIEWABLE DATA & KPIS)    */}
      {/* ---------------------------------------------------- */}

      {activeTab === 'dashboard' && (
        !activeProject ? (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-amber-500/10 via-white to-gray-50 rounded-3xl p-8 sm:p-12 text-center border border-amber-200/80 shadow-sm max-w-2xl mx-auto my-4 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-[#FFB800] text-gray-950 flex items-center justify-center mx-auto shadow-md">
                <Building2 className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2.5 py-0.5 rounded bg-gray-900 text-amber-300">
                  {firm.code}
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-gray-950 mt-2">
                  Welcome to {firm.name}!
                </h3>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                  All top bar operations, metrics, partner allocations, and project bank accounts sync with the selected project. As Firm Accountant, you manage the firm and project operations. To get started, please add your first project venture.
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openAddProject()}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Add First Project Venture</span>
                </button>
              </div>
            </div>

            {/* 3-Step Project Workflow Guide (No mock numbers, no defaulted values) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-black text-xs">
                  1
                </div>
                <h4 className="text-xs font-black text-gray-900">Create Project Venture</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Configure Open Plotting or Construction projects with survey numbers, extent, and estimated outlay.
                </p>
              </div>
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-900 flex items-center justify-center font-black text-xs">
                  2
                </div>
                <h4 className="text-xs font-black text-gray-900">Assign Project Partners</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Allocate partner equity shares and capital investments specific to each project venture.
                </p>
              </div>
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-black text-xs">
                  3
                </div>
                <h4 className="text-xs font-black text-gray-900">Register Project Bank Accounts</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Open and link dedicated RERA escrow, operational, or cash accounts for each specific project.
                </p>
              </div>
            </div>
          </div>
        ) : (
        <div className="space-y-6">
          {/* CORE KPI CARDS — each card navigates to its module for the selected project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* KPI Card 1: Total Project Estimated Cost -> Partners & Equity */}
            <button
              type="button"
              data-testid="card-kpi-project-cost"
              onClick={() => guardedTab('partners')}
              aria-label="Total estimated project cost. Open Partners and Equity"
              className={kpiCardCls}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span>Total Est. Project Cost</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <h4 className="text-2xl sm:text-3xl font-black text-gray-950 font-mono mt-2">{formatINR(activeProjectCost)}</h4>
                <div className="mt-3 space-y-1.5">
                  {activeProjectPartners.length === 0 ? (
                    <p className="text-xs font-semibold text-amber-800">No partners assigned to this project yet.</p>
                  ) : (
                    activeProjectPartners.map((p) => (
                      <div key={p.id} data-testid={`text-kpi-partner-${p.id}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`w-5 h-5 rounded-full ${p.avatarColor} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>{p.name.charAt(0).toUpperCase()}</span>
                          <span className="truncate font-bold text-gray-900 group-hover:underline">{p.name}</span>
                          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-800 border border-amber-200">{p.fixedEquityPercent}%</span>
                        </span>
                        <span className="shrink-0 font-mono font-bold text-gray-700">{formatINR(p.initialCapital || 0)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="w-full mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs gap-2">
                <span className="text-gray-500 text-[10px] uppercase font-bold">Partner Target Commitment</span>
                <strong className="text-gray-900 font-mono font-bold">{formatINR(activeProjectTotalCapital)}</strong>
              </div>
            </button>

            {/* KPI Card 2: Projected Gross Sales -> Open Plotting */}
            <button
              type="button"
              data-testid="card-kpi-gross-sales"
              onClick={() => guardedTab(salesTab)}
              aria-label="Projected gross sales. Open inventory"
              className={kpiCardCls}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Projected Gross Sales</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition-colors" />
                </div>
                <h4 className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono mt-2">{formatINR(totalActualEstimatedValue)}</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Projected revenue if all {totalInventoryCount} {isPlotSector ? 'plots' : 'units'} are sold at catalog rates.
                </p>
              </div>
              <div className="w-full mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs gap-2">
                <span className="text-gray-500 text-[10px] uppercase font-bold">Projected Net Surplus</span>
                <strong className="text-emerald-800 font-mono font-bold">{projectedSurplus >= 0 ? '+' : ''}{formatINR(projectedSurplus)} ({projectedRoiPercent}%)</strong>
              </div>
            </button>

            {/* KPI Card 3: Inventory -> Open Plotting */}
            <button
              type="button"
              data-testid="card-kpi-inventory"
              onClick={() => guardedTab(salesTab)}
              aria-label="Inventory status. Open inventory"
              className={kpiCardCls}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>{isPlotSector ? 'Plot Inventory' : isConstructionSector ? 'Apartment Units' : 'Venture Assets'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">{totalInventoryCount} Total</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition-colors" />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-emerald-50 p-2 rounded-2xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-800 block">Available</span>
                    <span className="text-base font-black text-emerald-950">{availableInventoryCount}</span>
                  </div>
                  <div className="bg-amber-50 p-2 rounded-2xl border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 block">Booked</span>
                    <span className="text-base font-black text-amber-950">{bookedInventoryCount}</span>
                  </div>
                  <div className="bg-slate-100 p-2 rounded-2xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-700 block">Sold / Reg</span>
                    <span className="text-base font-black text-slate-950">{soldInventoryCount}</span>
                  </div>
                </div>
              </div>
              <div className="w-full mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span className="text-gray-500">Inventory Sell-Through:</span>
                <strong className="text-gray-950 font-bold">
                  {totalInventoryCount > 0 ? Math.round(((bookedInventoryCount + soldInventoryCount) / totalInventoryCount) * 100) : 0}% Committed
                </strong>
              </div>
            </button>

            {/* KPI Card 4: Project Account -> Project Statement */}
            <button
              type="button"
              data-testid="card-kpi-project-account"
              onClick={() => guardedTab('project_statement')}
              aria-label="Project account balance. Open Project Statement"
              className={kpiCardCls}
            >
              <div className="w-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-amber-600" />
                    <span>Project Account</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 border border-gray-200">Bank + Cash · {projectAccounts.length} A/Cs</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition-colors" />
                  </span>
                </div>
                <h4 data-testid="text-project-net-balance" className="text-2xl sm:text-3xl font-black text-gray-950 font-mono mt-2">{cashBreakdown ? formatINR(totalProjectLiquidity) : 'Unavailable'}</h4>
                <p className="text-[11px] text-gray-500 mt-0.5">Net balance from live bank and cash account balances.</p>
                {cashBreakdown ? (
                  <div className="mt-3 space-y-1 text-xs">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Posted cash movements</p>
                    {([
                      ['Opening balance', cashBreakdown.opening, 1],
                      ['Investments', cashBreakdown.investments, 1],
                      ['Plot booking / customer receipts', cashBreakdown.receipts, 1],
                      ['Other inflows', cashBreakdown.otherIn, 1],
                      ['Expenses', cashBreakdown.expenses, -1],
                      ['Drawings', cashBreakdown.drawings, -1],
                      ['Other outflows', cashBreakdown.otherOut, -1],
                    ] as Array<[string, number, number]>).map(([label, val, sign]) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="text-gray-600">{sign > 0 ? '+' : '-'} {label}</span>
                        <span className={`font-mono font-bold ${sign > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatINR(val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1">
                      <span className="font-bold text-gray-800">= Posted net</span>
                      <span className="font-mono font-black text-gray-950">{formatINR(cashBreakdown.net)}</span>
                    </div>
                    {Math.abs(cashBreakdown.net - totalProjectLiquidity) >= 0.005 && (
                      <p data-testid="text-reconciliation-gap" className="text-[11px] font-semibold text-amber-800">
                        Differs from live balances by {formatINR(Math.abs(cashBreakdown.net - totalProjectLiquidity))}. Review the Project Statement to reconcile.
                      </p>
                    )}
                  </div>
                ) : (
                  <p data-testid="text-breakdown-unavailable" className="mt-3 rounded-xl border border-dashed border-gray-300 p-2.5 text-[11px] text-gray-600">
                    Posted cash breakdown unavailable: the server statement for this project has not loaded. Open the Project Statement for the full ledger.
                  </p>
                )}
              </div>
            </button>
          </div>
        </div>
      )
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: PARTNERS INFO & EQUITY                        */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'partners' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
              <PieChart className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Project Venture Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                Syndicate partners, capital commitments, and dynamic equity stakes are configured per project venture. Please add your first project or select an active venture from the dropdown above to manage partner allocations and passbook ledgers.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add First Project Venture</span>
              </button>
            </div>
          </div>
        ) : (
          <SyndicateEquityModule
            firm={firm}
            project={activeProject}
            plots={activePlots}
            apartmentUnits={activeUnits}
            layoutCalc={activeLayoutCalc}
            totalProjectEstimatedValue={totalActualEstimatedValue}
            totalProjectInvestedValue={activeProjectTotalActualInvested}
            partners={activeProjectPartners}
            onUpdatePartner={onUpdatePartner}
            onAddPartnerMember={onAddPartnerMember}
            splitMode={splitMode}
            onToggleSplitMode={onToggleSplitMode}
            fieldExpenses={fieldExpenses}
            onApproveExpense={onApproveExpense}
            onRejectExpense={onRejectExpense}
            projectSurplusEstimate={projectedSurplus}
            ledgerMode={ledgerMode}
            partnerStockDraws={partnerStockDraws}
            firmAccounts={firmAccounts}
            individualInvestments={individualInvestments}
          />
        )
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: REAL ESTATE - OPEN PLOTTING                   */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'open_plotting' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
              <Compass className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Open Plotting Venture Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                Select an Open Plotting project to view its saved layout details and plot inventory, or add a new project to get started.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add Open Plotting Project</span>
              </button>
            </div>
          </div>
        ) : (
          <OpenPlottingModule
            plots={activePlots}
            onUpdatePlot={onUpdatePlot}
            onApproveBooking={onApproveBooking}
            layoutCalc={activeLayoutCalc}
            onUpdateLayoutCalc={onUpdateLayoutCalc}
            projectExpenses={activeProjectExpenses}
            onAddExpense={onAddProjectExpense}
            onUpdateExpense={onUpdateProjectExpense}
            ledgerMode={ledgerMode}
            project={activeProject}
            firm={firm}
            firmAccounts={firmAccounts}
            onAddAccountTransaction={onAddAccountTransaction}
            onUploadProjectDocuments={onUploadProjectDocuments}
          />
        )
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 4: APARTMENTS & CONSTRUCTION                     */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'construction' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
              <Building className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Construction Project Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                Apartment construction floor matrices, flat units inventory, and milestone schedules sync with specific construction projects. Please select or add an Apartment &amp; Construction project above.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add Construction Project</span>
              </button>
            </div>
          </div>
        ) : (
          <ConstructionModule
            units={activeUnits}
            onUpdateUnit={onUpdateApartmentUnit}
            pricingMatrix={pricingMatrix}
            onUpdatePricingMatrix={onUpdatePricingMatrix}
            ledgerMode={ledgerMode}
            project={activeProject}
          />
        )
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 5: LIQUOR VENDS / CUSTOM INFRA                   */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'liquor_infra' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
              <Wine className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Retail Vend Project Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                Daily liquor vend counter reconciliation, stock draws, and cash passbooks sync with specific retail projects. Please select or add a project venture above.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add Project Venture</span>
              </button>
            </div>
          </div>
        ) : (
          <LiquorVendSettlementModule
            firm={firm}
            partners={activeProjectPartners}
            settlements={liquorSettlements}
            onAddSettlement={onAddLiquorSettlement}
            partnerStockDraws={partnerStockDraws}
            onAddStockDraw={onAddStockDraw}
          />
        )
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 6: PROJECT ACCOUNTS & TREASURY                   */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'accounts' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
              <Landmark className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Project Venture Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                Project bank accounts (RERA Escrow, Capital Pool, Operational Current, and Cash Vaults) belong strictly to specific project ventures. Please create or select a project from the dropdown above to manage its dedicated accounts.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add First Project Venture</span>
              </button>
            </div>
          </div>
        ) : (
          <FirmAccountsBar
            firm={firm}
            accounts={firmAccounts}
            projects={firmActiveProjects.length > 0 ? firmActiveProjects : projects}
            activeProjectId={activeProject.id}
            onOpenAddAccountModal={() => setIsAddFirmAccountModalOpen(true)}
            onOpenStatementModal={(acc) => setStatementAccount(acc)}
            onAddTransaction={onAddAccountTransaction}
          />
        )
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 7: EXPENSES & APPROVALS                          */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'expenses' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto shadow-inner">
              <Receipt className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Project Venture Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                Site petty cash expenses, vendor bills, and field partner expenditure vouchers are logged per project. Please select or add a project from the dropdown above to audit expenses.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add First Project Venture</span>
              </button>
            </div>
          </div>
        ) : (() => {
          // Project-scoped expense calculations
          const projectExpensesList = fieldExpenses.filter(
            (e) => e.projectId === activeProject.id && e.firmId === firm.id
          );
        const pendingExpenses = projectExpensesList.filter((e) => e.status === 'pending');
        const approvedExpenses = projectExpensesList.filter((e) => e.status === 'approved');
        const pendingExpensesSum = pendingExpenses.reduce((sum, e) => sum + e.amount, 0);
        const approvedExpensesSum = approvedExpenses.reduce((sum, e) => sum + e.amount, 0);
        const costHeadsSpentSum = activeProjectExpenses.reduce((sum, pe) => sum + pe.actualSpent, 0);
        const totalActualDisbursed = Math.max(costHeadsSpentSum, approvedExpensesSum);
        const budgetUtilizationPct =
          activeProjectCost > 0 ? Math.min(100, Math.round((totalActualDisbursed / activeProjectCost) * 100)) : 0;
        const remainingBudgetBuffer = Math.max(0, activeProjectCost - totalActualDisbursed);

        const displayedExpenses = projectExpensesList.filter((e) => {
          if (expenseSubTab === 'pending' && e.status !== 'pending') return false;
          if (expenseSubTab === 'approved' && e.status !== 'approved') return false;
          if (expenseCategoryFilter !== 'all' && e.category !== expenseCategoryFilter) return false;
          if (expenseSearchQuery.trim()) {
            const q = expenseSearchQuery.toLowerCase();
            const match =
              e.note.toLowerCase().includes(q) ||
              e.partnerName.toLowerCase().includes(q) ||
              (e.vendorName && e.vendorName.toLowerCase().includes(q)) ||
              (e.taxInvoiceNo && e.taxInvoiceNo.toLowerCase().includes(q)) ||
              e.category.toLowerCase().includes(q) ||
              (e.paymentMode && e.paymentMode.toLowerCase().includes(q));
            if (!match) return false;
          }
          return true;
        });

        return (
          <div className="space-y-6">
            {/* 1. Header Banner with Action: + Enroll Expense */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 flex items-center gap-1">
                    <Receipt className="w-3 h-3 text-amber-700" />
                    <span>{activeProject ? activeProject.code : firm.code} Expense Ledger</span>
                  </span>
                  <span className="text-xs text-gray-500 font-medium">
                    {projectExpensesList.length} Total Site Vouchers
                  </span>
                </div>
                <h3 className="text-xl font-black text-gray-950 mt-1">
                  Expenses Control Desk
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Enroll civil and field disbursements, record contractor bills and supervisor imprests as they happen, and reconcile cost heads for{' '}
                  <strong className="text-gray-950">{activeProject ? activeProject.name : firm.name}</strong>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {/* + Enroll Project Expenses Button */}
                <button
                  id="btn-enroll-expense-action"
                  type="button"
                  onClick={() => setIsEnrollExpenseModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black rounded-2xl shadow-md hover:shadow-lg transition-all border border-amber-600/30 active:scale-95 cursor-pointer text-xs"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>+ Enroll Project Expenses</span>
                </button>

              </div>
            </div>

            {/* 2. Top 4 Financial KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Spent / Disbursed */}
              <div className="bg-[#F4F4F6] p-4 rounded-2xl border border-gray-200 flex flex-col justify-between">
                <span className="text-gray-500 text-[11px] font-bold uppercase block flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                  <span>Total Spent / Disbursed</span>
                </span>
                <div className="my-1.5">
                  <strong className="text-gray-950 text-xl sm:text-2xl font-black font-mono block">
                    {formatINR(totalActualDisbursed)}
                  </strong>
                  <span className="text-xs text-amber-800 font-bold block">
                    {approvedExpenses.length} Recorded Vouchers
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 block">
                  Ground civil, labor, machinery &amp; statutory fees
                </span>
              </div>

              {/* Card 2: Total Venture Budget Outlay */}
              <div className="bg-[#F4F4F6] p-4 rounded-2xl border border-gray-200 flex flex-col justify-between">
                <span className="text-gray-500 text-[11px] font-bold uppercase block flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-blue-600" />
                  <span>Venture Budget Outlay</span>
                </span>
                <div className="my-1.5">
                  <strong className="text-gray-950 text-xl sm:text-2xl font-black font-mono block">
                    {formatINR(activeProjectCost)}
                  </strong>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        budgetUtilizationPct > 85 ? 'bg-red-500' : 'bg-[#FFB800]'
                      }`}
                      style={{ width: `${budgetUtilizationPct}%` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-blue-900 font-bold block">
                  {budgetUtilizationPct}% of estimated outlay consumed
                </span>
              </div>

              {/* Card 3: Pending Approvals Queue */}
              <div className="bg-[#FFFDF0] p-4 rounded-2xl border border-amber-300 flex flex-col justify-between">
                <span className="text-amber-800 text-[11px] font-bold uppercase block flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Historical Unposted</span>
                </span>
                <div className="my-1.5">
                  <strong className="text-amber-950 text-xl sm:text-2xl font-black font-mono block flex items-center gap-2">
                    <span>{pendingExpenses.length}</span>
                    <span className="text-xs font-sans font-bold text-amber-800">
                      Voucher{pendingExpenses.length === 1 ? '' : 's'}
                    </span>
                  </strong>
                  <span className="text-xs text-amber-900 font-mono font-bold block">
                    {formatINR(pendingExpensesSum)} not in the books
                  </span>
                </div>
                <span className="text-[10px] text-amber-900 block">
                  {pendingExpenses.length > 0 ? 'Correct & resubmit from Project Statements' : 'Every voucher is recorded'}
                </span>
              </div>

              {/* Card 4: Remaining Budget Buffer */}
              <div className="bg-[#F4F4F6] p-4 rounded-2xl border border-gray-200 flex flex-col justify-between">
                <span className="text-gray-500 text-[11px] font-bold uppercase block flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Remaining Budget Buffer</span>
                </span>
                <div className="my-1.5">
                  <strong className="text-emerald-700 text-xl sm:text-2xl font-black font-mono block">
                    {formatINR(remainingBudgetBuffer)}
                  </strong>
                  <span className="text-xs text-emerald-800 font-bold block">
                    Safe Contingency Margin
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 block">
                  Available before additional partner calls
                </span>
              </div>
            </div>

            {/* 3. Sub-Navigation & Filters Bar */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-200 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-200 pb-4">
                {/* Sub-tabs pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpenseSubTab('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      expenseSubTab === 'all'
                        ? 'bg-[#111827] text-white shadow'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All Enrolled Expenses ({projectExpensesList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseSubTab('pending')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      expenseSubTab === 'pending'
                        ? 'bg-amber-500 text-gray-950 shadow font-black'
                        : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                    }`}
                  >
                    <span>Historical Unposted</span>
                    <span className="px-1.5 py-0.2 bg-white/70 text-gray-950 rounded-full text-[10px]">
                      {pendingExpenses.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseSubTab('approved')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      expenseSubTab === 'approved'
                        ? 'bg-[#111827] text-white shadow'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Recorded ({approvedExpenses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseSubTab('budget_matrix')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      expenseSubTab === 'budget_matrix'
                        ? 'bg-[#111827] text-white shadow'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Venture Cost Heads Matrix ({activeProjectExpenses.length})
                  </button>
                </div>

                {/* Quick CTA */}
                <button
                  type="button"
                  onClick={() => setIsEnrollExpenseModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-full border border-amber-300 transition-colors self-start lg:self-auto cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>+ Enroll Project Expenses</span>
                </button>
              </div>

              {/* Search & Category Filter (only for voucher tabs) */}
              {expenseSubTab !== 'budget_matrix' && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search expenses by vendor, enroller, work note, or voucher ref..."
                      value={expenseSearchQuery}
                      onChange={(e) => setExpenseSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:bg-white focus:ring-2 focus:ring-[#FFB800] outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={expenseCategoryFilter}
                      onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                      className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-[#FFB800] outline-none cursor-pointer"
                    >
                      <option value="all">All Cost Categories</option>
                      <MasterOptions group="expense_categories" />
                    </select>

                    {(expenseSearchQuery || expenseCategoryFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpenseSearchQuery('');
                          setExpenseCategoryFilter('all');
                        }}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 4. Table / Content based on active sub-tab */}
              {expenseSubTab === 'budget_matrix' ? (
                /* Cost Heads Matrix Table */
                <div className="overflow-x-auto pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black text-gray-950 uppercase tracking-wide flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-amber-600" />
                      <span>Civil Cost Heads &amp; Statutory Budget Breakdown</span>
                    </h4>
                    <span className="text-xs text-gray-500 font-medium">
                      Total Budget Outlay: <strong className="text-gray-950 font-mono">{formatINR(activeProjectCost)}</strong>
                    </span>
                  </div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-400 uppercase text-[10px] font-black">
                        <th className="py-2.5 pr-4">Cost Category</th>
                        <th className="py-2.5 pr-4">Estimated Budget</th>
                        <th className="py-2.5 pr-4">Actual Spent</th>
                        <th className="py-2.5 pr-4">Consumption</th>
                        <th className="py-2.5 pr-4">Tax Invoiced</th>
                        <th className="py-2.5">Vendor &amp; Execution Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeProjectExpenses.map((exp) => {
                        const pct = exp.estimatedBudget > 0 ? Math.round((exp.actualSpent / exp.estimatedBudget) * 100) : 0;
                        return (
                          <tr key={exp.id} className="hover:bg-gray-50/80">
                            <td className="py-3 pr-4 font-bold text-gray-900">{exp.category}</td>
                            <td className="py-3 pr-4 font-mono font-semibold text-gray-800">
                              {formatINR(exp.estimatedBudget)}
                            </td>
                            <td className="py-3 pr-4 font-mono font-bold text-amber-700">
                              {formatINR(exp.actualSpent)}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : 'bg-amber-500'}`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[10px] font-bold text-gray-600">{pct}%</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 font-mono text-gray-600">
                              {exp.officialTaxInvoicedAmount ? formatINR(exp.officialTaxInvoicedAmount) : '—'}
                            </td>
                            <td className="py-3 text-gray-500 max-w-xs truncate">{exp.vendorNotes}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Enrolled Expenses Ledger Table */
                <div className="overflow-x-auto pt-2">
                  {displayedExpenses.length === 0 ? (
                    <div className="py-12 text-center bg-gray-50 rounded-2xl border border-gray-200/80">
                      <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-gray-800">No project expenses found</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {expenseSearchQuery || expenseCategoryFilter !== 'all'
                          ? 'No vouchers match your search keywords or filter criteria.'
                          : 'No expenses enrolled yet for this project. Click "+ Enroll Expense" to record a site payment.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsEnrollExpenseModalOpen(true)}
                        className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black rounded-full text-xs shadow-sm cursor-pointer border border-amber-600/30"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Enroll Project Expenses</span>
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-400 uppercase text-[10px] font-black">
                          <th className="py-3 px-3">Date &amp; Ref</th>
                          <th className="py-3 px-3">Category</th>
                          <th className="py-3 px-3">Work Narration &amp; Payee</th>
                          <th className="py-3 px-3">Enrolled By</th>
                          <th className="py-3 px-3">Disbursement Mode</th>
                          <th className="py-3 px-3">Amount (₹)</th>
                          <th className="py-3 px-3">Posting</th>
                          <th className="py-3 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayedExpenses.map((exp) => {
                          const isPending = exp.status === 'pending';
                          const isApproved = exp.status === 'approved';
                          return (
                            <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                              {/* Date & Ref */}
                              <td className="py-3 px-3">
                                <div className="font-bold text-gray-900">{exp.date}</div>
                                <div className="text-[10px] font-mono text-gray-500">
                                  {exp.taxInvoiceNo || `REF-${exp.id.slice(-6).toUpperCase()}`}
                                </div>
                              </td>

                              {/* Category */}
                              <td className="py-3 px-3">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                  <Tag className="w-2.5 h-2.5 text-amber-700" />
                                  <span>{exp.category}</span>
                                </span>
                              </td>

                              {/* Narration & Vendor */}
                              <td className="py-3 px-3 max-w-xs">
                                <div className="font-medium text-gray-900 line-clamp-2">{exp.note}</div>
                                {exp.vendorName && (
                                  <div className="text-[10px] text-gray-500 mt-0.5">
                                    Vendor: <strong className="text-gray-700">{exp.vendorName}</strong>
                                  </div>
                                )}
                              </td>

                              {/* Enrolled By */}
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-5 h-5 rounded-full bg-gray-900 text-[#FFB800] text-[9px] font-bold flex items-center justify-center">
                                    {exp.partnerName.charAt(0)}
                                  </div>
                                  <span className="font-bold text-gray-800 text-[11px] truncate max-w-[120px]">
                                    {exp.partnerName.split(':')[0]}
                                  </span>
                                </div>
                              </td>

                              {/* Payment Mode */}
                              <td className="py-3 px-3">
                                <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                                  {exp.paymentMode || 'Cash / Voucher'}
                                </span>
                              </td>

                              {/* Amount */}
                              <td className="py-3 px-3 font-mono font-black text-gray-950 text-sm">
                                {formatINR(exp.amount)}
                              </td>

                              {/* Status */}
                              <td className="py-3 px-3">
                                {isApproved ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                      <span>Recorded</span>
                                    </span>
                                  </div>
                                ) : isPending ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    <Clock className="w-3 h-3 text-amber-700" />
                                    <span>Not posted (historical)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-900 border border-red-300">
                                    <X className="w-3 h-3 text-red-700" />
                                    <span>Referred back</span>
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedVoucherForSlip(exp)}
                                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3 text-gray-500" />
                                      <span>Voucher Slip</span>
                                    </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })())}

      {/* ---------------------------------------------------- */}
      {/* TAB 8: PROJECT STATEMENT (APPROVED TXS & PASSBOOK)   */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'project_statement' && (
        !activeProject ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-gray-200 shadow-sm max-w-xl mx-auto my-6 space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-900 flex items-center justify-center mx-auto shadow-inner">
              <FileText className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-950">No Project Venture Selected</h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-md mx-auto">
                The project treasury statement, customer advance tracking, and passbook reconciliation sync with respective venture projects. Select or create a project from the dropdown above to view its live passbook.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => openAddProject()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-md transition-all border border-amber-600/30 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add First Project Venture</span>
              </button>
            </div>
          </div>
        ) : (
          <ProjectStatementModule
            onRecordDrawing={onSubmitDrawing}
            onReferBackFinancial={onReferBackFinancial}
            onResubmitFinancial={onResubmitFinancial}
            project={activeProject}
            firm={firm}
            accounts={firmAccounts}
            fieldExpenses={fieldExpenses}
            plots={activePlots}
            apartmentUnits={activeUnits}
            partners={activeProjectPartners}
            individualInvestments={individualInvestments}
            onOpenIndividualInvestmentModal={() => setIsIndividualInvestmentModalOpen(true)}
            onOpenEnrollExpenseModal={() => setIsEnrollExpenseModalOpen(true)}
          />
        )
      )}

      {/* ======================================================== */}
      {/* MODALS                                                   */}
      {/* ======================================================== */}

      {/* Modal: + Record Ledger Transaction */}
      <RecordLedgerTransactionModal
        isOpen={isRecordTxModalOpen}
        onClose={() => setIsRecordTxModalOpen(false)}
        firm={firm}
        accounts={firmAccounts}
        projects={projects}
        preselectedAccountId={projectAccounts[0]?.id}
        onAddTransaction={onAddAccountTransaction}
      />

      {/* Modal: + Add Projects */}
      {editingProject && projectEditSeed && projectEditSeed.id === editingProject.id && projectEditSeed.firmId === firm.id && onSaveProjectForm && (
        <AddProjectModal
          key={`edit-${firm.id}-${editingProject.id}`}
          isOpen
          onClose={() => setEditProjectId(null)}
          firm={firm}
          existingPartners={partners}
          initialProject={projectEditSeed}
          onAddProject={(p, _plots, _units, accounts) => onSaveProjectForm(p, accounts)}
          firmAccounts={firmAccounts}
          onAddFirmAccount={onAddFirmAccount}
          onUploadDocuments={onUploadProjectDocuments}
          onDocumentsChanged={onProjectDocumentsChanged}
        />
      )}

      {isAddProjectModalOpen && (
      <AddProjectModal
        key={`add-${firm.id}-${addProjectSession}`}
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        firm={firm}
        existingPartners={partners}
        onAddProject={onAddProject}
        firmAccounts={firmAccounts}
        onAddFirmAccount={onAddFirmAccount}
      />
      )}

      {/* Modal: + Add Project Account */}
      <AddFirmAccountModal
        isOpen={isAddFirmAccountModalOpen}
        onClose={() => setIsAddFirmAccountModalOpen(false)}
        firm={firm}
        projects={projects}
        activeProjectId={activeProject ? activeProject.id : ''}
        onAddAccount={onAddFirmAccount}
      />

      {/* Modal: Account Statement / Ledger */}
      {statementAccount && (
        <FirmAccountStatementModal
          isOpen={!!statementAccount}
          onClose={() => setStatementAccount(null)}
          account={statementAccount}
          firm={firm}
          onAddTransaction={onAddAccountTransaction}
        />
      )}

      {/* Modal: + Enroll Project Expense */}
      {activeProject && <EnrollExpenseModal
        isOpen={isEnrollExpenseModalOpen}
        onClose={() => setIsEnrollExpenseModalOpen(false)}
        firm={firm}
        project={activeProject}
        partners={activeProjectPartners}
        firmAccounts={firmAccounts}
        onEnrollExpense={(newExpense, bankAccountId) => onEnrollExpense(newExpense, bankAccountId)}
      />}

      {/* Modal: + Individual Investment */}
      {activeProject && <IndividualInvestmentModal
        isOpen={isIndividualInvestmentModalOpen}
        onClose={() => setIsIndividualInvestmentModalOpen(false)}
        firm={firm}
        project={activeProject}
        partners={activeProjectPartners}
        firmAccounts={firmAccounts}
        initiatorRole="accountant"
        onRecordInvestment={(data) => (onRecordIndividualInvestment ? onRecordIndividualInvestment(data) : false)}
      />}

      {/* Modal: Voucher Slip View & Print */}
      {selectedVoucherForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-[#FFB800] p-5 flex items-center justify-between border-b border-amber-500/40">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-gray-950" />
                <h3 className="font-black text-gray-950 text-base">
                  Payment Disbursement Voucher
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVoucherForSlip(null)}
                className="w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-gray-950 font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Slip Body */}
            <div className="p-6 space-y-4 text-xs font-sans">
              <div className="border-b border-gray-200 pb-3 flex justify-between items-start">
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Tenant Syndicate Firm</div>
                  <div className="font-black text-gray-950 text-sm">{firm.name} ({firm.code})</div>
                  <div className="text-gray-600 text-[11px] mt-0.5">Project: <strong>{activeProject ? `${activeProject.name} [${activeProject.code}]` : 'General Operations'}</strong></div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Voucher Ref</div>
                  <div className="font-mono font-bold text-amber-800 text-xs">
                    {selectedVoucherForSlip.taxInvoiceNo || `VCH-${selectedVoucherForSlip.id.slice(-6).toUpperCase()}`}
                  </div>
                  <div className="text-[11px] text-gray-600 font-bold">{selectedVoucherForSlip.date}</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold">Category:</span>
                  <span className="font-bold text-gray-900 bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[11px]">
                    {selectedVoucherForSlip.category}
                  </span>
                </div>
                {selectedVoucherForSlip.vendorName && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-bold">Payee / Vendor:</span>
                    <span className="font-bold text-gray-950">{selectedVoucherForSlip.vendorName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold">Payment Mode:</span>
                  <span className="font-bold text-gray-800">{selectedVoucherForSlip.paymentMode || 'Cash'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-bold">Enrolled By:</span>
                  <span className="font-bold text-gray-900">{selectedVoucherForSlip.partnerName}</span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-gray-700 font-black text-xs uppercase">Disbursed Amount:</span>
                  <span className="text-lg font-black text-gray-950 font-mono">
                    {formatINR(selectedVoucherForSlip.amount)}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Work Description &amp; Narration</div>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs italic">
                  "{selectedVoucherForSlip.note}"
                </p>
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-600">
                <div>
                  <span className="text-[10px] text-gray-400 block font-bold uppercase">Posting</span>
                  <strong className={selectedVoucherForSlip.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}>
                    {selectedVoucherForSlip.status === 'approved'
                      ? 'Recorded'
                      : selectedVoucherForSlip.status === 'pending' ? 'Not posted (historical)' : 'Referred back'}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 block font-bold uppercase">System Auth</span>
                  <span className="font-mono text-[10px] text-gray-500">Ledger Cleared</span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedVoucherForSlip(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-full text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#111827] hover:bg-gray-800 text-white font-bold rounded-full text-xs shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Print Slip</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
