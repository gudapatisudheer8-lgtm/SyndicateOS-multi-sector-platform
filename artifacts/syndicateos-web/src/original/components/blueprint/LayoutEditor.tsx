import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, Route, Trees, Square, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, RotateCcw, RotateCw, Trash2, Magnet, Check, X, Plus } from 'lucide-react';
import {
  FACING_LABEL, areaSqFt, centroid, clamp, displayAspect, frameOf, fromFt, newId, normDeg, rectPoints, redoHistory,
  roadFromLine, rotatePoints, round2, scaleOf, snapTo, sqFtToSqYd, toFt, translatePoints, undoHistory, pushHistory,
  type Advisory, type Geometry, type History, type Pt,
} from './blueprintGeometry';

export type Sel = { kind: 'plot' | 'road' | 'park'; i: number } | { kind: 'boundary'; i: 0 } | null;
type Tool = 'select' | 'road' | 'park' | 'boundary';
type Drag =
  | { mode: 'move'; sel: Exclude<Sel, null>; start: Pt; base: Geometry }
  | { mode: 'vertex'; sel: Exclude<Sel, null>; vi: number; base: Geometry }
  | { mode: 'pan'; sx: number; sy: number; vb: VB };
type VB = { x: number; y: number; w: number; h: number };

interface Props {
  history: History;
  setHistory: (h: History | ((h: History) => History)) => void;
  unmatched: Set<string>;
  advisories: Advisory[];
  disabled?: boolean;
}

const inp = 'w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60';
const tb = (on: boolean) => `inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition-colors ${on ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-800 border-stone-300 hover:bg-amber-50'} disabled:opacity-40`;

function pointsOf(g: Geometry, s: Exclude<Sel, null>): Pt[] {
  if (s.kind === 'plot') return g.plots[s.i]?.points ?? [];
  if (s.kind === 'road') return g.roads[s.i]?.points ?? [];
  if (s.kind === 'park') return g.parks?.[s.i]?.points ?? [];
  return g.boundary?.points ?? [];
}
function withPoints(g: Geometry, s: Exclude<Sel, null>, pts: Pt[]): Geometry {
  const d: Geometry = { ...g };
  if (s.kind === 'plot') d.plots = g.plots.map((p, j) => (j === s.i ? { ...p, points: pts } : p));
  else if (s.kind === 'road') d.roads = g.roads.map((r, j) => (j === s.i ? { ...r, points: pts } : r));
  else if (s.kind === 'park') d.parks = (g.parks ?? []).map((k, j) => (j === s.i ? { ...k, points: pts } : k));
  else d.boundary = { ...(g.boundary ?? {}), points: pts };
  return d;
}
const NumField: React.FC<{ label: string; value: number | null | undefined; onCommit: (v: number | null) => void; disabled?: boolean; allowBlank?: boolean; id: string; suffix?: string }> = ({ label, value, onCommit, disabled, allowBlank, id, suffix }) => {
  const [txt, setTxt] = useState(value == null ? '' : String(round2(value)));
  useEffect(() => { setTxt(value == null ? '' : String(round2(value))); }, [value]);
  const commit = () => {
    if (txt.trim() === '') { if (allowBlank) onCommit(null); else setTxt(value == null ? '' : String(round2(value))); return; }
    const n = Number(txt);
    if (Number.isFinite(n)) onCommit(n); else setTxt(value == null ? '' : String(round2(value)));
  };
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}{suffix ? <span className="normal-case font-semibold"> ({suffix})</span> : null}
      <input className={inp} inputMode="decimal" value={txt} disabled={disabled} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} data-testid={`input-${id}`} />
    </label>
  );
};

