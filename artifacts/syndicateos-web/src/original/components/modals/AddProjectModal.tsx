import { MasterOptions, masterNumber, masterItem } from '../../../adapter/config';
import React, { useCallback, useRef, useState } from 'react';
import { ProjectDocumentsManager } from './ProjectDocumentsManager';
import {
  TenantFirm,
  Project,
  ProjectPartnerShare,
  Plot,
  ApartmentUnit,
  SectorType,
  SyndicatePartner,
  FloorFlatConfig,
  FlatConfigUnit,
  ProjectAmenity,
  PlanUploadDocument,
  PlotDistributionConfig,
  LayoutAmenity,
  FirmAccount
} from '../../types';
import { AddFirmAccountModal } from './AddFirmAccountModal';
import {
  FolderPlus,
  X,
  Building2,
  Compass,
  MapPin,
  Percent,
  DollarSign,
  Users,
  ShieldCheck,
  Plus,
  Trash2,
  Sparkles,
  Info,
  CheckCircle2,
  Layers,
  AlertCircle,
  Wine,
  Hammer,
  FileText,
  Landmark,
  Store,
  HardHat,
  IndianRupee,
  Calendar,
  Tag,
  TrendingUp,
  Receipt,
  Upload,
  Dumbbell,
  PieChart,
  Pencil,
  Lock
} from 'lucide-react';
import { formatINR, formatIndianCompact } from '../../utils/formatters';
import { ConstructionPlanBuilder } from './ConstructionPlanBuilder';
import { OpenPlottingPlanBuilder } from './OpenPlottingPlanBuilder';
import { LiquorVendPlanBuilder, RetailCounterConfig, LiquorFacilityConfig } from './LiquorVendPlanBuilder';
import { CustomInfraPlanBuilder, InfraPackageConfig, InfraFacilityConfig } from './CustomInfraPlanBuilder';
import { PlanDocumentUploader } from './PlanDocumentUploader';

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  firm: TenantFirm;
  existingPartners: SyndicatePartner[];
  onAddProject: (newProject: Project, initialPlots?: Plot[], initialUnits?: ApartmentUnit[], initialAccounts?: FirmAccount[]) => boolean | Promise<boolean>;
  firmAccounts?: FirmAccount[];
  onAddFirmAccount?: (account: FirmAccount) => void | boolean | Promise<boolean>;
  /** Edit mode: seeds every form field from this saved project. Inventory is never regenerated. */
  initialProject?: Project;
  /** Edit mode: uploads NEW documents privately to the saved project. */
  onUploadDocuments?: (projectId: string, documents: PlanUploadDocument[]) => Promise<boolean>;
  /** Edit mode: ask the app to refresh its workspace after documents are saved. */
  onDocumentsChanged?: () => void;
}

const AVATAR_COLORS = [
  'bg-indigo-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-sky-600',
  'bg-purple-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-blue-600',
];

// Helper to generate default initial construction floors
const createInitialFloorPlans = (numFloors: number, baseRate: number): FloorFlatConfig[] => {
  const result: FloorFlatConfig[] = [];
  for (let f = 1; f <= numFloors; f++) {
    const isPenthouseFloor = f === numFloors && numFloors >= 4;
    const floorLabel = isPenthouseFloor
      ? `Floor ${f} (Penthouse Floor)`
      : f === 1
      ? 'Floor 1 (Ground / Lower)'
      : `Floor ${f}`;

    const units: FlatConfigUnit[] = [
      {
        unitNumber: `#${f}01`,
        flatType: isPenthouseFloor ? 'Duplex Penthouse' : '3 BHK',
        sftArea: isPenthouseFloor ? 2450 : 1650,
        facing: 'East',
        baseRate,
      },
      {
        unitNumber: `#${f}02`,
        flatType: '2 BHK',
        sftArea: 1250,
        facing: 'North',
        baseRate,
      },
      {
        unitNumber: `#${f}03`,
        flatType: '2 BHK',
        sftArea: 1250,
        facing: 'West',
        baseRate,
      },
      {
        unitNumber: `#${f}04`,
        flatType: isPenthouseFloor ? 'Duplex Penthouse' : '3 BHK',
        sftArea: isPenthouseFloor ? 2450 : 1650,
        facing: 'Corner',
        baseRate,
      },
    ];

    result.push({
      floorNumber: f,
      floorLabel,
      flatsCount: units.length,
      units,
    });
  }
  return result;
};

const defaultConstructionAmenities: ProjectAmenity[] = [];

const defaultPlotDistribution: PlotDistributionConfig = {
  eastPlotsCount: 0,
  eastAreaSqYards: 0,
  northPlotsCount: 0,
  northAreaSqYards: 0,
  westPlotsCount: 0,
  westAreaSqYards: 0,
  southPlotsCount: 0,
  southAreaSqYards: 0,
  cornerPlotsCount: 0,
  cornerAreaSqYards: 0,
  commercialPlotsCount: 0,
  commercialAreaSqYards: 0,
  // backward-compatibility
  standardPlotsCount: 0,
  standardAreaSqYards: 0,
  premiumPlotsCount: 0,
  premiumAreaSqYards: 0,
};

const defaultLayoutAmenities: LayoutAmenity[] = [];

const defaultLiquorCounters: RetailCounterConfig[] = [
  { id: 'c-1', name: 'Excise Vend #01 - Highway Transit', category: 'High-Footfall Transit', sqFtArea: 450, dailySalesTarget: 400000, staffCount: 4 },
  { id: 'c-2', name: 'Excise Vend #02 - Premium Walk-in Lounge', category: 'Premium Walk-in Lounge', sqFtArea: 800, dailySalesTarget: 450000, staffCount: 5 },
  { id: 'c-3', name: 'Excise Vend #03 - Urban Neighborhood', category: 'Urban Neighborhood', sqFtArea: 350, dailySalesTarget: 280000, staffCount: 3 },
  { id: 'c-4', name: 'Excise Vend #04 - Bypass Express', category: 'Highway Express', sqFtArea: 400, dailySalesTarget: 320000, staffCount: 3 },
];

const defaultLiquorFacilities: LiquorFacilityConfig[] = [
  { id: 'lf-1', name: 'Central Cold Storage & Walk-in Chiller', sqFtArea: 1200, description: 'Heavy refrigerated walk-in chamber for beer & premium stock' },
  { id: 'lf-2', name: 'High-Security Currency Vault & Cash Counting Room', sqFtArea: 250, description: 'Double-lock biometric cash deposit safe with CCTV' },
  { id: 'lf-3', name: 'Depot Liaison & Partner Settlement Office', sqFtArea: 350, description: 'Daily TGSBCL / APSBL indent dispatch coordination desk' },
];

const defaultInfraPackages: InfraPackageConfig[] = [
  { id: 'pkg-1', name: 'Package 1 - Earthwork & Granular Sub-base (GSB)', chainage: 'KM 0/0 to KM 1/5', scopeCategory: 'Earth Excavation & Embankment', targetCompletionMonths: 4 },
  { id: 'pkg-2', name: 'Package 2 - Dense Bituminous Macadam (DBM) & Wearing Coat', chainage: 'KM 1/5 to KM 3/5', scopeCategory: 'Asphalt Paving & Road Marking', targetCompletionMonths: 6 },
  { id: 'pkg-3', name: 'Package 3 - Reinforced Concrete Box Culverts & Drainage', chainage: 'Cross Drainages (4 Nos)', scopeCategory: 'RCC Structural Works', targetCompletionMonths: 3 },
];

const defaultInfraFacilities: InfraFacilityConfig[] = [
  { id: 'if-1', name: 'Ready-Mix Concrete Batching Plant (60 m³/hr)', areaString: '1.5 Acres', purpose: 'On-site automated concrete & aggregate mixing' },
  { id: 'if-2', name: 'Heavy Machinery Maintenance Workshop & Fuel Bunker', areaString: '4,500 SFT', purpose: 'Excavator, tipper & road roller servicing' },
  { id: 'if-3', name: 'Resident Engineer Quality Control (QC) Testing Lab', areaString: '1,200 SFT', purpose: 'Cube compressive strength & bitumen penetration testing' },
];

// Helper to proportionally sync partner capital estimated invest values with total estimated project outlay
const syncPartnersCapitalWithTotalOutlay = (
  partnersList: ProjectPartnerShare[],
  outlay: number
): ProjectPartnerShare[] => {
  if (partnersList.length === 0 || outlay <= 0) return partnersList;

  let allocatedSoFar = 0;
  return partnersList.map((p, idx) => {
    if (idx === partnersList.length - 1) {
      // Last partner receives exact remainder to ensure 100% exact match
      const remainder = Math.max(0, outlay - allocatedSoFar);
      return {
        ...p,
        initialCapital: remainder,
      };
    }
    const shareAmount = Math.round((outlay * (Number(p.equityPercent) || 0)) / 100);
    allocatedSoFar += shareAmount;
    return {
      ...p,
      initialCapital: shareAmount,
    };
  });
};

const DEFAULT_INITIAL_OUTLAY = 0;

