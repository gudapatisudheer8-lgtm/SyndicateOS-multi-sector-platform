// Blueprint geometry contract + pure helpers (validation, editing transforms, advisories, orthographic projection).
// Coordinates are normalized 0..100 across the workspace. `scale` maps them to feet as a WORKSPACE CONVENTION,
// never a survey claim. This file is pure TypeScript and is mirrored verbatim in
// artifacts/syndicateos-mobile/lib/blueprintGeometry.ts so web and native share identical rules.

export type Facing = 'E' | 'N' | 'W' | 'S' | 'NE' | 'NW' | 'SE' | 'SW' | 'UNKNOWN';
export const FACINGS: Facing[] = ['E', 'N', 'W', 'S', 'NE', 'NW', 'SE', 'SW', 'UNKNOWN'];

export interface Pt { x: number; y: number }
export type MeasurementSource = 'recorded' | 'schematic';
export interface BlueprintPlot {
  id?: string; number: string; facing: Facing; points: Pt[]; referenceOnly?: boolean; confidence?: number;
  areaSqYards?: number; dimensions?: string; rotationDegrees?: number; measurementSource?: MeasurementSource;
}
export interface BlueprintRoad {
  id?: string; name: string; widthFeet: number | null; lengthFeet?: number | null; points: Pt[]; rotationDegrees?: number; confidence?: number;
}
export interface BlueprintPark { id: string; name: string; points: Pt[]; targetAreaSqYards?: number }
export interface LayoutScale { widthFeet: number; heightFeet: number; provenance: 'schematic' | 'user-entered' }
export interface Geometry {
  plots: BlueprintPlot[];
  roads: BlueprintRoad[];
  northDegrees: number | null;
  notes: string;
  /** Source PAGE width / height (legacy). null = unknown/unverified. */
  aspectRatio?: number | null;
  layoutVersion?: number;
  origin?: 'PROJECT' | 'MANUAL' | 'SOURCE';
  inventoryFingerprint?: string;
  units?: 'feet';
  scale?: LayoutScale;
  parks?: BlueprintPark[];
  boundary?: { points: Pt[]; provenance?: string; source?: string } | null;
}

export type BlueprintStatus = 'EMPTY' | 'DRAFT' | 'CONFIRMED';
export interface BlueprintAttachment { id: string; fileName: string; contentType: string }
export interface BlueprintState {
  revision: number;
  status: BlueprintStatus;
  sourceAttachmentId: string | null;
  confirmedAttachmentId?: string | null;
  draft: Geometry | null;
  confirmed: Geometry | null;
  attachments: BlueprintAttachment[];
  canManage: boolean;
  inventoryFingerprint?: string;
  needsReconciliation?: boolean;
  warnings?: string[];
}
export interface InventoryPlot { id?: string; number: string }

export const SUPPORTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;
const cp = (pts: Pt[]) => pts.map((q) => ({ x: q.x, y: q.y }));

export function cloneGeometry(g: Geometry): Geometry {
  const out: Geometry = {
    ...g,
    plots: g.plots.map((p) => ({ ...p, points: cp(p.points) })),
    roads: g.roads.map((r) => ({ ...r, points: cp(r.points) })),
    northDegrees: g.northDegrees,
    notes: g.notes ?? '',
    aspectRatio: g.aspectRatio ?? null,
  };
  if (g.scale) out.scale = { ...g.scale };
  if (g.parks) out.parks = g.parks.map((k) => ({ ...k, points: cp(k.points) }));
  if (g.boundary) out.boundary = { ...g.boundary, points: cp(g.boundary.points) };
  return out;
}

export const emptyGeometry = (): Geometry => ({ plots: [], roads: [], northDegrees: null, notes: '', aspectRatio: null });

export function centroid(points: Pt[]): Pt {
  if (!points.length) return { x: 0, y: 0 };
  const s = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / points.length, y: s.y / points.length };
}

export const normalizeLabel = (s: string) => String(s || '').trim().toUpperCase().replace(/^PLOT\s*/i, '').replace(/\s+/g, '');

