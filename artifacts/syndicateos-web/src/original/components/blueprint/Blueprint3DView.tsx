import React, { useMemo, useRef, useState } from 'react';
import { Maximize, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Plot } from '../../types';
import {
  DEFAULT_CAMERA, FACING_LABEL, centroid, clamp, fitCamera, normalizeLabel, project, proportionedGeometry,
  type Camera, type Geometry,
} from './blueprintGeometry';

const W = 800, H = 520, BASE = 6, SLAB = 0.8;

const STATUS_FILL: Record<string, { top: string; side: string; label: string }> = {
  available: { top: '#6EE7B7', side: '#059669', label: 'Available' },
  reserved: { top: '#FCD34D', side: '#B45309', label: 'Booked / reserved' },
  blocked: { top: '#D6D3D1', side: '#78716C', label: 'Blocked' },
  sold: { top: '#94A3B8', side: '#334155', label: 'Sold / registered' },
  reference: { top: '#F5F5F4', side: '#A8A29E', label: 'Reference only / not in inventory' },
};

/** Orthographic SVG 3D view of CONFIRMED geometry. Uniform slab thickness is a display aid, not height. */
export const Blueprint3DView: React.FC<{ geometry: Geometry; plots: Pick<Plot, 'plotNumber' | 'status'>[] }> = ({ geometry: source, plots }) => {
  const geometry = useMemo(() => proportionedGeometry(source), [source]);
  const ratioKnown = !!source.aspectRatio || !!source.scale;
  const [cam, setCam] = useState<Camera>(() => fitCamera(geometry, DEFAULT_CAMERA, BASE, W, H));
  const drag = useRef<{ x: number; y: number; cam: Camera; mode: 'rotate' | 'pan' } | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cam: Camera } | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [roadLabels, setRoadLabels] = useState(false);

  const statusByNumber = useMemo(() => {
    const m = new Map<string, string>();
    plots.forEach((p) => m.set(normalizeLabel(p.plotNumber), p.status));
    return m;
  }, [plots]);

  const faces = useMemo(() => {
    const out: Array<{ key: string; d: string; fill: string; stroke: string; depth: number; title?: string }> = [];
    const labels: Array<{ key: string; x: number; y: number; text: string; sub?: string; depth: number; muted?: boolean }> = [];
    geometry.plots.forEach((p, i) => {
      const st = p.referenceOnly ? undefined : statusByNumber.get(normalizeLabel(p.number));
      const pal = STATUS_FILL[st ?? 'reference'] ?? STATUS_FILL.reference;
      const n = p.points.length;
      for (let k = 0; k < n; k++) {
        const a = p.points[k], b = p.points[(k + 1) % n];
        const q = [project(a.x, a.y, 0, cam, BASE), project(b.x, b.y, 0, cam, BASE), project(b.x, b.y, SLAB, cam, BASE), project(a.x, a.y, SLAB, cam, BASE)];
        out.push({ key: `s${i}-${k}`, d: `M${q.map((v) => `${v.sx},${v.sy}`).join('L')}Z`, fill: pal.side, stroke: '#1C1917', depth: q.reduce((s, v) => s + v.depth, 0) / 4 - 0.01 });
      }
      const top = p.points.map((v) => project(v.x, v.y, SLAB, cam, BASE));
      out.push({ key: `t${i}`, d: `M${top.map((v) => `${v.sx},${v.sy}`).join('L')}Z`, fill: pal.top, stroke: '#44403C', depth: top.reduce((s, v) => s + v.depth, 0) / top.length, title: `Plot ${p.number} · ${FACING_LABEL[p.facing]} · ${pal.label}` });
      const c = centroid(p.points);
      const cp = project(c.x, c.y, SLAB, cam, BASE);
      labels.push({ key: `l${i}`, x: cp.sx, y: cp.sy, text: p.number, sub: p.facing === 'UNKNOWN' ? 'facing ?' : p.facing, depth: cp.depth + 1 });
    });
    (geometry.parks ?? []).forEach((k, i) => {
      if (k.points.length < 3) return;
      const top = k.points.map((v) => project(v.x, v.y, 0.25, cam, BASE));
      out.push({ key: `k${i}`, d: `M${top.map((v) => `${v.sx},${v.sy}`).join('L')}Z`, fill: '#86CF98', stroke: '#2F7D4A', depth: -5e5 + i, title: k.name || 'Open space' });
      const c = centroid(k.points); const cp = project(c.x, c.y, 0.3, cam, BASE);
      labels.push({ key: `kl${i}`, x: cp.sx, y: cp.sy, text: k.name || 'Open space', sub: 'open space', depth: cp.depth + 0.4 });
    });
    if (geometry.boundary && geometry.boundary.points.length >= 3) {
      const b = geometry.boundary.points.map((v) => project(v.x, v.y, 0, cam, BASE));
      out.push({ key: 'boundary', d: `M${b.map((v) => `${v.sx},${v.sy}`).join('L')}Z`, fill: 'none', stroke: 'boundary', depth: -2e6 });
    }
    geometry.roads.forEach((r, i) => {
      const pts = r.points.map((v) => project(v.x, v.y, 0.05, cam, BASE));
      const mid = centroid(r.points);
      const mp = project(mid.x, mid.y, 0.2, cam, BASE);
      // Keep plot numbers readable in dense layouts; internal names are opt-in.
      if (roadLabels || /approach|main road/i.test(r.name || '')) labels.push({ key: `rl${i}`, x: mp.sx, y: mp.sy, text: `${r.name || 'Road'}`, sub: r.widthFeet === null ? 'width unknown' : `${r.widthFeet} ft wide`, depth: mp.depth + 0.5, muted: r.widthFeet === null });
      if (r.points.length >= 3) out.push({ key: `r${i}`, d: `M${pts.map((v) => `${v.sx},${v.sy}`).join('L')}Z`, fill: r.widthFeet === null ? '#BDB6AA' : '#8B857B', stroke: '#57534E', depth: -1e6 + i });
      else out.push({ key: `r${i}`, d: `M${pts.map((v) => `${v.sx},${v.sy}`).join('L')}`, fill: 'none', stroke: r.widthFeet === null ? 'unknown' : 'road', depth: -1e6 + i });
    });
    out.sort((a, b) => a.depth - b.depth);
    labels.sort((a, b) => a.depth - b.depth);
    return { out, labels };
  }, [geometry, cam, statusByNumber, roadLabels]);

  const north = geometry.northDegrees;
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-bold hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

  return (
    <div className={presenting ? 'fixed inset-0 z-[100] overflow-auto bg-[#F5F1E8] p-4 sm:p-8 space-y-3' : 'space-y-2'} data-testid="blueprint-3d-view">
      {presenting && <div className="flex items-center justify-between"><p className="text-lg font-black text-stone-900">Layout presentation</p><button type="button" className={btn} onClick={() => setPresenting(false)} data-testid="button-exit-presentation">Exit presentation</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
          Illustrative 3D of the confirmed layout. Schematic placement, not a cadastral survey or legal approval. Slab thickness is uniform and not a height.
        </p>
        <p className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border ${ratioKnown ? 'text-stone-700 bg-white border-stone-200' : 'text-red-800 bg-red-50 border-red-200'}`} data-testid="text-3d-aspect">
          {source.scale ? `Workspace ${Math.round(source.scale.widthFeet)} x ${Math.round(source.scale.heightFeet)} ft (${source.scale.provenance})` : ratioKnown ? `Source page aspect ${source.aspectRatio!.toFixed(3)} (width / height) applied` : 'Source page aspect unverified: shown square as a viewing convention only'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn} aria-label="Zoom in" onClick={() => setCam((c) => ({ ...c, zoom: clamp(c.zoom * 1.2, 0.2, 8), panX: c.panX * 1.2, panY: c.panY * 1.2 }))}><ZoomIn className="w-3.5 h-3.5" /></button>
          <button type="button" className={btn} aria-label="Zoom out" onClick={() => setCam((c) => ({ ...c, zoom: clamp(c.zoom / 1.2, 0.2, 8), panX: c.panX / 1.2, panY: c.panY / 1.2 }))}><ZoomOut className="w-3.5 h-3.5" /></button>
          <button type="button" className={btn} onClick={() => setCam((c) => fitCamera(geometry, c, BASE, W, H))}><Maximize className="w-3.5 h-3.5" /> Fit</button>
          <button type="button" className={btn} onClick={() => setCam((c) => fitCamera(geometry, { ...c, yaw: 0, pitch: 90 }, BASE, W, H))}>Top</button>
          <button type="button" className={btn} onClick={() => setCam(fitCamera(geometry, DEFAULT_CAMERA, BASE, W, H))}><RotateCcw className="w-3.5 h-3.5" /> Reset</button>
          <button type="button" className={btn} aria-pressed={roadLabels} onClick={() => setRoadLabels((v) => !v)}>{roadLabels ? 'Hide internal road labels' : 'Show internal road labels'}</button>
          {!presenting && <button type="button" className={btn} onClick={() => setPresenting(true)} data-testid="button-presentation">Customer presentation</button>}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 text-[11px] text-stone-700">
        <label className="flex items-center gap-2">Rotate <input aria-label="Yaw rotation" type="range" min={-180} max={180} value={Math.round(cam.yaw)} onChange={(e) => setCam((c) => ({ ...c, yaw: Number(e.target.value) }))} className="accent-amber-600" /></label>
        <label className="flex items-center gap-2">Tilt <input aria-label="Pitch tilt" type="range" min={15} max={90} value={Math.round(cam.pitch)} onChange={(e) => setCam((c) => ({ ...c, pitch: Number(e.target.value) }))} className="accent-amber-600" /></label>
        <span className="col-span-2 text-stone-500">Drag to orbit, Shift+drag to pan, wheel or pinch to zoom.</span>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-b from-[#F7F2E7] to-[#ECE4D2] overflow-hidden">
        <svg
          viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
          className="w-full h-auto touch-none select-none cursor-grab active:cursor-grabbing"
          role="img"
          aria-label={`Illustrative 3D layout with ${geometry.plots.length} plots and ${geometry.roads.length} roads`}
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cam }; drag.current = null; return; } drag.current = { x: e.clientX, y: e.clientY, cam, mode: e.shiftKey || e.button === 1 ? 'pan' : 'rotate' }; }}
          onPointerMove={(e) => {
            if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch.current && ptrs.current.size >= 2) { const [a, b] = [...ptrs.current.values()]; const f = Math.hypot(a.x - b.x, a.y - b.y) / (pinch.current.d || 1); const c0 = pinch.current.cam; setCam({ ...c0, zoom: clamp(c0.zoom * f, 0.2, 8), panX: c0.panX * f, panY: c0.panY * f }); return; }
            const d = drag.current; if (!d) return;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            setCam(d.mode === 'pan' ? { ...d.cam, panX: d.cam.panX + dx, panY: d.cam.panY + dy } : { ...d.cam, yaw: d.cam.yaw + dx * 0.4, pitch: clamp(d.cam.pitch - dy * 0.3, 15, 90) });
          }}
          onPointerUp={(e) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = null; drag.current = null; }}
          onPointerCancel={(e) => { ptrs.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}
          onWheel={(e) => { const f = e.deltaY < 0 ? 1.1 : 1 / 1.1; setCam((c) => ({ ...c, zoom: clamp(c.zoom * f, 0.2, 8), panX: c.panX * f, panY: c.panY * f })); }}
        >
          {faces.out.map((f) => f.stroke === 'boundary' ? (
            <path key={f.key} d={f.d} fill="none" stroke="#7C2D12" strokeWidth={1.4} strokeDasharray="6 4" />
          ) : f.fill === 'none' ? (
            <path key={f.key} d={f.d} fill="none" stroke={f.stroke === 'unknown' ? '#A8A29E' : '#44403C'} strokeWidth={f.stroke === 'unknown' ? 5 : 7} strokeDasharray={f.stroke === 'unknown' ? '8 6' : undefined} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          ) : (
            <path key={f.key} d={f.d} fill={f.fill} stroke={f.stroke} strokeWidth={0.6} strokeLinejoin="round">{f.title && <title>{f.title}</title>}</path>
          ))}
          {faces.labels.map((l) => (
            <g key={l.key} pointerEvents="none">
              <text x={l.x} y={l.y - 2} textAnchor="middle" fontSize={11} fontWeight={800} fill={l.muted ? '#57534E' : '#1C1917'} stroke="#FBF8F1" strokeWidth={3} paintOrder="stroke">{l.text}</text>
              {l.sub && <text x={l.x} y={l.y + 10} textAnchor="middle" fontSize={9} fontStyle={l.muted ? 'italic' : undefined} fill={l.muted ? '#78716C' : '#44403C'} stroke="#FBF8F1" strokeWidth={2.5} paintOrder="stroke">{l.sub}</text>}
            </g>
          ))}
          <g transform={`translate(${W / 2 - 52}, ${-H / 2 + 52})`} pointerEvents="none">
            <circle r={30} fill="#FFFBEB" stroke="#B45309" strokeWidth={1.2} />
            {north === null ? (
              <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#78716C">North ?</text>
            ) : (() => {
              const t = (north * Math.PI) / 180;
              const tip = project(50 + Math.sin(t) * 10, 50 - Math.cos(t) * 10, 0, { ...cam, zoom: 1, panX: 0, panY: 0 }, 1);
              const len = Math.hypot(tip.sx, tip.sy) || 1;
              const ux = tip.sx / len, uy = tip.sy / len;
              return (
                <>
                  <line x1={-ux * 18} y1={-uy * 18} x2={ux * 18} y2={uy * 18} stroke="#92400E" strokeWidth={2.4} markerEnd="" />
                  <circle cx={ux * 18} cy={uy * 18} r={3.2} fill="#92400E" />
                  <text x={ux * 26} y={uy * 26} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={800} fill="#92400E">N</text>
                </>
              );
            })()}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-stone-700" aria-label="Legend">
        {Object.entries(STATUS_FILL).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-stone-500" style={{ background: v.top }} />{v.label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-4 border-stone-700" />Road (width recorded)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-4 border-dashed border-stone-400" />Road (width unknown)</span>
      </div>
    </div>
  );
};
