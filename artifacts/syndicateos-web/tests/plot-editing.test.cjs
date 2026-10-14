const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { test } = require('node:test');

function loadEditor() {
  const cache = new Map();
  const directory = path.resolve(__dirname, '../src/original/components/modals');
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} };
    cache.set(name, module);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(directory, `${name}.tsx`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', compiled)((dependency) => {
      if (dependency === './ProjectPlotEditor' || dependency === './EditProjectModal') return load(dependency.slice(2));
      if (dependency === './PlanDocumentUploader') return { PlanDocumentUploader: () => null };
      if (dependency === './ProjectDocumentsManager') return { ProjectDocumentsManager: () => null };
      if (dependency === '../../../adapter/api') return { downloadProjectAttachment: async () => {} };
      return require(dependency);
    }, module, module.exports);
    return module.exports;
  }
  return load('ProjectPlotEditor');
}

const fields = [
  { key: 'plotNumber', kind: 'text', label: 'Plot Number', required: true },
  { key: 'status', kind: 'select', label: 'Status', options: ['available', 'reserved', 'sold'], required: true },
  { key: 'areaSqYards', kind: 'number', label: 'Area', required: true, min: 0 },
  { key: 'facing', kind: 'select', label: 'Facing', required: true, options: ['East', 'North'] },
  { key: 'notes', kind: 'multiline', label: 'Notes' },
];
const record = { id: 'plot-1', revision: 3, status: 'approved',
  data: { plotNumber: '1', status: 'available', areaSqYards: 100, facing: 'East', notes: 'Original' } };

test('plot changes retain IDs/revisions, normalize numbers and cannot alter status', () => {
  const { buildPlotEdits } = loadEditor();
  assert.deepEqual(buildPlotEdits(fields, [record], { [record.id]: { ...record.data } }), []);
  const drafts = { [record.id]: { ...record.data, areaSqYards: '120', status: 'sold', unknown: 'not configured' } };
  const changes = buildPlotEdits(fields, [record], drafts);
  assert.deepEqual(changes, [{ recordId: 'plot-1', revision: 3,
    data: { plotNumber: '1', status: 'available', areaSqYards: 120, facing: 'East', notes: 'Original' } }]);
  assert.equal(record.data.areaSqYards, 100);
});

test('invalid plot values yield field errors and booking states are locked', () => {
  const { plotEditErrors, isPlotLocked } = loadEditor();
  const errors = plotEditErrors(fields, [record], { [record.id]: {
    ...record.data, plotNumber: '', areaSqYards: '-1', facing: 'Invalid',
  } });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((error) => error.includes('Plot Number is required')));
  assert.equal(isPlotLocked(record, true), false);
  assert.equal(isPlotLocked(record, false), true);
  assert.equal(isPlotLocked({ ...record, status: 'pending' }, true), true);
  for (const status of ['reserved', 'sold', 'blocked']) {
    assert.equal(isPlotLocked({ ...record, data: { ...record.data, status } }, true), true);
  }
});

test('the editor renders saved fields with status protected and booked fields disabled', () => {
  const { ProjectPlotEditor } = loadEditor();
  const render = (data) => renderToStaticMarkup(React.createElement(ProjectPlotEditor, {
    fields, records: [data], drafts: {}, onChangeDrafts: () => {}, canManage: true, disabled: false,
  }));
  const available = render(record);
  assert.match(available, /Plot Number/);
  assert.match(available, /100 sq\.yd/);
  assert.match(available, /Notes/);
  const booked = render({ ...record, data: { ...record.data, status: 'reserved' } });
  assert.match(booked, /Booking.protected/);
  assert.ok((booked.match(/disabled=""/g) || []).length >= 4);
});
