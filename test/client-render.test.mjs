// Render smoke test for the client half — the panel is ~900 lines of UI that
// no other test touches, and the headline promise of this layout is a negative
// one ("the read-only board contains no clickable element"), so it has to be
// asserted rather than eyeballed.
//
// There is no React in this repo, so this test supplies a minimal one: enough
// hooks to render one component through several state updates, and a walker
// that turns the element tree into HTML-ish text. Effects are collected and
// flushed so the panel's `fetch('/list')` actually lands, exactly like the real
// mount sequence.
import fs from 'node:fs';
import assert from 'node:assert/strict';

// ── minimal React ───────────────────────────────────────────────────────────
let hooks = [];
let hookIndex = 0;
let pendingEffects = [];
const react = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : children },
  }),
  useState: (init) => {
    const i = hookIndex++;
    if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init;
    return [hooks[i], (next) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
  },
  useEffect: (fn) => { pendingEffects.push(fn); },
  useLayoutEffect: (fn) => { pendingEffects.push(fn); },
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (init) => ({ current: init === undefined ? null : init }),
};

// ── browser stubs ───────────────────────────────────────────────────────────
const styleStub = () => ({ setAttribute() {}, remove() {} });
globalThis.document = { createElement: styleStub, head: { appendChild() {} } };
globalThis.window = { innerHeight: 900, addEventListener() {}, removeEventListener() {} };
const timers = [];
globalThis.setInterval = () => { const id = timers.length; timers.push(id); return id; };
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;

/** Walk the element tree into text, recording every tag and click handler. */
const seen = { tags: [], onclick: 0, imgs: [] };
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('');
  const { type, props } = node;
  if (typeof type === 'function') return render(type(props));
  seen.tags.push(type);
  if (typeof props.onClick === 'function') seen.onclick += 1;
  if (type === 'img') seen.imgs.push(props.src);
  const children = render(props.children);
  const attrs = [];
  if (props.className) attrs.push(`class="${props.className}"`);
  if (typeof props.title === 'string') attrs.push(`title="${props.title}"`);
  if (typeof props.src === 'string') attrs.push(`src="${props.src}"`);
  if (props.disabled) attrs.push('disabled');
  if (props.value !== undefined) attrs.push(`value="${props.value}"`);
  return `<${type}${attrs.length ? ' ' + attrs.join(' ') : ''}>${children}</${type}>`;
}

// ── load the real client half through a ModuleLoader shim ───────────────────
const captured = [];
const fakeWindow = { __ModuleLoader__: { load: (def) => captured.push(def) } };
const fakeRequire = (name) => {
  if (name === 'react') return react;
  throw new Error(`unexpected require: ${name}`);
};
const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
new Function('window', 'require', source)(fakeWindow, fakeRequire);
assert.equal(captured.length, 1, 'client registers exactly one module');
const clientExports = captured[0].factory(fakeRequire);

// ── capture the slot components through apply() ─────────────────────────────
const slots = [];
let dictionary = null;
const fakeCtx = {
  effect: (fn) => { const d = fn(); return d; },
  locale: {
    register: (ns, dict) => { dictionary = dict; },
    bind: (ns) => (key, vars) => {
      const raw = (dictionary && dictionary.zh && dictionary.zh[key]) || key;
      return vars ? Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), raw) : raw;
    },
  },
  slots: {
    inject: (name, fn) => fn(),
    register: (config, component) => { slots.push({ config, component }); return () => {}; },
  },
};
clientExports.apply(fakeCtx);
assert.deepEqual(slots.map((s) => s.config.name).sort(), ['main', 'settings.section', 'sidebar.panellist'],
  'registers the sidebar icon, the main board and the settings section');
const mainSlot = slots.find((s) => s.config.name === 'main').component;
const settingsSlot = slots.find((s) => s.config.name === 'settings.section').component;