// ---------- scale / feet space ----------
/** Effective workspace scale. Legacy geometry gets a schematic convention derived from the page aspect. */
export function scaleOf(g: Geometry): LayoutScale {
  if (g.scale && g.scale.widthFeet > 0 && g.scale.heightFeet > 0) return g.scale;
  const ar = g.aspectRatio && g.aspectRatio > 0 ? g.aspectRatio : 1;
  return { widthFeet: 1000, heightFeet: round2(1000 / ar), provenance: 'schematic' };
}
export const toFt = (p: Pt, s: LayoutScale): Pt => ({ x: (p.x * s.widthFeet) / 100, y: (p.y * s.heightFeet) / 100 });
export const fromFt = (p: Pt, s: LayoutScale): Pt => ({ x: (p.x * 100) / s.widthFeet, y: (p.y * 100) / s.heightFeet });

/** Signed-free polygon area in square feet (shoelace in feet space). */
export function areaSqFt(points: Pt[], s: LayoutScale): number {
  if (points.length < 3) return 0;
  const f = points.map((p) => toFt(p, s));
  let a = 0;
  for (let i = 0; i < f.length; i++) { const p = f[i], q = f[(i + 1) % f.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}
export const sqFtToSqYd = (v: number) => v / 9;

const rot = (p: Pt, c: Pt, deg: number): Pt => {
  const t = (deg * Math.PI) / 180, dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(t) - dy * Math.sin(t), y: c.y + dx * Math.sin(t) + dy * Math.cos(t) };
};

/** Rectangle polygon (normalized) centred at `center`, sized in feet, rotated clockwise in feet space. */
export function rectPoints(center: Pt, widthFt: number, depthFt: number, rotationDeg: number, s: LayoutScale): Pt[] {
  const c = toFt(center, s), hw = widthFt / 2, hd = depthFt / 2;
  return [{ x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd }]
    .map((d) => fromFt(rot({ x: c.x + d.x, y: c.y + d.y }, c, rotationDeg), s))
    .map((p) => ({ x: round2(p.x), y: round2(p.y) }));
}

/** Centre, rotated-frame size (feet) of a polygon given its stored rotation. */
export function frameOf(points: Pt[], rotationDeg: number, s: LayoutScale) {
  const center = centroid(points);
  if (!points.length) return { center, widthFt: 0, depthFt: 0 };
  const c = toFt(center, s);
  const local = points.map((p) => rot(toFt(p, s), c, -rotationDeg));
  const xs = local.map((p) => p.x), ys = local.map((p) => p.y);
  return { center, widthFt: round2(Math.max(...xs) - Math.min(...xs)), depthFt: round2(Math.max(...ys) - Math.min(...ys)) };
}

/** Translate, keeping every vertex inside 0..100 (shift is clamped as a whole, shape never distorts). */
export function translatePoints(points: Pt[], dx: number, dy: number): Pt[] {
  if (!points.length) return [];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const cx = clamp(dx, -Math.min(...xs), 100 - Math.max(...xs));
  const cy = clamp(dy, -Math.min(...ys), 100 - Math.max(...ys));
  return points.map((p) => ({ x: round2(p.x + cx), y: round2(p.y + cy) }));
}

/** Rotate about centroid in feet space (so non-square scales do not shear the shape). */
export function rotatePoints(points: Pt[], deg: number, s: LayoutScale): Pt[] {
  const c = toFt(centroid(points), s);
  return points.map((p) => fromFt(rot(toFt(p, s), c, deg), s)).map((p) => ({ x: round2(p.x), y: round2(p.y) }));
}

export const normDeg = (d: number) => ((Math.round(d * 100) / 100) % 360 + 360) % 360;
export const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);

/** Road polygon from a centreline start/end, width in feet. Returns polygon, length and rotation. */
export function roadFromLine(a: Pt, b: Pt, widthFeet: number, s: LayoutScale) {
  const fa = toFt(a, s), fb = toFt(b, s);
  const lengthFeet = round2(Math.hypot(fb.x - fa.x, fb.y - fa.y));
  const rotationDegrees = normDeg((Math.atan2(fb.y - fa.y, fb.x - fa.x) * 180) / Math.PI);
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { points: rectPoints(center, lengthFeet, widthFeet, rotationDegrees, s), lengthFeet, rotationDegrees };
}

/** Upgrade legacy shapes for editing: 2-point roads become polygons. Preserves every other field. */
export function normalizeForEdit(g: Geometry): Geometry {
  const d = cloneGeometry(g);
  const s = scaleOf(d);
  d.roads = d.roads.map((r) => {
    if (r.points.length !== 2) return r;
    const built = roadFromLine(r.points[0], r.points[1], r.widthFeet ?? 20, s);
    return { ...r, points: built.points.map((p) => ({ x: clamp(p.x, 0, 100), y: clamp(p.y, 0, 100) })), lengthFeet: r.lengthFeet ?? built.lengthFeet, rotationDegrees: r.rotationDegrees ?? built.rotationDegrees };
  });
  if (!d.parks) d.parks = [];
  return d;
}