/** Movable venture layout editor. Drawing changes never touch inventory, facing, bookings or money. */
export const LayoutEditor: React.FC<Props> = ({ history, setHistory, unmatched, advisories, disabled }) => {
  const g = history.present;
  const s = scaleOf(g);
  const ar = displayAspect(g);
  const H = 100 / ar;
  const full: VB = { x: -4, y: -4, w: 108, h: H + 8 };
  const [vb, setVb] = useState<VB>(full);
  const [sel, setSel] = useState<Sel>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [pending, setPending] = useState<Pt[]>([]);
  const [snap, setSnap] = useState(true);
  const [gridFt, setGridFt] = useState(5);
  const [roadWidth, setRoadWidth] = useState(30);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pushedRef = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; vb: VB } | null>(null);

  useEffect(() => { setVb({ x: -4, y: -4, w: 108, h: 100 / ar + 8 }); }, [ar]);
  useEffect(() => { setPending([]); }, [tool]);
  useEffect(() => { if (sel && !pointsOf(g, sel).length && sel.kind !== 'boundary') setSel(null); }, [g, sel]);

  const commit = (next: Geometry) => setHistory((h) => pushHistory(h, next));
  const live = (next: Geometry) => setHistory((h) => ({ ...h, present: next }));

  const toPlan = (e: { clientX: number; clientY: number }): Pt | null => {
    const svg = svgRef.current; const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y * ar };
  };
  const toPlanClamped = (e: { clientX: number; clientY: number }) => { const p = toPlan(e); return p ? { x: round2(clamp(p.x, 0, 100)), y: round2(clamp(p.y, 0, 100)) } : null; };
  const snapPt = (p: Pt): Pt => { if (!snap) return p; const f = toFt(p, s); return fromFt({ x: snapTo(f.x, gridFt), y: snapTo(f.y, gridFt) }, s); };
  const D = (p: Pt) => `${p.x},${p.y / ar}`;
  const poly = (pts: Pt[]) => pts.map(D).join(' ');

  const zoom = (f: number, around?: Pt) => setVb((v) => {
    const w = clamp(v.w / f, 8, 240), h = w * (v.h / v.w);
    const c = around ? { x: around.x, y: around.y / ar } : { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    return { x: c.x - (c.x - v.x) * (w / v.w), y: c.y - (c.y - v.y) * (h / v.h), w, h };
  });

  const startShapeDrag = (e: React.PointerEvent, target: Exclude<Sel, null>, vi?: number) => {
    if (disabled || tool !== 'select') return;
    e.stopPropagation();
    (svgRef.current as Element | null)?.setPointerCapture?.(e.pointerId);
    setSel(target);
    const start = toPlan(e); if (!start) return;
    pushedRef.current = false;
    drag.current = vi === undefined ? { mode: 'move', sel: target, start, base: g } : { mode: 'vertex', sel: target, vi, base: g };
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), vb }; drag.current = null; return;
    }
    if (disabled) return;
    const p = toPlanClamped(e); if (!p) return;
    if (tool === 'road') {
      const q = snapPt(p);
      if (!pending.length) { setPending([q]); return; }
      const built = roadFromLine(pending[0], q, roadWidth, s);
      if (built.lengthFeet < 1) { setPending([]); return; }
      const next = { ...g, roads: [...g.roads, { id: newId(), name: `Internal road ${g.roads.length + 1}`, widthFeet: roadWidth, lengthFeet: built.lengthFeet, rotationDegrees: built.rotationDegrees, points: built.points.map((v) => ({ x: clamp(v.x, 0, 100), y: clamp(v.y, 0, 100) })) }] };
      commit(next); setSel({ kind: 'road', i: g.roads.length }); setPending([]); setTool('select');
      return;
    }
    if (tool === 'park' || tool === 'boundary') { setPending((l) => [...l, snapPt(p)]); return; }
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vb };
    setSel(null);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const f = Math.hypot(a.x - b.x, a.y - b.y) / (pinch.current.d || 1);
      const v = pinch.current.vb; const w = clamp(v.w / f, 8, 240), h = w * (v.h / v.w);
      setVb({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h });
      return;
    }
    const d = drag.current; if (!d) return;
    if (d.mode === 'pan') {
      const r = svgRef.current?.getBoundingClientRect(); if (!r?.width) return;
      setVb({ ...d.vb, x: d.vb.x - ((e.clientX - d.sx) / r.width) * d.vb.w, y: d.vb.y - ((e.clientY - d.sy) / r.height) * d.vb.h });
      return;
    }
    const p = toPlan(e); if (!p) return;
    if (!pushedRef.current) { setHistory((h) => pushHistory(h, h.present)); pushedRef.current = true; }
    if (d.mode === 'move') {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (snap) { dx = (snapTo((dx * s.widthFeet) / 100, gridFt) * 100) / s.widthFeet; dy = (snapTo((dy * s.heightFeet) / 100, gridFt) * 100) / s.heightFeet; }
      live(withPoints(d.base, d.sel, translatePoints(pointsOf(d.base, d.sel), dx, dy)));
    } else {
      const q = snapPt({ x: clamp(p.x, 0, 100), y: clamp(p.y, 0, 100) });
      const pts = pointsOf(d.base, d.sel).map((v, j) => (j === d.vi ? { x: round2(q.x), y: round2(q.y) } : v));
      live(withPoints(d.base, d.sel, pts));
    }
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  };

  const finishPending = () => {
    if (pending.length < 3) return;
    if (tool === 'park') { commit({ ...g, parks: [...(g.parks ?? []), { id: newId(), name: `Open space ${(g.parks?.length ?? 0) + 1}`, points: pending }] }); setSel({ kind: 'park', i: g.parks?.length ?? 0 }); }
    else { commit({ ...g, boundary: { points: pending } }); setSel({ kind: 'boundary', i: 0 }); }
    setPending([]); setTool('select');
  };

  const rotateSel = (delta: number) => {
    if (!sel || sel.kind === 'boundary') return;
    const pts = rotatePoints(pointsOf(g, sel), delta, s);
    if (pts.some((v) => v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100)) return;
    const n = withPoints(g, sel, pts);
    if (sel.kind === 'plot') n.plots = n.plots.map((p, j) => (j === sel.i ? { ...p, rotationDegrees: normDeg((p.rotationDegrees ?? 0) + delta) } : p));
    if (sel.kind === 'road') n.roads = n.roads.map((r, j) => (j === sel.i ? { ...r, rotationDegrees: normDeg((r.rotationDegrees ?? 0) + delta) } : r));
    commit(n);
  };
  const removeSel = () => {
    if (!sel) return;
    if (sel.kind === 'road') commit({ ...g, roads: g.roads.filter((_, j) => j !== sel.i) });
    else if (sel.kind === 'park') commit({ ...g, parks: (g.parks ?? []).filter((_, j) => j !== sel.i) });
    else if (sel.kind === 'boundary') commit({ ...g, boundary: null });
    else return; // Plots are live inventory; they can be moved but never removed from the drawing here.
    setSel(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); setHistory((h) => (e.shiftKey ? redoHistory(h) : undoHistory(h))); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); setHistory(redoHistory); return; }
      if (e.key === 'Escape') { setPending([]); setTool('select'); return; }
      if (!sel || disabled) return;
      const step = e.shiftKey ? 5 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (mv[e.key]) { e.preventDefault(); commit(withPoints(g, sel, translatePoints(pointsOf(g, sel), mv[e.key][0], mv[e.key][1]))); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.kind !== 'plot') { e.preventDefault(); removeSel(); } }
      if (e.key === 'r' || e.key === 'R') rotateSel(e.shiftKey ? -15 : 15);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const gridLines = useMemo(() => {
    const out: Array<{ k: string; x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    const stepFt = s.widthFeet > 600 ? 50 : s.widthFeet > 200 ? 25 : 10;
    for (let f = 0, n = 0; f <= s.widthFeet + 0.01; f += stepFt, n++) { const x = (f * 100) / s.widthFeet; out.push({ k: `x${n}`, x1: x, y1: 0, x2: x, y2: H, major: n % 4 === 0 }); }
    for (let f = 0, n = 0; f <= s.heightFeet + 0.01; f += stepFt, n++) { const y = ((f * 100) / s.heightFeet) / ar; out.push({ k: `y${n}`, x1: 0, y1: y, x2: 100, y2: y, major: n % 4 === 0 }); }
    return out;
  }, [s.widthFeet, s.heightFeet, H, ar]);

  const selPts = sel ? pointsOf(g, sel) : [];
  const frame = sel && sel.kind !== 'boundary' ? frameOf(selPts, sel.kind === 'plot' ? g.plots[sel.i]?.rotationDegrees ?? 0 : sel.kind === 'road' ? g.roads[sel.i]?.rotationDegrees ?? 0 : 0, s) : null;
  const centerFt = frame ? toFt(frame.center, s) : null;
  const rebuild = (cx: number, cy: number, w: number, d: number, rotDeg: number) => {
    if (!sel || sel.kind === 'boundary' || !(w > 0) || !(d > 0)) return;
    const pts = rectPoints(fromFt({ x: cx, y: cy }, s), w, d, rotDeg, s);
    if (pts.some((v) => v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100)) return;
    let n = withPoints(g, sel, pts);
    if (sel.kind === 'road') n = { ...n, roads: n.roads.map((r, j) => (j === sel.i ? { ...r, lengthFeet: round2(w), widthFeet: round2(d), rotationDegrees: normDeg(rotDeg) } : r)) };
    if (sel.kind === 'plot') n = { ...n, plots: n.plots.map((p, j) => (j === sel.i ? { ...p, rotationDegrees: normDeg(rotDeg) } : p)) };
    commit(n);
  };
  const rotOfSel = sel?.kind === 'plot' ? g.plots[sel.i]?.rotationDegrees ?? 0 : sel?.kind === 'road' ? g.roads[sel.i]?.rotationDegrees ?? 0 : 0;

  const shapeOptions = [
    ...g.plots.map((p, i) => ({ v: `plot:${i}`, l: `Plot ${p.number || i + 1}${unmatched.has(p.number) ? ' (not in inventory)' : ''}` })),
    ...g.roads.map((r, i) => ({ v: `road:${i}`, l: r.name || `Road ${i + 1}` })),
    ...(g.parks ?? []).map((k, i) => ({ v: `park:${i}`, l: k.name || `Open space ${i + 1}` })),
    ...(g.boundary?.points.length ? [{ v: 'boundary:0', l: 'Site boundary' }] : []),
  ];

  const plotFill = (i: number) => {
    const p = g.plots[i];
    if (unmatched.has(p.number) && !p.referenceOnly) return '#FECACA';
    if (p.measurementSource === 'recorded') return '#FDE7B0';
    return '#F5EBD3';
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4" data-testid="layout-editor">
      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Layout tools">
          <button type="button" className={tb(tool === 'select')} onClick={() => setTool('select')} data-testid="tool-select"><MousePointer2 className="w-3.5 h-3.5" />Move</button>
          <button type="button" className={tb(tool === 'road')} disabled={disabled} onClick={() => setTool('road')} data-testid="tool-road"><Route className="w-3.5 h-3.5" />Add road</button>
          <button type="button" className={tb(tool === 'park')} disabled={disabled} onClick={() => setTool('park')} data-testid="tool-park"><Trees className="w-3.5 h-3.5" />Draw open space</button>
          <button type="button" className={tb(tool === 'boundary')} disabled={disabled} onClick={() => setTool('boundary')} data-testid="tool-boundary"><Square className="w-3.5 h-3.5" />{g.boundary?.points.length ? 'Redraw boundary' : 'Site boundary'}</button>
          <span className="w-px h-6 bg-stone-300 mx-1" />
          <button type="button" className={tb(false)} disabled={!history.past.length || disabled} onClick={() => setHistory(undoHistory)} aria-label="Undo" data-testid="button-undo"><Undo2 className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb(false)} disabled={!history.future.length || disabled} onClick={() => setHistory(redoHistory)} aria-label="Redo" data-testid="button-redo"><Redo2 className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb(snap)} onClick={() => setSnap((v) => !v)} aria-pressed={snap} data-testid="button-snap"><Magnet className="w-3.5 h-3.5" />Snap {gridFt} ft</button>
          <select aria-label="Snap grid" value={gridFt} onChange={(e) => setGridFt(Number(e.target.value))} className="rounded-lg border border-stone-300 bg-white px-1.5 py-1.5 text-[11px] font-bold" data-testid="select-grid">
            {[1, 2.5, 5, 10, 25].map((v) => <option key={v} value={v}>{v} ft</option>)}
          </select>
          <span className="w-px h-6 bg-stone-300 mx-1" />
          <button type="button" className={tb(false)} onClick={() => zoom(1.25)} aria-label="Zoom in" data-testid="button-editor-zoom-in"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb(false)} onClick={() => zoom(1 / 1.25)} aria-label="Zoom out" data-testid="button-editor-zoom-out"><ZoomOut className="w-3.5 h-3.5" /></button>
          <button type="button" className={tb(false)} onClick={() => setVb(full)} data-testid="button-editor-fit"><Maximize className="w-3.5 h-3.5" />Fit</button>
        </div>
        {tool === 'road' && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
            {pending.length ? 'Now tap the road end point.' : 'Tap the road start point, then the end point.'}
            <label className="inline-flex items-center gap-1 font-bold">Width <input className="w-16 rounded border border-amber-400 bg-white px-1.5 py-0.5 tabular-nums" inputMode="decimal" value={roadWidth} onChange={(e) => setRoadWidth(Math.max(1, Number(e.target.value) || 0))} data-testid="input-new-road-width" /> ft</label>
            <button type="button" className="ml-auto underline font-bold" onClick={() => { const c = { x: 50, y: 50 }; const w = Math.min(s.widthFeet * 0.6, 300); const pts = rectPoints(c, w, roadWidth, 0, s); commit({ ...g, roads: [...g.roads, { id: newId(), name: `Internal road ${g.roads.length + 1}`, widthFeet: roadWidth, lengthFeet: round2(w), rotationDegrees: 0, points: pts }] }); setSel({ kind: 'road', i: g.roads.length }); setTool('select'); }} data-testid="button-add-road-numeric">Add by numbers instead</button>
          </div>
        )}
        {(tool === 'park' || tool === 'boundary') && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-950" role="status">
            Tap corners in order ({pending.length} placed). Finish with at least 3.
            <button type="button" className={tb(false)} disabled={pending.length < 3} onClick={finishPending} data-testid="button-finish-shape"><Check className="w-3.5 h-3.5" />Finish</button>
            <button type="button" className={tb(false)} onClick={() => { setPending([]); setTool('select'); }}><X className="w-3.5 h-3.5" />Cancel</button>
            {tool === 'park' && <button type="button" className="ml-auto underline font-bold" onClick={() => { const side = Math.sqrt(Math.max(400, ((g.parks?.[0]?.targetAreaSqYards ?? 0) * 9) || 2500)); commit({ ...g, parks: [...(g.parks ?? []), { id: newId(), name: `Open space ${(g.parks?.length ?? 0) + 1}`, points: rectPoints({ x: 50, y: 50 }, side, side, 0, s) }] }); setSel({ kind: 'park', i: g.parks?.length ?? 0 }); setTool('select'); }} data-testid="button-add-park-rect">Add a square block</button>}
          </div>
        )}
        <div className="relative rounded-2xl border border-stone-300 bg-[#FBF8F1] overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className={`w-full touch-none select-none ${tool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ aspectRatio: `${vb.w} / ${vb.h}`, maxHeight: '72vh' }}
            role="application"
            aria-label="Layout canvas. Drag a block to move it; drag empty space to pan; pinch or scroll to zoom."
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={(e) => { const p = toPlan(e); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, p ?? undefined); }}
            data-testid="canvas-layout"
          >
            <rect x={0} y={0} width={100} height={H} fill="#FFFDF7" stroke="#D6CBB4" strokeWidth={0.2} />
            {gridLines.map((l) => <line key={l.k} {...l} stroke={l.major ? '#E7DCC4' : '#F1EADB'} strokeWidth={l.major ? 0.12 : 0.06} />)}
            {g.boundary?.points.length ? <polygon points={poly(g.boundary.points)} fill="none" stroke="#7C2D12" strokeWidth={0.35} strokeDasharray="1.2 0.8" onPointerDown={(e) => startShapeDrag(e, { kind: 'boundary', i: 0 })} /> : null}
            {(g.parks ?? []).map((k, i) => (
              <g key={k.id} onPointerDown={(e) => startShapeDrag(e, { kind: 'park', i })} data-testid={`shape-park-${i}`}>
                <polygon points={poly(k.points)} fill="#BBE3C3" stroke={sel?.kind === 'park' && sel.i === i ? '#D97706' : '#2F7D4A'} strokeWidth={sel?.kind === 'park' && sel.i === i ? 0.5 : 0.25} />
                <text x={centroid(k.points).x} y={centroid(k.points).y / ar} fontSize={1.8} textAnchor="middle" fill="#1F5131" fontWeight={700} pointerEvents="none">{k.name}</text>
              </g>
            ))}
            {g.roads.map((r, i) => {
              const on = sel?.kind === 'road' && sel.i === i; const c = centroid(r.points);
              return (
                <g key={r.id ?? `r${i}`} onPointerDown={(e) => startShapeDrag(e, { kind: 'road', i })} data-testid={`shape-road-${i}`}>
                  {r.points.length >= 3
                    ? <polygon points={poly(r.points)} fill="#9C958A" stroke={on ? '#D97706' : '#57534E'} strokeWidth={on ? 0.5 : 0.15} />
                    : <polyline points={poly(r.points)} fill="none" stroke={on ? '#D97706' : '#9C958A'} strokeWidth={1.4} />}
                  <text x={c.x} y={c.y / ar} fontSize={1.5} textAnchor="middle" fill="#FFFDF7" fontWeight={700} pointerEvents="none">{r.name}{r.widthFeet ? ` · ${r.widthFeet} ft` : ''}</text>
                </g>
              );
            })}
            {g.plots.map((p, i) => {
              const on = sel?.kind === 'plot' && sel.i === i; const c = centroid(p.points);
              return (
                <g key={p.id ?? `p${i}`} onPointerDown={(e) => startShapeDrag(e, { kind: 'plot', i })} data-testid={`shape-plot-${i}`}>
                  <polygon points={poly(p.points)} fill={plotFill(i)} stroke={on ? '#D97706' : '#57534E'} strokeWidth={on ? 0.55 : 0.18} strokeDasharray={p.measurementSource === 'schematic' ? '0.6 0.4' : undefined} />
                  <text x={c.x} y={c.y / ar + 0.6} fontSize={1.9} textAnchor="middle" fill="#1C1917" fontWeight={800} pointerEvents="none">{p.number}</text>
                </g>
              );
            })}
            {sel && (sel.kind === 'park' || sel.kind === 'boundary') && tool === 'select' && selPts.map((v, j) => (
              <circle key={j} cx={v.x} cy={v.y / ar} r={Math.max(0.7, vb.w / 90)} fill="#FFFDF7" stroke="#D97706" strokeWidth={0.3} onPointerDown={(e) => startShapeDrag(e, sel, j)} data-testid={`handle-vertex-${j}`} />
            ))}
            {pending.map((v, j) => <circle key={`pd${j}`} cx={v.x} cy={v.y / ar} r={0.8} fill="#D97706" />)}
            {pending.length > 1 && tool !== 'road' && <polyline points={poly(pending)} fill="none" stroke="#D97706" strokeWidth={0.3} />}
            {g.northDegrees != null && (
              <g transform={`translate(${vb.x + vb.w - 5} ${vb.y + 5}) rotate(${g.northDegrees})`} pointerEvents="none">
                <circle r={3} fill="#FFFBEB" stroke="#B45309" strokeWidth={0.2} />
                <path d="M0,-2.4 L1,0.8 L0,0.2 L-1,0.8 Z" fill="#92400E" />
                <text y={-0.2} fontSize={1.4} textAnchor="middle" fill="#FFFBEB" fontWeight={800} transform="translate(0 2.2)">N</text>
              </g>
            )}
          </svg>
        </div>
        <p className="text-[11px] text-stone-600">
          Workspace {round2(s.widthFeet)} x {round2(s.heightFeet)} ft ({s.provenance === 'schematic' ? 'schematic convention, not surveyed' : 'entered by a reviewer'}). Solid edges = recorded dimensions; dashed = schematic placement. Keyboard: arrows nudge, R rotates, Ctrl+Z / Ctrl+Y.
        </p>
      </div>

      <aside className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3 self-start" aria-label="Inspector" data-testid="panel-inspector">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">Select shape
          <select className={inp} value={sel ? `${sel.kind}:${sel.i}` : ''} onChange={(e) => { const [k, n] = e.target.value.split(':'); setSel(k ? ({ kind: k, i: Number(n) } as Sel) : null); }} data-testid="select-shape">
            <option value="">Nothing selected</option>
            {shapeOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>

        {sel && sel.kind === 'plot' && g.plots[sel.i] && (() => { const p = g.plots[sel.i]; return (
          <div className="space-y-2" data-testid="inspector-plot">
            <div className="rounded-xl bg-stone-50 border border-stone-200 p-2.5 text-xs space-y-0.5">
              <p className="font-black text-stone-900 text-sm">Plot {p.number}</p>
              <p className="text-stone-700">Facing <b>{FACING_LABEL[p.facing]}</b> (operational, read-only)</p>
              <p className="text-stone-700">Recorded: {p.dimensions || 'dimensions not recorded'}{p.areaSqYards ? ` · ${round2(p.areaSqYards)} sq yd` : ''}</p>
              <p className={p.measurementSource === 'recorded' ? 'text-emerald-800 font-semibold' : 'text-amber-800 font-semibold'}>{p.measurementSource === 'recorded' ? 'Block sized from recorded dimensions' : 'Schematic size and placement'}</p>
              {!p.id && <p className="text-stone-500">Legacy traced plot, not linked by ID.</p>}
            </div>
            {frame && centerFt && <>
              <div className="grid grid-cols-2 gap-2">
                <NumField id="plot-x" label="Centre X" suffix="ft" value={centerFt.x} disabled={disabled} onCommit={(v) => v != null && rebuild(v, centerFt.y, frame.widthFt, frame.depthFt, rotOfSel)} />
                <NumField id="plot-y" label="Centre Y" suffix="ft" value={centerFt.y} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, v, frame.widthFt, frame.depthFt, rotOfSel)} />
                <NumField id="plot-w" label="Drawn width" suffix="ft" value={frame.widthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, centerFt.y, v, frame.depthFt, rotOfSel)} />
                <NumField id="plot-d" label="Drawn depth" suffix="ft" value={frame.depthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, centerFt.y, frame.widthFt, v, rotOfSel)} />
              </div>
              <p className="text-[11px] text-stone-500">Drawn area {Math.round(sqFtToSqYd(areaSqFt(p.points, s)))} sq yd. Resizing the drawing does not change saleable area.</p>
            </>}
          </div>
        ); })()}

        {sel && sel.kind === 'road' && g.roads[sel.i] && frame && centerFt && (() => { const r = g.roads[sel.i]; return (
          <div className="space-y-2" data-testid="inspector-road">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">Road name
              <input className={inp} value={r.name} disabled={disabled} onChange={(e) => live({ ...g, roads: g.roads.map((x, j) => (j === sel.i ? { ...x, name: e.target.value } : x)) })} onFocus={() => commit(g)} data-testid="input-road-name" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <NumField id="road-length" label="Length" suffix="ft" value={r.lengthFeet ?? frame.widthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, centerFt.y, v, r.widthFeet ?? frame.depthFt, rotOfSel)} />
              <NumField id="road-width" label="Width" suffix="ft" value={r.widthFeet} allowBlank disabled={disabled} onCommit={(v) => { if (v == null) commit({ ...g, roads: g.roads.map((x, j) => (j === sel.i ? { ...x, widthFeet: null } : x)) }); else rebuild(centerFt.x, centerFt.y, r.lengthFeet ?? frame.widthFt, v, rotOfSel); }} />
              <NumField id="road-x" label="Centre X" suffix="ft" value={centerFt.x} disabled={disabled} onCommit={(v) => v != null && rebuild(v, centerFt.y, r.lengthFeet ?? frame.widthFt, r.widthFeet ?? frame.depthFt, rotOfSel)} />
              <NumField id="road-y" label="Centre Y" suffix="ft" value={centerFt.y} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, v, r.lengthFeet ?? frame.widthFt, r.widthFeet ?? frame.depthFt, rotOfSel)} />
            </div>
            <p className="text-[11px] text-stone-500">Width is the carriageway across; length runs along the road. Blank width means unknown.</p>
          </div>
        ); })()}

        {sel && sel.kind === 'park' && g.parks?.[sel.i] && frame && centerFt && (() => { const k = g.parks![sel.i]; const drawn = sqFtToSqYd(areaSqFt(k.points, s)); return (
          <div className="space-y-2" data-testid="inspector-park">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">Name
              <input className={inp} value={k.name} disabled={disabled} onFocus={() => commit(g)} onChange={(e) => live({ ...g, parks: g.parks!.map((x, j) => (j === sel.i ? { ...x, name: e.target.value } : x)) })} data-testid="input-park-name" />
            </label>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs">
              <p>Drawn <b className="tabular-nums">{Math.round(drawn).toLocaleString('en-IN')} sq yd</b>{s.provenance === 'schematic' ? ' (schematic scale)' : ''}</p>
              <p>Configured target <b className="tabular-nums">{k.targetAreaSqYards ? `${Math.round(k.targetAreaSqYards).toLocaleString('en-IN')} sq yd` : 'not configured'}</b></p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumField id="park-w" label="Width" suffix="ft" value={frame.widthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, centerFt.y, v, frame.depthFt, 0)} />
              <NumField id="park-d" label="Depth" suffix="ft" value={frame.depthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, centerFt.y, frame.widthFt, v, 0)} />
            </div>
            {k.targetAreaSqYards ? <button type="button" className={tb(false)} disabled={disabled} onClick={() => { const side = Math.sqrt(k.targetAreaSqYards! * 9); rebuild(centerFt.x, centerFt.y, side, side, 0); }} data-testid="button-park-match-target">Resize to target area</button> : null}
            <p className="text-[11px] text-stone-500">Drag the corner handles to reshape. Width/depth rebuilds a rectangle.</p>
            <div className="flex gap-1.5">
              <button type="button" className={tb(false)} disabled={disabled} onClick={() => { const pts = k.points; const a = pts[pts.length - 1], b = pts[0]; commit(withPoints(g, sel, [...pts, { x: round2((a.x + b.x) / 2), y: round2((a.y + b.y) / 2) }])); }} data-testid="button-add-vertex"><Plus className="w-3.5 h-3.5" />Corner</button>
              <button type="button" className={tb(false)} disabled={disabled || k.points.length <= 3} onClick={() => commit(withPoints(g, sel, k.points.slice(0, -1)))} data-testid="button-remove-vertex">Remove last corner</button>
            </div>
          </div>
        ); })()}

        {sel && sel.kind === 'boundary' && <p className="text-xs text-stone-700" data-testid="inspector-boundary">Site boundary: drag corner handles to adjust. Optional; used only for advisory checks. {g.boundary?.points.length ? `Encloses ${Math.round(sqFtToSqYd(areaSqFt(g.boundary.points, s))).toLocaleString('en-IN')} sq yd at the workspace scale.` : ''}</p>}

        {sel && (
          <div className="flex flex-wrap gap-1.5 border-t border-stone-200 pt-2">
            {sel.kind !== 'boundary' && <>
              <button type="button" className={tb(false)} disabled={disabled} onClick={() => rotateSel(-15)} aria-label="Rotate 15 degrees anticlockwise" data-testid="button-rotate-left"><RotateCcw className="w-3.5 h-3.5" />15°</button>
              <button type="button" className={tb(false)} disabled={disabled} onClick={() => rotateSel(15)} aria-label="Rotate 15 degrees clockwise" data-testid="button-rotate-right"><RotateCw className="w-3.5 h-3.5" />15°</button>
              {(sel.kind === 'plot' || sel.kind === 'road') && frame && centerFt && <div className="w-20"><NumField id="rotation" label="Angle" value={rotOfSel} disabled={disabled} onCommit={(v) => v != null && rebuild(centerFt.x, centerFt.y, sel.kind === 'road' ? g.roads[sel.i].lengthFeet ?? frame.widthFt : frame.widthFt, sel.kind === 'road' ? g.roads[sel.i].widthFeet ?? frame.depthFt : frame.depthFt, v)} /></div>}
            </>}
            {sel.kind !== 'plot' && <button type="button" className={`${tb(false)} text-red-700`} disabled={disabled} onClick={removeSel} data-testid="button-remove-shape"><Trash2 className="w-3.5 h-3.5" />Remove</button>}
            {sel.kind === 'plot' && <p className="text-[11px] text-stone-500 w-full">Rotating a block never changes its recorded facing.</p>}
          </div>
        )}

        <div className="border-t border-stone-200 pt-2 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Workspace</p>
          <div className="grid grid-cols-2 gap-2">
            <NumField id="scale-w" label="Width" suffix="ft" value={s.widthFeet} disabled={disabled} onCommit={(v) => v != null && v > 0 && commit({ ...g, units: 'feet', scale: { widthFeet: v, heightFeet: s.heightFeet, provenance: 'user-entered' } })} />
            <NumField id="scale-h" label="Height" suffix="ft" value={s.heightFeet} disabled={disabled} onCommit={(v) => v != null && v > 0 && commit({ ...g, units: 'feet', scale: { widthFeet: s.widthFeet, heightFeet: v, provenance: 'user-entered' } })} />
            <NumField id="north" label="North" suffix="deg, blank = unknown" value={g.northDegrees} allowBlank disabled={disabled} onCommit={(v) => commit({ ...g, northDegrees: v == null ? null : normDeg(v) })} />
          </div>
          <p className="text-[11px] text-stone-500">Changing workspace feet rescales how existing shapes read; it is a drawing convention, not a survey.</p>
        </div>

        <div className="border-t border-stone-200 pt-2 space-y-1" data-testid="list-advisories">
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Advisory checks ({advisories.length})</p>
          {advisories.length === 0 ? <p className="text-xs text-emerald-800">No schematic warnings.</p> : advisories.map((a, i) => <p key={i} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">{a.text}</p>)}
          <p className="text-[10px] text-stone-500">Advisories do not block saving. Invalid shapes do.</p>
        </div>
      </aside>
    </div>
  );
};

