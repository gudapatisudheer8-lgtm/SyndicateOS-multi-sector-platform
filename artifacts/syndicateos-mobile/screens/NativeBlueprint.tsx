import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Circle, G, Line as SLine, Path, Polygon, Polyline, Rect, Text as SText } from 'react-native-svg';
import { generateProjectLayout, getProjectBlueprint, saveProjectBlueprint, type LayoutGeometry, type ProjectErp } from '@workspace/api-client-react';
import { Badge, Banner, Btn, Card, Chips, Confirm, Skeleton } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { nativeApi } from '@/lib/native-api';
import { attachmentsSupported, fetchAttachmentBlob, pickFile, saveBlob, uploadAttachment, validateFile } from '@/lib/attachments';
import { newRequestId } from '@/lib/erp';
import { errMessage } from '@/lib/session';
import { useRun } from '@/lib/workspace';
import { guardLeave, registerLeaveGuard } from '@/lib/leaveGuard';
import {
  DEFAULT_CAMERA, FACING_LABEL, SUPPORTED_TYPES, areaSqFt, centroid, clamp, displayAspect, fitCamera, frameOf, fromFt, historyOf,
  layoutAdvisories, newId, normDeg, normalizeForEdit, normalizeLabel, pointInPolygon, project, proportionedGeometry, pushHistory,
  rectPoints, redoHistory, roadFromLine, rotatePoints, round2, scaleOf, snapTo, sqFtToSqYd, toFt, translatePoints, undoHistory,
  unmatchedPlotNumbers, validateGeometry,
  type BlueprintState, type Camera, type Geometry, type History, type Pt,
} from '@/lib/blueprintGeometry';

const api = {
  get: (p: string) => getProjectBlueprint(p) as unknown as Promise<BlueprintState>,
  generate: (p: string, revision: number) => generateProjectLayout(p, { revision }) as unknown as Promise<BlueprintState>,
  save: (p: string, body: { attachmentId: string | null; revision: number; geometry: Geometry; confirm: boolean; reviewAcknowledged: boolean }) =>
    saveProjectBlueprint(p, { ...body, geometry: body.geometry as unknown as LayoutGeometry }) as unknown as Promise<BlueprintState>,
  // Optional billed AI tracing has no generated client; kept on the existing ERP path.
  analyze: (p: string, attachmentId: string, revision: number) => nativeApi<BlueprintState>(`/api/erp/${p}/blueprint/analyze`, { method: 'POST', body: { attachmentId, revision } }),
};

/* ---- original plan preview ---- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(u: Uint8Array): string {
  let out = '';
  for (let i = 0; i < u.length; i += 3) {
    const a = u[i], b = u[i + 1], c = u[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
  }
  return out;
}
function Original({ projectId, att }: { projectId: string; att: BlueprintState['attachments'][number] }) {
  const c = useColors();
  const [uri, setUri] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true; let made: string | null = null;
    setUri(null); setErr('');
    if (att.contentType === 'application/pdf') return;
    fetchAttachmentBlob(projectId, att.id).then(async (b) => {
      if (!alive) return;
      if (Platform.OS === 'web') { made = URL.createObjectURL(b); setUri(made); return; }
      const ab = (b as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer;
      if (typeof ab !== 'function') { setErr('This device cannot preview the plan inline. Use Download original.'); return; }
      const buf = await ab.call(b);
      if (alive) setUri(`data:${att.contentType};base64,${toBase64(new Uint8Array(buf))}`);
    }).catch((e) => alive && setErr(errMessage(e)));
    return () => { alive = false; if (made && Platform.OS === 'web') URL.revokeObjectURL(made); };
  }, [projectId, att.id, att.contentType]);
  const download = async () => { try { saveBlob(await fetchAttachmentBlob(projectId, att.id), att.fileName); } catch (e) { setErr(errMessage(e)); } };
  return (
    <Card>
      <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 8 }}>{att.fileName}</Text>
      {err ? <Banner tone="error" title={err} /> : null}
      {att.contentType === 'application/pdf' ? <Text style={{ color: c.mutedForeground, marginBottom: 8 }}>PDF plans open with the device viewer.</Text> : uri ? <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', height: 360, backgroundColor: c.muted, borderRadius: 12 }} accessibilityLabel={`Original plan ${att.fileName}`} /> : <Skeleton lines={3} />}
      <Btn label="Download original" icon="download" variant="ghost" onPress={() => void download()} />
    </Card>
  );
}

/* ---- numeric field committing on end of editing ---- */
function Num({ label, value, onCommit, allowBlank, disabled }: { label: string; value: number | null | undefined; onCommit: (v: number | null) => void; allowBlank?: boolean; disabled?: boolean }) {
  const c = useColors();
  const show = value == null ? '' : String(round2(value));
  const [t, setT] = useState(show);
  useEffect(() => setT(show), [show]);
  const commit = () => {
    if (t.trim() === '') { if (allowBlank) onCommit(null); else setT(show); return; }
    const n = Number(t); if (Number.isFinite(n)) onCommit(n); else setT(show);
  };
  return (
    <View style={{ flex: 1, minWidth: 120, marginBottom: 8 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 3 }}>{label}</Text>
      <TextInput value={t} onChangeText={setT} onEndEditing={commit} onSubmitEditing={commit} onBlur={commit} editable={!disabled} keyboardType="numeric" returnKeyType="done"
        accessibilityLabel={label} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: c.foreground, backgroundColor: c.card }} />
    </View>
  );
}

/* ---- movable layout editor ---- */
type Sel = { kind: 'plot' | 'road' | 'park' | 'boundary'; i: number } | null;
type Tool = 'select' | 'road' | 'park' | 'boundary';
type VB = { x: number; y: number; w: number; h: number };
function ptsOf(g: Geometry, s: NonNullable<Sel>): Pt[] {
  if (s.kind === 'plot') return g.plots[s.i]?.points ?? [];
  if (s.kind === 'road') return g.roads[s.i]?.points ?? [];
  if (s.kind === 'park') return g.parks?.[s.i]?.points ?? [];
  return g.boundary?.points ?? [];
}
function withPts(g: Geometry, s: NonNullable<Sel>, pts: Pt[]): Geometry {
  const d: Geometry = { ...g };
  if (s.kind === 'plot') d.plots = g.plots.map((p, j) => (j === s.i ? { ...p, points: pts } : p));
  else if (s.kind === 'road') d.roads = g.roads.map((r, j) => (j === s.i ? { ...r, points: pts } : r));
  else if (s.kind === 'park') d.parks = (g.parks ?? []).map((k, j) => (j === s.i ? { ...k, points: pts } : k));
  else d.boundary = { ...(g.boundary ?? {}), points: pts };
  return d;
}

