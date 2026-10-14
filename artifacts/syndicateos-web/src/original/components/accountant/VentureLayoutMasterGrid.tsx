import React, { useState, useMemo, useEffect } from 'react';
import { Plot, Project, LayoutCalculation, PlanUploadDocument, TenantFirm, MarketingBookingRequest } from '../../types';
import { formatINR, formatIndianCompact } from '../../utils/formatters';
import {
  Compass,
  Maximize2,
  Minimize2,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  Ban,
  Sparkles,
  MapPin,
  Layers,
  FileText,
  ShieldCheck,
  ChevronRight,
  Split,
  Grid3X3,
  Share2,
  Lock,
  AlertCircle
} from 'lucide-react';
import { BlueprintWorkspace } from '../blueprint/BlueprintWorkspace';
import { confirmLeave } from '../../../adapter/leaveGuard';
import { MarketingPlotPortalModal } from '../marketing/MarketingPlotPortalModal';
import { ProjectLayoutDetails, savedProjectText } from './ProjectLayoutDetails';

const savedRoadWidthLabel = (width?: number | string) => {
  // Persisted project select values can be numeric strings, unlike plot widths.
  const measurement = typeof width === 'string' && /^\d+(?:\.\d+)?$/.test(width.trim())
    ? Number(width.trim())
    : width;
  return typeof measurement === 'number' && Number.isFinite(measurement) && measurement > 0
    ? `${measurement} ft`
    : 'Width unspecified';
};

interface VentureLayoutMasterGridProps {
  plots: Plot[];
  project?: Project;
  layoutCalc?: LayoutCalculation;
  firm: TenantFirm;
  onSelectPlot: (plot: Plot) => void;
  floorRate?: number;
  onUpdatePlot?: (plot: Plot) => void | boolean | Promise<boolean>;
  onUploadDocuments?: (projectId: string, documents: PlanUploadDocument[]) => Promise<boolean>;
}

