const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    assert.ok(filename.startsWith(sourceRoot));
    const source = fs.readFileSync(filename, 'utf8').replace(/\bimport\.meta\.env\b/g, '({BASE_URL:"/",DEV:false})');
    const { outputText } = ts.transpileModule(source, {compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    }, fileName: filename});
    module._compile(outputText, filename);
  };
}
const geometry = require('../src/original/components/blueprint/blueprintGeometry.ts');
const { Blueprint3DView } = require('../src/original/components/blueprint/Blueprint3DView.tsx');
const sample = () => ({
  plots: [{number:'1', facing:'UNKNOWN', points:[{x:10,y:10},{x:30,y:10},{x:30,y:30},{x:10,y:30}]}],
  roads: [{name:'Main road',widthFeet:30,points:[{x:0,y:35},{x:100,y:35},{x:100,y:45},{x:0,y:45}]}],
  northDegrees:null,aspectRatio:2,notes:'Synthetic test only',
});
test('reviewed geometry preserves source proportions and original arrays', () => {
  const original=sample(),copy=geometry.cloneGeometry(original);
  const view=geometry.proportionedGeometry(copy);
  assert.equal(view.plots[0].points[0].y,30);
  assert.equal(original.plots[0].points[0].y,10);
  assert.equal(copy.aspectRatio,2);
  const p=geometry.project(10,10,0,geometry.DEFAULT_CAMERA,5);
  assert.ok(Number.isFinite(p.sx)&&Number.isFinite(p.sy));
});
test('3D presentation keeps internal road labels opt-in so plot numbers remain readable', () => {
  const g = sample();
  g.roads.push({...g.roads[0], name:'Suggested connector East'});
  const html = renderToStaticMarkup(React.createElement(Blueprint3DView,{geometry:g,plots:[]}));
  assert.match(html, /Main road/);
  assert.match(html, /Show internal road labels/);
  assert.doesNotMatch(html, /Suggested connector East/);
  assert.match(html, /aria-pressed="false"/);
});
test('confirmation rejects unknown labels until marked plan-only, and unknown widths remain unknown', () => {
  const model=sample();model.roads[0].widthFeet=null;
  assert.ok(geometry.validateGeometry(model,[],true).length>0);
  model.plots[0].referenceOnly=true;
  assert.equal(geometry.validateGeometry(model,[],true).length,0);
  assert.equal(model.roads[0].widthFeet,null);
});
test('confirmed viewer renders SVG and honest unknown labels without changing booking records', () => {
  const model=sample();model.roads[0].widthFeet=null;
  const plots=Object.freeze([Object.freeze({plotNumber:'1',status:'booked',projectId:'test'})]);
  const before=JSON.stringify(plots);
  const html=renderToStaticMarkup(React.createElement(Blueprint3DView,{geometry:model,plots}));
  assert.match(html,/<svg/);assert.match(html,/cadastral survey/i);
  assert.match(html,/unknown/i);assert.match(html,/Rotate|rotate/);
  assert.equal(JSON.stringify(plots),before);
});

