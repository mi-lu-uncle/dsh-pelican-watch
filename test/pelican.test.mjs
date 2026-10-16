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
  apply(noKeyCtx, { dir: path.join(tmp, 'nk'), apiKeyEnv: 'PELICAN_TEST_KEY', runOnStart: false });
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log('pelican: OK');
