// Offline tests for dsh-pelican-watch: pure helpers, storage lifecycle, and a
// full apply() wiring against a fake ctx — a fake web server and a fake
// `ctx.llm`. No network, no DSH, no credentials: the plugin calls models only
// through the service, so that is the seam the tests drive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  apply,
  drawWithLlm,
  failureText,
  pool,
  stripFences,
  extractSvg,
  modelSafe,
  saveRun,
  parseMeta,
  listGallery,
  prune,
  summarizeRuns,
  normalizeTargets,
  loadSettings,
  saveSettings,
  STOPPED_MESSAGE,
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
// The task asks for animation, so the extracted copy must keep the pieces an
// <img> can actually play — SMIL, not CSS (browsers do not run CSS animations
// inside an SVG loaded as an image).
const ANIMATED = '<!doctype html><html><body><p>note</p><svg viewBox="0 0 10 10">'
  + '<style>.x{fill:red}</style>'
  + '<animateTransform attributeName="transform" type="rotate" from="0 5 5" to="360 5 5" dur="2s" repeatCount="indefinite"/>'
  + '<circle cx="5" cy="5" r="3"/></svg></body></html>';
const animatedSvg = extractSvg(ANIMATED);
assert.ok(animatedSvg.startsWith('<svg') && animatedSvg.endsWith('</svg>'), 'animated drawing extracted whole');
assert.ok(animatedSvg.includes('<animateTransform'), 'SMIL animation survives extraction');
assert.ok(!animatedSvg.includes('<p>note</p>'), 'and the prose around it does not');
assert.equal(modelSafe('glm-5.3-flash'), 'glm-5.3-flash');
assert.equal(modelSafe('a/b\\c:d'), 'a-b-c-d');

// ---- the prompt is the fixed benchmark text: one animated SVG, nothing else ----
assert.ok(PROMPT.includes('鹈鹕') && PROMPT.toLowerCase().includes('svg'));
assert.ok(PROMPT.includes('动图'), 'the task asks for an animated drawing');
assert.ok(PROMPT.includes('不要调用任何 skill'), 'and tells the model not to reach for skills/tools');
assert.ok(/<svg>/.test(PROMPT) && PROMPT.includes('<animate'), 'with the animation inside the <svg>, where an <img> can play it');
assert.ok(/不要用 <script>/.test(PROMPT), 'script-driven animation is ruled out (an <img> would never run it)');
assert.ok(/不要用 <style>/.test(PROMPT), 'CSS animation is ruled out too (an <img> would freeze it)');

// ---- saveRun / listGallery / parseMeta ----
const dir = path.join(tmp, 'gallery');
const first = saveRun(dir, 'test-model', PAGE, 1234);
assert.ok(first.ok === true, 'first run has an svg');
assert.ok(first.id.endsWith('test-model'));
assert.equal(parseMeta(fs.readFileSync(path.join(dir, `${first.id}.html`), 'utf8')).model, 'test-model');
assert.ok(fs.existsSync(path.join(dir, `${first.id}.svg`)), 'svg side file written');

const refused = saveRun(dir, 'refuser', '抱歉，我不能画。', 50);
assert.equal(refused.ok, false, 'a refusal (no svg) is recorded with ok:false');
assert.ok(!fs.existsSync(path.join(dir, `${refused.id}.svg`)), 'no side svg for a refusal');

const listed = listGallery(dir, 10);
assert.equal(listed.length, 2, 'both runs listed');
assert.equal(listed[0].model, 'refuser', 'newest first');
assert.equal(listed[0].hasSvg, false);
assert.equal(listed[1].hasSvg, true);
assert.equal(listed[0].score, undefined, 'the gallery carries no score');

// ---- prune keeps the newest max and drops both html+svg ----
const small = path.join(tmp, 'pruned');
for (let i = 0; i < 5; i += 1) saveRun(small, `m${i}`, PAGE, i, { now: Date.now() + i * 1000 });
assert.equal(fs.readdirSync(small).filter((f) => f.endsWith('.html')).length, 5);
const removed = prune(small, 3);
assert.equal(removed, 2, 'two oldest dropped');
assert.equal(fs.readdirSync(small).filter((f) => f.endsWith('.html')).length, 3);
assert.equal(fs.readdirSync(small).filter((f) => f.endsWith('.svg')).length, 3, 'their svg side files go too');

