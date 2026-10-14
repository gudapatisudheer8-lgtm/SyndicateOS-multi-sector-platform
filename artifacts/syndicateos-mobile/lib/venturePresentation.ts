// Pure presentation/gesture helpers for the mobile Venture layout card. No React, no I/O: unit tested in tests/venture-presentation.test.cjs.

export interface Cam { yaw: number; pitch: number; zoom: number; panX: number; panY: number }
export interface Touch { x: number; y: number }

/* ---------- which surface to show ---------- */
export type VentureView = 'presentation' | 'editor' | 'empty-partner';
export interface ViewInput { canManage: boolean; hasConfirmed: boolean; editorOpen: boolean }
/**
 * Confirmed layout always wins by default, even when a newer draft exists. The editor only shows when an accountant
 * explicitly opened it, or when there is no confirmed layout yet (first creation). Partners never get the editor.
 */
export function ventureView({ canManage, hasConfirmed, editorOpen }: ViewInput): VentureView {
  if (!canManage) return hasConfirmed ? 'presentation' : 'empty-partner';
  if (!hasConfirmed) return 'editor';
  return editorOpen ? 'editor' : 'presentation';
}
/** The single resting-view action is only offered to managers looking at a confirmed presentation. */
export const showEditEntry = (i: ViewInput) => i.canManage && ventureView(i) === 'presentation';
/** Return action only makes sense when there is a confirmed scene to return to. */
export const showEditorReturn = (i: ViewInput) => i.canManage && i.hasConfirmed && ventureView(i) === 'editor';
export type CloseDecision = 'close' | 'ask';
export const closeEditorDecision = (dirty: boolean): CloseDecision => (dirty ? 'ask' : 'close');

/* ---------- responsive bounded scene ---------- */
export const SCENE_MIN_W = 260, SCENE_MAX_W = 430;
/** Card-bounded scene size for phone widths (about 360-430 px). Height follows a 4:3-ish ratio, capped for scrolling. */
export function sceneSize(available: number): { w: number; h: number } {
  const w = Math.round(Math.min(SCENE_MAX_W, Math.max(SCENE_MIN_W, Number.isFinite(available) && available > 0 ? available : 340)));
  const h = Math.round(Math.min(320, Math.max(220, w * 0.74)));
  return { w, h };
}

/* ---------- touch gestures ---------- */
export const ZOOM_MIN = 0.2, ZOOM_MAX = 8, PITCH_MIN = 15, PITCH_MAX = 90;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export interface Anchor { n: 0 | 1 | 2; x: number; y: number; dist: number }
export const NO_ANCHOR: Anchor = { n: 0, x: 0, y: 0, dist: 0 };

/** Anchor for the current touch set: single point, or two-finger centroid + spread. */
export function anchorOf(touches: Touch[]): Anchor {
  if (!touches.length) return NO_ANCHOR;
  if (touches.length === 1) return { n: 1, x: touches[0].x, y: touches[0].y, dist: 0 };
  const a = touches[0], b = touches[1];
  return { n: 2, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
}

/**
 * One gesture step. A change in finger count only re-anchors (no camera change), so 1 -> 2 -> 1 never jumps.
 * One finger orbits (yaw/pitch). Two fingers pinch-zoom about their centroid and pan by centroid motion.
 * `cx`/`cy` is the scene centre in the same coordinates as touches (camera pan is relative to it).
 */
export function gestureStep(cam: Cam, prev: Anchor, touches: Touch[], cx = 0, cy = 0): { cam: Cam; anchor: Anchor } {
  const next = anchorOf(touches);
  if (next.n === 0 || next.n !== prev.n) return { cam, anchor: next };
  if (next.n === 1) {
    const dx = next.x - prev.x, dy = next.y - prev.y;
    return { cam: { ...cam, yaw: cam.yaw + dx * 0.5, pitch: clamp(cam.pitch - dy * 0.4, PITCH_MIN, PITCH_MAX) }, anchor: next };
  }
  const f0 = next.dist / prev.dist;
  const zoom = clamp(cam.zoom * f0, ZOOM_MIN, ZOOM_MAX);
  const f = zoom / cam.zoom;
  // Keep the world point under the previous centroid under the new centroid.
  const px = prev.x - cx, py = prev.y - cy, nx = next.x - cx, ny = next.y - cy;
  return { cam: { ...cam, zoom, panX: nx - (px - cam.panX) * f, panY: ny - (py - cam.panY) * f }, anchor: next };
}

/** Rescale an existing camera when the scene box changes size, keeping relative framing. */
export function rescaleCam(cam: Cam, from: { w: number; h: number }, to: { w: number; h: number }): Cam {
  if (!(from.w > 0 && from.h > 0)) return cam;
  const f = Math.min(to.w / from.w, to.h / from.h);
  return { ...cam, zoom: clamp(cam.zoom * f, ZOOM_MIN, ZOOM_MAX), panX: cam.panX * f, panY: cam.panY * f };
}