// ── fixture: the real payload shape (3 targets, one of them timing out) ─────
const IMAGES = [
  { id: '20261016-153930_deepseek-flash', time: '2026-10-16T07:39:30.478Z', model: 'deepseek-flash', provider: 'taotoken', ms: 144984, ok: true, score: 88, features: ['svg', 'wheels'], bytes: 3942, hasSvg: true },
  { id: '20261016-153917_deepseek-v4-flash-vision-exp', time: '2026-10-16T07:39:17.540Z', model: 'deepseek-v4-flash-vision-exp', provider: 'taotoken', ms: 132043, ok: true, score: 94, features: ['svg'], bytes: 6170, hasSvg: true },
];
const TARGETS = [
  { provider: 'taotoken', baseURL: 'https://taotoken.net/api/v1', apiKeyEnv: 'TAOTOKEN_API_KEY', model: 'deepseek-flash' },
  { provider: 'taotoken', baseURL: 'https://taotoken.net/api/v1', apiKeyEnv: 'TAOTOKEN_API_KEY', model: 'deepseek-v4-flash' },
  { provider: 'taotoken', baseURL: 'https://taotoken.net/api/v1', apiKeyEnv: 'TAOTOKEN_API_KEY', model: 'deepseek-v4-flash-vision-exp' },
];
const SUMMARY = [
  { model: 'deepseek-v4-flash-vision-exp', provider: 'taotoken', count: 2, latest: 94, avg: 94, best: 94, worst: 94, trend: 0, avgMs: 100039, refusals: 0, lastTime: IMAGES[1].time, scores: [94, 94] },
  { model: 'deepseek-flash', provider: 'taotoken', count: 1, latest: 88, avg: 88, best: 88, worst: 88, trend: 0, avgMs: 144984, refusals: 0, lastTime: IMAGES[0].time, scores: [88] },
  { model: 'deepseek-v4-flash', provider: 'taotoken', count: 3, latest: null, avg: null, best: null, worst: null, trend: 0, avgMs: null, refusals: 3, lastTime: null, scores: [] },
];
const basePayload = {
  ok: true, images: IMAGES, targets: TARGETS, summary: SUMMARY,
  providers: [{ provider: 'taotoken', keyAvailable: true }],
  maxImages: 12, intervalMinutes: 30, model: '', running: false, runningModel: null,
  inflight: [], inflightSince: {}, startedAt: null, done: 0, total: 0,
  errors: { 'deepseek-v4-flash': '超过 300 秒没有返回（可在插件配置里调大 timeoutSeconds）' },
  timeoutSeconds: 300,
  concurrency: 3, nextRunAt: Date.now() + 600000, lastRunAt: '2026-10-16T07:40:05.501Z', lastError: null,
};

let payload = basePayload;
globalThis.fetch = async (url) => ({
  ok: true, status: 200,
  json: async () => payload,
  text: async () => '<!doctype html><html></html>',
});

/** Mount a slot component, flush effects, let the /list fetch land, re-render. */
async function mount(component, props) {
  hooks = []; hookIndex = 0; pendingEffects = [];
  seen.tags = []; seen.onclick = 0; seen.imgs = [];
  const element = component({ t: fakeCtx.locale.bind('pelicanWatch'), ...props });
  let out = render(element);
  for (const effect of pendingEffects.slice()) { try { effect(); } catch { /* ignore */ } }
  for (let i = 0; i < 5; i += 1) await new Promise((r) => queueMicrotask(r));
  hookIndex = 0; pendingEffects = [];
  out = render(component({ t: fakeCtx.locale.bind('pelicanWatch'), ...props }));
  return out;
}

// ── 1. the read-only board: every model, every drawing, nothing to click ────
{
  payload = basePayload;
  const out = await mount(mainSlot, {});
  assert.ok(!/undefined|NaN/.test(out), 'no undefined/NaN leaked into the board');
  assert.ok(out.includes('每个模型的全部画作'), 'board heading is rendered');
  for (const target of TARGETS) assert.ok(out.includes(target.model), `band for ${target.model}`);
  assert.equal(seen.imgs.length, IMAGES.length, 'one inline preview per saved drawing');
  assert.ok(seen.imgs.every((src) => src.startsWith('/api/pelican-watch/image?id=')), 'previews use the same-origin image route');
  assert.ok(out.includes('94') && out.includes('88'), 'scores are printed');
  assert.ok(out.includes('没出图 3 次'), 'the model that never returns reports its refusal count');
  assert.ok(out.includes('超过 300 秒没有返回'), 'the timeout reason is printed on the page');
  assert.ok(out.includes('145.0s') && out.includes('132.0s'), 'per-drawing duration is printed');
  assert.equal(seen.tags.filter((tag) => tag === 'button').length, 0, 'the read-only board renders no button at all');
  assert.equal(seen.onclick, 0, 'the read-only board attaches no click handler at all');
}

// ── 2. the settings side keeps the actions ─────────────────────────────────
{
  payload = basePayload;
  const out = await mount(settingsSlot, {});
  assert.ok(seen.tags.includes('button'), 'the settings side has buttons');
  assert.ok(out.includes('选择模型') && out.includes('全部检测一遍'), 'picker and manual probe are offered');
  assert.ok(seen.onclick > 0, 'settings tiles open the sandboxed viewer');
}