const v2 = () => ({
  layoutVersion:2, origin:'PROJECT', inventoryFingerprint:'fp', units:'feet', northDegrees:0, notes:'', aspectRatio:null,
  scale:{widthFeet:200,heightFeet:100,provenance:'schematic'},
  plots:[
    {id:'a',number:'1',facing:'N',points:[{x:10,y:40},{x:30,y:40},{x:30,y:80},{x:10,y:80}],rotationDegrees:0,measurementSource:'recorded',dimensions:'40x40'},
    {id:'b',number:'2',facing:'N',points:[{x:40,y:40},{x:60,y:40},{x:60,y:80},{x:40,y:80}],rotationDegrees:0,measurementSource:'schematic'},
  ],
  roads:[{id:'r',name:'Approach',widthFeet:30,lengthFeet:null,points:[{x:0,y:10},{x:100,y:10},{x:100,y:40},{x:0,y:40}]}],
  parks:[{id:'k',name:'Park',points:[{x:70,y:50},{x:90,y:50},{x:90,y:90},{x:70,y:90}],targetAreaSqYards:2000}],
  boundary:{points:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]},
});
test('clone and projection preserve scale, parks and boundary', () => {
  const g=v2(),c=geometry.cloneGeometry(g);
  c.parks[0].points[0].x=1;c.scale.widthFeet=9;
  assert.equal(g.parks[0].points[0].x,70);assert.equal(g.scale.widthFeet,200);
  const p=geometry.proportionedGeometry(g);
  assert.equal(p.parks.length,1);assert.ok(p.boundary);assert.equal(p.scale.provenance,'schematic');
  assert.equal(geometry.displayAspect(g),2);
});
test('move, rotate and road building keep shapes in the workspace and do not touch facing', () => {
  const g=v2();
  const moved=geometry.translatePoints(g.plots[0].points,500,0);
  assert.ok(moved.every((q)=>q.x<=100));
  const w0=geometry.frameOf(g.plots[0].points,0,g.scale).widthFt;
  const r=geometry.rotatePoints(g.plots[0].points,90,g.scale);
  assert.ok(Math.abs(geometry.frameOf(r,90,g.scale).widthFt-w0)<0.1);
  assert.ok(Math.abs(geometry.areaSqFt(r,g.scale)-geometry.areaSqFt(g.plots[0].points,g.scale))<1);
  assert.equal(g.plots[0].facing,'N');
  const road=geometry.roadFromLine({x:0,y:50},{x:50,y:50},20,g.scale);
  assert.equal(road.points.length,4);assert.equal(road.lengthFeet,100);
  assert.ok(Math.abs(geometry.areaSqFt(road.points,g.scale)-2000)<5);
});
test('blocking validation catches degenerate and duplicate shapes; advisories stay advisory', () => {
  const g=v2();
  assert.deepEqual(geometry.validateGeometry(g,['1','2'],true),[]);
  assert.ok(geometry.validateGeometry(g,['1','2','3'],true).some((m)=>/Missing: 3/.test(m)));
  const bad=geometry.cloneGeometry(g);bad.parks[0].points=[{x:1,y:1},{x:2,y:2},{x:3,y:3}];
  assert.ok(geometry.validateGeometry(bad,['1','2'],false).some((m)=>/no area/.test(m)));
  bad.plots[1].number='1';
  assert.ok(geometry.validateGeometry(bad,['1','2'],false).some((m)=>/more than once/.test(m)));
  const ov=geometry.cloneGeometry(g);ov.plots[1].points=ov.plots[0].points.map((q)=>({x:q.x+5,y:q.y}));
  const adv=geometry.layoutAdvisories(ov,[{number:'1'},{number:'2'}]);
  assert.ok(adv.some((a)=>a.kind==='overlap'));
  assert.ok(geometry.layoutAdvisories(g,[{number:'1'},{number:'2'}]).some((a)=>a.kind==='area'));
  const far=geometry.cloneGeometry(g);far.roads.push({name:'Loose',widthFeet:null,points:[{x:95,y:95},{x:99,y:95},{x:99,y:99},{x:95,y:99}]});
  assert.ok(geometry.layoutAdvisories(far,[]).some((a)=>a.kind==='roads'));
});
test('legacy two-point roads upgrade to polygons and undo/redo restores edits', () => {
  const legacy={plots:[],roads:[{name:'Old',widthFeet:null,points:[{x:10,y:50},{x:90,y:50}]}],northDegrees:null,notes:'',aspectRatio:1};
  const n=geometry.normalizeForEdit(legacy);
  assert.equal(n.roads[0].points.length,4);assert.equal(n.roads[0].widthFeet,null);assert.equal(legacy.roads[0].points.length,2);
  let h=geometry.historyOf(v2());const before=h.present;
  h=geometry.pushHistory(h,{...before,northDegrees:90});
  h=geometry.undoHistory(h);assert.equal(h.present,before);
  h=geometry.redoHistory(h);assert.equal(h.present.northDegrees,90);
});
test('3D viewer renders parks and polygon roads for a v2 layout', () => {
  const html=renderToStaticMarkup(React.createElement(Blueprint3DView,{geometry:v2(),plots:[{plotNumber:'1',status:'sold',projectId:'t'}]}));
  assert.match(html,/Park/);assert.match(html,/Approach/);assert.match(html,/Customer presentation/);
});
test('boundary provenance survives clone and projection', () => {
  const g=v2();g.boundary.provenance='drawn';
  assert.equal(geometry.cloneGeometry(g).boundary.provenance,'drawn');
  assert.equal(geometry.proportionedGeometry(g).boundary.provenance,'drawn');
});
test('mobile geometry mirror is byte-identical to web', () => {
  const web=fs.readFileSync(path.resolve(__dirname,'../src/original/components/blueprint/blueprintGeometry.ts'),'utf8');
  const mob=fs.readFileSync(path.resolve(__dirname,'../../syndicateos-mobile/lib/blueprintGeometry.ts'),'utf8');
  assert.equal(mob,web);
});
test('bbox culling keeps overlap results and 300-plot advisories stay fast', () => {
  const sq=(x,y,w)=>[{x,y},{x:x+w,y},{x:x+w,y:y+w},{x,y:y+w}];
  assert.equal(geometry.polygonsOverlap(sq(0,0,10),sq(50,50,10)),false);
  assert.equal(geometry.polygonsOverlap(sq(0,0,10),sq(5,5,10)),true);
  assert.equal(geometry.polygonsOverlap(sq(0,0,10),sq(10,0,10)),false);
  assert.equal(geometry.polygonsOverlap(sq(0,0,10),sq(2,2,3)),true);
  const plots=[];const inv=[];
  for(let i=0;i<300;i++){const r=Math.floor(i/20),c=i%20;plots.push({id:'p'+i,number:String(i+1),facing:'N',points:sq(c*4.8+1,r*6+3,4)});inv.push({number:String(i+1)});}
  plots[1].points=sq(plots[0].points[0].x+1,plots[0].points[0].y,4);
  const roads=[];for(let r=0;r<15;r++)roads.push({name:'R'+r,widthFeet:null,points:[{x:0,y:r*6+7.2},{x:100,y:r*6+7.2},{x:100,y:r*6+8.8},{x:0,y:r*6+8.8}]});
  const g={...v2(),plots,roads,parks:[]};
  const t=process.hrtime.bigint();
  const adv=geometry.layoutAdvisories(g,inv);
  const ms=Number(process.hrtime.bigint()-t)/1e6;
  assert.ok(adv.some((a)=>a.kind==='overlap'&&/Plot 1 \/ Plot 2/.test(a.text)));
  assert.ok(ms<1500,`advisories took ${ms}ms`);
});