// ---------- polygon tests ----------
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
/** True when interiors overlap (edges crossing or containment). Touching edges do not count. */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export function boundsOf(P: Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
/** Strict separation (touching boxes are not separated, so callers stay conservative). */
const boxesApart = (a: Box, b: Box, pad = 0) => a.x1 + pad < b.x0 || b.x1 + pad < a.x0 || a.y1 + pad < b.y0 || b.y1 + pad < a.y0;
export function polygonsOverlap(A: Pt[], B: Pt[], ba?: Box, bb?: Box): boolean {
  if (A.length < 3 || B.length < 3) return false;
  if (boxesApart(ba ?? boundsOf(A), bb ?? boundsOf(B))) return false;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  }
  return pointInPolygon(centroid(A), B) || pointInPolygon(centroid(B), A);
}
/** Minimum distance between two polygons in feet (0 when they overlap or touch). */
export function polygonDistanceFt(A: Pt[], B: Pt[], s: LayoutScale): number {
  const a = A.map((p) => toFt(p, s)), b = B.map((p) => toFt(p, s));
  if (polygonsOverlap(a, b)) return 0;
  let m = Infinity;
  for (const p of a) for (let j = 0; j < b.length; j++) m = Math.min(m, segDist(p, b[j], b[(j + 1) % b.length]));
  for (const p of b) for (let j = 0; j < a.length; j++) m = Math.min(m, segDist(p, a[j], a[(j + 1) % a.length]));
  return m;
}

/** Plot numbers in the geometry that do not match any saved inventory plot number. */
export function unmatchedPlotNumbers(g: Geometry, inventoryNumbers: string[]): Set<string> {
  const inv = new Set(inventoryNumbers.map(normalizeLabel));
  const out = new Set<string>();
  g.plots.forEach((p) => { if (!inv.has(normalizeLabel(p.number))) out.add(p.number); });
  return out;
}