export const VentureLayoutMasterGrid: React.FC<VentureLayoutMasterGridProps> = ({
  plots: suppliedPlots,
  project,
  layoutCalc,
  firm,
  onSelectPlot,
  floorRate = 0,
  onUpdatePlot,
  onUploadDocuments,
}) => {
  // Never display another project's plot measurements when the selection changes.
  const plots = useMemo(
    () => suppliedPlots.filter((plot) => project && plot.projectId === project.id),
    [suppliedPlots, project?.id],
  );
  const approachRoadWidth = savedRoadWidthLabel(project?.roadWidth);
  const [facingFilter, setFacingFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'blocked' | 'reserved' | 'sold'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'interactive_grid' | 'blueprint'>('interactive_grid');
  // Customer presentation mode was retired; kept as a constant so existing styling branches stay inert.
  const isPresentationMode = false as boolean;
  const [showMarketingPortal, setShowMarketingPortal] = useState(false);

  // Check URL query parameters on mount to auto-open Marketing Portal if shared link was accessed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('portal') === 'marketing' || params.get('view') === 'marketing') {
      setShowMarketingPortal(true);
    }
  }, []);

  // Filtered plots
  const filteredPlots = useMemo(() => {
    return plots.filter((plot) => {
      // Facing filter
      if (facingFilter !== 'all') {
        if (facingFilter === 'Corner') {
          if (!plot.facing.includes('Corner')) return false;
        } else if (facingFilter === 'Commercial') {
          if (plot.areaSqYards > 280 && !plot.facing.includes('Corner')) {
            // treat as commercial or if road width is main
          } else if (plot.notes?.toLowerCase().includes('commercial') || plot.blockName?.toLowerCase().includes('commercial')) {
            // match
          } else {
            return false;
          }
        } else if (!plot.facing.toLowerCase().includes(facingFilter.toLowerCase())) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all' && plot.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNumber = plot.plotNumber.toLowerCase().includes(q);
        const matchBuyer = plot.buyerName?.toLowerCase().includes(q);
        const matchFacing = plot.facing.toLowerCase().includes(q);
        const matchBlock = plot.blockName?.toLowerCase().includes(q);
        if (!matchNumber && !matchBuyer && !matchFacing && !matchBlock) return false;
      }

      return true;
    });
  }, [plots, facingFilter, statusFilter, searchQuery]);

  // Counts for each facing
  const eastCount = plots.filter((p) => p.facing === 'East').length;
  const westCount = plots.filter((p) => p.facing === 'West').length;
  const northCount = plots.filter((p) => p.facing === 'North').length;
  const southCount = plots.filter((p) => p.facing === 'South').length;
  const cornerCount = plots.filter((p) => p.facing.includes('Corner')).length;
  const availableCount = plots.filter((p) => p.status === 'available').length;
  const blockedCount = plots.filter((p) => p.status === 'blocked').length;
  const reservedCount = plots.filter((p) => p.status === 'reserved').length;
  const soldCount = plots.filter((p) => p.status === 'sold').length;
  const pendingProposalsCount = plots.filter((p) => p.marketingRequest?.status === 'pending').length;

  // Group plots into visual sectors/blocks for the realistic master layout
  const eastFacingPlots = filteredPlots.filter((p) => p.facing === 'East');
  const westFacingPlots = filteredPlots.filter((p) => p.facing === 'West');
  const northFacingPlots = filteredPlots.filter((p) => p.facing === 'North');
  const southFacingPlots = filteredPlots.filter((p) => p.facing === 'South');
  const cornerPlots = filteredPlots.filter((p) => p.facing.includes('Corner'));

  const renderPlotCard = (plot: Plot, isCompact = false) => {
    const isAvailable = plot.status === 'available';
    const isBlocked = plot.status === 'blocked';
    const isReserved = plot.status === 'reserved';
    const registrationBooked = isReserved && plot.registrationState === 'scheduled';
    const isSold = plot.status === 'sold';
    const hasPendingProposal = plot.marketingRequest && plot.marketingRequest.status === 'pending';
    const currentRate = isBlocked && plot.blockedRate ? plot.blockedRate : plot.ratePerSqYard;
    const totalValue = plot.areaSqYards * currentRate;

    return (
      <div
        key={plot.id}
        data-testid="venture-plot-card"
        data-plot-number={plot.plotNumber}
        onClick={() => onSelectPlot(plot)}
        className={`group relative rounded-2xl border transition-all cursor-pointer shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-98 select-none ${
          isAvailable
            ? 'bg-gradient-to-b from-white to-emerald-50/50 border-emerald-300 hover:border-emerald-500'
            : isBlocked
            ? 'bg-gradient-to-b from-white to-amber-50/90 border-amber-400 hover:border-amber-500 ring-2 ring-amber-300/70'
            : isReserved
            ? 'bg-gradient-to-b from-white to-amber-50/70 border-amber-300 hover:border-amber-500'
            : 'bg-gradient-to-b from-white to-red-50/50 border-red-200 hover:border-red-400 opacity-90'
        } ${isCompact ? 'p-2 sm:p-2.5' : 'p-3 sm:p-3.5'}`}
      >
        {/* Pulsing Pending Marketing Proposal Badge */}
        {hasPendingProposal && (
          <div className="bg-amber-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full mb-1.5 flex items-center justify-between shadow-xs ">
            <span className="flex items-center gap-1">
              Rate request: ₹{plot.marketingRequest?.proposedRatePerSqYard?.toLocaleString('en-IN')}/Sq.Yd
            </span>
            <span className="font-extrabold text-[8px] bg-black/10 px-1 py-0.2 rounded">Noted</span>
          </div>
        )}

        {/* Top Header: Plot Number & Status Badge */}
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-black text-gray-950 text-xs sm:text-sm">
              {plot.plotNumber}
            </span>
            {plot.facing.includes('Corner') && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 font-extrabold border border-emerald-300">
                Corner
              </span>
            )}
          </div>

          <span
            className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full text-center leading-tight max-w-[145px] ${
              isAvailable
                ? 'bg-emerald-100 text-emerald-800'
                : isBlocked
                ? 'bg-amber-400 text-slate-950'
                : registrationBooked
                ? 'bg-violet-100 text-violet-900 border border-violet-300'
                : isReserved
                ? 'bg-amber-100 text-amber-900'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {isAvailable ? 'Available' : isBlocked ? '🔒 Blocked' : registrationBooked ? 'Slot booked for registration' : isReserved ? 'Token Booked' : 'Sold'}
          </span>
        </div>

        {/* Facing & Area Line */}
        <div className="space-y-0.5 text-[11px]">
          <div className="flex items-center justify-between text-gray-600">
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-amber-600" />
              <strong className="text-gray-900">{plot.facing}</strong>
            </span>
            <span className="font-mono font-bold text-gray-900">{plot.areaSqYards} Sq.Yds</span>
          </div>

          {plot.dimensions && (
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>Dims:</span>
              <span className="font-mono">{plot.dimensions}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
            <span className="text-gray-500">Rate:</span>
            <span className="font-mono font-bold text-gray-950">{formatINR(currentRate)}</span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500">Total:</span>
            <strong className="font-mono font-black text-emerald-800">{formatINR(totalValue)}</strong>
          </div>
        </div>

        <div className="mt-1 text-[10px] text-gray-600">
          Plot road width: {savedRoadWidthLabel(plot.roadWidthFt)}
        </div>

        {/* If Blocked, Booked or Sold, show Buyer/Agent preview */}
        {isBlocked ? (
          <div className="mt-2 pt-1.5 border-t border-amber-200 text-[10px] text-amber-950">
            <span className="font-bold text-amber-800 block truncate">
              Blocked: {plot.blockedForBuyer || plot.buyerName || 'Client'}
            </span>
            <span className="text-slate-500 block truncate text-[9px]">
              via {plot.blockedByAgent || plot.marketingRequest?.agentName || 'Agent'} (Token Awaited)
            </span>
          </div>
        ) : plot.buyerName ? (
          <div className="mt-2 pt-1.5 border-t border-gray-200/80 text-[10px] text-gray-700 truncate">
            <span className="text-gray-400">Buyer: </span>
            <strong className="text-gray-900">{plot.buyerName}</strong>
          </div>
        ) : (
          <div className="mt-2 pt-1.5 border-t border-emerald-100 text-[10px] text-emerald-700 font-bold flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <span>Tap to Book</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="venture-layout-grid"
      className={`space-y-5 transition-all ${
        isPresentationMode
          ? 'fixed inset-0 z-50 bg-slate-900 text-slate-100 p-4 sm:p-6 overflow-y-auto'
          : 'bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-200'
      }`}
    >
      {/* 1. TOP HEADER & CONTROLS BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded-xl text-amber-900">
              <Compass className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3
                className={`text-base sm:text-lg font-black tracking-tight ${
                  isPresentationMode ? 'text-white' : 'text-gray-950'
                }`}
              >
                {project?.name || firm.name} - Master Venture Plot Grid
              </h3>
              <p className={`text-xs ${isPresentationMode ? 'text-slate-400' : 'text-gray-600'}`}>
                Directional demarcations (East, West, North, South, Corner) with road networks &amp; on-spot tap-to-book.
              </p>
            </div>
          </div>
        </div>

        {/* VIEW TOGGLES & PRESENTATION BUTTON */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode switcher */}
          <div className="flex items-center bg-gray-100 p-1 rounded-2xl border border-gray-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => { if (viewMode !== 'interactive_grid' && !confirmLeave()) return; setViewMode('interactive_grid'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                viewMode === 'interactive_grid'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-950'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>Interactive Grid</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('blueprint')}
              aria-pressed={viewMode === 'blueprint'}
              data-testid="button-view-blueprint"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                viewMode === 'blueprint'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-gray-700 hover:text-gray-950'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Original Plan &amp; 3D</span>
            </button>
          </div>

          {/* Marketing Agent Portal & Share Link Button (Field Sales & Brokers) */}
          <button
            type="button"
            onClick={() => setShowMarketingPortal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer border border-indigo-500"
            title="Open and share live marketing inventory portal with rate proposal submission for field agents & brokers"
          >
            <Share2 className="w-4 h-4 text-indigo-200" />
            <span>Marketing Portal &amp; Share Link</span>
            {pendingProposalsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] animate-pulse">
                {pendingProposalsCount} Request{pendingProposalsCount > 1 ? 's' : ''} noted
              </span>
            )}
          </button>
        </div>
      </div>


      {/* 2. DIRECTIONAL FACING SPLIT SUMMARY TILES */}
      <div className="text-[10px] font-semibold text-gray-500">{`LP / RERA: ${project?.lpOrReraNumber ?? 'Unspecified'}`}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        {/* East Facing */}
        <button
          type="button"
          onClick={() => setFacingFilter(facingFilter === 'East' ? 'all' : 'East')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            facingFilter === 'East'
              ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm font-bold ring-2 ring-amber-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-amber-50/50 border-amber-200 text-amber-950 hover:bg-amber-100/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">East Facing</span>
            <span className="text-xs">🌅</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{eastCount} Plots</div>
          <span className="text-[10px] opacity-75 block">Sunrise / Vastu</span>
        </button>

        {/* North Facing */}
        <button
          type="button"
          onClick={() => setFacingFilter(facingFilter === 'North' ? 'all' : 'North')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            facingFilter === 'North'
              ? 'bg-blue-600 text-white border-blue-700 shadow-sm font-bold ring-2 ring-blue-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-blue-50/50 border-blue-200 text-blue-950 hover:bg-blue-100/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">North Facing</span>
            <span className="text-xs">⭐</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{northCount} Plots</div>
          <span className="text-[10px] opacity-75 block">Kubera Direction</span>
        </button>

        {/* West Facing */}
        <button
          type="button"
          onClick={() => setFacingFilter(facingFilter === 'West' ? 'all' : 'West')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            facingFilter === 'West'
              ? 'bg-purple-600 text-white border-purple-700 shadow-sm font-bold ring-2 ring-purple-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-purple-50/50 border-purple-200 text-purple-950 hover:bg-purple-100/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">West Facing</span>
            <span className="text-xs">🌇</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{westCount} Plots</div>
          <span className="text-[10px] opacity-75 block">Standard Vastu</span>
        </button>

        {/* South Facing */}
        <button
          type="button"
          onClick={() => setFacingFilter(facingFilter === 'South' ? 'all' : 'South')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            facingFilter === 'South'
              ? 'bg-rose-600 text-white border-rose-700 shadow-sm font-bold ring-2 ring-rose-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-rose-50/50 border-rose-200 text-rose-950 hover:bg-rose-100/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">South Facing</span>
            <span className="text-xs">☀️</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{southCount} Plots</div>
          <span className="text-[10px] opacity-75 block">Value / Budget</span>
        </button>

        {/* Corner Plots */}
        <button
          type="button"
          onClick={() => setFacingFilter(facingFilter === 'Corner' ? 'all' : 'Corner')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            facingFilter === 'Corner'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm font-bold ring-2 ring-emerald-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-emerald-50/50 border-emerald-200 text-emerald-950 hover:bg-emerald-100/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Corner Plots</span>
            <span className="text-xs">👑</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{cornerCount} Plots</div>
          <span className="text-[10px] opacity-75 block">NE / SE Corners</span>
        </button>

        {/* Blocked Inventory (Awaiting Token Deposit) */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'blocked' ? 'all' : 'blocked')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            statusFilter === 'blocked'
              ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm font-bold ring-2 ring-amber-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-amber-100/70 border-amber-300 text-amber-950 hover:bg-amber-200/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Blocked</span>
            <span className="text-xs">🔒</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{blockedCount} Plots</div>
          <span className="text-[10px] opacity-75 block">Token Awaited</span>
        </button>

        {/* Available Inventory */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'available' ? 'all' : 'available')}
          className={`p-3 rounded-2xl border text-left transition-all ${
            statusFilter === 'available'
              ? 'bg-emerald-500 text-slate-950 border-emerald-600 shadow-sm font-bold ring-2 ring-emerald-400'
              : isPresentationMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-emerald-100/70 border-emerald-300 text-emerald-950 hover:bg-emerald-200/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider">Available</span>
            <span className="text-xs">🟢</span>
          </div>
          <div className="text-lg font-black font-mono mt-0.5">{availableCount} Plots</div>
          <span className="text-[10px] opacity-75 block">Instant Booking</span>
        </button>
      </div>

      {/* 3. FILTERS & SEARCH ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[11px] font-bold mr-1 ${isPresentationMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Status:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-full font-bold transition-all ${
              statusFilter === 'all'
                ? isPresentationMode
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'bg-slate-900 text-white shadow-xs'
                : isPresentationMode
                ? 'text-slate-300 hover:bg-slate-800'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({plots.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('available')}
            className={`px-3 py-1 rounded-full font-bold transition-all ${
              statusFilter === 'available'
                ? 'bg-emerald-600 text-white shadow-xs'
                : isPresentationMode
                ? 'text-slate-300 hover:bg-slate-800'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            🟢 Available ({availableCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('blocked')}
            className={`px-3 py-1 rounded-full font-bold transition-all cursor-pointer ${
              statusFilter === 'blocked'
                ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                : isPresentationMode
                ? 'text-amber-300 hover:bg-slate-800'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
            }`}
          >
            🔒 Blocked ({blockedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('reserved')}
            className={`px-3 py-1 rounded-full font-bold transition-all ${
              statusFilter === 'reserved'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : isPresentationMode
                ? 'text-slate-300 hover:bg-slate-800'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            🟡 Token Booked ({reservedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('sold')}
            className={`px-3 py-1 rounded-full font-bold transition-all ${
              statusFilter === 'sold'
                ? 'bg-red-600 text-white shadow-xs'
                : isPresentationMode
                ? 'text-slate-300 hover:bg-slate-800'
                : 'bg-red-50 text-red-900 hover:bg-red-100'
            }`}
          >
            🔴 Registered ({soldCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Plot #, buyer, facing..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 rounded-full text-xs outline-none border transition-colors ${
              isPresentationMode
                ? 'bg-slate-800 border-slate-700 text-white focus:border-amber-400'
                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white focus:border-amber-500'
            }`}
          />
        </div>
      </div>

      {/* 4. MAIN VIEWPORT AREA */}
      {viewMode === 'blueprint' && (
        project ? (
          <BlueprintWorkspace key={project.id} projectId={project.id} plots={plots} onUploadDocuments={onUploadDocuments} />
        ) : (
          <p className="text-xs font-semibold text-gray-600">Select a project to view its original plan.</p>
        )
      )}

      {viewMode === 'interactive_grid' && (
        /* REALISTIC VENTURE MASTER LAYOUT WITH ROADS & COMPASS */
        <div className="space-y-6">
          {/* VENTURE ENTRY & SAVED APPROACH ROAD WIDTH */}
          <div className="relative rounded-2xl overflow-hidden border border-amber-300/80 bg-gradient-to-r from-amber-50 via-slate-100 to-amber-50 p-3 sm:p-4 text-center shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider">
                  ⛩️ Main Entrance Arch
                </span>
                <span className="text-xs font-black text-slate-900">
                  Approach Road — {approachRoadWidth}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-gray-700">
                <span>Compass Orientation:</span>
                <span className="px-2 py-0.5 bg-white rounded-md border border-gray-300 font-extrabold text-blue-900">
                  ⬆ NORTH | ➡ EAST
                </span>
              </div>
            </div>

            {/* Road Graphics with dashed center line */}
            <div className="my-2 h-7 bg-slate-800 rounded-lg flex items-center justify-center relative overflow-hidden border border-slate-900 shadow-inner">
              <div className="w-full border-t-2 border-dashed border-amber-400 opacity-80" />
              <span className="absolute text-[10px] uppercase font-black tracking-widest text-white/90 bg-slate-900/90 px-3 py-0.5 rounded-full">
                🛣️ Approach Road — {approachRoadWidth}
              </span>
            </div>
          </div>

          {/* MASTER VENTURE SECTORS & ROADWAYS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LEFT / CENTER: VENTURE PLOT BLOCKS SEPARATED BY ROADS */}
            <div className="lg:col-span-9 space-y-6">
              {/* BLOCK 1: EAST FACING RESIDENTIAL BOULEVARD */}
              <div className="bg-amber-50/30 p-4 rounded-3xl border border-amber-200/90 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌅</span>
                    <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                      Sector A: East Facing Premium Plots
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">
                      Sunrise Vastu
                    </span>
                  </div>
                  <span className="text-xs font-bold text-amber-900 font-mono">
                    {eastFacingPlots.length} Plots Demarcated
                  </span>
                </div>

                {eastFacingPlots.length === 0 ? (
                  <p className="text-xs text-gray-500 py-3 text-center">No East-facing plots matching filter.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {eastFacingPlots.map((plot) => renderPlotCard(plot))}
                  </div>
                )}
              </div>

              {/* No saved mapping connects plot frontage widths to this schematic road. */}
              <div className="h-6 bg-slate-700 rounded-lg flex items-center justify-center relative overflow-hidden border border-slate-800 shadow-inner">
                <div className="w-full border-t border-dashed border-white/60" />
                <span className="absolute text-[9px] uppercase font-black tracking-widest text-white bg-slate-800 px-3 py-0.2 rounded-full">
                  🚗 Internal Sector Road — Width unspecified
                </span>
              </div>

              {/* BLOCK 2: NORTH FACING KUBERA PLOTS & CORNERS */}
              <div className="bg-blue-50/30 p-4 rounded-3xl border border-blue-200/90 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⭐</span>
                    <h4 className="text-xs sm:text-sm font-black text-blue-950 uppercase tracking-wide">
                      Sector B: North Facing &amp; Corner Enclave
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-200 text-blue-900 font-bold">
                      Kubera Vastu
                    </span>
                  </div>
                  <span className="text-xs font-bold text-blue-900 font-mono">
                    {northFacingPlots.length + cornerPlots.length} Plots
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[...cornerPlots, ...northFacingPlots].map((plot) => renderPlotCard(plot))}
                </div>
              </div>

              {/* Do not substitute the approach width for an unmeasured internal road. */}
              <div className="h-6 bg-slate-700 rounded-lg flex items-center justify-center relative overflow-hidden border border-slate-800 shadow-inner">
                <div className="w-full border-t border-dashed border-white/60" />
                <span className="absolute text-[9px] uppercase font-black tracking-widest text-white bg-slate-800 px-3 py-0.2 rounded-full">
                  🚙 Internal Access Road — Width unspecified
                </span>
              </div>

              {/* BLOCK 3: WEST & SOUTH FACING RESIDENTIAL PLOTS */}
              <div className="bg-purple-50/20 p-4 rounded-3xl border border-purple-200/90 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-purple-200">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌇</span>
                    <h4 className="text-xs sm:text-sm font-black text-purple-950 uppercase tracking-wide">
                      Sector C &amp; D: West &amp; South Residential Rows
                    </h4>
                  </div>
                  <span className="text-xs font-bold text-purple-900 font-mono">
                    {westFacingPlots.length + southFacingPlots.length} Plots
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[...westFacingPlots, ...southFacingPlots].map((plot) => renderPlotCard(plot))}
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR: DIRECTION GUIDE & SAVED PROJECT DETAILS */}
            <div className="lg:col-span-3 space-y-4">
              {/* COMPASS ROSE WIDGET */}
              <div
                className={`p-4 rounded-3xl border text-center space-y-3 ${
                  isPresentationMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">
                  Direction Guide (Illustrative)
                </span>

                <div className="w-28 h-28 mx-auto relative flex items-center justify-center rounded-full bg-white shadow-inner border-2 border-slate-200">
                  <span className="absolute top-1 font-black text-xs text-blue-900">N ⬆</span>
                  <span className="absolute right-2 font-black text-xs text-amber-700">E ➡</span>
                  <span className="absolute bottom-1 font-black text-xs text-rose-700">S ⬇</span>
                  <span className="absolute left-2 font-black text-xs text-purple-700">⬅ W</span>
                  <div className="w-12 h-12 rounded-full border border-dashed border-slate-400 flex items-center justify-center">
                    <Compass className="w-6 h-6 text-amber-500 animate-pulse" />
                  </div>
                </div>

                <div className="text-[11px] text-gray-500 font-mono">
                  Sanctioned compass bearings: Unspecified. This guide does not represent a surveyed layout.
                </div>
              </div>

              <ProjectLayoutDetails project={project} />

              {/* FAST STATS SUMMARY */}
              <div
                className={`p-4 rounded-3xl border space-y-2 text-xs ${
                  isPresentationMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-2xs'
                }`}
              >
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Plotted Inventory</span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-600">Total Plots:</span>
                  <strong className="font-mono text-gray-900">{plots.length}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-600 font-bold">Available:</span>
                  <strong className="font-mono text-emerald-700">{availableCount}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-600 font-bold">Blocked (Token Awaited):</span>
                  <strong className="font-mono text-amber-700">{blockedCount}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-orange-600 font-bold">Token Booked:</span>
                  <strong className="font-mono text-orange-700">{reservedCount}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-red-600 font-bold">Sold / Registered:</span>
                  <strong className="font-mono text-red-700">{soldCount}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MARKETING & CHANNEL PARTNER PORTAL MODAL */}
      {showMarketingPortal && (
        <MarketingPlotPortalModal
          isOpen={showMarketingPortal}
          onClose={() => setShowMarketingPortal(false)}
          plots={plots}
          project={project}
          firm={firm}
          floorRate={floorRate}
          onSubmitProposal={(plotId, proposal) => {
            const target = plots.find((p) => p.id === plotId);
            if (target && onUpdatePlot) {
              onUpdatePlot({
                ...target,
                marketingRequest: proposal,
              });
            }
          }}
        />
      )}
    </div>
  );
};