// ── 3. a pass in flight is legible (progress, waited so far, cap) ──────────
{
  payload = {
    ...basePayload,
    running: true, done: 1, total: 3, lastRunAt: null,
    inflight: ['deepseek-flash', 'deepseek-v4-flash'],
    inflightSince: { 'deepseek-flash': Date.now() - 72000, 'deepseek-v4-flash': Date.now() - 72000 },
  };
  const out = await mount(mainSlot, {});
  assert.ok(out.includes('已完成 1/3'), 'progress is shown');
  assert.ok(out.includes('启动首轮检测'), 'the boot round is labelled');
  assert.ok(out.includes('已等') && out.includes('上限'), 'waited-so-far and the cap are shown');
  assert.ok(out.includes('正在检测'), 'the in-flight models are named');
  assert.equal(seen.onclick, 0, 'still nothing to click while probing');
}

// ── 4. empty states say what to do, without a button ──────────────────────
{
  payload = { ...basePayload, images: [], summary: [], targets: [] };
  const out = await mount(mainSlot, {});
  assert.ok(out.includes('还没有选模型'), 'no targets → tells the user where to pick models');
  assert.equal(seen.onclick, 0, 'empty board also has nothing to click');

  payload = { ...basePayload, images: [], summary: [
    { model: 'deepseek-flash', provider: 'taotoken', count: 1, latest: null, avg: null, best: null, worst: null, trend: 0, avgMs: null, refusals: 1, lastTime: null, scores: [] },
  ] };
  const out2 = await mount(mainSlot, {});
  assert.ok(out2.includes('还没有画'), 'targets but no drawings → explains the scheduler');
}

// ── 5. a model that ran but never produced a drawing is not "ok" ───────────
{
  payload = { ...basePayload, images: [], errors: {}, summary: [
    { model: 'deepseek-v4-flash', provider: 'taotoken', count: 6, latest: null, avg: null, best: null, worst: null, trend: 0, avgMs: null, refusals: 6, lastTime: null, scores: [] },
  ], targets: [TARGETS[1]] };
  const out = await mount(mainSlot, {});
  assert.ok(out.includes('没出图'), 'status reads “no drawing”, not “ok” (the error map is empty after a restart)');
  assert.ok(!out.includes('>正常<'), 'no green status for a model with zero drawings');
  assert.ok(out.includes('没出图 6 次'), 'the refusal count is shown');
}

// ── 6. the pace controls live on the settings side only ────────────────────
// Probe passes cost tokens, so pausing the schedule and cutting off a running
// pass have to be reachable — without putting a button back on the board.
{
  payload = basePayload;
  const out = await mount(settingsSlot, {});
  assert.ok(out.includes('检测节奏'), 'the pace strip is on the settings side');
  assert.ok(out.includes('暂停自动检测'), 'auto probing can be paused');
  assert.ok(out.includes('保存间隔') && out.includes('停止本轮'), 'interval save and stop are offered');
  assert.ok(out.includes('间隔') && out.includes('value="30"'), 'the interval input shows the host value');
  assert.ok(/<button[^>]*disabled[^>]*>停止本轮/.test(out), '“stop this pass” is disabled while nothing runs');
  assert.ok(out.includes('自动检测开着') || out.includes('下次'), 'the strip reports the schedule state');
}

// ── 7. paused: the board says so, still with nothing to click ─────────────
{
  payload = { ...basePayload, autoEnabled: false, nextRunAt: null };
  const out = await mount(mainSlot, {});
  assert.ok(out.includes('自动检测已暂停'), 'the read-only board shows that probing is paused');
  assert.ok(out.includes('在「设置 → 鹈鹕监视」里恢复'), 'and where to turn it back on');
  assert.equal(seen.onclick, 0, 'a paused board is still click-free');
  const settings = await mount(settingsSlot, {});
  assert.ok(settings.includes('恢复自动检测'), 'settings offers to resume');
  assert.ok(settings.includes('不会再消耗 token'), 'and says what pausing means for the bill');
}

// ── 8. stopping a pass is visible while it happens ────────────────────────
{
  payload = { ...basePayload, running: true, stopping: true, done: 1, total: 3, inflight: ['deepseek-flash'] };
  const out = await mount(settingsSlot, {});
  assert.ok(out.includes('正在停止'), 'the progress line says it is stopping');
  assert.ok(!out.includes('正在检测 deepseek-flash'), 'and stops naming models as “probing”');
  assert.ok(!/<button[^>]*disabled[^>]*>停止本轮/.test(out), '“stop this pass” is live while a pass runs');
}

// ── 9. a model the user cut off is not reported as a timeout ──────────────
{
  payload = {
    ...basePayload,
    stopped: ['deepseek-v4-flash'],
    errors: { 'deepseek-v4-flash': '已手动停止（本轮检测被中断）' },
  };
  const out = await mount(mainSlot, {});
  assert.ok(out.includes('>已停止<'), 'the band says stopped');
  assert.ok(!out.includes('>超时<'), 'and not “timeout”');
  assert.ok(out.includes('已手动停止'), 'while still showing why');
  assert.equal(seen.onclick, 0, 'a stopped board is still click-free');
}

console.log('pelican client render: OK');