/** BLOCKING rules. Client-side mirror of the server; the server remains authoritative. */
export function validateGeometry(g: Geometry, inventoryNumbers: string[], forConfirm: boolean): string[] {
  const errors: string[] = [];
  const inRange = (p: Pt) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
  const s = scaleOf(g);
  const shapeChecks = (label: string, pts: Pt[]) => {
    if (pts.length < 3) { errors.push(`${label} needs at least 3 vertices.`); return; }
    if (!pts.every(inRange)) errors.push(`${label} has a vertex outside the workspace (0 to 100).`);
    const keys = new Set(pts.map((p) => `${round2(p.x)}:${round2(p.y)}`));
    if (keys.size < pts.length) errors.push(`${label} has duplicate vertices.`);
    if (areaSqFt(pts, s) < 1) errors.push(`${label} has no area (degenerate shape).`);
  };
  const seen = new Set<string>();
  const ids = new Set<string>();
  g.plots.forEach((p, i) => {
    const label = p.number.trim() || `#${i + 1}`;
    if (!p.number.trim()) errors.push(`Plot polygon ${i + 1} needs a plot number.`);
    shapeChecks(`Plot ${label}`, p.points);
    const k = normalizeLabel(p.number);
    if (k && seen.has(k)) errors.push(`Plot number ${label} is used more than once.`);
    seen.add(k);
    if (p.id) { if (ids.has(p.id)) errors.push(`Plot ${label} duplicates another plot's inventory link.`); ids.add(p.id); }
  });
  g.roads.forEach((r, i) => {
    const label = `Road ${r.name.trim() || `#${i + 1}`}`;
    if (r.points.length === 2 && (g.layoutVersion ?? 1) < 2) { if (!r.points.every(inRange)) errors.push(`${label} has a point outside 0 to 100.`); }
    else shapeChecks(label, r.points);
    if (r.widthFeet !== null && !(r.widthFeet > 0)) errors.push(`${label}: width must be positive or left unknown.`);
    if (r.lengthFeet != null && !(r.lengthFeet > 0)) errors.push(`${label}: length must be positive or left unknown.`);
  });
  (g.parks ?? []).forEach((k, i) => {
    shapeChecks(`Open space ${k.name.trim() || `#${i + 1}`}`, k.points);
    if (k.targetAreaSqYards != null && !(k.targetAreaSqYards > 0)) errors.push(`Open space ${k.name || i + 1}: target area must be positive.`);
  });
  if (g.boundary && g.boundary.points.length) shapeChecks('Site boundary', g.boundary.points);
  if (g.scale && !(g.scale.widthFeet > 0 && g.scale.heightFeet > 0)) errors.push('Workspace width and height in feet must be positive.');
  if (g.northDegrees !== null && !(g.northDegrees >= 0 && g.northDegrees < 360)) errors.push('North angle must be between 0 and 359 degrees, or unknown.');
  const ar = g.aspectRatio;
  if (ar !== null && ar !== undefined && !(Number.isFinite(ar) && ar > 0.05 && ar <= 20)) errors.push('Source page aspect ratio must be greater than 0.05 and at most 20, or unknown.');
  if (forConfirm) {
    if (!g.plots.length) errors.push('At least one plot polygon is required to confirm.');
    const unmatched = unmatchedPlotNumbers(g, inventoryNumbers);
    g.plots.forEach((p) => {
      if (unmatched.has(p.number) && !p.referenceOnly) errors.push(`Plot ${p.number || '(blank)'} is not in current inventory. Mark it reference-only or correct the number.`);
    });
    if ((g.layoutVersion ?? 1) >= 2 && g.origin !== 'SOURCE') {
      const drawn = new Set(g.plots.map((p) => normalizeLabel(p.number)));
      const missing = inventoryNumbers.filter((n) => !drawn.has(normalizeLabel(n)));
      if (missing.length) errors.push(`Every live plot must be placed before confirming. Missing: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ` and ${missing.length - 12} more` : ''}. Regenerate or reconcile the layout.`);
    }
  }
  return errors;
}

export const FACING_LABEL: Record<Facing, string> = {
  E: 'East', N: 'North', W: 'West', S: 'South', NE: 'North-East', NW: 'North-West', SE: 'South-East', SW: 'South-West', UNKNOWN: 'Unknown',
};
const BEARING: Record<Facing, number | null> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315, UNKNOWN: null };

export interface Advisory { kind: 'overlap' | 'outside' | 'frontage' | 'roads' | 'inventory' | 'facing' | 'area'; text: string; ref?: string }

