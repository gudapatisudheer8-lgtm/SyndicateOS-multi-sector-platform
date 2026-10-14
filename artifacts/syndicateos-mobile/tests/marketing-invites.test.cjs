const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/marketingInvites.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(output, { exports: mod.exports, URL });
const { normalizeAgentMobile, marketingPortalEntry, invitationMessage, invitationExpiryText, InvitationMemory } = mod.exports;
const response = (extra = {}) => ({ invitationToken: 'A'.repeat(43), created: true, requiresPinChange: true, temporaryPin: '456789', ...extra });
const input = (extra = {}) => ({ projectId: 'project-one', agentName: ' Test Agent ', mobile: '9876543210', portalEntry: 'https://example.test/marketing', ...extra });

test('activation deadline is the server timestamp displayed in IST, not an invented duration', () => {
  const text = invitationExpiryText('2026-10-21T12:30:00Z');
  assert.match(text, /21 Oct 2026/);
  assert.match(text, /06:00 pm/i);
  assert.match(text, /After activation/);
  assert.match(text, /sessions expire separately/);
  assert.match(invitationExpiryText(), /unavailable/);
  assert.match(invitationExpiryText('invalid'), /unavailable/);
});
test('cached invitation renews only on an explicit action after the activation deadline', async () => {
  let clock = Date.parse('2026-10-14T00:00:00Z'), calls = 0;
  const memory = new InvitationMemory(() => clock);
  const create = async () => response({ invitationToken: (++calls === 1 ? 'A' : 'B').repeat(43), activationExpiresAt: new Date(clock + 1000).toISOString() });
  const one = await memory.obtain(input(), create);
  assert.equal(calls, 1);
  clock += 999;
  assert.equal(await memory.obtain(input(), create), one);
  clock += 1;
  assert.equal(calls, 1); // passing time alone never creates an invitation
  const two = await memory.obtain(input(), create);
  assert.equal(calls, 2);
  assert.notEqual(two.invitationToken, one.invitationToken);
  assert.match(invitationMessage({projectName:'Test',firmName:'Office',invite:two}), /Activate this link by/);
  memory.dispose();
});
test('invalid server deadlines fail explicitly instead of being cached or displayed as real expiry', async () => {
  const memory = new InvitationMemory();
  await assert.rejects(memory.obtain(input(), async () => response({activationExpiresAt:'not-a-date'})), /invalid invitation activation deadline/);
});

