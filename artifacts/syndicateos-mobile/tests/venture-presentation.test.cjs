const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Math, Number });
  return exports;
}
const v = load(path.resolve(__dirname, '../lib/venturePresentation.ts'));
const geo = load(path.resolve(__dirname, '../lib/blueprintGeometry.ts'));
const cam0 = { yaw: -30, pitch: 55, zoom: 1, panX: 0, panY: 0 };

test('accountant layout and partner plots routes share the server-gated presentation without duplicating inventory', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../screens/ErpBespoke.tsx'), 'utf8');
  assert.match(source, /case 'erp-layout': return <PlotWorkspace erp=\{erp\} ctx=\{ctx\} \/>/);
  assert.match(source, /if \(kind === 'plots'\) return <PlotWorkspace erp=\{erp\} ctx=\{ctx\} \/>/);
  const wrapper = source.slice(source.indexOf('function PlotWorkspace'), source.indexOf('registerBespoke((key'));
  assert.equal((wrapper.match(/<NativeBlueprint /g) || []).length, 1);
  assert.equal((wrapper.match(/<Plots /g) || []).length, 1);
});

test('confirmed layout is the default view for managers, even with a newer draft', () => {
  // A draft never enters the decision: only hasConfirmed + explicit editorOpen matter.
  const i = { canManage: true, hasConfirmed: true, editorOpen: false };
  assert.equal(v.ventureView(i), 'presentation');
  assert.equal(v.showEditEntry(i), true);
  assert.equal(v.showEditorReturn(i), false);
});
test('explicit editor open shows editor with return action; confirmation success closes back to presentation', () => {
  const open = { canManage: true, hasConfirmed: true, editorOpen: true };
  assert.equal(v.ventureView(open), 'editor');
  assert.equal(v.showEditEntry(open), false);
  assert.equal(v.showEditorReturn(open), true);
  assert.equal(v.ventureView({ ...open, editorOpen: false }), 'presentation');
});
test('no confirmed layout: managers create in the editor, partners get an honest empty state', () => {
  assert.equal(v.ventureView({ canManage: true, hasConfirmed: false, editorOpen: false }), 'editor');
  assert.equal(v.showEditorReturn({ canManage: true, hasConfirmed: false, editorOpen: false }), false);
  assert.equal(v.ventureView({ canManage: false, hasConfirmed: false, editorOpen: false }), 'empty-partner');
});
test('partners never reach the editor or the edit entry, even if editorOpen were set', () => {
  for (const hasConfirmed of [true, false]) for (const editorOpen of [true, false]) {
    const i = { canManage: false, hasConfirmed, editorOpen };
    assert.notEqual(v.ventureView(i), 'editor');
    assert.equal(v.showEditEntry(i), false);
    assert.equal(v.showEditorReturn(i), false);
  }
});
test('closing a dirty editor asks (Stay/Discard); clean closes directly', () => {
  assert.equal(v.closeEditorDecision(true), 'ask');
  assert.equal(v.closeEditorDecision(false), 'close');
});
test('scene size is bounded for 360-430 phones', () => {
  for (const w of [360, 390, 412, 430]) { const s = v.sceneSize(w); assert.equal(s.w, w); assert.ok(s.h >= 220 && s.h <= 320); }
  assert.equal(v.sceneSize(1200).w, 430);
  assert.equal(v.sceneSize(0).w, 340);
  assert.equal(v.sceneSize(200).w, 260);
});
test('one finger orbits without zoom/pan change', () => {
  let a = v.anchorOf([{ x: 100, y: 100 }]);
  const r = v.gestureStep(cam0, a, [{ x: 120, y: 90 }]);
  assert.equal(r.cam.yaw, -20); assert.equal(r.cam.pitch, 59); assert.equal(r.cam.zoom, 1); assert.equal(r.cam.panX, 0);
});
test('pinch zooms about the centroid and two-finger drag pans', () => {
  const a = v.anchorOf([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
  const z = v.gestureStep(cam0, a, [{ x: 50, y: 100 }, { x: 250, y: 100 }], 150, 100);
  assert.equal(z.cam.zoom, 2); assert.equal(z.cam.panX, 0); assert.equal(z.cam.yaw, cam0.yaw);
  const p = v.gestureStep(z.cam, z.anchor, [{ x: 80, y: 130 }, { x: 280, y: 130 }], 150, 100);
  assert.equal(p.cam.zoom, 2); assert.equal(p.cam.panX, 30); assert.equal(p.cam.panY, 30);
});
test('touch count transitions 1 -> 2 -> 1 re-anchor without jumping', () => {
  let a = v.anchorOf([{ x: 10, y: 10 }]);
  let r = v.gestureStep(cam0, a, [{ x: 10, y: 10 }, { x: 300, y: 300 }]);
  assert.deepEqual(r.cam, cam0); assert.equal(r.anchor.n, 2);
  r = v.gestureStep(r.cam, r.anchor, [{ x: 300, y: 300 }]);
  assert.deepEqual(r.cam, cam0); assert.equal(r.anchor.n, 1);
  r = v.gestureStep(r.cam, r.anchor, [{ x: 302, y: 300 }]);
  assert.equal(r.cam.yaw, cam0.yaw + 1);
  assert.deepEqual(v.gestureStep(r.cam, r.anchor, []).cam, r.cam);
});
test('zoom is clamped', () => {
  const a = v.anchorOf([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
  assert.equal(v.gestureStep(cam0, a, [{ x: 0, y: 0 }, { x: 1, y: 0 }]).cam.zoom, v.ZOOM_MIN);
});
test('fit keeps the actual model inside the scene and refits on resize', () => {
  const sq = (x, y, n) => ({ number: n, facing: 'E', points: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }] });
  const g = geo.proportionedGeometry({ plots: [sq(5, 5, '1'), sq(80, 60, '2')], roads: [], northDegrees: null, notes: '' });
  for (const width of [360, 430]) {
    const { w, h } = v.sceneSize(width);
    const c = geo.fitCamera(g, cam0, 6, w, h);
    const pts = g.plots.flatMap((p) => p.points).map((p) => geo.project(p.x, p.y, 0, c, 6));
    for (const q of pts) { assert.ok(Math.abs(q.sx) <= w / 2 + 0.01); assert.ok(Math.abs(q.sy) <= h / 2 + 0.01); }
    const xs = pts.map((q) => q.sx); assert.ok(Math.max(...xs) - Math.min(...xs) > w * 0.5, 'no large empty padding');
  }
});
