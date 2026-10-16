// Offline tests for dsh-pelican-watch: pure helpers, storage lifecycle, and a
// full apply() wiring against a fake ctx + fake fetch (no network, no DSH).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  apply,
  stripFences,
  extractSvg,
  modelSafe,
  saveRun,
  parseMeta,
  listGallery,
  prune,
  readKeyFromCredentials,
  scoreDrawing,
  summarizeRuns,
  parseProviderRows,
  normalizeTargets,
  loadSettings,
  saveSettings,
  PROMPT,
} from '../lib/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pelican-watch-'));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><circle cx="60" cy="240" r="40"/><circle cx="340" cy="240" r="40"/></svg>';
const PAGE = `<!doctype html><html><body>${SVG}</body></html>`;

// ---- stripFences / extractSvg / modelSafe ----
assert.equal(stripFences('```html\n<html></html>\n```'), '<html></html>');
assert.equal(stripFences('```\n<html></html>\n```'), '<html></html>');
assert.equal(stripFences('<html></html>'), '<html></html>');
assert.deepEqual(extractSvg(PAGE), SVG);
assert.equal(extractSvg('no drawing here'), null);
assert.equal(extractSvg('<svg>a</svg> tail <b>x</b>'), '<svg>a</svg>');
assert.equal(modelSafe('glm-5.3-flash'), 'glm-5.3-flash');
assert.equal(modelSafe('a/b\\c:d'), 'a-b-c-d');

// ---- saveRun / listGallery / parseMeta ----
const dir = path.join(tmp, 'gallery');
const first = saveRun(dir, 'test-model', PAGE, 1234);
assert.ok(first.ok === true, 'first run has an svg');
assert.ok(first.id.endsWith('test-model'));
assert.equal(parseMeta(fs.readFileSync(path.join(dir, `${first.id}.html`), 'utf8')).model, 'test-model');
assert.ok(fs.existsSync(path.join(dir, `${first.id}.svg`)), 'svg side file written');

const refused = saveRun(dir, 'test-model', '抱歉，我无法完成这个请求。', 200);
assert.equal(refused.ok, false, 'refusal has no svg');
assert.ok(!fs.existsSync(path.join(dir, `${refused.id}.svg`)), 'no svg file for a refusal');

// same-second runs must not overwrite each other
const again = saveRun(dir, 'test-model', PAGE, 999);
assert.notEqual(again.id, first.id, 'second same-second save gets a distinct id');

const listed = listGallery(dir, 12);
assert.equal(listed.length, 3);
assert.equal(listed[0].id, again.id, 'newest first');
assert.equal(listed.find((r) => r.id === first.id).hasSvg, true);
assert.equal(listed.find((r) => r.id === refused.id).hasSvg, false);
assert.equal(listed.find((r) => r.id === first.id).ms, 1234);

// ---- prune keeps the newest max and drops both html+svg ----
for (let i = 0; i < 14; i += 1) saveRun(dir, 'bulk-model', PAGE, i * 10);
assert.equal(prune(dir, 12), 5, '15 + 1 older refusal rows… pruned down to 12');
assert.equal(listGallery(dir, 99).length, 12);
assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.html')).length, 12);