// ---- summarizeRuns: counts, durations, refusals — no scoring ----
const summary = summarizeRuns([
  { model: 'alpha', provider: 'p', ms: 1000, ok: true, time: '2026-01-03T00:00:00Z' },
  { model: 'alpha', provider: 'p', ms: 2000, ok: true, time: '2026-01-02T00:00:00Z' },
  { model: 'alpha', provider: 'p', ms: 3000, ok: false, time: '2026-01-01T00:00:00Z' },
  { model: 'beta', provider: 'q', ms: 500, ok: true, time: '2026-01-01T00:00:00Z' },
]);
assert.deepEqual(summary.map((r) => r.model), ['alpha', 'beta'], 'newest activity first');
assert.deepEqual(
  { count: summary[0].count, avgMs: summary[0].avgMs, lastMs: summary[0].lastMs, refusals: summary[0].refusals },
  { count: 3, avgMs: 2000, lastMs: 1000, refusals: 1 },
);
assert.equal(summary[0].score, undefined, 'no score is computed any more');
assert.equal(summary[1].avgMs, 500);
assert.deepEqual(summarizeRuns([]), []);

// ---- target list validation: provider + model, de-duplicated ----
assert.deepEqual(
  normalizeTargets([{ provider: 'deepseek-account', model: 'deepseek-flash' }, { provider: 'deepseek-account', model: 'deepseek-flash' }, { model: '' }, null]),
  [{ provider: 'deepseek-account', model: 'deepseek-flash' }],
);
assert.deepEqual(normalizeTargets([{ model: 'x' }]), [{ provider: 'deepseek-account', model: 'x' }], 'provider defaults to the account route');
assert.deepEqual(normalizeTargets(null, []), [], 'nothing usable → empty, no invented target');
assert.equal(normalizeTargets([{ model: 'a' }, { model: 'b' }]).length, 2);

// ── fake DSH model service ─────────────────────────────────────────────────
/** A stand-in for `ctx.llm`: two provider routes (the signed-in account and a
 *  pi-ai provider), their model catalogues, and a scripted drawing stream. */