function LayoutEditor({ hist, setHist, unmatched, disabled }: { hist: History; setHist: (f: (h: History) => History) => void; unmatched: Set<string>; disabled: boolean }) {
  const c = useColors();
  const g = hist.present;
  const s = scaleOf(g);
  const ar = displayAspect(g);
  const H = 100 / ar;
  const full: VB = { x: -3, y: -3, w: 106, h: H + 6 };
  const [vb, setVb] = useState<VB>(full);
  const [w, setW] = useState(320);
  const [sel, setSel] = useState<Sel>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [pending, setPending] = useState<Pt[]>([]);
  const [snap, setSnap] = useState(true);
  const [roadWidth, setRoadWidth] = useState(30);
  const boxRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const gest = useRef<{ mode: 'move' | 'vertex' | 'pan' | 'tap'; sel?: NonNullable<Sel>; vi?: number; start: Pt; px: number; py: number; vb: VB; base: Geometry; pushed: boolean; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; vb: VB } | null>(null);
  const GRID = 5;
  const viewH = (w * vb.h) / vb.w;

  useEffect(() => { setVb({ x: -3, y: -3, w: 106, h: 100 / ar + 6 }); }, [ar]);
  useEffect(() => { setPending([]); }, [tool]);

  const commit = (n: Geometry) => setHist((h) => pushHistory(h, n));
  const toPlan = (pageX: number, pageY: number, v: VB = vb): Pt => {
    const lx = pageX - origin.current.x, ly = pageY - origin.current.y;
    return { x: v.x + (lx / w) * v.w, y: (v.y + (ly / viewH) * v.h) * ar };
  };
  const snapPt = (p: Pt): Pt => { const q = { x: clamp(p.x, 0, 100), y: clamp(p.y, 0, 100) }; if (!snap) return { x: round2(q.x), y: round2(q.y) }; const f = toFt(q, s); const r = fromFt({ x: snapTo(f.x, GRID), y: snapTo(f.y, GRID) }, s); return { x: round2(clamp(r.x, 0, 100)), y: round2(clamp(r.y, 0, 100)) }; };
  const hit = (p: Pt): NonNullable<Sel> | null => {
    for (let i = g.plots.length - 1; i >= 0; i--) if (pointInPolygon(p, g.plots[i].points)) return { kind: 'plot', i };
    for (let i = g.roads.length - 1; i >= 0; i--) if (g.roads[i].points.length >= 3 && pointInPolygon(p, g.roads[i].points)) return { kind: 'road', i };
    const parks = g.parks ?? [];
    for (let i = parks.length - 1; i >= 0; i--) if (pointInPolygon(p, parks[i].points)) return { kind: 'park', i };
    return null;
  };
  const tap = (p: Pt) => {
    if (disabled) return;
    if (tool === 'road') {
      const q = snapPt(p);
      if (!pending.length) { setPending([q]); return; }
      const b = roadFromLine(pending[0], q, roadWidth, s);
      setPending([]);
      if (b.lengthFeet < 1) return;
      commit({ ...g, roads: [...g.roads, { id: newId(), name: `Internal road ${g.roads.length + 1}`, widthFeet: roadWidth, lengthFeet: b.lengthFeet, rotationDegrees: b.rotationDegrees, points: b.points.map((v) => ({ x: clamp(v.x, 0, 100), y: clamp(v.y, 0, 100) })) }] });
      setSel({ kind: 'road', i: g.roads.length }); setTool('select');
      return;
    }
    if (tool === 'park' || tool === 'boundary') { setPending((l) => [...l, snapPt(p)]); return; }
    setSel(hit(p));
  };
  const finish = () => {
    if (pending.length < 3) return;
    if (tool === 'park') { commit({ ...g, parks: [...(g.parks ?? []), { id: newId(), name: `Open space ${(g.parks?.length ?? 0) + 1}`, points: pending }] }); setSel({ kind: 'park', i: g.parks?.length ?? 0 }); }
    else { commit({ ...g, boundary: { points: pending } }); setSel({ kind: 'boundary', i: 0 }); }
    setPending([]); setTool('select');
  };
  const rotateSel = (d: number) => {
    if (!sel || sel.kind === 'boundary') return;
    const pts = rotatePoints(ptsOf(g, sel), d, s);
    if (pts.some((v) => v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100)) return;
    const n = withPts(g, sel, pts);
    if (sel.kind === 'plot') n.plots = n.plots.map((p, j) => (j === sel.i ? { ...p, rotationDegrees: normDeg((p.rotationDegrees ?? 0) + d) } : p));
    if (sel.kind === 'road') n.roads = n.roads.map((r, j) => (j === sel.i ? { ...r, rotationDegrees: normDeg((r.rotationDegrees ?? 0) + d) } : r));
    commit(n);
  };
  const nudge = (dx: number, dy: number) => { if (sel) commit(withPts(g, sel, translatePoints(ptsOf(g, sel), dx, dy))); };
  const removeSel = () => {
    if (!sel || sel.kind === 'plot') return;
    if (sel.kind === 'road') commit({ ...g, roads: g.roads.filter((_, j) => j !== sel.i) });
    else if (sel.kind === 'park') commit({ ...g, parks: (g.parks ?? []).filter((_, j) => j !== sel.i) });
    else commit({ ...g, boundary: null });
    setSel(null);
  };
  const zoom = (f: number) => setVb((v) => { const nw = clamp(v.w / f, 8, 240), nh = nw * (v.h / v.w); return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh }; });

  const rotOf = sel?.kind === 'plot' ? g.plots[sel.i]?.rotationDegrees ?? 0 : sel?.kind === 'road' ? g.roads[sel.i]?.rotationDegrees ?? 0 : 0;
  const selPts = sel ? ptsOf(g, sel) : [];
  const frame = sel && sel.kind !== 'boundary' && selPts.length ? frameOf(selPts, rotOf, s) : null;
  const cFt = frame ? toFt(frame.center, s) : null;
  const rebuild = (cx: number, cy: number, wf: number, df: number, rd: number) => {
    if (!sel || sel.kind === 'boundary' || !(wf > 0) || !(df > 0)) return;
    const pts = rectPoints(fromFt({ x: cx, y: cy }, s), wf, df, rd, s);
    if (pts.some((v) => v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100)) return;
    let n = withPts(g, sel, pts);
    if (sel.kind === 'road') n = { ...n, roads: n.roads.map((r, j) => (j === sel.i ? { ...r, lengthFeet: round2(wf), widthFeet: round2(df), rotationDegrees: normDeg(rd) } : r)) };
    if (sel.kind === 'plot') n = { ...n, plots: n.plots.map((p, j) => (j === sel.i ? { ...p, rotationDegrees: normDeg(rd) } : p)) };
    commit(n);
  };
  const D = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y / ar}`).join(' ');
  const toolBtn = (k: Tool, l: string) => (
    <Pressable key={k} onPress={() => setTool(k)} disabled={disabled && k !== 'select'} accessibilityRole="button" accessibilityState={{ selected: tool === k }}
      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: tool === k ? c.foreground : c.muted }}>
      <Text style={{ color: tool === k ? c.background : c.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{l}</Text>
    </Pressable>
  );
  const options = [
    ...g.plots.map((p, i) => ({ value: `plot:${i}`, label: `Plot ${p.number}${unmatched.has(p.number) ? ' (not in inventory)' : ''}` })),
    ...g.roads.map((r, i) => ({ value: `road:${i}`, label: r.name || `Road ${i + 1}` })),
    ...(g.parks ?? []).map((k, i) => ({ value: `park:${i}`, label: k.name || `Open space ${i + 1}` })),
    ...(g.boundary?.points.length ? [{ value: 'boundary:0', label: 'Site boundary' }] : []),
  ];

  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {toolBtn('select', 'Move')}{toolBtn('road', 'Add road')}{toolBtn('park', 'Open space')}{toolBtn('boundary', 'Boundary')}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <Btn label="Undo" icon="corner-up-left" variant="ghost" disabled={!hist.past.length || disabled} onPress={() => setHist(undoHistory)} />
        <Btn label="Redo" icon="corner-up-right" variant="ghost" disabled={!hist.future.length || disabled} onPress={() => setHist(redoHistory)} />
        <Btn label="Zoom in" icon="zoom-in" variant="ghost" onPress={() => zoom(1.25)} />
        <Btn label="Zoom out" icon="zoom-out" variant="ghost" onPress={() => zoom(0.8)} />
        <Btn label="Fit" icon="maximize" variant="ghost" onPress={() => setVb(full)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Switch value={snap} onValueChange={setSnap} accessibilityLabel="Snap to 5 foot grid" /><Text style={{ color: c.foreground, fontSize: 12 }}>Snap {GRID} ft</Text></View>
      </View>
      {tool === 'road' ? (
        <View style={{ marginBottom: 8 }}>
          <Banner tone="warn" title={pending.length ? 'Tap the road end point.' : 'Tap the road start point, then the end point.'} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Num label="New road width (ft)" value={roadWidth} onCommit={(v) => v && v > 0 && setRoadWidth(v)} />
            <Btn label="Add by numbers" variant="ghost" onPress={() => { const L = Math.min(s.widthFeet * 0.6, 300); commit({ ...g, roads: [...g.roads, { id: newId(), name: `Internal road ${g.roads.length + 1}`, widthFeet: roadWidth, lengthFeet: round2(L), rotationDegrees: 0, points: rectPoints({ x: 50, y: 50 }, L, roadWidth, 0, s) }] }); setSel({ kind: 'road', i: g.roads.length }); setTool('select'); }} />
          </View>
        </View>
      ) : null}
      {tool === 'park' || tool === 'boundary' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: c.foreground, fontSize: 12, flex: 1, minWidth: 160 }}>Tap corners in order ({pending.length} placed).</Text>
          <Btn label="Finish" icon="check" disabled={pending.length < 3} onPress={finish} />
          {tool === 'park' ? <Btn label="Add square block" variant="ghost" onPress={() => { const side = Math.sqrt(Math.max(400, (g.parks?.[0]?.targetAreaSqYards ?? 0) * 9 || 2500)); commit({ ...g, parks: [...(g.parks ?? []), { id: newId(), name: `Open space ${(g.parks?.length ?? 0) + 1}`, points: rectPoints({ x: 50, y: 50 }, side, side, 0, s) }] }); setSel({ kind: 'park', i: g.parks?.length ?? 0 }); setTool('select'); }} /> : null}
        </View>
      ) : null}
      <View
        ref={boxRef}
        onLayout={(e) => { setW(e.nativeEvent.layout.width); boxRef.current?.measureInWindow((x, y) => { origin.current = { x, y }; }); }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          const ne = e.nativeEvent;
          origin.current = { x: ne.pageX - ne.locationX, y: ne.pageY - ne.locationY };
          boxRef.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
          const p = toPlan(ne.pageX, ne.pageY);
          pinch.current = null;
          let mode: 'move' | 'vertex' | 'pan' | 'tap' = tool === 'select' ? 'pan' : 'tap';
          let target: NonNullable<Sel> | undefined; let vi: number | undefined;
          if (tool === 'select' && !disabled) {
            if (sel && (sel.kind === 'park' || sel.kind === 'boundary')) {
              const tol = (vb.w / w) * 22;
              const j = ptsOf(g, sel).findIndex((v) => Math.hypot(v.x - p.x, (v.y - p.y) / ar) < tol);
              if (j >= 0) { mode = 'vertex'; target = sel; vi = j; }
            }
            if (mode === 'pan') { const h = hit(p); if (h) { mode = 'move'; target = h; setSel(h); } }
          }
          gest.current = { mode, sel: target, vi, start: p, px: ne.pageX, py: ne.pageY, vb, base: g, pushed: false, moved: false };
        }}
        onResponderMove={(e) => {
          const t = e.nativeEvent.touches;
          if (t && t.length >= 2) {
            const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            if (!pinch.current) pinch.current = { d, vb };
            const f = d / (pinch.current.d || 1); const v = pinch.current.vb;
            const nw = clamp(v.w / f, 8, 240), nh = nw * (v.h / v.w);
            setVb({ x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh });
            if (gest.current) gest.current.moved = true;
            return;
          }
          const gs = gest.current; if (!gs || pinch.current) return;
          const ne = e.nativeEvent;
          if (Math.hypot(ne.pageX - gs.px, ne.pageY - gs.py) > 6) gs.moved = true;
          if (!gs.moved) return;
          if (gs.mode === 'pan') { setVb({ ...gs.vb, x: gs.vb.x - ((ne.pageX - gs.px) / w) * gs.vb.w, y: gs.vb.y - ((ne.pageY - gs.py) / viewH) * gs.vb.h }); return; }
          if (gs.mode === 'tap' || !gs.sel) return;
          const p = toPlan(ne.pageX, ne.pageY, gs.vb);
          if (!gs.pushed) { setHist((h) => pushHistory(h, h.present)); gs.pushed = true; }
          if (gs.mode === 'move') {
            let dx = p.x - gs.start.x, dy = p.y - gs.start.y;
            if (snap) { dx = (snapTo((dx * s.widthFeet) / 100, GRID) * 100) / s.widthFeet; dy = (snapTo((dy * s.heightFeet) / 100, GRID) * 100) / s.heightFeet; }
            const moved = withPts(gs.base, gs.sel, translatePoints(ptsOf(gs.base, gs.sel), dx, dy));
            setHist((h) => ({ ...h, present: moved }));
          } else if (gs.vi !== undefined) {
            const q = snapPt(p); const sl = gs.sel; const vi2 = gs.vi;
            const moved = withPts(gs.base, sl, ptsOf(gs.base, sl).map((v, j) => (j === vi2 ? q : v)));
            setHist((h) => ({ ...h, present: moved }));
          }
        }}
        onResponderRelease={() => { const gs = gest.current; if (gs && !gs.moved && (gs.mode === 'tap' || gs.mode === 'pan')) tap(gs.start); gest.current = null; pinch.current = null; }}
        style={{ width: '100%', height: viewH, backgroundColor: '#FFFDF7', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}
        accessibilityLabel="Layout canvas. Tap a block to select it, drag to move it, drag empty space to pan, pinch to zoom."
      >
        <Svg width={w} height={viewH} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} pointerEvents="none">
          <Rect x={0} y={0} width={100} height={H} fill="#FFFDF7" stroke="#D6CBB4" strokeWidth={0.2} />
          {g.boundary?.points.length ? <Polygon points={D(g.boundary.points)} fill="none" stroke="#7C2D12" strokeWidth={0.35} strokeDasharray="1.2,0.8" /> : null}
          {(g.parks ?? []).map((k, i) => { const cc = centroid(k.points); const on = sel?.kind === 'park' && sel.i === i; return <G key={k.id}><Polygon points={D(k.points)} fill="#BBE3C3" stroke={on ? '#D97706' : '#2F7D4A'} strokeWidth={on ? 0.5 : 0.25} /><SText x={cc.x} y={cc.y / ar} fontSize={1.8} textAnchor="middle" fill="#1F5131" fontWeight="bold">{k.name}</SText></G>; })}
          {g.roads.map((r, i) => { const on = sel?.kind === 'road' && sel.i === i; const cc = centroid(r.points); return <G key={r.id ?? `r${i}`}>{r.points.length >= 3 ? <Polygon points={D(r.points)} fill="#9C958A" stroke={on ? '#D97706' : '#57534E'} strokeWidth={on ? 0.5 : 0.15} /> : <Polyline points={D(r.points)} fill="none" stroke="#9C958A" strokeWidth={1.4} />}<SText x={cc.x} y={cc.y / ar} fontSize={1.4} textAnchor="middle" fill="#FFFDF7" fontWeight="bold">{r.name}</SText></G>; })}
          {g.plots.map((p, i) => { const on = sel?.kind === 'plot' && sel.i === i; const cc = centroid(p.points); return <G key={p.id ?? `p${i}`}><Polygon points={D(p.points)} fill={unmatched.has(p.number) && !p.referenceOnly ? '#FECACA' : p.measurementSource === 'recorded' ? '#FDE7B0' : '#F5EBD3'} stroke={on ? '#D97706' : '#57534E'} strokeWidth={on ? 0.55 : 0.18} strokeDasharray={p.measurementSource === 'schematic' ? '0.6,0.4' : undefined} /><SText x={cc.x} y={cc.y / ar + 0.6} fontSize={1.9} textAnchor="middle" fill="#1C1917" fontWeight="bold">{p.number}</SText></G>; })}
          {sel && (sel.kind === 'park' || sel.kind === 'boundary') ? selPts.map((v, j) => <Circle key={j} cx={v.x} cy={v.y / ar} r={Math.max(0.8, vb.w / 70)} fill="#FFFDF7" stroke="#D97706" strokeWidth={0.3} />) : null}
          {pending.map((v, j) => <Circle key={`pd${j}`} cx={v.x} cy={v.y / ar} r={0.9} fill="#D97706" />)}
        </Svg>
      </View>
      <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 6 }}>Workspace {round2(s.widthFeet)} x {round2(s.heightFeet)} ft, {s.provenance === 'schematic' ? 'schematic convention, not surveyed' : 'entered by a reviewer'}. Dashed blocks are schematic placement.</Text>

      <Chips label="Selected shape" options={[{ value: '', label: 'None' }, ...options]} value={sel ? `${sel.kind}:${sel.i}` : ''} onChange={(v) => { if (!v) { setSel(null); return; } const [k, n] = v.split(':'); setSel({ kind: k as NonNullable<Sel>['kind'], i: Number(n) }); }} />
      {sel && sel.kind === 'plot' && g.plots[sel.i] ? (() => { const p = g.plots[sel.i]; return (
        <View style={{ backgroundColor: c.muted, borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold' }}>Plot {p.number} · {FACING_LABEL[p.facing]} (read-only)</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Recorded: {p.dimensions || 'dimensions not recorded'}{p.areaSqYards ? ` · ${round2(p.areaSqYards)} sq yd` : ''}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{p.measurementSource === 'recorded' ? 'Block sized from recorded dimensions.' : 'Schematic size and placement.'} Drawn {Math.round(sqFtToSqYd(areaSqFt(p.points, s)))} sq yd. Rotation never changes facing.</Text>
        </View>
      ); })() : null}
      {sel && sel.kind === 'road' && g.roads[sel.i] ? (
        <View>
          <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>{g.roads[sel.i].name || 'Road'}</Text>
          <TextInput value={g.roads[sel.i].name} onChangeText={(v) => setHist((h) => ({ ...h, present: { ...h.present, roads: h.present.roads.map((r, j) => (j === sel.i ? { ...r, name: v } : r)) } }))} onFocus={() => commit(g)} accessibilityLabel="Road name" style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 8, color: c.foreground, marginBottom: 8 }} />
          <Text style={{ color: c.mutedForeground, fontSize: 11, marginBottom: 6 }}>Width is across the road; length runs along it. Blank width means unknown.</Text>
        </View>
      ) : null}
      {sel && sel.kind === 'park' && g.parks?.[sel.i] ? (() => { const k = g.parks![sel.i]; return (
        <View style={{ backgroundColor: c.muted, borderRadius: 10, padding: 10, marginBottom: 8 }}>
          <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold' }}>{k.name}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Drawn {Math.round(sqFtToSqYd(areaSqFt(k.points, s))).toLocaleString('en-IN')} sq yd · target {k.targetAreaSqYards ? `${Math.round(k.targetAreaSqYards).toLocaleString('en-IN')} sq yd` : 'not configured'}. Drag corner handles to reshape.</Text>
          {k.targetAreaSqYards && cFt ? <Btn label="Resize to target area" variant="ghost" onPress={() => { const side = Math.sqrt(k.targetAreaSqYards! * 9); rebuild(cFt.x, cFt.y, side, side, 0); }} /> : null}
        </View>
      ); })() : null}
      {frame && cFt && sel ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Num label="Centre X (ft)" value={cFt.x} disabled={disabled} onCommit={(v) => v != null && rebuild(v, cFt.y, frame.widthFt, frame.depthFt, rotOf)} />
          <Num label="Centre Y (ft)" value={cFt.y} disabled={disabled} onCommit={(v) => v != null && rebuild(cFt.x, v, frame.widthFt, frame.depthFt, rotOf)} />
          {sel.kind === 'road' ? <>
            <Num label="Length (ft)" value={g.roads[sel.i].lengthFeet ?? frame.widthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(cFt.x, cFt.y, v, g.roads[sel.i].widthFeet ?? frame.depthFt, rotOf)} />
            <Num label="Width (ft)" value={g.roads[sel.i].widthFeet} allowBlank disabled={disabled} onCommit={(v) => { if (v == null) commit({ ...g, roads: g.roads.map((r, j) => (j === sel.i ? { ...r, widthFeet: null } : r)) }); else rebuild(cFt.x, cFt.y, g.roads[sel.i].lengthFeet ?? frame.widthFt, v, rotOf); }} />
          </> : <>
            <Num label="Drawn width (ft)" value={frame.widthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(cFt.x, cFt.y, v, frame.depthFt, rotOf)} />
            <Num label="Drawn depth (ft)" value={frame.depthFt} disabled={disabled} onCommit={(v) => v != null && rebuild(cFt.x, cFt.y, frame.widthFt, v, rotOf)} />
          </>}
          {sel.kind !== 'park' ? <Num label="Angle (deg)" value={rotOf} disabled={disabled} onCommit={(v) => v != null && rebuild(cFt.x, cFt.y, sel.kind === 'road' ? g.roads[sel.i].lengthFeet ?? frame.widthFt : frame.widthFt, sel.kind === 'road' ? g.roads[sel.i].widthFeet ?? frame.depthFt : frame.depthFt, v)} /> : null}
        </View>
      ) : null}
      {sel ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <Btn label="Left" variant="ghost" disabled={disabled} onPress={() => nudge(-1, 0)} />
          <Btn label="Right" variant="ghost" disabled={disabled} onPress={() => nudge(1, 0)} />
          <Btn label="Up" variant="ghost" disabled={disabled} onPress={() => nudge(0, -1)} />
          <Btn label="Down" variant="ghost" disabled={disabled} onPress={() => nudge(0, 1)} />
          {sel.kind !== 'boundary' ? <Btn label="Rotate -15" icon="rotate-ccw" variant="ghost" disabled={disabled} onPress={() => rotateSel(-15)} /> : null}
          {sel.kind !== 'boundary' ? <Btn label="Rotate +15" icon="rotate-cw" variant="ghost" disabled={disabled} onPress={() => rotateSel(15)} /> : null}
          {sel.kind !== 'plot' ? <Btn label="Remove" icon="trash-2" variant="danger" disabled={disabled} onPress={removeSel} /> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderColor: c.border, paddingTop: 8 }}>
        <Num label="Workspace width (ft)" value={s.widthFeet} disabled={disabled} onCommit={(v) => v && v > 0 && commit({ ...g, units: 'feet', scale: { widthFeet: v, heightFeet: s.heightFeet, provenance: 'user-entered' } })} />
        <Num label="Workspace height (ft)" value={s.heightFeet} disabled={disabled} onCommit={(v) => v && v > 0 && commit({ ...g, units: 'feet', scale: { widthFeet: s.widthFeet, heightFeet: v, provenance: 'user-entered' } })} />
        <Num label="North (deg, blank = unknown)" value={g.northDegrees} allowBlank disabled={disabled} onCommit={(v) => commit({ ...g, northDegrees: v == null ? null : normDeg(v) })} />
      </View>
    </Card>
  );
}

/* ---- illustrative 3D (orthographic projection, same math as web Blueprint3DView) ---- */
const STATUS_FILL: Record<string, [string, string, string]> = { available: ['#6EE7B7', '#059669', 'Available'], reserved: ['#FCD34D', '#B45309', 'Booked / reserved'], blocked: ['#D6D3D1', '#78716C', 'Blocked'], sold: ['#94A3B8', '#334155', 'Sold'], reference: ['#F5F5F4', '#A8A29E', 'Reference only'] };
const W = 800, H3 = 520, BASE = 6, SLAB = 0.8;
function View3D({ geometry, statusOf, presenting, onPresent }: { geometry: Geometry; statusOf: (n: string) => string | null; presenting: boolean; onPresent: (v: boolean) => void }) {
  const c = useColors();
  const g = useMemo(() => proportionedGeometry(geometry), [geometry]);
  const [cam, setCam] = useState<Camera>(() => fitCamera(g, DEFAULT_CAMERA, BASE, W, H3));
  const [mode, setMode] = useState<'orbit' | 'pan'>('orbit');
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<number | null>(null);
  const faces = useMemo(() => {
    const out: { key: string; pts: string; fill: string; stroke: string; depth: number; label?: { x: number; y: number; t: string } }[] = [];
    (g.parks ?? []).forEach((k, i) => { if (k.points.length >= 3) out.push({ key: `k${i}`, pts: k.points.map((q) => project(q.x, q.y, 0.25, cam, BASE)).map((v) => `${v.sx},${v.sy}`).join(' '), fill: '#86CF98', stroke: '#2F7D4A', depth: -5e5 + i }); });
    g.roads.forEach((r, i) => { if (r.points.length >= 3) out.push({ key: `r${i}`, pts: r.points.map((q) => project(q.x, q.y, 0.05, cam, BASE)).map((v) => `${v.sx},${v.sy}`).join(' '), fill: r.widthFeet == null ? '#BDB6AA' : '#8B857B', stroke: '#57534E', depth: -1e6 + i }); });
    g.plots.forEach((p, i) => {
      const st = p.referenceOnly ? 'reference' : (statusOf(p.number) ?? 'reference');
      const k = st === 'booked' ? 'reserved' : st;
      const [fill, stroke] = STATUS_FILL[k] ?? STATUS_FILL.reference;
      const top = p.points.map((q) => project(q.x, q.y, SLAB, cam, BASE));
      p.points.forEach((q, j) => {
        const n = p.points[(j + 1) % p.points.length];
        const a = project(q.x, q.y, 0, cam, BASE), b = project(n.x, n.y, 0, cam, BASE), bt = project(n.x, n.y, SLAB, cam, BASE), at = top[j];
        out.push({ key: `s${i}-${j}`, pts: [a, b, bt, at].map((v) => `${v.sx},${v.sy}`).join(' '), fill: stroke, stroke, depth: (a.depth + b.depth) / 2 - 0.01 });
      });
      const cc = centroid(p.points); const lp = project(cc.x, cc.y, SLAB, cam, BASE);
      out.push({ key: `t${i}`, pts: top.map((v) => `${v.sx},${v.sy}`).join(' '), fill, stroke, depth: top.reduce((n, v) => n + v.depth, 0) / Math.max(1, top.length), label: { x: lp.sx, y: lp.sy, t: p.number } });
    });
    return out.sort((a, b) => a.depth - b.depth);
  }, [g, cam, statusOf]);
  const nudge = (d: Partial<Camera>) => setCam((k) => ({ ...k, yaw: k.yaw + (d.yaw ?? 0), pitch: clamp(k.pitch + (d.pitch ?? 0), 15, 90), zoom: clamp(k.zoom * (d.zoom ?? 1), 0.2, 8), panX: k.panX * (d.zoom ?? 1), panY: k.panY * (d.zoom ?? 1) }));
  const north = geometry.northDegrees;
  const boundary = g.boundary?.points.length ? g.boundary.points.map((q) => project(q.x, q.y, 0, cam, BASE)) : null;
  return (
    <Card>
      {presenting ? <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 8 }}>Layout presentation</Text> : null}
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => { drag.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; pinch.current = null; }}
        onResponderMove={(e) => {
          const t = e.nativeEvent.touches;
          if (t && t.length >= 2) {
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            if (pinch.current) { const f = dist / pinch.current; setCam((k) => ({ ...k, zoom: clamp(k.zoom * f, 0.2, 8), panX: k.panX * f, panY: k.panY * f })); }
            pinch.current = dist; drag.current = null; return;
          }
          pinch.current = null;
          const d = drag.current; const x = e.nativeEvent.pageX, y = e.nativeEvent.pageY;
          drag.current = { x, y };
          if (!d) return;
          if (mode === 'orbit') setCam((k) => ({ ...k, yaw: k.yaw + (x - d.x) * 0.5, pitch: clamp(k.pitch - (y - d.y) * 0.4, 15, 90) }));
          else setCam((k) => ({ ...k, panX: k.panX + (x - d.x) * 1.6, panY: k.panY + (y - d.y) * 1.6 }));
        }}
        onResponderRelease={() => { drag.current = null; pinch.current = null; }}
        style={{ width: '100%', aspectRatio: W / H3, backgroundColor: '#F5F1E8', borderRadius: 14, overflow: 'hidden' }}
        accessibilityLabel="Confirmed layout scene. Drag to orbit or pan, pinch to zoom; buttons rotate, tilt and zoom.">
        <Svg width="100%" height="100%" viewBox={`${-W / 2} ${-H3 / 2} ${W} ${H3}`} pointerEvents="none">
          {boundary ? <Polygon points={boundary.map((v) => `${v.sx},${v.sy}`).join(' ')} fill="none" stroke="#7C2D12" strokeWidth={1.4} strokeDasharray="6,4" /> : null}
          {g.roads.filter((r) => r.points.length < 3).map((r, i) => { const pts = r.points.map((q) => project(q.x, q.y, 0, cam, BASE)); return <Polyline key={`rl${i}`} points={pts.map((v) => `${v.sx},${v.sy}`).join(' ')} fill="none" stroke="#a8a29e" strokeWidth={Math.max(2, (r.widthFeet ?? 20) / 6) * cam.zoom} strokeLinecap="round" />; })}
          {faces.map((f) => (
            <G key={f.key}>
              <Polygon points={f.pts} fill={f.fill} stroke={f.stroke} strokeWidth={1} />
              {f.label ? <SText x={f.label.x} y={f.label.y + 4} fontSize={11 * Math.min(1.6, Math.max(0.7, cam.zoom))} fontWeight="bold" fill="#1c1917" stroke="#FBF8F1" strokeWidth={0.6} textAnchor="middle">{f.label.t}</SText> : null}
            </G>
          ))}
          {north != null ? (
            <G transform={`translate(${W / 2 - 46} ${-H3 / 2 + 46}) rotate(${north - cam.yaw})`}>
              <Circle r={26} fill="#FFFBEB" stroke="#d6d3d1" />
              <SLine x1={0} y1={14} x2={0} y2={-18} stroke="#b45309" strokeWidth={3} />
              <Path d="M0,-22 L5,-12 L-5,-12 Z" fill="#b45309" />
              <SText x={0} y={22} fontSize={11} fontWeight="bold" fill="#1c1917" textAnchor="middle">N</SText>
            </G>
          ) : null}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        <Chips label="Drag mode" options={[{ value: 'orbit', label: 'Orbit' }, { value: 'pan', label: 'Pan' }]} value={mode} onChange={(v) => setMode(v as 'orbit' | 'pan')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Btn label="Rotate left" variant="ghost" onPress={() => nudge({ yaw: -15 })} />
        <Btn label="Rotate right" variant="ghost" onPress={() => nudge({ yaw: 15 })} />
        <Btn label="Tilt up" variant="ghost" onPress={() => nudge({ pitch: 8 })} />
        <Btn label="Tilt down" variant="ghost" onPress={() => nudge({ pitch: -8 })} />
        <Btn label="Zoom in" variant="ghost" onPress={() => nudge({ zoom: 1.2 })} />
        <Btn label="Zoom out" variant="ghost" onPress={() => nudge({ zoom: 1 / 1.2 })} />
        <Btn label="Reset view" variant="ghost" onPress={() => setCam(fitCamera(g, DEFAULT_CAMERA, BASE, W, H3))} />
        <Btn label={presenting ? 'Exit presentation' : 'Customer presentation'} icon={presenting ? 'x' : 'monitor'} onPress={() => onPresent(!presenting)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {Object.entries(STATUS_FILL).map(([k, [f, s, l]]) => <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: f, borderWidth: 1, borderColor: s }} /><Text style={{ color: c.mutedForeground, fontSize: 11 }}>{l}</Text></View>)}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#86CF98' }} /><Text style={{ color: c.mutedForeground, fontSize: 11 }}>Open space</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#8B857B' }} /><Text style={{ color: c.mutedForeground, fontSize: 11 }}>Road</Text></View>
      </View>
      <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 6 }}>Illustrative SVG view of the confirmed layout (no WebGL needed). Schematic placement, uniform slab height; not a survey or legal approval.{north == null ? ' North is unknown.' : ''}</Text>
    </Card>
  );
}

/* ---- workspace ---- */
type Tab = 'original' | 'edit' | 'view3d';
type Busy = '' | 'analyze' | 'save' | 'confirm' | 'upload' | 'generate';
export function NativeBlueprint({ projectId, erp }: { projectId: string; erp: ProjectErp }) {
  const c = useColors();
  const run = useRun();
  const [state, setState] = useState<BlueprintState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [hist, setHist] = useState<History | null>(null);
  const [saved, setSaved] = useState<Geometry | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [editSourceId, setEditSourceId] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<Busy>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [ask, setAsk] = useState<null | { title: string; text: string; label: string; go: () => void }>(null);
  const [presenting, setPresenting] = useState(false);
  const dirty = !!hist && hist.present !== saved;
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirty) return;
    const off = registerLeaveGuard(() => 'You have unsaved layout edits. Leave and discard them? The last saved layout is kept.');
    let offWeb = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', h);
      offWeb = () => window.removeEventListener('beforeunload', h);
    }
    // Android hardware back would leave the single-route workspace (or the app): ask first.
    const sub = Platform.OS === 'android' ? BackHandler.addEventListener('hardwareBackPress', () => { guardLeave(() => BackHandler.exitApp()); return true; }) : null;
    return () => { off(); offWeb(); sub?.remove(); };
  }, [dirty]);
  const busyRef = useRef(false);
  const plots = useMemo(() => erp.records.filter((r) => r.kind === 'plots' && r.status !== 'deleted'), [erp.records]);
  const inventory = useMemo(() => plots.map((p) => String(p.data.plotNumber ?? '')), [plots]);
  const invObjs = useMemo(() => inventory.map((n) => ({ number: n })), [inventory]);
  const statusOf = useCallback((n: string) => { const hit = plots.find((p) => normalizeLabel(String(p.data.plotNumber ?? '')) === normalizeLabel(n)); return hit ? String(hit.data.status ?? 'available') : null; }, [plots]);

  const apply = useCallback((s: BlueprintState, force: boolean) => {
    setState(s);
    setTab((t) => t ?? (s.canManage ? 'edit' : 'view3d'));
    setSelectedId((cur) => (cur && s.attachments.some((a) => a.id === cur) ? cur : s.sourceAttachmentId || s.confirmedAttachmentId || s.attachments[0]?.id || ''));
    if (force || !dirtyRef.current) {
      const seed = s.draft ?? s.confirmed;
      const gg = seed ? normalizeForEdit(seed) : null;
      setHist(gg ? historyOf(gg) : null); setSaved(gg); setEditRevision(s.revision);
      setEditSourceId(s.draft ? s.sourceAttachmentId ?? null : s.confirmedAttachmentId ?? null);
      setAck(false); setConflict(false);
    }
  }, []);
  const load = useCallback(async (force: boolean) => {
    setLoading(true); setLoadError('');
    try { apply(await api.get(projectId), force); } catch (e) { setLoadError(errMessage(e)); } finally { setLoading(false); }
  }, [projectId, apply]);
  useEffect(() => { void load(true); }, [load]);

  const act = async (k: Exclude<Busy, ''>, fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(k); setErrors([]); setNotice('');
    try { await fn(); } catch (e) {
      const m = errMessage(e);
      if (/409|revision|conflict|stale|LAYOUT_INPUTS_CHANGED|changed/i.test(m)) setConflict(true);
      setErrors([m]);
    } finally { busyRef.current = false; setBusy(''); }
  };
  const upload = () => act('upload', async () => {
    const f = await pickFile(SUPPORTED_TYPES.join(','));
    if (!f) return;
    if (!SUPPORTED_TYPES.includes(f.type)) throw new Error('Select a PDF, PNG, JPEG or WebP plan.');
    const bad = validateFile({ type: f.type, size: f.size }); if (bad) throw new Error(bad);
    const att = await uploadAttachment(projectId, f, f.name);
    const docs = erp.resources.find((r) => r.kind === 'documents' && r.canCreate);
    if (docs) await run('erp.save', { projectId, kind: 'documents', requestId: newRequestId(), data: Object.fromEntries(Object.entries({ title: f.name.replace(/\.[^/.]+$/, ''), category: 'master_layout', attachmentId: att.id }).filter(([k]) => docs.fields.some((x) => x.key === k))) });
    setNotice(`${f.name} uploaded privately as a master layout document.`);
    const s = await api.get(projectId); apply(s, false); setSelectedId(att.id);
  });
  const guarded = (title: string, text: string, label: string, go: () => void, needs: boolean) => (needs ? setAsk({ title, text, label, go }) : go());
  const generate = () => { if (!state) return; guarded('Generate from project data?', dirty ? 'Unsaved edits will be discarded. The confirmed 3D presentation is kept.' : 'This replaces the current saved draft. The confirmed 3D presentation is kept.', 'Generate', () => void act('generate', async () => { apply(await api.generate(projectId, state.revision), true); setTab('edit'); setNotice('Layout generated from saved inventory, facing groups, approach road and open space. Placement is schematic; arrange it before confirming.'); }), dirty || !!state.draft); };
  const analyze = () => { if (state && selectedId) guarded('Run optional AI tracing?', 'Uses billed credits and replaces the current draft. The confirmed presentation is kept.', 'Run AI', () => void act('analyze', async () => { apply(await api.analyze(projectId, selectedId, state.revision), true); setTab('edit'); setNotice('AI draft ready. Review everything before confirming.'); }), true); };
  const save = (confirm: boolean) => {
    if (!state || !hist || editRevision === null) return;
    const e = validateGeometry(hist.present, inventory, confirm);
    if (confirm && !ack) e.push('Tick the review acknowledgement before confirming.');
    if (e.length) { setErrors(e); return; }
    void act(confirm ? 'confirm' : 'save', async () => {
      apply(await api.save(projectId, { attachmentId: editSourceId || null, revision: editRevision, geometry: hist.present, confirm, reviewAcknowledged: confirm ? ack : false }), true);
      setNotice(confirm ? 'Layout confirmed. The 3D presentation now shows this version.' : 'Draft saved. The confirmed presentation is unchanged until you confirm.');
      if (confirm) setTab('view3d');
    });
  };

  const unmatched = useMemo(() => (hist ? unmatchedPlotNumbers(hist.present, inventory) : new Set<string>()), [hist, inventory]);
  const advisories = useMemo(() => (hist ? layoutAdvisories(hist.present, invObjs) : []), [hist, invObjs]);
  const blocking = useMemo(() => (hist ? validateGeometry(hist.present, inventory, false) : []), [hist, inventory]);

  if (loading && !state) return <Skeleton lines={5} />;
  if (loadError && !state) return <Banner tone="error" title="Could not load the layout workspace." text={loadError} action={{ label: 'Retry', onPress: () => void load(true) }} />;
  if (!state) return null;
  const canManage = state.canManage;
  const active: Tab = tab === 'edit' && !canManage ? 'view3d' : tab ?? 'view3d';
  const selected = state.attachments.find((a) => a.id === selectedId);
  const stale = dirty && editRevision !== null && state.revision !== editRevision;
  const warnings = (state as BlueprintState & { warnings?: string[] }).warnings ?? [];
  const tabs: { k: Tab; l: string }[] = [{ k: 'original', l: 'Original plan (optional)' }, ...(canManage ? [{ k: 'edit' as Tab, l: 'Edit layout' }] : []), { k: 'view3d', l: '3D presentation' }];

  if (presenting && state.confirmed) return <View style={{ marginBottom: 16 }}><View3D geometry={state.confirmed} statusOf={statusOf} presenting onPresent={setPresenting} /></View>;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 8 }}>Venture layout</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        {tabs.map((t) => (
          <Pressable key={t.k} onPress={() => setTab(t.k)} accessibilityRole="tab" accessibilityState={{ selected: active === t.k }} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: active === t.k ? c.foreground : c.muted }}>
            <Text style={{ color: active === t.k ? c.background : c.foreground, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{t.l}</Text>
          </Pressable>
        ))}
        <Badge text={`${state.status === 'CONFIRMED' ? 'Confirmed' : state.status === 'DRAFT' ? (state.confirmed ? 'Draft · confirmed kept' : 'Draft') : 'No layout'} · rev ${state.revision}`} tone={state.status === 'CONFIRMED' ? 'ok' : state.status === 'DRAFT' ? 'warn' : 'muted'} />
        {dirty ? <Badge text="Unsaved edits" tone="bad" /> : null}
      </View>
      {notice ? <Banner tone="ok" title={notice} /> : null}
      {canManage && state.needsReconciliation ? <Banner tone="warn" title="Inventory or setup changed since this layout was drawn." text="Manual positions are kept. Regenerate for a fresh starter, or place missing plots before confirming." action={{ label: 'Regenerate', onPress: generate }} /> : null}
      {canManage && warnings.length ? <Banner tone="warn" title="Generation notes" text={warnings.slice(0, 8).join('\n')} /> : null}
      {errors.length ? <Banner tone="error" title={errors[0]} text={errors.slice(1).join('\n') || undefined} action={conflict ? { label: 'Reload latest', onPress: () => guarded('Reload latest layout?', 'Unsaved edits will be discarded.', 'Reload', () => void load(true), dirty) } : undefined} /> : null}

      {active === 'original' ? (
        <View>
          {state.attachments.length ? <Chips label="Plan document" options={state.attachments.map((a) => ({ value: a.id, label: a.fileName }))} value={selectedId} onChange={setSelectedId} /> : null}
          {canManage && attachmentsSupported ? <Btn label={busy === 'upload' ? 'Uploading…' : 'Upload plan'} icon="upload" variant="ghost" disabled={!!busy} onPress={() => void upload()} /> : null}
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginVertical: 8 }}>An original plan is an optional reference. Layouts are generated from saved project data and never need an upload.</Text>
          {selected ? <Original key={selected.id} projectId={projectId} att={selected} /> : <Card><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>No plan document on file</Text></Card>}
          {canManage && selected ? <Btn label={busy === 'analyze' ? 'Analyzing…' : 'Advanced: AI tracing (billed)'} icon="zap" variant="ghost" disabled={!!busy} onPress={analyze} /> : null}
        </View>
      ) : null}

      {active === 'edit' && canManage ? (
        <View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <Btn label={busy === 'generate' ? 'Generating…' : hist ? 'Regenerate from project data' : 'Generate layout'} icon="layout" disabled={!!busy} onPress={generate} />
            <Btn label="Reset to last saved" icon="rotate-ccw" variant="ghost" disabled={!!busy || !dirty} onPress={() => setAsk({ title: 'Discard unsaved edits?', text: 'The layout returns to the last saved version.', label: 'Discard', go: () => apply(state, true) })} />
          </View>
          {stale ? <Banner tone="warn" title={`A newer revision (${state.revision}) exists.`} text={`Your edits are based on revision ${editRevision}; saving will be rejected.`} action={{ label: 'Load newer', onPress: () => setAsk({ title: 'Load newer revision?', text: 'Your unsaved edits will be discarded.', label: 'Load', go: () => apply(state, true) }) }} /> : null}
          {!hist ? (
            <Card>
              <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>No layout drawn yet</Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, textAlign: 'center' }}>Generate one block per live plot, grouped by facing, with the saved approach road and open space. No AI, no charges.</Text>
            </Card>
          ) : (
            <>
              <LayoutEditor hist={hist} setHist={(f) => setHist((h) => (h ? f(h) : h))} unmatched={unmatched} disabled={!!busy} />
              {blocking.length ? <Banner tone="error" title={`Must fix before saving (${blocking.length})`} text={blocking.slice(0, 6).join('\n')} /> : null}
              <Card>
                <Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 4 }}>Advisory checks ({advisories.length})</Text>
                {advisories.length ? advisories.map((a, i) => <Text key={i} style={{ color: c.mutedForeground, fontSize: 12, marginBottom: 4 }}>{a.text}</Text>) : <Text style={{ color: c.mutedForeground, fontSize: 12 }}>No schematic warnings.</Text>}
                <Text style={{ color: c.mutedForeground, fontSize: 11 }}>Advisories never block saving; invalid shapes do.</Text>
              </Card>
              <Card>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                  <Switch value={ack} onValueChange={setAck} accessibilityLabel="Review acknowledgement" />
                  <Text style={{ color: c.foreground, fontSize: 12, flex: 1 }}>I reviewed placement, roads, open space and warnings. The drawing is illustrative and does not change inventory, facing, bookings, prices or money.</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Btn label={busy === 'save' ? 'Saving…' : 'Save draft'} icon="save" variant="ghost" disabled={!!busy || blocking.length > 0} onPress={() => save(false)} />
                  <Btn label={busy === 'confirm' ? 'Confirming…' : 'Confirm layout'} icon="shield" disabled={!!busy || !ack || blocking.length > 0} onPress={() => save(true)} />
                </View>
              </Card>
            </>
          )}
        </View>
      ) : null}

      {active === 'view3d' ? (state.confirmed && state.confirmed.plots.length ? <View3D key={`3d-${state.revision}`} geometry={state.confirmed} statusOf={statusOf} presenting={false} onPresent={setPresenting} /> : (
        <Card><Text style={{ color: c.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>No confirmed layout yet</Text><Text style={{ color: c.mutedForeground, fontSize: 12, textAlign: 'center' }}>{canManage ? 'Generate and arrange the layout, then confirm it to publish the presentation.' : 'The project team has not published a confirmed layout yet.'}</Text></Card>
      )) : null}
      {ask ? <Confirm title={ask.title} text={ask.text} confirmLabel={ask.label} danger onConfirm={() => { const go = ask.go; setAsk(null); go(); }} onCancel={() => setAsk(null)} /> : null}
    </View>
  );
}