// ---- apply() wiring with a fake ctx + fake fetch ----
const routes = {};
const effectDisposes = [];
const ctx = {
  effect: (fn) => { const d = fn(); if (typeof d === 'function') effectDisposes.push(d); return d; },
  webServer: { register: (r) => { routes[r.path] = r; return () => delete routes[r.path]; } },
};
const pluginDir = path.join(tmp, 'plugin-gallery');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ choices: [{ message: { content: PAGE } }] }),
});
try {
  apply(ctx, {
    dir: pluginDir,
    model: 'probe-model',
    apiKey: 'sk-test',
    baseURL: 'http://fake.local/v1',
    intervalMinutes: 30,
    maxImages: 12,
    runOnStart: false,
  });
  assert.ok(routes['/api/pelican-watch/list'], 'list route registered');
  assert.ok(routes['/api/pelican-watch/run'], 'run route registered');

  const fakeRes = () => {
    const r = { code: 0, headers: {}, body: '' };
    r.writeHead = (code, headers) => { r.code = code; Object.assign(r.headers, headers); };
    r.end = (body) => { r.body = body; };
    return r;
  };
  const req = (method, url) => ({ method, url, headers: { 'sec-fetch-site': 'same-origin' }, async *[Symbol.asyncIterator]() {} });

  // trigger a run through the HTTP surface (fire-and-forget) and wait for it
  const runRes = fakeRes();
  await routes['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), runRes);
  assert.equal(runRes.code, 200);
  await new Promise((r) => setTimeout(r, 120));

  const listRes = fakeRes();
  await routes['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  const payload = JSON.parse(listRes.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.images.length, 1, 'the triggered run was saved');
  assert.equal(payload.images[0].model, 'probe-model');
  assert.equal(payload.images[0].hasSvg, true);

  // image route serves the svg side file with a locked-down content type
  const imgRes = fakeRes();
  await routes['/api/pelican-watch/image'].handler(req('GET', `/api/pelican-watch/image?id=${encodeURIComponent(payload.images[0].id)}`), imgRes);
  assert.equal(imgRes.code, 200);
  assert.equal(imgRes.headers['content-type'], 'image/svg+xml; charset=utf-8');
  assert.equal(imgRes.headers['x-content-type-options'], 'nosniff');
  assert.ok(String(imgRes.body).startsWith('<svg'), 'svg body served');

  // raw route serves the page source as text/plain (rendered via sandboxed iframe)
  const rawRes = fakeRes();
  await routes['/api/pelican-watch/raw'].handler(req('GET', `/api/pelican-watch/raw?id=${encodeURIComponent(payload.images[0].id)}`), rawRes);
  assert.equal(rawRes.code, 200);
  assert.ok(String(rawRes.headers['content-type']).startsWith('text/plain'));
  assert.ok(String(rawRes.body).includes('<!doctype html>'));

  // traversal attempts are rejected
  for (const evil of ['..%2F..%2Fetc%2Fpasswd', '..', 'a/b', '%2e%2e']) {
    const badRes = fakeRes();
    await routes['/api/pelican-watch/image'].handler(req('GET', `/api/pelican-watch/image?id=${evil}`), badRes);
    assert.equal(badRes.code, 404, `traversal rejected: ${evil}`);
  }

  // missing key → clear error surfaced through the list payload
  const noKeyCtx = {
    effect: (fn) => { const d = fn(); if (typeof d === 'function') effectDisposes.push(d); return d; },
    webServer: { register: (r) => { routes[`${r.path}:nk`] = r; return () => {}; } },
  };
  const savedEnv = process.env.PELICAN_TEST_KEY;
  delete process.env.PELICAN_TEST_KEY;
  apply(noKeyCtx, {
    dir: path.join(tmp, 'nk'),
    apiKeyEnv: 'PELICAN_TEST_KEY',
    credentialsFile: path.join(tmp, 'no-key-store.yaml'), // hermetic: never read the real store
    runOnStart: false,
  });
  const nkList = fakeRes();
  await routes['/api/pelican-watch/list:nk'].handler(req('GET', '/api/pelican-watch/list'), nkList);
  const nkPayload = JSON.parse(nkList.body);
  await routes['/api/pelican-watch/run:nk'].handler(req('POST', '/api/pelican-watch/run'), fakeRes());
  await new Promise((r) => setTimeout(r, 50));
  const nkList2 = fakeRes();
  await routes['/api/pelican-watch/list:nk'].handler(req('GET', '/api/pelican-watch/list'), nkList2);
  const nkPayload2 = JSON.parse(nkList2.body);
  assert.ok(nkPayload2.lastError && nkPayload2.lastError.includes('PELICAN_TEST_KEY'), 'missing key is reported');
  assert.equal(nkPayload2.images.length, 0);
  if (savedEnv !== undefined) process.env.PELICAN_TEST_KEY = savedEnv;

  // ---- key resolution: config > env > DSH's credential store ----
  // The GUI app does not inherit shell env vars, so the credential store is the
  // source that makes a DSH-configured provider key work out of the box.
  const credsFile = path.join(tmp, 'credentials.yaml');
  fs.writeFileSync(credsFile, [
    'version: 1',
    'records:',
    '  client-connection/browser-session:',
    '    kind: grant',
    'refs:',
    '  PELICAN_PK_KEY: from-file',
    '  OTHER_KEY: "quoted-value"  # trailing comment',
    'later:',
    '  PELICAN_PK_KEY: ignored-outside-refs',
    '',
  ].join('\n'));
  const garbage = path.join(tmp, 'garbage.yaml');
  fs.writeFileSync(garbage, 'this is not: [valid\n  yaml at all');

  // unit level: the tiny reader degrades to null instead of throwing
  assert.equal(readKeyFromCredentials('PELICAN_PK_KEY', credsFile), 'from-file');
  assert.equal(readKeyFromCredentials('OTHER_KEY', credsFile), 'quoted-value', 'quotes and comment stripped');
  assert.equal(readKeyFromCredentials('MISSING_KEY', credsFile), null, 'unknown ref');
  assert.equal(readKeyFromCredentials('PELICAN_PK_KEY', path.join(tmp, 'nope.yaml')), null, 'missing file');
  assert.equal(readKeyFromCredentials('PELICAN_PK_KEY', garbage), null, 'garbage file');
  assert.equal(readKeyFromCredentials('', credsFile), null, 'no env name');
  assert.equal(readKeyFromCredentials('PELICAN_PK_KEY', path.join(tmp, 'later-key.yaml')) , null, 'reference file absent');

  // end to end: the authorization header the request actually carries
  const authSeen = [];
  globalThis.fetch = async (url, init) => {
    authSeen.push(init.headers.authorization);
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: PAGE } }] }),
    };
  };
  const keyRoutes = {};
  const keyCtx = {
    effect: (fn) => { const d = fn(); if (typeof d === 'function') effectDisposes.push(d); return d; },
    webServer: { register: (r) => { keyRoutes[r.path] = r; return () => {}; } },
  };
  apply(keyCtx, {
    dir: path.join(tmp, 'keys'),
    model: 'probe-model',
    apiKeyEnv: 'PELICAN_PK_KEY',
    credentialsFile: credsFile,
    runOnStart: false,
  });
  const trigger = async () => {
    await keyRoutes['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), fakeRes());
    await new Promise((r) => setTimeout(r, 80));
  };
  process.env.PELICAN_PK_KEY = 'from-env';
  await trigger();
  assert.equal(authSeen.at(-1), 'Bearer from-env', 'env beats the credential store');
  delete process.env.PELICAN_PK_KEY;
  await trigger();
  assert.equal(authSeen.at(-1), 'Bearer from-file', 'the credential store is the last fallback');

  // runOnStart arms the schedule; disposing the effect clears it
  const armCtx = {
    effect: (fn) => { const d = fn(); effectDisposes.push(d); return d; },
    webServer: { register: () => () => {} },
  };
  apply(armCtx, { dir: path.join(tmp, 'arm'), apiKey: 'sk-x', runOnStart: true });
  const armRes = fakeRes();
  await routes['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), armRes);
  assert.ok(JSON.parse(armRes.body).nextRunAt > Date.now(), 'next run armed');
} finally {
  globalThis.fetch = realFetch;
  for (const d of effectDisposes) { try { d(); } catch { /* ignore */ } }
}

// the prompt is the fixed benchmark text and never mentions tools/skills
assert.ok(PROMPT.includes('鹈鹕') && PROMPT.includes('自行车'));
assert.ok(!/skill|工具|agent/i.test(PROMPT), 'prompt stays a pure drawing task');

// ---- IQ rubric ----
const GOOD_PAGE = `<!doctype html><html><body><svg viewBox="0 0 400 300">
<g id="frame"><path d="M60 240 L160 150"/><path d="M160 150 L260 240"/><path d="M160 150 L120 110"/>
<line x1="1" y1="2" x2="3" y2="4"/><line x1="5" y1="6" x2="7" y2="8"/><line x1="9" y1="10" x2="11" y2="12"/>
<polyline points="1,1 2,2 3,3"/></g>
<circle id="wheel-front" cx="60" cy="240" r="40"/><circle id="wheel-back" cx="300" cy="240" r="40"/>
<rect id="handlebar" x="100" y="90" width="40" height="6"/>
<ellipse id="saddle" cx="150" cy="120" rx="18" ry="6"/>
<circle id="pedal-crank" cx="170" cy="200" r="8"/>
<path id="pelican-body" d="M200 140 q20 -30 40 0"/><path id="pelican-wing" d="M210 150 q15 10 30 0"/>
<path id="beak" d="M240 145 l30 6 l-30 6z"/></svg></body></html>`;
assert.equal(scoreDrawing(GOOD_PAGE).score, 100, 'a complete drawing hits every rubric line');
assert.ok(scoreDrawing(GOOD_PAGE).features.includes('wheels'));
assert.equal(scoreDrawing('很抱歉，我不能画这个。').score, 0, 'a refusal scores zero');
assert.ok(scoreDrawing('这里只有文字，没有图。').features.length === 0);
assert.equal(scoreDrawing('').score, 0, 'empty answer scores zero');

// ---- per-model roll-up (the IQ board) ----
const summary = summarizeRuns([
  { model: 'alpha', provider: 'p', score: 90, ms: 1000, ok: true, time: '2026-01-03T00:00:00Z' },
  { model: 'alpha', provider: 'p', score: 80, ms: 2000, ok: true, time: '2026-01-02T00:00:00Z' },
  { model: 'alpha', provider: 'p', score: 70, ms: 3000, ok: false, time: '2026-01-01T00:00:00Z' },
  { model: 'beta', provider: 'q', score: 40, ms: 500, ok: true, time: '2026-01-01T00:00:00Z' },
]);
assert.deepEqual(summary.map((r) => r.model), ['alpha', 'beta'], 'best latest score first');
assert.deepEqual(
  { count: summary[0].count, latest: summary[0].latest, avg: summary[0].avg, best: summary[0].best, worst: summary[0].worst },
  { count: 3, latest: 90, avg: 80, best: 90, worst: 70 },
);
assert.equal(summary[0].trend, 15, 'trend = latest vs the average of the older runs');
assert.equal(summary[0].avgMs, 2000);
assert.equal(summary[0].refusals, 1);
assert.equal(summary[1].trend, 0, 'a single run has no trend');
assert.deepEqual(summarizeRuns([]), []);

// ---- provider discovery out of a profile patch layer ----
const PATCH = `- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      taotoken:
        displayName: taotoken
        apiKeyEnv: TAOTOKEN_API_KEY
        api: openai-completions
        baseURL: https://taotoken.net/api/v1
        models:
          - id: deepseek-flash
            name: deepseek-flash
          - id: glm-5.3-flash
            name: GLM-5.3-Flash
      other:
        baseURL: "https://other.example/v1"  # comment
        apiKeyEnv: OTHER_KEY
        models:
          - name: only-names
- id: ui-chat
  config:
    transcriptView: standard
`;
const parsed = parseProviderRows(PATCH);
assert.deepEqual(parsed.map((p) => p.provider), ['taotoken', 'other']);
assert.equal(parsed[0].baseURL, 'https://taotoken.net/api/v1');
assert.equal(parsed[0].apiKeyEnv, 'TAOTOKEN_API_KEY');
assert.deepEqual(parsed[0].models, ['deepseek-flash', 'glm-5.3-flash']);
assert.equal(parsed[1].baseURL, 'https://other.example/v1', 'quotes and comment stripped');
assert.deepEqual(parsed[1].models, ['only-names'], 'a models list with only names still works');
assert.deepEqual(parseProviderRows('not: [valid yaml'), [], 'unknown shapes discover nothing');

// ---- target list validation ----
assert.equal(normalizeTargets([{ model: 'x' }, { model: 'x' }], []).length, 1, 'de-duplicated');
assert.equal(normalizeTargets(Array.from({ length: 20 }, (_, i) => ({ model: `m${i}` })), []).length, 12, 'capped');
assert.deepEqual(normalizeTargets([{}, null, { model: '' }, { model: 7 }], [{ model: 'fallback' }]), [{ model: 'fallback' }]);
const roundTrip = path.join(tmp, 'settings');
saveSettings(roundTrip, { targets: [{ provider: 'p', baseURL: 'u', apiKeyEnv: 'K', model: 'm' }] });
assert.equal(loadSettings(roundTrip).targets[0].model, 'm');
assert.deepEqual(loadSettings(path.join(tmp, 'no-settings')), {}, 'missing settings file');

// ---- multi-target: catalog discovery, selection persistence, per-model run ----
{
  const disposerMark = effectDisposes.length;
  try {
  const routes2 = {};
  const dir2 = path.join(tmp, 'multi');
  const ctx2 = {
    effect: (fn) => { const d = fn(); if (typeof d === 'function') effectDisposes.push(d); return d; },
    webServer: { register: (r) => { routes2[r.path] = r; return () => {}; } },
  };
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/models')) {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'live-a' }, { id: 'live-b' }] }), text: async () => '' };
    }
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: PAGE } }] }) };
  };
  const reqBody = (method, url, payload) => ({
    method,
    url,
    headers: { 'sec-fetch-site': 'same-origin' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(payload)); },
  });
  const fakeRes = () => {
    const r = { code: 0, headers: {}, body: '' };
    r.writeHead = (code, headers) => { r.code = code; Object.assign(r.headers, headers); };
    r.end = (body) => { r.body = body; };
    return r;
  };
  const req = (method, url) => ({ method, url, headers: { 'sec-fetch-site': 'same-origin' }, async *[Symbol.asyncIterator]() {} });
  apply(ctx2, {
    dir: dir2,
    provider: 'p-test',
    baseURL: 'http://fake.local/v1',
    apiKeyEnv: 'PELICAN_MULTI_KEY',
    apiKey: 'sk-multi',
    model: 'seed-model',
    runOnStart: false,
    credentialsFile: path.join(tmp, 'none.yaml'),
  });

  // the picker's catalog: live /models discovery merged with the seed model
  const catRes = fakeRes();
  await routes2['/api/pelican-watch/catalog'].handler(req('GET', '/api/pelican-watch/catalog?refresh=1'), catRes);
  const catalog = JSON.parse(catRes.body);
  const row = catalog.providers.find((p) => p.provider === 'p-test');
  assert.ok(row, 'the configured provider appears in the picker');
  for (const id of ['seed-model', 'live-a', 'live-b']) {
    assert.ok(row.models.includes(id), `discovered model ${id}`);
  }
  assert.equal(row.keyAvailable, true);

  // saving a selection persists it and never echoes key material
  const saveRes = fakeRes();
  await routes2['/api/pelican-watch/targets'].handler(
    reqBody('POST', '/api/pelican-watch/targets', {
      targets: [{ provider: 'p-test', baseURL: 'http://fake.local/v1', apiKeyEnv: 'PELICAN_MULTI_KEY', model: 'live-a', apiKey: 'sk-secret' }],
    }),
    saveRes,
  );
  assert.equal(saveRes.code, 200);
  assert.ok(!saveRes.body.includes('sk-secret'), 'keys never travel to the browser');
  assert.equal(loadSettings(dir2).targets[0].model, 'live-a', 'selection persisted to disk');

  // an empty selection is refused
  const emptyRes = fakeRes();
  await routes2['/api/pelican-watch/targets'].handler(reqBody('POST', '/api/pelican-watch/targets', { targets: [] }), emptyRes);
  assert.equal(emptyRes.code, 400, 'cannot save an empty selection');

  // running one model runs only that model, and it lands in that model's row
  const runRes2 = fakeRes();
  await routes2['/api/pelican-watch/run'].handler(
    reqBody('POST', '/api/pelican-watch/run', { model: 'live-a', provider: 'p-test' }),
    runRes2,
  );
  await new Promise((r) => setTimeout(r, 120));
  const listRes2 = fakeRes();
  await routes2['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes2);
  const list2 = JSON.parse(listRes2.body);
  assert.equal(list2.images.length, 1, 'only the requested model ran');
  assert.equal(list2.images[0].model, 'live-a');
  assert.equal(typeof list2.images[0].score, 'number');
  assert.equal(Array.isArray(list2.images[0].features), true);
  assert.equal(list2.targets.length, 1);
  assert.equal(list2.summary[0].model, 'live-a');
  assert.equal(list2.summary[0].count, 1);
  } finally {
    // these effects own a 30-minute timer: dispose them or the test never exits
    for (const d of effectDisposes.slice(disposerMark)) { try { d(); } catch { /* ignore */ } }
  }
}

// ---- client entry contract: BOTH apply and inject must be exported ----
// A bare `return { apply }` makes the entry fail to activate and aborts the
// whole web boot ("1 entry did not activate"). Load the real client source
// through a ModuleLoader shim and assert the export shape.
{
  const captured = [];
  const fakeWindow = { __ModuleLoader__: { load: (def) => captured.push(def) } };
  const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  const fakeRequire = (name) => {
    if (name === 'react') return { createElement: () => null };
    throw new Error(`unexpected require: ${name}`);
  };
  new Function('window', 'require', source)(fakeWindow, fakeRequire);
  assert.equal(captured.length, 1, 'client registers exactly one module');
  const clientExports = captured[0].factory(fakeRequire);
  assert.equal(typeof clientExports.apply, 'function', 'client must export apply');
  assert.ok(Array.isArray(clientExports.inject), 'client must export inject');
  assert.ok(clientExports.inject.includes('slots') && clientExports.inject.includes('locale'),
    'inject must declare the services apply uses');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('pelican: OK');