/** ADVISORY schematic warnings. They never block saving; confirmation is a human decision. */
export function layoutAdvisories(g: Geometry, inventory: InventoryPlot[]): Advisory[] {
  const out: Advisory[] = [];
  const s = scaleOf(g);
  const plots = g.plots.filter((p) => p.points.length >= 3);
  const roads = g.roads.filter((r) => r.points.length >= 3);
  const parks = (g.parks ?? []).filter((k) => k.points.length >= 3);
  const all: Array<{ ref: string; label: string; pts: Pt[] }> = [
    ...plots.map((p, i) => ({ ref: `plot:${i}`, label: `Plot ${p.number}`, pts: p.points })),
    ...parks.map((k) => ({ ref: `park:${k.id}`, label: k.name || 'Open space', pts: k.points })),
  ];
  const ov: string[] = [];
  // Cached bounds + sort-and-sweep on x so only box-overlapping pairs reach the edge test.
  const ab = all.map((x) => boundsOf(x.pts));
  const order = all.map((_, i) => i).sort((i, j) => ab[i].x0 - ab[j].x0);
  for (let a = 0; a < order.length; a++) {
    const i = order[a];
    for (let c = a + 1; c < order.length; c++) {
      const j = order[c];
      if (ab[j].x0 > ab[i].x1) break;
      const [lo, hi] = i < j ? [i, j] : [j, i];
      if (polygonsOverlap(all[lo].pts, all[hi].pts, ab[lo], ab[hi])) ov.push(`${all[lo].label} / ${all[hi].label}`);
    }
  }
  const rb = roads.map((r) => boundsOf(r.points));
  plots.forEach((p, pi) => roads.forEach((r, ri) => { if (polygonsOverlap(p.points, r.points, ab[pi], rb[ri])) ov.push(`Plot ${p.number} / ${r.name || 'road'}`); }));
  if (ov.length) out.push({ kind: 'overlap', text: `Overlapping shapes: ${ov.slice(0, 6).join('; ')}${ov.length > 6 ? ` and ${ov.length - 6} more` : ''}.` });
  const b = g.boundary?.points;
  if (b && b.length >= 3) {
    const outside = [...all, ...roads.map((r, i) => ({ ref: `road:${i}`, label: r.name || 'Road', pts: r.points }))].filter((x) => x.pts.some((p) => !pointInPolygon(p, b)));
    if (outside.length) out.push({ kind: 'outside', text: `Outside the site boundary: ${outside.slice(0, 8).map((x) => x.label).join(', ')}.` });
  }
  if (roads.length) {
    const ftBox = (b: Box) => ({ x0: b.x0 * s.widthFeet / 100, x1: b.x1 * s.widthFeet / 100, y0: b.y0 * s.heightFeet / 100, y1: b.y1 * s.heightFeet / 100 });
    const pf = plots.map((_, i) => ftBox(ab[i])), rf = rb.map(ftBox);
    const noFront = plots.filter((p, pi) => !roads.some((r, ri) => !boxesApart(pf[pi], rf[ri], 3) && polygonDistanceFt(p.points, r.points, s) <= 3));
    if (noFront.length) out.push({ kind: 'frontage', text: `No road frontage within 3 ft: ${noFront.slice(0, 10).map((p) => p.number).join(', ')}${noFront.length > 10 ? ` and ${noFront.length - 10} more` : ''}.` });
    // Road connectivity via union-find on near-touching polygons.
    const parent = roads.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
      if (!boxesApart(rf[i], rf[j], 2) && polygonDistanceFt(roads[i].points, roads[j].points, s) <= 2) parent[find(i)] = find(j);
    }
    const groups = new Set(roads.map((_, i) => find(i)));
    if (groups.size > 1) out.push({ kind: 'roads', text: `Internal roads form ${groups.size} disconnected groups.` });
    // Facing vs nearest road direction.
    const north = g.northDegrees ?? 0;
    const bad: string[] = [];
    plots.forEach((p) => {
      const bear = BEARING[p.facing]; if (bear === null) return;
      const c = toFt(centroid(p.points), s);
      let best: Pt | null = null, bd = Infinity;
      roads.forEach((r) => r.points.forEach((q, k) => {
        const a = toFt(q, s), n = toFt(r.points[(k + 1) % r.points.length], s);
        const dx = n.x - a.x, dy = n.y - a.y, l = dx * dx + dy * dy;
        const t = l ? clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / l, 0, 1) : 0;
        const pt = { x: a.x + t * dx, y: a.y + t * dy }, d = Math.hypot(pt.x - c.x, pt.y - c.y);
        if (d < bd) { bd = d; best = pt; }
      }));
      if (!best) return;
      const bp = best as Pt;
      const roadBearing = normDeg((Math.atan2(bp.x - c.x, -(bp.y - c.y)) * 180) / Math.PI - north);
      const diff = Math.abs(((roadBearing - bear + 540) % 360) - 180);
      if (diff > 67.5) bad.push(p.number);
    });
    if (bad.length) out.push({ kind: 'facing', text: `Recorded facing differs from the nearest road side: ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? ` and ${bad.length - 10} more` : ''}. Facing is not changed by the drawing.` });
  } else if (plots.length) out.push({ kind: 'frontage', text: 'No roads drawn yet, so frontage cannot be checked.' });
  if (inventory.length || g.plots.length) {
    const inv = new Set(inventory.map((p) => normalizeLabel(p.number)));
    const drawn = new Set(g.plots.map((p) => normalizeLabel(p.number)));
    const missing = inventory.filter((p) => !drawn.has(normalizeLabel(p.number))).map((p) => p.number);
    const extra = g.plots.filter((p) => !p.referenceOnly && !inv.has(normalizeLabel(p.number))).map((p) => p.number);
    if (missing.length || extra.length) out.push({ kind: 'inventory', text: `Layout has ${g.plots.length} plots; live inventory has ${inventory.length}.${missing.length ? ` Not placed: ${missing.slice(0, 10).join(', ')}.` : ''}${extra.length ? ` Not in inventory: ${extra.slice(0, 10).join(', ')}.` : ''}` });
  }
  parks.forEach((k) => {
    if (!k.targetAreaSqYards) return;
    const drawn = sqFtToSqYd(areaSqFt(k.points, s));
    const pct = ((drawn - k.targetAreaSqYards) / k.targetAreaSqYards) * 100;
    if (Math.abs(pct) > 5) out.push({ kind: 'area', text: `${k.name || 'Open space'} is drawn at ${Math.round(drawn).toLocaleString('en-IN')} sq yd vs ${Math.round(k.targetAreaSqYards).toLocaleString('en-IN')} sq yd configured (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%, schematic scale).` });
  });
  return out;
}