function makeLlm(options = {}) {
  const llm = {
    requests: [],
    providers: options.providers ?? [
      { id: 'deepseek-account', name: 'DeepSeek 账号' },
      { id: 'taotoken', name: 'taotoken' },
    ],
    catalog: options.catalog ?? {
      'deepseek-account': [
        { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
      taotoken: [{ id: 'glm-5.3-flash', name: 'GLM-5.3-Flash' }],
    },
    /** What the "model" answers. */
    answer: options.answer ?? PAGE,
    /** Yield a terminal error finish instead of text. */
    failure: options.failure ?? null,
    /** Never finish until aborted. */
    hang: options.hang === true,
    /** Delay before the first chunk (lets a stop arrive mid-flight). */
    delayMs: options.delayMs ?? 0,
  };
  llm.listProviders = () => llm.providers.map((route) => ({ ...route }));
  llm.listModels = async (provider) => {
    // A provider that cannot list (not signed in) throws, like the real service.
    if (typeof llm.catalog[provider] === 'string') throw new Error(llm.catalog[provider]);
    return (llm.catalog[provider] ?? []).map((model) => ({ provider, ...model }));
  };
  llm.stream = (request) => {
    llm.requests.push(request);
    const signal = request.signal;
    return (async function* stream() {
      const aborted = new Promise((resolve) => {
        if (signal === undefined) return;
        if (signal.aborted) { resolve(); return; }
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      if (llm.delayMs > 0) await Promise.race([new Promise((r) => setTimeout(r, llm.delayMs)), aborted]);
      if (llm.hang) {
        await aborted;
        yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED' } } };
        return;
      }
      if (signal?.aborted) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED' } } };
        return;
      }
      if (llm.failure !== null) {
        yield { type: 'finish', reason: { kind: 'error', failure: llm.failure } };
        return;
      }
      yield { type: 'text-delta', index: 0, text: llm.answer };
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    })();
  };
  return llm;
}

// ── apply() wiring: routes, catalogue, drawing, image serving ──────────────
const routes = {};
const resets = [];
function mount(llm, config) {
  const table = {};
  apply({
    effect: (fn) => { const d = fn(); if (typeof d === 'function') resets.push(d); return d; },
    webServer: { register: (r) => { table[r.path] = r; routes[r.path] = r; return () => delete table[r.path]; } },
    llm,
  }, config);
  return table;
}
function fakeRes() {
  const r = { code: 0, headers: {}, body: '' };
  r.writeHead = (code, headers) => { r.code = code; Object.assign(r.headers, headers); };
  r.end = (body) => { r.body = body; };
  return r;
}
const req = (method, url) => ({ method, url, headers: { 'sec-fetch-site': 'same-origin' }, async *[Symbol.asyncIterator]() {} });
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const llm = makeLlm();
const pluginDir = path.join(tmp, 'plugin-gallery');
const table = mount(llm, { dir: pluginDir, model: 'deepseek-v4.1-flash', runOnStart: false, maxImages: 12 });

assert.ok(table['/api/pelican-watch/list'], 'list route registered');
assert.ok(table['/api/pelican-watch/run'], 'run route registered');
assert.equal(table['/api/pelican-watch/raw'], undefined, 'no raw page route: the viewer only shows the drawing');

{
  // The catalogue is DSH's own: provider routes with their display names and
  // the models each one advertises (the account route included).
  const catRes = fakeRes();
  await table['/api/pelican-watch/catalog'].handler(req('GET', '/api/pelican-watch/catalog'), catRes);
  const cat = JSON.parse(catRes.body);
  assert.equal(cat.ok, true);
  assert.deepEqual(cat.providers.map((p) => p.provider), ['deepseek-account', 'taotoken'], 'every registered route is offered');
  assert.equal(cat.providers[0].displayName, 'DeepSeek 账号', 'with the display name the app uses');
  assert.deepEqual(cat.providers[0].models, [
    { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' },
    { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
  ], 'the account catalogue is listed with ids and names');
  assert.deepEqual(cat.targets, [{ provider: 'deepseek-account', model: 'deepseek-v4.1-flash' }], 'seeded target');
}

{
  // Trigger a pass through the HTTP surface (fire-and-forget) and wait.
  const runRes = fakeRes();
  await table['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), runRes);
  assert.equal(runRes.code, 200);
  await wait(120);

  assert.equal(llm.requests.length, 1, 'exactly one model call');
  const request = llm.requests[0];
  assert.equal(request.provider, 'deepseek-account', 'called through the account route');
  assert.equal(request.model, 'deepseek-v4.1-flash');
  assert.equal(request.messages.length, 1);
  assert.equal(request.messages[0].role, 'user');
  assert.deepEqual(request.messages[0].content, [{ type: 'text', text: PROMPT }], 'the fixed benchmark prompt');
  assert.ok(request.signal instanceof AbortSignal, 'a cancel signal is always passed');

  const listRes = fakeRes();
  await table['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  const payload = JSON.parse(listRes.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.images.length, 1, 'the triggered run was saved');
  assert.equal(payload.images[0].model, 'deepseek-v4.1-flash');
  assert.equal(payload.images[0].provider, 'deepseek-account');
  assert.equal(payload.images[0].hasSvg, true);
  assert.equal(payload.lastError, null);

  // image route serves the svg side file with a locked-down content type
  const imgRes = fakeRes();
  await table['/api/pelican-watch/image'].handler(req('GET', `/api/pelican-watch/image?id=${encodeURIComponent(payload.images[0].id)}`), imgRes);
  assert.equal(imgRes.code, 200);
  assert.equal(imgRes.headers['content-type'], 'image/svg+xml; charset=utf-8');
  assert.equal(imgRes.headers['x-content-type-options'], 'nosniff');
  assert.ok(String(imgRes.body).startsWith('<svg'), 'svg body served');

  // traversal attempts are rejected
  for (const evil of ['..%2F..%2Fetc%2Fpasswd', '..', 'a/b', '%2e%2e']) {
    const badRes = fakeRes();
    await table['/api/pelican-watch/image'].handler(req('GET', `/api/pelican-watch/image?id=${evil}`), badRes);
    assert.equal(badRes.code, 404, `traversal rejected: ${evil}`);
  }
}

{
  // Saving a selection persists {provider, model} and keeps the schedule knobs.
  const saveRes = fakeRes();
  await table['/api/pelican-watch/schedule'].handler({ ...req('POST', '/api/pelican-watch/schedule'), async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ intervalMinutes: 5 })); } }, saveRes);
  const pick = { targets: [{ provider: 'deepseek-account', model: 'deepseek-v4-pro' }, { provider: 'taotoken', model: 'glm-5.3-flash' }] };
  const pickRes = fakeRes();
  await table['/api/pelican-watch/targets'].handler({ ...req('POST', '/api/pelican-watch/targets'), async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(pick)); } }, pickRes);
  assert.equal(pickRes.code, 200);
  const stored = loadSettings(pluginDir);
  assert.deepEqual(stored.targets, pick.targets, 'selection persisted as provider+model');
  assert.equal(stored.intervalMinutes, 5, 'and the saved interval is not clobbered');
  const listRes = fakeRes();
  await table['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  assert.deepEqual(JSON.parse(listRes.body).targets, pick.targets);
}

// ── a provider failure is reported as text, not as a crash ────────────────
{
  const failing = makeLlm({ failure: { code: 'MISSING_CREDENTIAL', message: 'no API key for route "deepseek-official"' } });
  const failingDir = path.join(tmp, 'failing');
  const t = mount(failing, { dir: failingDir, model: 'deepseek-v4-pro', runOnStart: false });
  await t['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), fakeRes());
  await wait(80);
  const listRes = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  const payload = JSON.parse(listRes.body);
  assert.equal(payload.images.length, 0, 'nothing saved for a failed call');
  assert.match(payload.lastError, /凭据/, 'the failure code is translated into an actionable message');
  assert.match(payload.lastError, /no API key/, 'and the provider detail is kept');
  assert.equal(payload.running, false, 'a failed pass still ends');
}

{
  // A provider that cannot list its models still appears, with its reason.
  const signedOut = makeLlm({ catalog: { 'deepseek-account': 'ACCOUNT_SIGN_IN_REQUIRED' } });
  const t = mount(signedOut, { dir: path.join(tmp, 'signed-out'), runOnStart: false });
  const catRes = fakeRes();
  await t['/api/pelican-watch/catalog'].handler(req('GET', '/api/pelican-watch/catalog'), catRes);
  const cat = JSON.parse(catRes.body);
  const account = cat.providers.find((p) => p.provider === 'deepseek-account');
  assert.deepEqual(account.models, []);
  assert.match(account.error, /ACCOUNT_SIGN_IN_REQUIRED/, 'the reason travels to the panel');
}

// ── failureText: stable codes become actionable Chinese ───────────────────
assert.match(failureText({ code: 'ACCOUNT_SIGN_IN_REQUIRED' }), /登录 DeepSeek 账号/);
assert.match(failureText({ code: 'RATE_LIMIT', message: '429' }), /限流.*429/);
assert.match(failureText({ code: 'WEIRD', message: 'boom' }), /boom/);
assert.match(failureText({}, { provider: 'x' }), /调用失败/);

// ── a hung model is cut off by the per-request timeout ────────────────────
{
  const hung = makeLlm({ hang: true });
  const started = Date.now();
  await assert.rejects(
    drawWithLlm(hung, { provider: 'deepseek-account', model: 'deepseek-v4-pro' }, 'draw', { timeoutMs: 60 }),
    /超过 0 秒没有返回|秒没有返回/,
    'a hung stream becomes a timeout message',
  );
  assert.ok(Date.now() - started < 2000, 'and returns promptly');
}

// ── a stop aborts the call in flight and skips the queued models ──────────
{
  const slow = makeLlm({ hang: true });
  const stopDir = path.join(tmp, 'stopping');
  const t = mount(slow, { dir: stopDir, runOnStart: false, concurrency: 1, targets: [
    { provider: 'deepseek-account', model: 'm-a' },
    { provider: 'deepseek-account', model: 'm-b' },
  ] });
  const runRes = fakeRes();
  await t['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), runRes);
  await wait(60);
  assert.equal(slow.requests.length, 1, 'concurrency 1 → one call in flight');
  const stopRes = fakeRes();
  await t['/api/pelican-watch/stop'].handler(req('POST', '/api/pelican-watch/stop'), stopRes);
  assert.deepEqual(JSON.parse(stopRes.body).stopped, true, 'the stop reached the running pass');
  await wait(80);
  assert.equal(slow.requests.length, 1, 'the queued model was skipped, no request sent');
  const listRes = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  const payload = JSON.parse(listRes.body);
  assert.deepEqual(payload.stopped, ['m-a', 'm-b'], 'both models are reported as stopped');
  assert.equal(payload.errors['m-a'], STOPPED_MESSAGE);
  assert.equal(payload.errors['m-b'], STOPPED_MESSAGE);
  assert.equal(payload.images.length, 0);
  const again = fakeRes();
  await t['/api/pelican-watch/stop'].handler(req('POST', '/api/pelican-watch/stop'), again);
  assert.equal(JSON.parse(again.body).stopped, false, 'stopping twice is not an error');
}

{
  // A finished pass clears the stopped marks and the errors.
  const ok = makeLlm();
  const t = mount(ok, { dir: path.join(tmp, 'after-stop'), runOnStart: false, targets: [{ provider: 'deepseek-account', model: 'm-a' }] });
  await t['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), fakeRes());
  await wait(100);
  const listRes = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  const payload = JSON.parse(listRes.body);
  assert.deepEqual(payload.stopped, []);
  assert.deepEqual(payload.errors, {});
  assert.equal(payload.images.length, 1);
}

// ── bounded concurrency: no more than `concurrency` calls at once ─────────
{
  const slow = makeLlm({ delayMs: 40, answer: PAGE });
  const t = mount(slow, { dir: path.join(tmp, 'concurrency'), runOnStart: false, concurrency: 2, targets: [
    { provider: 'deepseek-account', model: 'c1' }, { provider: 'deepseek-account', model: 'c2' },
    { provider: 'deepseek-account', model: 'c3' }, { provider: 'deepseek-account', model: 'c4' },
  ] });
  await t['/api/pelican-watch/run'].handler(req('POST', '/api/pelican-watch/run'), fakeRes());
  await wait(30);
  assert.equal(slow.requests.length, 2, 'only two calls in flight at a time');
  await wait(200);
  assert.equal(slow.requests.length, 4, 'all four eventually run');
}

// ── pool: caps the number in flight and keeps order ───────────────────────
{
  let active = 0;
  let peak = 0;
  const seen = [];
  await pool([1, 2, 3, 4, 5], 2, async (n) => {
    active += 1; peak = Math.max(peak, active); seen.push(n);
    await new Promise((r) => setTimeout(r, 10));
    active -= 1;
  });
  assert.equal(peak, 2, 'pool respects the limit');
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5]);
}

// ── schedule control: pause, retune the interval, stop a pass ─────────────
{
  const ok = makeLlm();
  const t = mount(ok, { dir: path.join(tmp, 'schedule'), runOnStart: false });
  const listBefore = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listBefore);
  const before = JSON.parse(listBefore.body);
  assert.equal(before.autoEnabled, true, 'automatic probing is on by default');
  assert.ok(typeof before.nextRunAt === 'number' && before.nextRunAt > Date.now(), 'the next pass is scheduled');

  const patch = async (body) => {
    const res = fakeRes();
    await t['/api/pelican-watch/schedule'].handler({ ...req('POST', '/api/pelican-watch/schedule'), async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, res);
    return { code: res.code, body: JSON.parse(res.body) };
  };

  const paused = await patch({ autoEnabled: false });
  assert.equal(paused.code, 200);
  assert.equal(paused.body.autoEnabled, false);
  const listPaused = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listPaused);
  assert.equal(JSON.parse(listPaused.body).nextRunAt, null, 'pausing disarms the timer at once');

  const interval = await patch({ intervalMinutes: 5 });
  assert.equal(interval.code, 200);
  assert.equal(interval.body.intervalMinutes, 5);

  for (const bad of [0, -3, 1441, 'abc']) {
    const res = await patch({ intervalMinutes: bad });
    assert.equal(res.code, 400, `rejects interval ${JSON.stringify(bad)}`);
  }
  const listAfterBad = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listAfterBad);
  assert.equal(JSON.parse(listAfterBad.body).intervalMinutes, 5, 'a rejected value leaves the live interval alone');

  const empty = await patch({});
  assert.equal(empty.code, 400, 'an empty patch is refused');

  const resumed = await patch({ autoEnabled: true });
  assert.equal(resumed.body.autoEnabled, true);
  assert.ok(typeof resumed.body.nextRunAt === 'number' && resumed.body.nextRunAt > Date.now(), 'resuming arms the next pass');

  const persisted = JSON.parse(fs.readFileSync(path.join(tmp, 'schedule', 'settings.json'), 'utf8'));
  assert.equal(persisted.autoEnabled, true);
  assert.equal(persisted.intervalMinutes, 5);
}

// ── runOnStart: does booting fire a pass right away? ──────────────────────
{
  // starts off: no automatic pass
  const off = makeLlm();
  mount(off, { dir: path.join(tmp, 'boot-off'), runOnStart: false, targets: [{ provider: 'deepseek-account', model: 'boot' }] });
  await wait(120);
  assert.equal(off.requests.length, 0, 'runOnStart:false never probes on boot');

  // does start on: one pass shortly after boot
  const on = makeLlm();
  mount(on, { dir: path.join(tmp, 'boot-on'), runOnStart: true, targets: [{ provider: 'deepseek-account', model: 'boot' }] });
  await wait(8600);
  assert.equal(on.requests.length, 1, 'runOnStart:true probes once');
  await wait(200);
  assert.equal(on.requests.length, 1, 'and only once (the next pass waits a full interval)');
}

// ── a fresh install has no fabricated target ──────────────────────────────
{
  const fresh = makeLlm();
  const t = mount(fresh, { dir: path.join(tmp, 'fresh'), runOnStart: false });
  const listRes = fakeRes();
  await t['/api/pelican-watch/list'].handler(req('GET', '/api/pelican-watch/list'), listRes);
  assert.deepEqual(JSON.parse(listRes.body).targets, [], 'nothing invented: the picker is where you choose');
  assert.equal(fresh.requests.length, 0);
}

// ── client entry contract: BOTH apply and inject must be exported ─────────
{
  const captured = [];
  const fakeWindow = { __ModuleLoader__: { load: (def) => captured.push(def) } };
  const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  new Function('window', 'require', source)(fakeWindow, () => ({}));
  assert.equal(captured.length, 1);
  const clientExports = captured[0].factory(() => ({}));
  assert.equal(typeof clientExports.apply, 'function', 'client exports apply');
  assert.ok(Array.isArray(clientExports.inject), 'client exports inject (a bare apply aborts the web boot)');
  assert.deepEqual([...clientExports.inject].sort(), ['locale', 'slots']);
}

// ── client source lint: dictionaries, inline styles and CSS classes ───────
// The panel is plain createElement + inline styles plus one injected
// stylesheet, so typos are invisible until runtime. Check the source instead:
// every t("key") resolves, zh/en stay in sync with no dead entries, every
// s.someStyle exists, and every className has a rule in the sheet.
{
  const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  const blockKeys = (from, to) => {
    const block = source.slice(source.indexOf(from), source.indexOf(to));
    return new Set([...block.matchAll(/^ {6}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]));
  };
  const zhKeys = blockKeys('const zh = {', 'const en = {');
  const enKeys = blockKeys('const en = {', '// ── styles');
  const usedKeys = new Set([...source.matchAll(/\bt\("([A-Za-z][A-Za-z0-9]*)"\)/g)].map((m) => m[1]));
  const styleKeys = blockKeys('const s = {', '// ── helpers');
  const usedStyles = new Set([...source.matchAll(/\bs\.([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]));

  assert.ok(zhKeys.size > 40, `the dictionary is populated (${zhKeys.size} keys)`);
  assert.deepEqual([...usedKeys].filter((k) => !zhKeys.has(k)), [], 'every t() key has a translation');
  assert.deepEqual([...zhKeys].filter((k) => !enKeys.has(k)), [], 'zh keys are all translated to en');
  assert.deepEqual([...enKeys].filter((k) => !zhKeys.has(k)), [], 'no extra en keys');
  assert.deepEqual([...zhKeys].filter((k) => !usedKeys.has(k)), [], 'no dead translation keys');
  assert.deepEqual([...usedStyles].filter((k) => !styleKeys.has(k)), [], 'every s.x style is defined');
  assert.deepEqual([...styleKeys].filter((k) => !usedStyles.has(k)), [], 'no dead style objects');

  const sheet = source.slice(source.indexOf('const STYLESHEET ='), source.indexOf('const NS ='));
  const cssClasses = new Set([...sheet.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
  const jsClasses = new Set();
  for (const m of source.matchAll(/className:\s*"([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) jsClasses.add(c);
  assert.ok(jsClasses.size >= 4, 'the panel still uses the class-based rules');
  assert.deepEqual([...jsClasses].filter((c) => !cssClasses.has(c)), [], 'every className has a CSS rule');
}

for (const reset of resets) reset();
console.log('pelican: OK');