test('mobile normalization matches the existing web invitation form', () => {
  for (const n of ['9876543210', '+91 98765 43210', '09876543210']) assert.equal(normalizeAgentMobile(n), '+919876543210');
  for (const n of ['', '1234567890', '987654321', '+44 9876543210']) assert.equal(normalizeAgentMobile(n), null);
});
test('production browser invitations stay at the deployed web origin, not /mobile', () => {
  assert.equal(marketingPortalEntry({ platform: 'web', origin: 'https://example.test', domain: 'unused.test', development: false }), 'https://example.test/marketing');
});
test('native production uses its configured API/web host with the existing marketing entry', () => {
  assert.equal(marketingPortalEntry({ platform: 'android', domain: 'example.test', development: false }), 'https://example.test/marketing');
  assert.equal(marketingPortalEntry({ platform: 'ios', domain: 'example.test', development: false }), 'https://example.test/marketing');
});
test('Expo Preview invitations target the original web artifact on the main host', () => {
  const url = marketingPortalEntry({ platform: 'web', origin: 'https://demo.expo.sisko.replit.dev', domain: 'demo.sisko.replit.dev', development: true });
  assert.equal(url, 'https://demo.sisko.replit.dev/syndicateos-web/marketing');
  assert.equal(marketingPortalEntry({ platform: 'android', domain: 'demo.sisko.replit.dev', development: true }), url);
});
test('unconfigured or malformed portal domains fail before generating an invitation', () => {
  for (const domain of [undefined, 'https://example.test', 'example.test/mobile', 'demo.expo.sisko.replit.dev', 'user@example.test']) {
    assert.throws(() => marketingPortalEntry({ platform: 'android', domain, development: false }));
  }
  assert.throws(() => marketingPortalEntry({ platform: 'web', origin: 'https://demo.expo.sisko.replit.dev', development: true }));
  assert.throws(() => marketingPortalEntry({ platform: 'web', origin: 'https://example.test?session=private', development: false }));
});
test('creating the in-memory scope does not create an invitation; blank details are rejected locally', async () => {
  const memory = new InvitationMemory();
  let calls = 0; const create = async () => { calls++; return response(); };
  assert.equal(calls, 0);
  for (const data of [input({ agentName: '' }), input({ mobile: '123' }), input({ projectId: '' }), input({ portalEntry: 'https://example.test/owner' })]) {
    await assert.rejects(memory.obtain(data, create));
  }
  assert.equal(calls, 0);
});
test('rapid duplicate taps share one request and send only normalized employee/project fields', async () => {
  const memory = new InvitationMemory();
  let resolve, calls = 0, sent;
  const create = (body) => { calls++; sent = body; return new Promise((r) => { resolve = r; }); };
  const a = memory.obtain(input(), create), b = memory.obtain(input({ agentName: 'test agent' }), create);
  assert.equal(calls, 1); resolve(response());
  const [one, two] = await Promise.all([a, b]);
  assert.equal(one, two);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), { projectId: 'project-one', agentName: 'Test Agent', mobile: '+919876543210' });
  assert.equal(new URL(one.url).searchParams.get('invite'), 'A'.repeat(43));
  assert.equal([...new URL(one.url).searchParams.keys()].join(','), 'invite');
});
test('full first invitation and temporary PIN survive a failed/cancelled share without another request', async () => {
  const memory = new InvitationMemory(); let calls = 0;
  const create = async () => { calls++; return response(); };
  const first = await memory.obtain(input(), create);
  try { throw new Error('Clipboard unavailable'); } catch {}
  const retried = await memory.obtain(input(), create);
  assert.equal(retried, first); assert.equal(calls, 1);
  const message = invitationMessage({ projectName: 'Synthetic venture', firmName: 'Synthetic firm', invite: retried });
  assert.match(message, /456789/); assert.match(message, /first time/); assert.ok(message.includes(first.url));
});
test('activated employee re-invitation shares existing PIN instructions and strips a stale temporary PIN', async () => {
  const invite = await new InvitationMemory().obtain(input(), async () => response({ created: false, requiresPinChange: false }));
  assert.equal(invite.temporaryPin, undefined);
  const message = invitationMessage({ projectName: 'Synthetic venture', firmName: 'Synthetic firm', invite });
  assert.match(message, /existing PIN/); assert.doesNotMatch(message, /456789|temporary PIN:/);
});
test('missing temporary PIN is explained rather than invented', async () => {
  const invite = await new InvitationMemory().obtain(input(), async () => response({ temporaryPin: undefined }));
  assert.match(invitationMessage({ projectName: 'Synthetic venture', firmName: 'Synthetic firm', invite }), /given by the office/);
});
test('failed creation can be retried without keeping a rejected pending request', async () => {
  const memory = new InvitationMemory();
  await assert.rejects(memory.obtain(input(), async () => { throw new Error('Network unavailable'); }));
  assert.equal((await memory.obtain(input(), async () => response())).created, true);
});
test('closing/changing account during creation rejects late results and destroys cached credentials', async () => {
  const memory = new InvitationMemory(); let resolve;
  const request = memory.obtain(input(), () => new Promise((r) => { resolve = r; }));
  memory.dispose(); resolve(response());
  await assert.rejects(request, /closed|changed/);
  await assert.rejects(memory.obtain(input(), async () => response()), /closed|changed/);
});
test('a scope cannot reuse a previous project invitation for a different project', async () => {
  const memory = new InvitationMemory(); let calls = 0;
  const create = async () => { calls++; return response(); };
  await memory.obtain(input(), create);
  await assert.rejects(memory.obtain(input({ projectId: 'project-two' }), create), /changed/);
  assert.equal(calls, 1);
});
test('invalid server invitation payloads are rejected without caching', async () => {
  const memory = new InvitationMemory();
  await assert.rejects(memory.obtain(input(), async () => response({ invitationToken: 'bad' })), /valid personal invitation/);
  assert.equal((await memory.obtain(input(), async () => response())).invitationToken.length, 43);
});

test('the two named sections collapse independently without wrapping inventory or the share entry', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../screens/ErpBespoke.tsx'), 'utf8');
  assert.match(ui, /role === 'ACCOUNTANT' && !!resOf\(erp, 'bookings'\)\?\.canCreate/);
  assert.match(ui, /<CollapsibleSection title="Venture layout"[^>]*><NativeBlueprint[^>]*\/><\/CollapsibleSection>/);
  assert.match(ui, /<\/CollapsibleSection> : null\}\s*<Plots erp=\{erp\} ctx=\{ctx\} \/>/);
  assert.match(ui, /<CollapsibleSection[^>]*title="Project Layout Summary"[^>]*><LayoutSummary[\s\S]*?\/><\/CollapsibleSection> : null\}\s*<Card/);
  assert.ok(ui.indexOf('testID="open-marketing-share"') < ui.indexOf('testID="toggle-venture-layout"'));
  assert.match(ui, /ctx\.project\?\.id.*ctx\.account\.identityId.*ctx\.account\.role/);
});
test('collapsed bodies mount lazily, then remain mounted with interaction and accessibility hidden', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../components/CollapsibleSection.tsx'), 'utf8');
  assert.match(ui, /\[open, setOpen\] = useState\(false\)/);
  assert.match(ui, /\{mounted \? \(/);
  assert.match(ui, /display: open \? 'flex' : 'none'/);
  assert.match(ui, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(ui, /pointerEvents=\{open \? 'auto' : 'none'\}/);
  assert.match(ui, /accessibilityElementsHidden=\{!open\}/);
  assert.doesNotMatch(ui, /setMounted\(false\)/);
});
test('sharing keeps messages private, uses full invitation copy, and rejects stale component responses', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../screens/NativeMarketingShare.tsx'), 'utf8');
  assert.match(ui, /Copy full invitation \(link and PIN\)/);
  assert.match(ui, /scope\.dispose\(\)/);
  assert.match(ui, /if \(!got \|\| !alive\.current\) return/);
  assert.match(ui, /if \(lock\.current\) return/);
  assert.match(ui, /await clip\.writeText\(text\)/);
  assert.doesNotMatch(ui, /console\.|localStorage|AsyncStorage|SecureStore/);
});