export const AddProjectModal: React.FC<AddProjectModalProps> = ({
  isOpen,
  onClose,
  firm,
  existingPartners,
  onAddProject,
  firmAccounts = [],
  onAddFirmAccount,
  initialProject,
  onUploadDocuments,
  onDocumentsChanged,
}) => {
  const [ip] = useState(() => initialProject ? structuredClone(initialProject) : undefined);
  const isEdit = !!ip;
  const ipAny = (ip || {}) as any;
  // Project ID: the real saved ID in edit mode, a fresh local draft ID only for creation
  const [projectId] = useState<string>(() => ip ? ip.id : `proj-${crypto.randomUUID()}`);

  // Only this draft's accounts are available. Its Cash ledger is provisioned
  // by the server on creation, never borrowed from another project.
  const [pendingAccounts, setPendingAccounts] = useState<FirmAccount[]>([]);
  const [savedAccounts] = useState(() => ip ? structuredClone(firmAccounts) : undefined);
  const [submitting, setSubmitting] = useState(false);
  // Staged copies (same stable ID) replace their saved originals; no duplicate rows.
  const stagedIds = new Set(pendingAccounts.map((a) => a.id));
  const availableFirmAccounts = [
    ...(savedAccounts || firmAccounts).filter((a) => !stagedIds.has(a.id)),
    ...pendingAccounts,
  ].filter((a) => a.firmId === firm.id && a.linkedProjectId === projectId);
  const savedAccountIds = new Set(firmAccounts.map((a) => a.id));
  const [editingAccount, setEditingAccount] = useState<FirmAccount | null>(null);
  // Edit-mode documents: new uploads are sent explicitly, never re-uploading saved files
  const [newDocs, setNewDocs] = useState<PlanUploadDocument[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const docRevisionRef = useRef<number>(Number((initialProject as any)?.__revision ?? 0));
  const [docsDirty, setDocsDirty] = useState(false);
  const [docsReload, setDocsReload] = useState(0);
  const docsSaveRef = useRef<null | (() => Promise<boolean>)>(null);
  const docsChangedRef = useRef(onDocumentsChanged); docsChangedRef.current = onDocumentsChanged;
  const onDocRevision = useCallback((r: number) => { const grew = r > docRevisionRef.current; docRevisionRef.current = r; if (grew) docsChangedRef.current?.(); }, []);
  const requestClose = () => { if (docsDirty && !window.confirm('Discard unsaved document changes?')) return; onClose(); };
  const [selectedFirmAccountId, setSelectedFirmAccountId] = useState<string>(() => {
    const primary = availableFirmAccounts.find((a) => a.isPrimary);
    return primary ? primary.id : availableFirmAccounts[0]?.id || '';
  });
  const cashDefaults = masterItem('project_account_defaults', 'standard')?.metadata;
  const [isAddAccountSubModalOpen, setIsAddAccountSubModalOpen] = useState(false);
  // Sector options filtered by what the firm supports
  const defaultSector: SectorType = firm.sectors.includes('real_estate_open_plotting')
    ? 'real_estate_open_plotting'
    : firm.sectors[0] || 'real_estate_open_plotting';

  // Basic Info State - starts clean with empty fields
  const [name, setName] = useState(ip?.name ?? '');
  const [code, setCode] = useState(ip?.code ?? '');
  const [sector, setSector] = useState<SectorType>(ip?.sector ?? defaultSector);
  const [status, setStatus] = useState<Project['status']>(ip?.status ?? 'active_sales');
  const [startDate, setStartDate] = useState(() => ip ? (ip.startDate || '') : new Date().toISOString().split('T')[0]);
  const [targetCompletionDate, setTargetCompletionDate] = useState(() => {
    if (ip) return ip.targetCompletionDate || '';
    const d = new Date();
    d.setMonth(d.getMonth() + 14);
    return d.toISOString().split('T')[0];
  });

  // Location & Statutory - start clean/empty with placeholders
  const [location, setLocation] = useState(ip?.location ?? '');
  const [mandalDistrict, setMandalDistrict] = useState(ip?.mandalDistrict ?? '');
  const [surveyNumbers, setSurveyNumbers] = useState(ip?.surveyNumbers ?? '');
  const [approvalAuthority, setApprovalAuthority] = useState<string>(ip?.approvalAuthority ?? '');
  const [lpOrReraNumber, setLpOrReraNumber] = useState(ip?.lpOrReraNumber ?? '');

  // Specifications - start clean
  const [extentValue, setExtentValue] = useState<number>(ip?.extentValue ?? 0);
  const [extentUnit, setExtentUnit] = useState<string>(
    ip ? ip.extentUnit : defaultSector === 'real_estate_construction' ? 'Units / Flats' :
    defaultSector === 'liquor_vends' ? 'Counters / Shops' :
    defaultSector === 'custom_infra' ? 'KM Stretch' : 'Acres'
  );
  const [roadWidth, setRoadWidth] = useState<20 | 30 | 40 | 60>((ip?.roadWidth ?? masterNumber('layout_defaults', 'road_width') ?? 0) as any);
  const [openSpacePercent, setOpenSpacePercent] = useState<number>(ip?.openSpacePercent ?? masterNumber('layout_defaults', 'open_space_percent') ?? 0);
  const [floorRatePerSqYard, setFloorRatePerSqYard] = useState<number>(ip?.floorRatePerSqYard ?? 0);
  const [baseSqFtRate, setBaseSqFtRate] = useState<number>(ip?.baseSqFtRate ?? 0);
  const [totalEstimatedOutlay, setTotalEstimatedOutlay] = useState<number>(ip?.totalEstimatedOutlay ?? 0);
  const [notes, setNotes] = useState(ip?.notes ?? '');
  const [autoGeneratePlots, setAutoGeneratePlots] = useState(false);

  // Sector-specific properties
  const [floorsCount, setFloorsCount] = useState<number>(ip?.floorsCount ?? 0);
  const [facingPremium, setFacingPremium] = useState<number>(ip?.facingPremium ?? 0);
  const [countersCount, setCountersCount] = useState<number>(ip?.countersCount ?? 0);
  const [dailySalesTarget, setDailySalesTarget] = useState<number>(ip?.dailySalesTarget ?? 0);
  const [securityDeposit, setSecurityDeposit] = useState<number>(ip?.securityDeposit ?? 0);
  const [contractType, setContractType] = useState<string>(ip ? (ip.contractType ?? '') : 'Item-Rate Schedule (BoQ)');
  const [retentionPercent, setRetentionPercent] = useState<number>(ip ? (ip.retentionPercent ?? 0) : 5.0);

  // CUSTOMIZATION: Construction Plan Builder State
  const [floorPlans, setFloorPlans] = useState<FloorFlatConfig[]>(() =>
    ip ? structuredClone(ip.floorPlans ?? []) : createInitialFloorPlans(5, 4800)
  );
  const [amenities, setAmenities] = useState<ProjectAmenity[]>(() => ip ? structuredClone(ip.amenities ?? []) : defaultConstructionAmenities);

  // CUSTOMIZATION: Open Plotting Plan Builder State
  const [plotDistribution, setPlotDistribution] = useState<PlotDistributionConfig>(() => ip?.plotDistribution ? { ...defaultPlotDistribution, ...ip.plotDistribution } : defaultPlotDistribution);
  const [layoutAmenities, setLayoutAmenities] = useState<LayoutAmenity[]>(() => ip ? structuredClone(ip.layoutAmenities ?? []) : defaultLayoutAmenities);

  // CUSTOMIZATION: Liquor Vends State
  const [liquorCounters, setLiquorCounters] = useState<RetailCounterConfig[]>(() => ip ? structuredClone(ipAny.liquorCounters ?? []) : defaultLiquorCounters);
  const [liquorFacilities, setLiquorFacilities] = useState<LiquorFacilityConfig[]>(() => ip ? structuredClone(ipAny.liquorFacilities ?? []) : defaultLiquorFacilities);

  // CUSTOMIZATION: Custom Infra State
  const [infraPackages, setInfraPackages] = useState<InfraPackageConfig[]>(() => ip ? structuredClone(ipAny.infraPackages ?? []) : defaultInfraPackages);
  const [infraFacilities, setInfraFacilities] = useState<InfraFacilityConfig[]>(() => ip ? structuredClone(ipAny.infraFacilities ?? []) : defaultInfraFacilities);

  // CUSTOMIZATION: Plan & Blueprint Upload Documents
  const [planDocuments, setPlanDocuments] = useState<PlanUploadDocument[]>([]);

  // Navigation tab inside modal for quick jump
  const [activeFormTab, setActiveFormTab] = useState<'all' | 'custom_plan' | 'blueprint_upload' | 'partners' | 'accounts'>('all');

  // Dynamic Partners for THIS project (Partners vary from project to project, initialized empty so user explicitly assigns partners)
  const [projectPartners, setProjectPartners] = useState<ProjectPartnerShare[]>(() => ip ? structuredClone(ip.partners ?? []) : []);

  const [error, setError] = useState('');
  // Edit mode: facing groups with plots but no single area are mixed-size groups
  const [initialDistribution] = useState<PlotDistributionConfig | null>(() => ip?.plotDistribution ? { ...defaultPlotDistribution, ...ip.plotDistribution } : null);
  const MATRIX_GROUPS: Array<[string, keyof PlotDistributionConfig, keyof PlotDistributionConfig]> = [
    ['East', 'eastPlotsCount', 'eastAreaSqYards'], ['North', 'northPlotsCount', 'northAreaSqYards'],
    ['West', 'westPlotsCount', 'westAreaSqYards'], ['South', 'southPlotsCount', 'southAreaSqYards'],
    ['Corner', 'cornerPlotsCount', 'cornerAreaSqYards'], ['Commercial', 'commercialPlotsCount', 'commercialAreaSqYards'],
  ];
  const seededMixed: string[] = Array.isArray(ipAny.__mixedPlotGroups) ? ipAny.__mixedPlotGroups.map((g: unknown) => String(g).toLowerCase()) : [];
  const mixedGroups = initialDistribution
    ? MATRIX_GROUPS.filter(([l, c, a]) =>
        seededMixed.length
          ? seededMixed.some((g) => g === l.toLowerCase() || String(c).toLowerCase().startsWith(g) || g === String(a).toLowerCase())
          : (Number(initialDistribution[c]) || 0) > 0 && !(Number(initialDistribution[a]) > 0)
      ).map(([l]) => l)
    : [];
  const livePlotArea: number | null = typeof ipAny.__livePlotArea === 'number' ? ipAny.__livePlotArea : null;
  const pendingCountGroups = initialDistribution
    ? MATRIX_GROUPS.filter(([, c]) => (Number(plotDistribution[c]) || 0) !== (Number(initialDistribution[c]) || 0)).map(([l, c]) => `${l} ${Number(initialDistribution[c]) || 0} to ${Number(plotDistribution[c]) || 0}`)
    : [];

  if (!isOpen) return null;

  // Auto generate project code when name changes
  const handleNameChange = (val: string) => {
    setName(val);
    if (!code || code.length <= 8) {
      const words = val.trim().split(/\s+/);
      const suggested = words.map((w) => w.charAt(0).toUpperCase()).join('');
      if (suggested.length >= 2) {
        setCode(`${suggested}-${Math.floor(10 + Math.random() * 90)}`);
      }
    }
  };

  // Unified Outlay Handler: updates Estimated Project Cost AND auto-syncs partners' Capital Estimated Invest Value
  const handleOutlayChange = (val: number) => {
    const numericVal = Math.max(0, val);
    setTotalEstimatedOutlay(numericVal);
    if (!isEdit) setProjectPartners((prev) => syncPartnersCapitalWithTotalOutlay(prev, numericVal));
  };

  // Handle Sector Engine Change dynamically updates unit types and sub-builders without injecting dummy data
  const handleSectorChange = (newSector: SectorType) => {
    if (isEdit) return; // sector of a saved project is fixed
    setSector(newSector);

    if (newSector === 'real_estate_open_plotting') {
      setExtentUnit('Acres');
    } else if (newSector === 'real_estate_construction') {
      setExtentUnit('Units / Flats');
      setFloorsCount(5);
      setFloorPlans(createInitialFloorPlans(5, baseSqFtRate || 4800));
    } else if (newSector === 'liquor_vends') {
      setExtentUnit('Counters / Shops');
      setCountersCount(4);
    } else if (newSector === 'custom_infra') {
      setExtentUnit('KM Stretch');
      setContractType('Item-Rate Schedule (BoQ)');
      setRetentionPercent(5.0);
    }

    // Update partner roles based on new sector
    setProjectPartners((prev) => {
      const updatedRoles = prev.map((p, idx) => {
        let role = p.roleInProject;
        if (newSector === 'real_estate_open_plotting') {
          role =
            idx === 0
              ? 'Managing Partner (Land & SRO Liaison)'
              : idx === 1
              ? 'Civil & Earthwork Contractor Partner'
              : 'Marketing & Investor Partner';
        } else if (newSector === 'real_estate_construction') {
          role =
            idx === 0
              ? 'Managing Partner (Master Developer & Financing)'
              : idx === 1
              ? 'Structural Construction & RCC Partner'
              : 'Finishing & Architectural Lead';
        } else if (newSector === 'liquor_vends') {
          role =
            idx === 0
              ? 'Managing Partner (Tender & License Holder)'
              : idx === 1
              ? 'Daily Depot Procurement & Logistics Partner'
              : 'Cash Collection & Reconciliation Lead';
        } else if (newSector === 'custom_infra') {
          role =
            idx === 0
              ? 'Managing Partner (Turnkey EPC Lead & Billing)'
              : idx === 1
              ? 'Heavy Machinery & Earthwork Contractor'
              : 'Civil Structural & Site Operations Partner';
        }
        return {
          ...p,
          roleInProject: role,
        };
      });
      return totalEstimatedOutlay > 0
        ? syncPartnersCapitalWithTotalOutlay(updatedRoles, totalEstimatedOutlay)
        : updatedRoles;
    });
  };

  // Partners equity calculations
  const totalEquity = projectPartners.reduce((sum, p) => sum + (Number(p.equityPercent) || 0), 0);
  const totalCapital = projectPartners.reduce((sum, p) => sum + (Number(p.initialCapital) || 0), 0);

  // Manual auto-sync trigger: Distribute Total Estimated Project Cost into Partner Capital
  const handleAutoSyncCapitalWithOutlay = () => {
    setProjectPartners(syncPartnersCapitalWithTotalOutlay(projectPartners, totalEstimatedOutlay));
  };

  // Sync Total Estimated Project Cost to match the sum of Capital Estimated Invest Values
  const handleSyncOutlayWithCapital = () => {
    if (totalCapital > 0) {
      setTotalEstimatedOutlay(totalCapital);
      // Re-normalize equity % to 100%
      let allocatedEq = 0;
      const normalized = projectPartners.map((p, idx) => {
        if (idx === projectPartners.length - 1) {
          return {
            ...p,
            equityPercent: Number((Math.max(0, 100 - allocatedEq)).toFixed(2)),
          };
        }
        const eq = Number(((p.initialCapital / totalCapital) * 100).toFixed(2));
        allocatedEq += eq;
        return {
          ...p,
          equityPercent: eq,
        };
      });
      setProjectPartners(normalized);
    }
  };

  const handlePartnerChange = (index: number, field: keyof ProjectPartnerShare, value: any) => {
    const updated = [...projectPartners];
    if (field === 'equityPercent') {
      const newEquity = Math.max(0, Math.min(100, Number(value) || 0));
      // Auto-recalculate Capital Estimated Invest Value from new Equity %
      const autoCapital = Math.round((totalEstimatedOutlay * newEquity) / 100);
      updated[index] = {
        ...updated[index],
        equityPercent: newEquity,
        initialCapital: autoCapital,
      };
    } else if (field === 'initialCapital') {
      const newCapital = Math.max(0, Number(value) || 0);
      updated[index] = {
        ...updated[index],
        initialCapital: newCapital,
      };
      // Calculate new total capital across all partners
      const newTotalCapital = updated.reduce((sum, p) => sum + (Number(p.initialCapital) || 0), 0);
      if (newTotalCapital > 0) {
        // Automatically sync Total Estimated Project Cost with sum of partner capital
        setTotalEstimatedOutlay(newTotalCapital);
        // Automatically recalculate every partner's Equity % so it sums to 100%
        let allocatedEquitySoFar = 0;
        updated.forEach((p, idx) => {
          if (idx === updated.length - 1) {
            p.equityPercent = Number((Math.max(0, 100 - allocatedEquitySoFar)).toFixed(2));
          } else {
            const eq = Number(((p.initialCapital / newTotalCapital) * 100).toFixed(2));
            p.equityPercent = eq;
            allocatedEquitySoFar += eq;
          }
        });
      }
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
    }
    setProjectPartners(updated);
  };

  const handleAddPartnerRow = () => {
    const unusedExisting = existingPartners.find(
      (ep) => !projectPartners.some((pp) => pp.partnerId === ep.id || pp.name === ep.name)
    );

    let defaultRole = 'Investor Partner';
    if (sector === 'real_estate_construction') defaultRole = 'MEP & Finishes Partner';
    else if (sector === 'liquor_vends') defaultRole = 'Counter Logistics Partner';
    else if (sector === 'custom_infra') defaultRole = 'Site Quality Engineer Partner';

    const currentTotalEquity = projectPartners.reduce((sum, p) => sum + (Number(p.equityPercent) || 0), 0);
    const unallocatedEquity = Math.max(0, Number((100 - currentTotalEquity).toFixed(2)));
    const newEquity = unallocatedEquity > 0 ? unallocatedEquity : (projectPartners.length === 0 ? 100.0 : 10.0);
    const newCapital = Math.round((totalEstimatedOutlay * newEquity) / 100);

    const newPartner: ProjectPartnerShare = unusedExisting
      ? {
          partnerId: unusedExisting.id,
          name: unusedExisting.name,
          phone: unusedExisting.phone,
          roleInProject: unusedExisting.roleDescription || defaultRole,
          equityPercent: newEquity,
          initialCapital: newCapital,
          drawings: 0,
          shareOfFieldExpenses: 0,
          avatarColor: unusedExisting.avatarColor || AVATAR_COLORS[projectPartners.length % AVATAR_COLORS.length],
        }
      : {
          partnerId: `partner-proj-${Date.now()}`,
          name: '',
          phone: '+91 ',
          roleInProject: defaultRole,
          equityPercent: newEquity,
          initialCapital: newCapital,
          drawings: 0,
          shareOfFieldExpenses: 0,
          avatarColor: AVATAR_COLORS[projectPartners.length % AVATAR_COLORS.length],
        };

    setProjectPartners([...projectPartners, newPartner]);
  };

  const handleRemovePartnerRow = (index: number) => {
    const updated = projectPartners.filter((_, i) => i !== index);
    setProjectPartners(updated);
  };

  const handleSplitRemainingEqually = () => {
    if (projectPartners.length === 0) return;
    const equalShare = Number((100 / projectPartners.length).toFixed(2));
    const remainder = Number((100 - equalShare * (projectPartners.length - 1)).toFixed(2));

    let allocatedCapSoFar = 0;
    const balanced = projectPartners.map((p, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === projectPartners.length - 1;
      const equity = isFirst ? remainder : equalShare;
      let cap = 0;
      if (isLast) {
        cap = Math.max(0, totalEstimatedOutlay - allocatedCapSoFar);
      } else {
        cap = Math.round((totalEstimatedOutlay * equity) / 100);
        allocatedCapSoFar += cap;
      }
      return {
        ...p,
        equityPercent: equity,
        initialCapital: cap,
      };
    });
    setProjectPartners(balanced);
  };

  // Helper text for Project Outlay explanation per sector
  const getOutlayExplanation = () => {
    switch (sector) {
      case 'real_estate_open_plotting':
        return 'land procurement, statutory DTCP/CRDA LP fees, earthwork, BT roads, electricity lines, and launch marketing';
      case 'real_estate_construction':
        return 'RCC structural casting, cement/steel procurement, finishing, labor contracts, and municipal permissions';
      case 'liquor_vends':
        return 'gazette tender application, non-refundable annual excise license fee, shop rent deposits, and initial stock draw inventory';
      case 'custom_infra':
        return 'turnkey EPC execution, heavy machinery mobilization, sub-contractor wages, raw material, and quality inspection';
      default:
        return 'total budgeted capital expenditure required to execute and complete this venture';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!name.trim()) {
      setError('Please provide a Project / Venture Name.');
      return;
    }

    if (!code.trim()) {
      setError('Please provide a Project Code / Identifier.');
      return;
    }

    if (isEdit && ip) {
      // Validate only matrix groups whose values changed; the backend is authoritative.
      if (sector === 'real_estate_open_plotting' && initialDistribution) {
        for (const [label, c, a] of MATRIX_GROUPS) {
          const cnt = Number(plotDistribution[c]) || 0;
          const area = Number(plotDistribution[a]) || 0;
          const changed = cnt !== (Number(initialDistribution[c]) || 0) || area !== (Number(initialDistribution[a]) || 0);
          if (cnt < 0 || area < 0) { setError(`${label} plots: counts and areas cannot be negative.`); return; }
          const wasMixed = mixedGroups.includes(label);
          if (changed && cnt > 0 && area <= 0 && !(wasMixed && cnt <= (Number(initialDistribution[c]) || 0))) {
            setError(`${label} plots: enter an area in Sq. Yards for the new or resized plots.`);
            return;
          }
        }
      }
      const reductions = initialDistribution ? MATRIX_GROUPS
        .map(([label, countKey]) => ({ label, count: Number(initialDistribution[countKey]) - Number(plotDistribution[countKey]) }))
        .filter((row) => row.count > 0) : [];
      if (reductions.length && !window.confirm(
        `Remove ${reductions.map((row) => `${row.count} ${row.label}`).join(', ')} unused available plots? ` +
        'Plots with bookings or history cannot be removed. This also saves your other project and account changes.'
      )) return;
      const { financialStatement: _fs, financialForms: _ff, reviewableRecordIds: _rr, ...base } = ip as any;
      const totalCustomFlatsEdit = floorPlans.reduce((sum, f) => sum + f.units.length, 0);
      const draft: Project = {
        ...base,
        id: ip.id,
        firmId: ip.firmId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        sector: ip.sector,
        location: location.trim(),
        mandalDistrict: mandalDistrict.trim(),
        surveyNumbers: surveyNumbers.trim(),
        approvalAuthority,
        lpOrReraNumber: lpOrReraNumber.trim(),
        extentValue: Number(extentValue) || 0,
        extentUnit,
        roadWidth: sector === 'real_estate_open_plotting' ? roadWidth : ip.roadWidth,
        openSpacePercent: sector === 'real_estate_open_plotting' ? openSpacePercent : ip.openSpacePercent,
        floorRatePerSqYard: sector === 'real_estate_open_plotting' ? floorRatePerSqYard : ip.floorRatePerSqYard,
        baseSqFtRate: sector === 'real_estate_construction' ? baseSqFtRate : ip.baseSqFtRate,
        totalEstimatedOutlay: Number(totalEstimatedOutlay) || 0,
        status,
        startDate,
        targetCompletionDate,
        partners: ip.partners, // managed in Partners & Equity, preserved unchanged
        notes: notes.trim(),
        floorsCount: sector === 'real_estate_construction' ? floorsCount : ip.floorsCount,
        facingPremium: sector === 'real_estate_construction' ? facingPremium : ip.facingPremium,
        floorPlans: sector === 'real_estate_construction' ? floorPlans : ip.floorPlans,
        amenities: sector === 'real_estate_construction' ? amenities : ip.amenities,
        flatsPerFloor: sector === 'real_estate_construction' && floorsCount > 0 ? Math.round(totalCustomFlatsEdit / floorsCount) : ip.flatsPerFloor,
        plotDistribution: sector === 'real_estate_open_plotting'
          ? (() => {
              // Mixed-size groups left at 0 send null so the backend keeps each existing plot size.
              const out: any = { ...plotDistribution };
              for (const [l, , areaKey] of MATRIX_GROUPS) if (mixedGroups.includes(l) && !(Number(plotDistribution[areaKey]) > 0)) out[areaKey] = null;
              return out as PlotDistributionConfig;
            })()
          : ip.plotDistribution,
        layoutAmenities: sector === 'real_estate_open_plotting' ? layoutAmenities : ip.layoutAmenities,
        planDocuments: ip.planDocuments, // saved docs only; new docs use Upload Documents
        autoGenerateInventory: false,
        dailySalesTarget: sector === 'liquor_vends' ? dailySalesTarget : ip.dailySalesTarget,
        securityDeposit: sector === 'liquor_vends' ? securityDeposit : ip.securityDeposit,
        contractType: sector === 'custom_infra' ? contractType : ip.contractType,
        retentionPercent: sector === 'custom_infra' ? retentionPercent : ip.retentionPercent,
      };
      if (sector === 'liquor_vends' && Array.isArray(ipAny.liquorCounters)) {
        (draft as any).liquorCounters = liquorCounters; (draft as any).liquorFacilities = liquorFacilities;
        draft.countersCount = liquorCounters.length;
      }
      if (sector === 'custom_infra' && Array.isArray(ipAny.infraPackages)) {
        (draft as any).infraPackages = infraPackages; (draft as any).infraFacilities = infraFacilities;
      }
      setSubmitting(true);
      try {
        if (docsSaveRef.current && !(await docsSaveRef.current())) {
          setError('Document changes could not be saved, so project details were not saved either. Fix the documents section and try again.');
          return;
        }
        (draft as any).__revision = Math.max(Number((draft as any).__revision ?? 0), docRevisionRef.current);
        const ok = await onAddProject(draft, undefined, undefined, pendingAccounts);
        if (ok === false) setError('Changes were not saved. Review the highlighted values; plot counts cannot drop below booked or sold plots.');
        else onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Changes could not be saved. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // If partners were added, ensure all have names
    for (const p of projectPartners) {
      if (!p.name.trim()) {
        setError('Please provide a name for all added partners, or remove unused partner rows.');
        return;
      }
    }

    // Calculate aggregated metrics from custom construction plan
    const totalResidentialSft = floorPlans.reduce(
      (sum, f) => sum + f.units.reduce((uSum, u) => uSum + (Number(u.sftArea) || 0), 0),
      0
    );
    const totalAmenitiesSft = amenities.reduce((sum, a) => sum + (Number(a.plannedSqFt) || 0), 0);
    const commonCirculationSft = Math.round((totalResidentialSft + totalAmenitiesSft) * 0.18);
    const totalBuiltUpAreaSft = totalResidentialSft + totalAmenitiesSft + commonCirculationSft;
    const totalCustomFlats = floorPlans.reduce((sum, f) => sum + f.units.length, 0);

    const newProject: Project = {
      id: projectId,
      firmId: firm.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      sector,
      location: location.trim(),
      mandalDistrict: mandalDistrict.trim(),
      surveyNumbers: surveyNumbers.trim(),
      approvalAuthority,
      lpOrReraNumber: lpOrReraNumber.trim(),
      extentValue:
        sector === 'real_estate_construction'
          ? totalCustomFlats || extentValue
          : Number(extentValue) || 0,
      extentUnit,
      roadWidth: sector === 'real_estate_open_plotting' ? roadWidth : undefined,
      openSpacePercent: sector === 'real_estate_open_plotting' ? openSpacePercent : undefined,
      floorRatePerSqYard: sector === 'real_estate_open_plotting' ? floorRatePerSqYard : undefined,
      baseSqFtRate: sector === 'real_estate_construction' ? baseSqFtRate : undefined,
      totalEstimatedOutlay: Number(totalEstimatedOutlay) || 0,
      status,
      startDate,
      targetCompletionDate,
      partners: projectPartners,
      notes: notes.trim(),
      plotsCount:
        sector === 'real_estate_open_plotting'
          ? (plotDistribution.eastPlotsCount || 0) +
            (plotDistribution.northPlotsCount || 0) +
            (plotDistribution.westPlotsCount || 0) +
            (plotDistribution.southPlotsCount || 0) +
            (plotDistribution.cornerPlotsCount || 0) +
            (plotDistribution.commercialPlotsCount || 0)
          : sector === 'real_estate_construction'
          ? totalCustomFlats
          : 0,
      floorsCount: sector === 'real_estate_construction' ? floorsCount : undefined,
      flatsPerFloor: sector === 'real_estate_construction' ? Math.round(totalCustomFlats / floorsCount) : undefined,
      facingPremium: sector === 'real_estate_construction' ? facingPremium : undefined,
      floorPlans: sector === 'real_estate_construction' ? floorPlans : undefined,
      amenities: sector === 'real_estate_construction' ? amenities : undefined,
      totalResidentialSft: sector === 'real_estate_construction' ? totalResidentialSft : undefined,
      totalAmenitiesSft: sector === 'real_estate_construction' ? totalAmenitiesSft : undefined,
      totalBuiltUpAreaSft: sector === 'real_estate_construction' ? totalBuiltUpAreaSft : undefined,
      plotDistribution: sector === 'real_estate_open_plotting' ? plotDistribution : undefined,
      layoutAmenities: sector === 'real_estate_open_plotting' ? layoutAmenities : undefined,
      planDocuments: planDocuments.length > 0 ? planDocuments : undefined,
      autoGenerateInventory: autoGeneratePlots,
      countersCount: sector === 'liquor_vends' ? liquorCounters.length : undefined,
      dailySalesTarget: sector === 'liquor_vends' ? dailySalesTarget : undefined,
      securityDeposit: sector === 'liquor_vends' ? securityDeposit : undefined,
      contractType: sector === 'custom_infra' ? contractType : undefined,
      retentionPercent: sector === 'custom_infra' ? retentionPercent : undefined,
    };

    // Auto-generate plots or apartment units matching the user's custom plan!
    let initialPlots: Plot[] | undefined;
    let initialUnits: ApartmentUnit[] | undefined;

    if (sector === 'real_estate_open_plotting') {
      initialPlots = [];
      let plotIdCounter = 1;

      // 1. East Facing Plots (Sunrise / Vastu)
      const eastCount = plotDistribution.eastPlotsCount || 0;
      const eastArea = plotDistribution.eastAreaSqYards || 0;
      for (let i = 1; i <= eastCount; i++) {
        initialPlots.push({
          id: 5000 + plotIdCounter,
          firmId: firm.id,
          projectId: newProject.id,
          plotNumber: `Plot #${plotIdCounter}`,
          areaSqYards: eastArea,
          facing: 'East',
          ratePerSqYard: floorRatePerSqYard,
          status: 'available',
          buyerName: undefined,
          buyerPhone: undefined,
          advanceReceived: undefined,
          paymentMilestone: undefined,
        });
        plotIdCounter++;
      }

      // 2. North Facing Plots (Kubera Vastu)
      const northCount = plotDistribution.northPlotsCount || 0;
      const northArea = plotDistribution.northAreaSqYards || 0;
      for (let i = 1; i <= northCount; i++) {
        initialPlots.push({
          id: 5000 + plotIdCounter,
          firmId: firm.id,
          projectId: newProject.id,
          plotNumber: `Plot #${plotIdCounter}`,
          areaSqYards: northArea,
          facing: 'North',
          ratePerSqYard: floorRatePerSqYard,
          status: 'available',
        });
        plotIdCounter++;
      }

      // 3. West Facing Plots (Standard Vastu)
      const westCount = plotDistribution.westPlotsCount || 0;
      const westArea = plotDistribution.westAreaSqYards || 0;
      for (let i = 1; i <= westCount; i++) {
        initialPlots.push({
          id: 5000 + plotIdCounter,
          firmId: firm.id,
          projectId: newProject.id,
          plotNumber: `Plot #${plotIdCounter}`,
          areaSqYards: westArea,
          facing: 'West',
          ratePerSqYard: floorRatePerSqYard,
          status: 'available',
        });
        plotIdCounter++;
      }

      // 4. South Facing Plots (Budget Residential)
      const southCount = plotDistribution.southPlotsCount || 0;
      const southArea = plotDistribution.southAreaSqYards || 0;
      for (let i = 1; i <= southCount; i++) {
        initialPlots.push({
          id: 5000 + plotIdCounter,
          firmId: firm.id,
          projectId: newProject.id,
          plotNumber: `Plot #${plotIdCounter}`,
          areaSqYards: southArea,
          facing: 'South',
          ratePerSqYard: floorRatePerSqYard,
          status: 'available',
        });
        plotIdCounter++;
      }

      // 5. Corner Plots (NE / SE Corners)
      const cornerCount = plotDistribution.cornerPlotsCount || 0;
      const cornerArea = plotDistribution.cornerAreaSqYards || 0;
      for (let i = 1; i <= cornerCount; i++) {
        initialPlots.push({
          id: 5000 + plotIdCounter,
          firmId: firm.id,
          projectId: newProject.id,
          plotNumber: `Plot #${plotIdCounter}`,
          areaSqYards: cornerArea,
          facing: 'North-East Corner',
          ratePerSqYard: floorRatePerSqYard,
          status: 'available',
        });
        plotIdCounter++;
      }

      // 6. Commercial Frontage Plots
      const commercialCount = plotDistribution.commercialPlotsCount || 0;
      const commercialArea = plotDistribution.commercialAreaSqYards || 0;
      for (let i = 1; i <= commercialCount; i++) {
        initialPlots.push({
          id: 5000 + plotIdCounter,
          firmId: firm.id,
          projectId: newProject.id,
          plotNumber: `Plot #${plotIdCounter}`,
          areaSqYards: commercialArea,
          facing: 'North',
          ratePerSqYard: floorRatePerSqYard,
          status: 'available',
        });
        plotIdCounter++;
      }
    } else if (autoGeneratePlots && sector === 'real_estate_construction') {
      // Generate initial units strictly from the user's custom FloorFlatConfig!
      initialUnits = [];
      let isFirstUnit = true;

      floorPlans.forEach((floor) => {
        floor.units.forEach((unit) => {
          const isCorner = unit.facing === 'Corner';
          const isEast = unit.facing === 'East';
          const unitRate = unit.baseRate || baseSqFtRate;
          const unitFacingPremium = 0;
          const floorRise = 0;

          initialUnits!.push({
            id: `apt-${newProject.id}-${unit.unitNumber.replace('#', '')}`,
            firmId: firm.id,
            projectId: newProject.id,
            unitNumber: unit.unitNumber,
            floor: floor.floorNumber,
            flatType: unit.flatType as any,
            sftArea: unit.sftArea,
            facing: unit.facing as any,
            baseRate: unitRate,
            facingPremium: unitFacingPremium,
            floorRise,
            parkingFee: 0,
            amenitiesFee: 0,
            status: 'available',
            buyerName: undefined,
            buyerPhone: undefined,
            advanceReceived: 0,
            currentMilestone: undefined,
          });

          if (isFirstUnit) isFirstUnit = false;
        });
      });
    }

    setSubmitting(true);
    try {
      const ok = await onAddProject(newProject, initialPlots, initialUnits, pendingAccounts);
      if (ok !== false) onClose();
      else setError('The project was not created. Review the fields and try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The project could not be created. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper for safe plot count
  function distributionPlotsCount(val: number, fallback: number) {
    return val !== undefined && val !== null ? Math.max(0, val) : fallback;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto bg-black/80 backdrop-blur-sm">
      <div className="relative bg-white rounded-3xl max-w-5xl w-full my-3 sm:my-6 shadow-2xl border border-gray-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header - Fixed & Pinned at Top (guarantees top part is ALWAYS 100% visible) */}
        <div className="sticky top-0 bg-white px-5 sm:px-7 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 z-30 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FFB800] flex items-center justify-center text-gray-950 font-black shadow-sm border border-amber-500/40 shrink-0">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-800">
                  {firm.code}
                </span>
                <span className="text-xs text-gray-500 font-semibold truncate max-w-[200px] sm:max-w-xs">
                  {firm.name}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-gray-950">
                {isEdit ? 'Edit Project' : '+ Add New Syndicate Project / Venture'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting || docUploading}
            className="p-2 text-gray-400 hover:text-gray-950 hover:bg-gray-100 rounded-full transition-colors shrink-0 disabled:opacity-40"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Jump Bar across Form Sections */}
        <div className="bg-gray-50/90 px-5 sm:px-7 py-2.5 border-b border-gray-200 flex items-center gap-2 overflow-x-auto shrink-0 z-20">
          <span className="text-[10px] font-bold text-gray-500 uppercase shrink-0">Sections:</span>
          <button
            type="button"
            onClick={() => setActiveFormTab('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors ${
              activeFormTab === 'all'
                ? 'bg-gray-950 text-white shadow-2xs'
                : 'text-gray-700 hover:bg-gray-200/80'
            }`}
          >
            All Sections
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('custom_plan')}
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors flex items-center gap-1.5 ${
              activeFormTab === 'custom_plan'
                ? 'bg-amber-500 text-gray-950 shadow-2xs font-black'
                : 'text-gray-700 hover:bg-gray-200/80'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>
              {sector === 'real_estate_construction'
                ? 'Construction Floor & Flats Matrix'
                : sector === 'real_estate_open_plotting'
                ? 'Demarcated Plots Matrix'
                : 'Physical Layout & Outlets'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('blueprint_upload')}
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors flex items-center gap-1.5 ${
              activeFormTab === 'blueprint_upload'
                ? 'bg-amber-500 text-gray-950 shadow-2xs font-black'
                : 'text-gray-700 hover:bg-gray-200/80'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Blueprint &amp; Plan Upload ({isEdit ? (ip?.planDocuments?.length || 0) + newDocs.length : planDocuments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('partners')}
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors flex items-center gap-1.5 ${
              activeFormTab === 'partners'
                ? 'bg-amber-500 text-gray-950 shadow-2xs font-black'
                : 'text-gray-700 hover:bg-gray-200/80'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Syndicate Partners ({projectPartners.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('accounts')}
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors flex items-center gap-1.5 ${
              activeFormTab === 'accounts'
                ? 'bg-amber-500 text-gray-950 shadow-2xs font-black'
                : 'text-gray-700 hover:bg-gray-200/80'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Project Accounts &amp; Banking ({availableFirmAccounts.length + (cashDefaults ? 1 : 0)})</span>
          </button>
        </div>

        {/* Form Container with Smooth Scrollable Body and Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 overscroll-contain">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* SECTION 1: PROJECT IDENTITY */}
            {(activeFormTab === 'all' || activeFormTab === 'custom_plan') && (
              <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-800 tracking-wider">
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>1. Project Identity &amp; Sector Engine</span>
                  </div>
                  <span className="text-[11px] text-gray-500 font-semibold hidden sm:inline">
                    Select sector engine to adapt form fields
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Project / Venture Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={
                        sector === 'real_estate_open_plotting'
                          ? 'e.g. Amaravati Phase 2 - Krishna Riverfront Enclave'
                          : sector === 'real_estate_construction'
                          ? 'e.g. Amaravati Heights - Royal Luxury Towers'
                          : sector === 'liquor_vends'
                          ? 'e.g. Warangal Urban Retail Outlet Cluster - Zone 1'
                          : 'e.g. Mirchi Yard Cold Storage & Terminal Logistics'
                      }
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Project Code / Tag *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AV-KR2"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-mono font-bold text-gray-950 focus:ring-2 focus:ring-[#FFB800] focus:border-transparent outline-none uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Venture Sector Engine *
                    </label>
                    <select
                      value={sector}
                      disabled={isEdit}
                      title={isEdit ? 'The sector of a saved project cannot be changed' : undefined}
                      onChange={(e) => handleSectorChange(e.target.value as SectorType)}
                      className="w-full px-3 py-2.5 bg-amber-50/70 border-2 border-amber-300 text-gray-950 font-bold rounded-xl text-xs focus:ring-2 focus:ring-[#FFB800] outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <MasterOptions group="sector_types" valueKey="uiCode" only={firm.sectors} />
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Project Development Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as Project['status'])}
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                    >
                      <MasterOptions group="project_statuses" />
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Venture Launch / Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                    />
                  </div>
                </div>

                {/* Dynamic Notification pill showing that fields have adapted to sector */}
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/70 rounded-xl border border-amber-300/80 text-amber-950 text-xs">
                  <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="font-semibold">
                    Sector Active:{' '}
                    <strong className="font-black underline">
                      {sector === 'real_estate_open_plotting' &&
                        'Real Estate - Open Plotting (Layouts & Gated Communities)'}
                      {sector === 'real_estate_construction' &&
                        'Apartments & Construction (Residential Towers & Flats)'}
                      {sector === 'liquor_vends' && 'Liquor Vends Register (Excise A4 Wine Outlets Cluster)'}
                      {sector === 'custom_infra' &&
                        'Custom Infra & Civil Works (Turnkey EPC, Roads & Warehousing)'}
                    </strong>
                    . All fields below have adapted to this sector.
                  </span>
                </div>
              </div>
            )}

            {/* SECTION 2: DYNAMIC LOCATION, CLEARANCES & OUTLAY PARAMETERS */}
            {activeFormTab === 'all' && (
              <>
                {/* SECTOR A: OPEN PLOTTING */}
                {sector === 'real_estate_open_plotting' && (
                  <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-800 tracking-wider">
                      <Compass className="w-4 h-4 text-amber-600" />
                      <span>2. Layout Location, Revenue Survey &amp; Statutory Approvals</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Layout Location / Highway Corridor *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mangalagiri Mandal, CRDA Capital Region"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Revenue Survey Numbers *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Sy. No. 165/1, 166/2, 168/P"
                          value={surveyNumbers}
                          onChange={(e) => setSurveyNumbers(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Statutory Town Planning Authority
                        </label>
                        <select
                          value={approvalAuthority}
                          onChange={(e) => setApprovalAuthority(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        >
                          <MasterOptions group="layout_authorities" />
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Layout Permit (LP) / RERA Number *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. CRDA/LP/2026/058 or LP No. 42/2025"
                          value={lpOrReraNumber}
                          onChange={(e) => setLpOrReraNumber(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    {/* Extent & Specifications */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-gray-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Total Land Extent</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="e.g. 6.0"
                            value={extentValue === 0 ? '' : extentValue}
                            onChange={(e) => setExtentValue(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <select
                            value={extentUnit}
                            onChange={(e) => setExtentUnit(e.target.value)}
                            className="px-2 py-2 bg-white border border-gray-300 rounded-xl text-[11px] font-bold text-gray-700 outline-none"
                          >
                            <MasterOptions group="extent_units" />
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Approach Road Width</label>
                        <select
                          value={roadWidth}
                          onChange={(e) => setRoadWidth(Number(e.target.value) as any)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-950 outline-none"
                        >
                          <MasterOptions group="road_widths" />
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Floor Rate Lock (₹/Sq.Yd)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="100"
                            placeholder="e.g. 18500"
                            value={floorRatePerSqYard === 0 ? '' : floorRatePerSqYard}
                            onChange={(e) => setFloorRatePerSqYard(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Estimated Project Cost (Total Outlay ₹) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="100000"
                            placeholder="e.g. 48000000"
                            value={totalEstimatedOutlay === 0 ? '' : totalEstimatedOutlay}
                            onChange={(e) => handleOutlayChange(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>
                    </div>

                    {/* Clarification Box for Project Outlay */}
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-2">
                          <span>What does "Project Outlay Estimated Cost" mean?</span>
                          <span className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full font-black">
                            = Total Estimated Project Cost
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900 leading-relaxed">
                          <strong>Project Outlay</strong> is the accounting term for <strong>Total Estimated Project Cost</strong>. It represents the overall financial capital budgeted to execute this venture (including {getOutlayExplanation()}).
                        </p>
                        <div className="text-xs font-bold text-amber-900 pt-0.5">
                          Current Budget:{' '}
                          <span className="font-black text-gray-950 font-mono">
                            {formatINR(totalEstimatedOutlay)} ({formatIndianCompact(totalEstimatedOutlay)})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTOR B: APARTMENTS & CONSTRUCTION */}
                {sector === 'real_estate_construction' && (
                  <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-800 tracking-wider">
                      <Building2 className="w-4 h-4 text-amber-600" />
                      <span>2. Construction Site, RERA Compliance &amp; Building Parameters</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Construction Site / Project Address *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Tadepalli Bypass, Financial District, Gachibowli"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Site Survey No. / Municipal Door No. *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Sy. No. 89/3, Tadepalli (Plot 14, Ward 2)"
                          value={surveyNumbers}
                          onChange={(e) => setSurveyNumbers(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Building Sanction &amp; Regulatory Authority
                        </label>
                        <select
                          value={approvalAuthority}
                          onChange={(e) => setApprovalAuthority(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        >
                          <MasterOptions group="approval_authorities" />
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          RERA Registration / Building Sanction Plan No. *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. P03240019284 or GHMC/BA/2026/089"
                          value={lpOrReraNumber}
                          onChange={(e) => setLpOrReraNumber(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    {/* Construction Specs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Base Rate (₹/Sq.Ft) *</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="50"
                            placeholder="e.g. 4800"
                            value={baseSqFtRate === 0 ? '' : baseSqFtRate}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setBaseSqFtRate(val);
                            }}
                            className="w-full pl-6 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Facing Premium (₹/Sq.Ft)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="25"
                            value={facingPremium}
                            onChange={(e) => setFacingPremium(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Estimated Construction Cost (Outlay ₹) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="100000"
                            placeholder="e.g. 42000000"
                            value={totalEstimatedOutlay === 0 ? '' : totalEstimatedOutlay}
                            onChange={(e) => handleOutlayChange(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>
                    </div>

                    {/* Clarification Box for Project Outlay */}
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-2">
                          <span>What does "Project Outlay Estimated Cost" mean?</span>
                          <span className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full font-black">
                            = Total Estimated Construction Cost
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900 leading-relaxed">
                          <strong>Project Outlay</strong> is the accounting term for <strong>Total Estimated Construction Cost</strong>. It covers the complete civil construction budget (including {getOutlayExplanation()}).
                        </p>
                        <div className="text-xs font-bold text-amber-900 pt-0.5">
                          Current Budget:{' '}
                          <span className="font-black text-gray-950 font-mono">
                            {formatINR(totalEstimatedOutlay)} ({formatIndianCompact(totalEstimatedOutlay)})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTOR C: LIQUOR VENDS */}
                {sector === 'liquor_vends' && (
                  <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-800 tracking-wider">
                      <Wine className="w-4 h-4 text-rose-600" />
                      <span>2. Excise Zone, Retail Shop Counters &amp; State Licensing Details</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Excise Zone / Retail Cluster Location *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Naimnagar &amp; Hanamkonda Circles, Warangal Urban"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Excise Gazette Shop Numbers (A4 Vends) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Excise Shop #04, #05, #08, #12"
                          value={surveyNumbers}
                          onChange={(e) => setSurveyNumbers(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          State Excise Regulatory Authority
                        </label>
                        <select
                          value={approvalAuthority}
                          onChange={(e) => setApprovalAuthority(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        >
                          <MasterOptions group="liquor_authorities" />
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Gazette Notification / Retail Vend License No. *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. TG-EXC-WGL-2025-089 or AP-EXC-GNT-2026/014"
                          value={lpOrReraNumber}
                          onChange={(e) => setLpOrReraNumber(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Daily Sales Target / Counter</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="10000"
                            value={dailySalesTarget}
                            onChange={(e) => setDailySalesTarget(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Excise BG / Security Deposit</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="100000"
                            value={securityDeposit}
                            onChange={(e) => setSecurityDeposit(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Estimated Syndicate Outlay (Cost ₹) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="100000"
                            value={totalEstimatedOutlay}
                            onChange={(e) => handleOutlayChange(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SECTOR D: CUSTOM INFRA & CIVIL WORKS */}
                {sector === 'custom_infra' && (
                  <div className="bg-gray-50/80 rounded-2xl p-5 border border-gray-200 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-800 tracking-wider">
                      <Hammer className="w-4 h-4 text-amber-700" />
                      <span>2. Contract Award, Client Department &amp; Technical Scope</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Work Site / Project Stretch Location *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Near Gate #2, Market Yard Road, Guntur Bypass NH-16"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Tender Agreement / Contract Number *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. GMC/INFRA/2026/012 or R&amp;B/EE/CRDA-04/2026"
                          value={surveyNumbers}
                          onChange={(e) => setSurveyNumbers(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Client Principal / Contracting Authority
                        </label>
                        <select
                          value={approvalAuthority}
                          onChange={(e) => setApprovalAuthority(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        >
                          <MasterOptions group="infra_authorities" />
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          LOA / Work Order Sanction Reference *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. LOA No. CRDA/ENGG/2026/982"
                          value={lpOrReraNumber}
                          onChange={(e) => setLpOrReraNumber(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-200">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Contract Agreement Model</label>
                        <select
                          value={contractType}
                          onChange={(e) => setContractType(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-950 outline-none"
                        >
                          <MasterOptions group="infra_contract_types" />
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Retention Deposit / BG %</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="15"
                            value={retentionPercent}
                            onChange={(e) => setRetentionPercent(parseFloat(e.target.value) || 0)}
                            className="w-full pl-2 pr-6 py-2 bg-white border border-gray-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute right-2.5 top-2 text-xs font-bold text-gray-400">%</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                          Estimated Work Value (Outlay ₹) *
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="100000"
                            value={totalEstimatedOutlay}
                            onChange={(e) => handleOutlayChange(parseInt(e.target.value) || 0)}
                            className="w-full pl-6 pr-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-xs font-black text-gray-950 focus:ring-2 focus:ring-[#FFB800] outline-none"
                          />
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">₹</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* SECTION 3: VENTURE CUSTOMIZATION & PHYSICAL PLAN MATRIX */}
            {(activeFormTab === 'all' || activeFormTab === 'custom_plan') && (
              <div className="bg-white rounded-2xl p-5 border-2 border-amber-300/80 shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-900 tracking-wider">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>3. Physical Plan &amp; Custom Layout Configuration</span>
                </div>

                {/* Switch according to sector */}
                {sector === 'real_estate_construction' && (
                  <ConstructionPlanBuilder
                    floorsCount={floorsCount}
                    onFloorsCountChange={setFloorsCount}
                    floorPlans={floorPlans}
                    onFloorPlansChange={setFloorPlans}
                    amenities={amenities}
                    onAmenitiesChange={setAmenities}
                    baseSqFtRate={baseSqFtRate}
                  />
                )}

                {isEdit && sector === 'real_estate_open_plotting' && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] leading-relaxed text-sky-900 space-y-1">
                    <p>Matrix values reflect the saved plot inventory. Area changes apply to available plots only; booked, sold and historical plots are preserved. Counts cannot be reduced below protected plots.</p>
                    {livePlotArea !== null && (
                      <p data-testid="text-recorded-plot-area"><strong>Recorded plot area:</strong> {livePlotArea.toLocaleString('en-IN')} Sq. Yards across saved plots. Matrix area totals below exclude mixed-size groups and are not the recorded total.</p>
                    )}
                    {pendingCountGroups.length > 0 && (
                      <p data-testid="text-pending-counts" className="font-semibold text-amber-900"><strong>Pending count changes (unsaved):</strong> {pendingCountGroups.join('; ')}.</p>
                    )}
                    {mixedGroups.length > 0 && (
                      <p data-testid="text-mixed-sizes"><strong>Mixed sizes:</strong> {mixedGroups.join(', ')} facing plots have different saved sizes, so the area field is blank-equivalent 0 and is NOT an actual zero area. Leave it at 0 to keep every existing size, or enter one area to resize the available plots in that group.</p>
                    )}
                  </div>
                )}
                {sector === 'real_estate_open_plotting' && (
                  <OpenPlottingPlanBuilder
                    extentValue={extentValue}
                    extentUnit={extentUnit}
                    floorRatePerSqYard={floorRatePerSqYard}
                    distribution={plotDistribution}
                    onDistributionChange={setPlotDistribution}
                    amenities={layoutAmenities}
                    onAmenitiesChange={setLayoutAmenities}
                    roadWidth={roadWidth}
                    openSpacePercent={openSpacePercent}
                    mixedGroups={isEdit ? mixedGroups : undefined}
                    recordedArea={isEdit ? livePlotArea : undefined}
                  />
                )}

                {sector === 'liquor_vends' && (
                  <LiquorVendPlanBuilder
                    counters={liquorCounters}
                    onCountersChange={setLiquorCounters}
                    facilities={liquorFacilities}
                    onFacilitiesChange={setLiquorFacilities}
                  />
                )}

                {sector === 'custom_infra' && (
                  <CustomInfraPlanBuilder
                    packages={infraPackages}
                    onPackagesChange={setInfraPackages}
                    facilities={infraFacilities}
                    onFacilitiesChange={setInfraFacilities}
                  />
                )}
              </div>
            )}

            {/* SECTION 4: BLUEPRINT & PLAN UPLOAD */}
            {/* Always mounted so unsaved document edits survive form-tab switches. */}
            <div className={activeFormTab === 'all' || activeFormTab === 'blueprint_upload' ? 'contents' : 'hidden'}>
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-900 tracking-wider">
                  <Upload className="w-4 h-4 text-amber-600" />
                  <span>4. Sanctioned Blueprint &amp; Venture Plan Documents</span>
                </div>

                {isEdit ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase tracking-wider text-gray-600">Saved documents</p>
                      <ProjectDocumentsManager projectId={projectId} revisionRef={docRevisionRef} onRevision={onDocRevision} onDirty={setDocsDirty}
                        saveRef={docsSaveRef} reloadKey={docsReload} disabled={submitting || docUploading} />
                    </div>
                    <div className="space-y-2 border-t border-gray-100 pt-3">
                      <p className="text-[11px] font-black uppercase tracking-wider text-gray-600">Add new documents</p>
                      <PlanDocumentUploader documents={newDocs} onChange={(d) => { setNewDocs(d); setDocMsg(null); }} sector={sector} />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] text-gray-500">
                          {!onUploadDocuments ? 'Document upload is unavailable right now.' : newDocs.length === 0 ? 'Select files above, then upload. Uploads are separate from Save changes.' : `${newDocs.length} file${newDocs.length > 1 ? 's' : ''} ready to upload.`}
                        </p>
                        <button type="button" data-testid="button-upload-documents" disabled={docUploading || submitting || !onUploadDocuments || newDocs.length === 0}
                          onClick={async () => {
                            if (docUploading || !onUploadDocuments || newDocs.length === 0) return;
                            setDocMsg(null); setDocUploading(true);
                            try {
                              if (docsSaveRef.current && !(await docsSaveRef.current())) { setDocMsg({ ok: false, text: 'Save or discard your document edits first; the upload was not started.' }); return; }
                              const ok = await onUploadDocuments(projectId, newDocs);
                              if (ok) { setDocMsg({ ok: true, text: `${newDocs.length} document${newDocs.length > 1 ? 's' : ''} uploaded privately.` }); setNewDocs([]); setDocsReload((n) => n + 1); }
                              else setDocMsg({ ok: false, text: 'Upload failed. Your selected files are kept; try again.' });
                            } catch (err) {
                              setDocMsg({ ok: false, text: err instanceof Error ? err.message : 'Upload failed.' });
                            } finally { setDocUploading(false); }
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                          <Upload className="w-4 h-4" />{docUploading ? 'Uploading…' : 'Upload Documents'}
                        </button>
                      </div>
                      {docMsg && <p role={docMsg.ok ? 'status' : 'alert'} className={`text-xs font-semibold ${docMsg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{docMsg.text}</p>}
                    </div>
                  </div>
                ) : (
                  <PlanDocumentUploader
                    documents={planDocuments}
                    onChange={setPlanDocuments}
                    sector={sector}
                  />
                )}
              </div>
            </div>

            {/* SECTION 5: PROJECT SYNDICATE PARTNERS & DYNAMIC EQUITY ALLOCATION */}
            {(activeFormTab === 'all' || activeFormTab === 'partners') && (
              <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-950 tracking-wider">
                      <Users className="w-4 h-4 text-amber-700" />
                      <span>5. Respective Syndicate Partners &amp; Equity Allocation</span>
                    </div>
                    <p className="text-[11px] text-amber-900 mt-0.5">
                      Syndicate partners and equity shares vary from project to project. Assign respective partners, project-specific roles, and capital contributions for this venture.
                    </p>
                  </div>

                  {/* Equity Total Badge & Quick Helper */}
                  <fieldset disabled={isEdit} className="flex flex-wrap items-center gap-2 shrink-0 disabled:opacity-60">
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                        Math.abs(totalEquity - 100) < 0.1
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-amber-200 text-amber-950 border border-amber-400'
                      }`}
                    >
                      <Percent className="w-3.5 h-3.5" />
                      <span>Total Equity: {totalEquity.toFixed(1)}% / 100%</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSplitRemainingEqually}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white text-gray-800 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors shadow-2xs"
                    >
                      Split Equity Equally
                    </button>

                    <button
                      type="button"
                      onClick={handleAutoSyncCapitalWithOutlay}
                      className="px-2.5 py-1 text-[10px] font-bold bg-amber-200 hover:bg-amber-300 text-amber-950 rounded-lg border border-amber-400 transition-colors flex items-center gap-1 shadow-2xs"
                      title="Distribute Total Estimated Project Cost into Partner Capital Estimated Invest Values"
                    >
                      <Sparkles className="w-3 h-3 text-amber-800" />
                      <span>Sync Capital from Cost ({formatIndianCompact(totalEstimatedOutlay)})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSyncOutlayWithCapital}
                      className="px-2.5 py-1 text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-950 rounded-lg border border-emerald-300 transition-colors flex items-center gap-1 shadow-2xs"
                      title="Set Total Estimated Project Cost to match the sum of Capital Estimated Invest Values"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-800" />
                      <span>Sync Cost from Capital ({formatIndianCompact(totalCapital)})</span>
                    </button>
                  </fieldset>
                </div>

                {isEdit && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-white p-3 text-[11px] text-amber-950">
                    <Lock className="w-4 h-4 shrink-0 text-amber-700" />
                    <span>Existing allocations are shown read-only. Manage partner identities, equity and capital in the <strong>Partners &amp; Equity</strong> tab; saving here keeps them unchanged.</span>
                  </div>
                )}
                <fieldset disabled={isEdit} className="contents">
                {/* Partners Table / Cards */}
                {projectPartners.length === 0 ? (
                  <div className="bg-white p-6 rounded-2xl border border-dashed border-gray-300 text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center mx-auto border border-amber-200">
                      <PieChart className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="space-y-1">
                      <h5 className="text-xs font-black text-gray-900">No Partners Assigned to this Project</h5>
                      <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                        Syndicate partners are project-specific. You can add venture partners right now, or create the project and allocate equity anytime in the Partners &amp; Equity tab.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPartnerRow}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-xs transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Partner to this Project</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectPartners.map((partner, idx) => (
                      <div
                        key={partner.partnerId || idx}
                        className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-[240px]">
                          <div
                            className={`w-8 h-8 rounded-full ${partner.avatarColor} text-white flex items-center justify-center text-xs font-bold shrink-0`}
                          >
                            {partner.name ? partner.name.charAt(0).toUpperCase() : 'P'}
                          </div>
                          <div className="flex-1 space-y-1">
                            <input
                              type="text"
                              placeholder="Partner Name (e.g. R. Venkatesh)"
                              value={partner.name}
                              onChange={(e) => handlePartnerChange(idx, 'name', e.target.value)}
                              className="w-full text-xs font-bold text-gray-950 border-b border-gray-300 focus:border-amber-500 outline-none pb-0.5 bg-transparent"
                            />
                            <div className="flex items-center gap-1 bg-amber-50/80 px-2 py-1 rounded-md border border-amber-200">
                              <span className="text-[9px] uppercase font-black text-amber-800 shrink-0">User ID (Mobile):</span>
                              <input
                                type="tel"
                                placeholder="+91 98480 XXXXX"
                                value={partner.phone}
                                onChange={(e) => handlePartnerChange(idx, 'phone', e.target.value)}
                                className="w-full text-xs font-mono font-bold text-gray-900 border-none outline-none p-0 bg-transparent placeholder:text-gray-400"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase">
                              Project Role
                            </label>
                            <input
                              type="text"
                              placeholder={
                                sector === 'real_estate_open_plotting'
                                  ? 'e.g. Managing Partner / Civil Contractor'
                                  : sector === 'real_estate_construction'
                                  ? 'e.g. Structural Lead / Finishes Lead'
                                  : sector === 'liquor_vends'
                                  ? 'e.g. Tender Bidder / Depot Logistics'
                                  : 'e.g. Turnkey EPC Lead / Earthwork Lead'
                              }
                              value={partner.roleInProject}
                              onChange={(e) => handlePartnerChange(idx, 'roleInProject', e.target.value)}
                              className="w-full px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase">
                              Project Equity %
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                max="100"
                                value={partner.equityPercent}
                                onChange={(e) => handlePartnerChange(idx, 'equityPercent', e.target.value)}
                                className="w-full pl-2 pr-6 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-black text-gray-900 outline-none"
                              />
                              <span className="absolute right-2 top-1 text-xs text-gray-400 font-bold">%</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase">
                              Capital Estimated Invest Value (₹)
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="50000"
                                value={partner.initialCapital}
                                onChange={(e) => handlePartnerChange(idx, 'initialCapital', e.target.value)}
                                className="w-full pl-5 pr-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-black text-gray-900 outline-none focus:bg-white focus:border-amber-500"
                              />
                              <span className="absolute left-1.5 top-1 text-xs text-gray-400 font-bold">₹</span>
                            </div>
                            <span className="text-[9px] text-gray-500 mt-0.5 block font-mono">
                              {formatINR(partner.initialCapital)} ({partner.equityPercent}% of {formatIndianCompact(totalEstimatedOutlay)})
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePartnerRow(idx)}
                          title="Remove partner from this project"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors self-end md:self-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add partner button & Total Capital Estimated Invest Value */}
                {projectPartners.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={handleAddPartnerRow}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/60 text-xs font-bold shadow-2xs transition-colors self-start sm:self-auto"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Another Partner to this Project</span>
                    </button>

                    <div className="text-right space-y-1">
                    <div className="text-xs font-semibold text-gray-700">
                      Total Capital Estimated Invest Value:{' '}
                      <strong className="text-gray-950 font-mono text-sm">{formatINR(totalCapital)}</strong>
                    </div>
                    <div className="text-[11px] font-medium text-gray-600 flex items-center justify-end gap-1.5 flex-wrap">
                      <span>Total Estimated Project Cost:</span>
                      <strong className="text-amber-950 font-mono">{formatINR(totalEstimatedOutlay)}</strong>
                      <span>•</span>
                      {Math.abs(totalCapital - totalEstimatedOutlay) < 100 ? (
                        <span className="text-emerald-700 font-bold bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          <span>✓ 100% In Perfect Sync</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-lg text-amber-950">
                          <span className="font-bold text-[10px]">
                            ⚠️ Difference of ₹{formatINR(Math.abs(totalEstimatedOutlay - totalCapital))}
                          </span>
                          <button
                            type="button"
                            onClick={handleAutoSyncCapitalWithOutlay}
                            className="underline font-bold text-[10px] hover:text-amber-800"
                            title="Scale partner capital to match project cost"
                          >
                            Sync to Cost
                          </button>
                          <span>/</span>
                          <button
                            type="button"
                            onClick={handleSyncOutlayWithCapital}
                            className="underline font-bold text-[10px] hover:text-emerald-800"
                            title="Update project cost to match total partner capital"
                          >
                            Sync to Capital
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )}
                </fieldset>
              </div>
            )}

            {/* SECTION: PROJECT BANK ACCOUNTS & SETTLEMENT BANKING */}
            {(activeFormTab === 'all' || activeFormTab === 'accounts') && (
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-950 flex items-center gap-1.5">
                        <span>Project Bank Accounts &amp; Escrow</span>
                        <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                          {availableFirmAccounts.length + (!isEdit && cashDefaults ? 1 : 0)} Dedicated Accounts
                        </span>
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Select or configure the dedicated Project Account to receive customer booking advances &amp; partner capital for this venture
                      </p>
                    </div>
                  </div>

                  {/* UI TO ADD PROJECT ACCOUNTS */}
                  <button
                    type="button"
                    onClick={() => setIsAddAccountSubModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 font-black text-xs shadow-xs transition-all border border-amber-500/40 self-start sm:self-auto cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Project Account</span>
                  </button>
                </div>

                {isEdit ? (
                  <p className="mb-3 text-[11px] text-gray-600">Balances are live and read-only. Add or edit bank account details here; changes are staged and saved with Save changes. The default Cash account is managed by the system.</p>
                ) : cashDefaults ? (
                  <div className="mb-3 max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-bold text-gray-950">{String(cashDefaults.cashAccountName)}</h5>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">Automatic</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">Cash vault · this project's cash ledger</p>
                    <div className="mt-3 flex justify-between border-t border-emerald-200 pt-2 text-xs">
                      <span>Starting balance</span><strong>{formatINR(0)}</strong>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-600">Created automatically when you save. Approved cash receipts and payments update this ledger.</p>
                  </div>
                ) : (
                  <p className="mb-3 text-sm text-red-700">The default Cash policy is unavailable. Ask the owner to check account configuration.</p>
                )}
                {availableFirmAccounts.length === 0 ? (
                  <div className="p-4 bg-gray-50/80 rounded-xl border border-dashed border-gray-300 text-center space-y-2">
                    <p className="text-xs font-bold text-gray-800">No bank accounts registered yet for this project</p>
                    <p className="text-[11px] text-gray-500">
                      You can register a dedicated RERA Escrow, Capital Pool, or Commercial Current Account now or later in the Accounts tab.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsAddAccountSubModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-black"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Project Bank Account</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableFirmAccounts.map((acc) => {
                      const isSelected = selectedFirmAccountId === acc.id;
                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedFirmAccountId(acc.id)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                            isSelected
                              ? 'bg-amber-50/60 border-amber-500 ring-2 ring-amber-500/30 shadow-xs'
                              : 'bg-gray-50/60 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white text-gray-800 border border-gray-200 shadow-2xs">
                                {acc.accountType.replace('_', ' ').toUpperCase()}
                              </span>
                              <div className="flex items-center gap-1">
                                {acc.isPrimary && (
                                  <span className="text-[9px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                    Primary
                                  </span>
                                )}
                                <input
                                  type="radio"
                                  name="projectAccountSelection"
                                  checked={isSelected}
                                  onChange={() => setSelectedFirmAccountId(acc.id)}
                                  className="w-3.5 h-3.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                />
                              </div>
                            </div>
                            <h5 className="text-xs font-bold text-gray-950 line-clamp-1">{acc.accountName}</h5>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                              {acc.bankName} • {acc.accountNumber.slice(-4) ? `•••• ${acc.accountNumber.slice(-4)}` : acc.accountNumber}
                            </p>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-gray-200/60 flex items-center justify-between">
                            <span className="text-[10px] text-gray-400 font-medium">{savedAccountIds.has(acc.id) ? 'Live Balance:' : 'Opening Balance:'}</span>
                            <span className="text-xs font-bold font-mono text-gray-900">{formatINR(acc.currentBalance)}</span>
                          </div>
                          {(stagedIds.has(acc.id) || (isEdit && savedAccountIds.has(acc.id) && acc.accountType !== cashDefaults?.cashAccountType && acc.accountType !== 'field_petty_cash')) && (
                            <div className="mt-2 flex items-center justify-between gap-2">
                              {stagedIds.has(acc.id) ? (
                                <span className="text-[9px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">{savedAccountIds.has(acc.id) ? 'Edited · unsaved' : 'New · unsaved'}</span>
                              ) : <span />}
                              {savedAccountIds.has(acc.id) && (
                                <button type="button" data-testid={`button-edit-account-${acc.id}`}
                                  onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); }}
                                  className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-[10px] font-bold text-gray-800 hover:bg-gray-50">
                                  <Pencil className="w-3 h-3" /> Edit
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 6: AUTO-INVENTORY / REGISTERS GENERATION (create only) */}
            {activeFormTab === 'all' && !isEdit && (
              <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="auto-gen-inventory"
                    checked={autoGeneratePlots}
                    onChange={(e) => setAutoGeneratePlots(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-gray-300 cursor-pointer"
                  />
                  <label htmlFor="auto-gen-inventory" className="text-xs font-bold text-gray-800 cursor-pointer">
                    {sector === 'real_estate_open_plotting' &&
                      'Auto-generate plotted layout inventory from above configured matrix for immediate booking & sales tracking'}
                    {sector === 'real_estate_construction' &&
                      'Auto-generate residential flat unit matrix directly from the above floor-by-floor plan (with exact 2BHK/3BHK & Sq.Ft specs)'}
                    {sector === 'liquor_vends' &&
                      'Auto-generate daily retail counter settlement registers & partner stock draw tracking ledgers'}
                    {sector === 'custom_infra' &&
                      'Auto-generate turnkey milestone billing schedule, BoQ measurement book & sub-contractor accounts'}
                  </label>
                </div>
                <span className="text-[11px] text-amber-900 font-mono font-bold bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-200 hidden sm:inline">
                  {sector === 'real_estate_open_plotting' &&
                    `${(plotDistribution.eastPlotsCount || 0) + (plotDistribution.northPlotsCount || 0) + (plotDistribution.westPlotsCount || 0) + (plotDistribution.southPlotsCount || 0) + (plotDistribution.cornerPlotsCount || 0) + (plotDistribution.commercialPlotsCount || 0)} Plots`}
                  {sector === 'real_estate_construction' &&
                    `${floorPlans.reduce((sum, f) => sum + f.units.length, 0)} Units (${floorsCount} Floors)`}
                  {sector === 'liquor_vends' && `${liquorCounters.length} Retail Counters`}
                  {sector === 'custom_infra' && `${infraPackages.length} Contract Packages`}
                </span>
              </div>
            )}
          </div>

          {/* Modal Actions - Pinned Footer */}
          <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur-xs px-5 sm:px-7 py-3.5 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 z-30">
            <div className="text-xs text-gray-500 font-medium hidden sm:block">
              {sector === 'real_estate_construction' && (
                <span>
                  Configured:{' '}
                  <strong className="text-gray-900">
                    {floorPlans.reduce((sum, f) => sum + f.units.length, 0)} Flats
                  </strong>{' '}
                  across <strong className="text-gray-900">{floorsCount} Floors</strong> •{' '}
                  <strong className="text-amber-800">
                    {amenities.reduce((sum, a) => sum + (a.plannedSqFt || 0), 0).toLocaleString('en-IN')} SFT
                  </strong>{' '}
                  Amenities
                </span>
              )}
              {sector === 'real_estate_open_plotting' && (
                <span>
                  Configured:{' '}
                  <strong className="text-gray-900">
                    {(plotDistribution.eastPlotsCount || 0) +
                      (plotDistribution.northPlotsCount || 0) +
                      (plotDistribution.westPlotsCount || 0) +
                      (plotDistribution.southPlotsCount || 0) +
                      (plotDistribution.cornerPlotsCount || 0) +
                      (plotDistribution.commercialPlotsCount || 0)}{' '}
                    Demarcated Plots
                  </strong>{' '}
                  in <strong className="text-gray-900">{extentValue} Acres</strong>
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={requestClose}
                disabled={submitting || docUploading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-950 hover:bg-gray-200/70 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid={isEdit ? 'button-save-project-changes' : 'button-create-project'}
                disabled={submitting || docUploading}
                className="px-6 py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-gray-950 text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-amber-500/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderPlus className="w-4 h-4" />
                <span>{submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create Project & Load Data'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Sub-modal: Edit existing Project Account (staged until Save changes) */}
      {editingAccount && (
        <AddFirmAccountModal
          key={`edit-acc-${editingAccount.id}`}
          isOpen
          onClose={() => setEditingAccount(null)}
          firm={firm}
          projects={ip ? [ip] : []}
          activeProjectId={projectId}
          initialAccount={editingAccount}
          onAddAccount={(updated) => {
            const staged = { ...updated, id: editingAccount.id, linkedProjectId: editingAccount.linkedProjectId, openingBalance: editingAccount.openingBalance, currentBalance: editingAccount.currentBalance };
            setPendingAccounts((prev) => [...prev.filter((a) => a.id !== staged.id), staged]);
            return true;
          }}
        />
      )}

      {/* Sub-modal: Add Project Account */}
      {isAddAccountSubModalOpen && (
        <AddFirmAccountModal
          isOpen={isAddAccountSubModalOpen}
          onClose={() => setIsAddAccountSubModalOpen(false)}
          firm={firm}
          projects={[
            {
              id: projectId,
              firmId: firm.id,
              ...(ip || {}),
              name: name.trim() || 'New Project Venture',
              code: code.trim().toUpperCase() || 'PROJECT',
              sector,
              location: location.trim(),
              status,
              startDate,
              targetCompletionDate,
              partners: projectPartners,
              extentValue,
              extentUnit,
            } as Project,
          ]}
          activeProjectId={projectId}
          onAddAccount={(newAcc) => {
            const mappedAcc = {
              ...newAcc,
              linkedProjectId: projectId,
            };
            setPendingAccounts((prev) => [...prev, mappedAcc]);
            setSelectedFirmAccountId(mappedAcc.id);
            return true;
          }}
        />
      )}
    </div>
  );
};