// ---------- Orthographic 3D projection ----------
export interface Camera { yaw: number; pitch: number; zoom: number; panX: number; panY: number }
export const DEFAULT_CAMERA: Camera = { yaw: -30, pitch: 55, zoom: 1, panX: 0, panY: 0 };

/** World: X = x-50 (right), Z = y-50 (down the plan), Y = up (uniform display thickness only). */
export function project(x: number, y: number, h: number, cam: Camera, base: number) {
  const X = x - 50, Z = y - 50, Y = h;
  const yaw = (cam.yaw * Math.PI) / 180, pitch = (cam.pitch * Math.PI) / 180;
  const x1 = X * Math.cos(yaw) - Z * Math.sin(yaw);
  const z1 = X * Math.sin(yaw) + Z * Math.cos(yaw);
  const sy = z1 * Math.sin(pitch) - Y * Math.cos(pitch);
  const depth = z1 * Math.cos(pitch) + Y * Math.sin(pitch);
  const s = base * cam.zoom;
  return { sx: x1 * s + cam.panX, sy: sy * s + cam.panY, depth };
}

/** Width / height ratio used for display: workspace scale when present, else the legacy page aspect. */
export function displayAspect(g: Geometry): number {
  if (g.scale && g.scale.widthFeet > 0 && g.scale.heightFeet > 0) return g.scale.widthFeet / g.scale.heightFeet;
  return g.aspectRatio && g.aspectRatio > 0 ? g.aspectRatio : 1;
}

/** Scale normalized y so plan proportions follow the display aspect. Preserves parks/boundary/scale. */
export function proportionedGeometry(g: Geometry): Geometry {
  const ar = displayAspect(g);
  const fy = (y: number) => 50 + (y - 50) / ar;
  const m = (pts: Pt[]) => pts.map((q) => ({ x: q.x, y: fy(q.y) }));
  return {
    ...g,
    plots: g.plots.map((p) => ({ ...p, points: m(p.points) })),
    roads: g.roads.map((r) => ({ ...r, points: m(r.points) })),
    parks: (g.parks ?? []).map((k) => ({ ...k, points: m(k.points) })),
    boundary: g.boundary ? { ...g.boundary, points: m(g.boundary.points) } : g.boundary,
  };
}

/** Camera zoom/pan that fits every geometry point into a viewport of size w x h (centered at origin). */
export function fitCamera(g: Geometry, cam: Camera, base: number, w: number, h: number): Camera {
  const pts = [...g.plots.flatMap((p) => p.points), ...g.roads.flatMap((r) => r.points), ...(g.parks ?? []).flatMap((k) => k.points), ...(g.boundary?.points ?? [])];
  if (!pts.length) return { ...cam, zoom: 1, panX: 0, panY: 0 };
  const unit = { ...cam, zoom: 1, panX: 0, panY: 0 };
  const pr = pts.map((p) => project(p.x, p.y, 0, unit, base));
  const minX = Math.min(...pr.map((p) => p.sx)), maxX = Math.max(...pr.map((p) => p.sx));
  const minY = Math.min(...pr.map((p) => p.sy)), maxY = Math.max(...pr.map((p) => p.sy));
  const zoom = clamp(Math.min((w * 0.86) / Math.max(1, maxX - minX), (h * 0.8) / Math.max(1, maxY - minY)), 0.2, 8);
  return { ...cam, zoom, panX: -((minX + maxX) / 2) * zoom, panY: -((minY + maxY) / 2) * zoom };
}

// ---------- editor history ----------
export interface History { past: Geometry[]; present: Geometry; future: Geometry[] }
export const historyOf = (g: Geometry): History => ({ past: [], present: g, future: [] });
export const pushHistory = (h: History, g: Geometry, limit = 80): History => ({ past: [...h.past, h.present].slice(-limit), present: g, future: [] });
export const undoHistory = (h: History): History => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h);
export const redoHistory = (h: History): History => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);

export const newId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
};
