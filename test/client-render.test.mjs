// Render smoke test for the client half — the panel is ~850 lines of UI that
// no other test touches, and its layout promise is a negative one ("reading the
// board costs no click; the actions are behind one gear"), so it has to be
// asserted rather than eyeballed.
//
// There is no React in this repo, so this test supplies a minimal one: enough
// hooks to render one component through several state updates, a walker that
// turns the element tree into HTML-ish text, and captured click handlers so a
// button can actually be pressed (that is how the settings modal is tested).
// Effects are collected and flushed so the panel's `fetch('/list')` lands,
// exactly like the real mount sequence.
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
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;

/** Walk the element tree into text, recording tags, images and live buttons. */
const seen = { tags: [], onclick: 0, imgs: [], buttons: [] };
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
  if (type === 'button') {
    seen.buttons.push({
      label: children.replace(/<[^>]*>/g, ''),
      title: props.title,
      disabled: props.disabled === true,
      handler: props.onClick,
    });
  }
  const attrs = [];
  if (props.className) attrs.push(`class="${props.className}"`);
  if (typeof props.title === 'string') attrs.push(`title="${props.title}"`);
  if (typeof props.src === 'string') attrs.push(`src="${props.src}"`);
  if (props.disabled) attrs.push('disabled');
  if (props.value !== undefined) attrs.push(`value="${props.value}"`);
  if (props.type) attrs.push(`type="${props.type}"`);
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
assert.deepEqual(slots.map((s) => s.config.name).sort(), ['main', 'sidebar.panellist'],
  'registers the sidebar icon and the panel — no DSH Settings section');
const mainSlot = slots.find((s) => s.config.name === 'main').component;
const t = fakeCtx.locale.bind('pelicanWatch');

// ── fixture: the real payload shape (3 targets, one of them timing out) ─────
const IMAGES = [
  { id: '20261016-153930_deepseek-flash', time: '2026-10-16T07:39:30.478Z', model: 'deepseek-flash', provider: 'taotoken', ms: 144984, ok: true, bytes: 3942, hasSvg: true },
  { id: '20261016-153917_deepseek-v4-flash-vision-exp', time: '2026-10-16T07:39:17.540Z', model: 'deepseek-v4-flash-vision-exp', provider: 'taotoken', ms: 132043, ok: true, bytes: 6170, hasSvg: true },
];
const TARGETS = [
  { provider: 'taotoken', model: 'deepseek-flash' },
  { provider: 'taotoken', model: 'deepseek-v4-flash' },
  { provider: 'taotoken', model: 'deepseek-v4-flash-vision-exp' },
];
const SUMMARY = [
  { model: 'deepseek-v4-flash-vision-exp', provider: 'taotoken', count: 2, avgMs: 100039, lastMs: 132043, refusals: 0, lastTime: IMAGES[1].time },
  { model: 'deepseek-flash', provider: 'taotoken', count: 1, avgMs: 144984, lastMs: 144984, refusals: 0, lastTime: IMAGES[0].time },
  { model: 'deepseek-v4-flash', provider: 'taotoken', count: 3, avgMs: null, lastMs: null, refusals: 3, lastTime: null },
];
const basePayload = {
  ok: true, images: IMAGES, targets: TARGETS, summary: SUMMARY,
  maxImages: 12, intervalMinutes: 30, model: '', running: false, runningModel: null,
  inflight: [], inflightSince: {}, startedAt: null, done: 0, total: 0,
  providerNames: { 'deepseek-account': 'DeepSeek 账号', taotoken: 'taotoken' },
  errors: { 'taotoken|deepseek-v4-flash': '超过 300 秒没有返回（可在插件配置里调大 timeoutSeconds）' },
  timeoutSeconds: 300,
  concurrency: 3, nextRunAt: Date.now() + 600000, lastRunAt: '2026-10-16T07:40:05.501Z', lastError: null,
};
const CATALOG = {
  ok: true,
  providers: [
    {
      provider: 'deepseek-account', displayName: 'DeepSeek 账号',
      models: [
        { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    },
    {
      provider: 'taotoken', displayName: 'taotoken',
      models: [
        { id: 'deepseek-flash', name: 'deepseek-flash' },
        { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash' },
        { id: 'deepseek-v4-flash-vision-exp', name: 'deepseek-v4-flash-vision-exp' },
      ],
    },
  ],
};

let payload = basePayload;
const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return {
    ok: true,
    status: 200,
    json: async () => (String(url).includes('/catalog') ? CATALOG : payload),
    text: async () => '<!doctype html><html></html>',
  };
};

const reset = () => {
  hookIndex = 0; pendingEffects = [];
  seen.tags = []; seen.onclick = 0; seen.imgs = []; seen.buttons = [];
};
const draw = (props) => render(mainSlot({ t, ...props }));
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => queueMicrotask(r)); };

/** Mount the panel, flush effects, let the /list fetch land, re-render. */
async function mount(props = {}) {
  hooks = []; reset();
  let out = draw(props);
  for (const effect of pendingEffects.slice()) { try { effect(); } catch { /* ignore */ } }
  await settle();
  reset();
  out = draw(props);
  return out;
}

/** Press the first button matching a predicate (e.g. the drawings themselves). */
async function pressWhere(match, props = {}) {
  const button = seen.buttons.find(match);
  assert.ok(button, 'a matching button exists');
  assert.equal(typeof button.handler, 'function', 'it is clickable');
  button.handler();
  await settle();
  reset();
  return draw(props);
}

/** Press a button by (substring of) its label, let the request land, redraw. */
async function press(label, props = {}) {
  const button = seen.buttons.find((b) => b.label.includes(label));
  assert.ok(button, `a button labelled “${label}” exists`);
  assert.equal(typeof button.handler, 'function', `“${label}” is clickable`);
  button.handler();
  await settle();
  reset();
  return draw(props);
}

// ── 1. the board: every model, every drawing, nothing hidden behind a click ─
{
  payload = basePayload;
  const out = await mount();
  assert.ok(!/undefined|NaN/.test(out), 'no undefined/NaN leaked into the board');
  assert.ok(out.includes('每个模型的全部画作'), 'board heading is rendered');
  for (const target of TARGETS) assert.ok(out.includes(target.model), `band for ${target.model}`);
  assert.equal(seen.imgs.length, IMAGES.length, 'one inline preview per saved drawing');
  assert.ok(seen.imgs.every((src) => src.startsWith('/api/pelican-watch/image?id=')), 'previews use the same-origin image route');
  assert.ok(out.includes('3 次检测') && out.includes('均耗时'), 'each band reports runs and average duration');
  // "\d+ 分" = a score badge; "30 分钟" is the interval and must not trip this.
  assert.ok(!/\d+\s*分(?!钟)/.test(out) && !out.includes('/100'), 'no score is shown anywhere');
  assert.ok(out.includes('没出图 3 次'), 'the model that never returns reports its refusal count');
  assert.ok(out.includes('超过 300 秒没有返回'), 'the timeout reason is printed on the page');
  assert.ok(out.includes('145.0s') && out.includes('132.0s'), 'per-drawing duration is printed');
  // The whole click budget of the panel: two header actions + one button per
  // drawing (which merely opens the bigger sandboxed view — optional).
  assert.equal(seen.buttons.length, 2 + IMAGES.length, 'only the header actions and one button per drawing');
  assert.ok(seen.buttons.some((b) => b.label.includes('全部检测一遍')), 'the header offers the manual probe');
  assert.ok(seen.buttons.some((b) => b.label.includes('设置')), 'the header offers the gear');
  assert.ok(seen.buttons
    .filter((b) => b.title === '看大图').length === IMAGES.length, 'each drawing opens the bigger view');
  assert.ok(seen.buttons
    .filter((b) => b.title !== '看大图' && !b.label.includes('全部检测一遍') && !b.label.includes('设置')).length === 0,
    'nothing else in the panel is clickable');
  assert.ok(!out.includes('检测节奏') && !out.includes('保存间隔'), 'the settings modal stays closed');
}

// ── 1a. a provider that cannot list its models is shown, not hidden ────────
// Listing a route can fail (not signed in, expired key). Silently dropping it
// left the user staring at a provider they had configured in DSH.
{
  payload = basePayload;
  const savedCatalog = CATALOG.providers;
  CATALOG.providers = [
    ...savedCatalog,
    { provider: 'deepseek-official', displayName: 'DeepSeek', models: [], error: 'MISSING_CREDENTIAL: no API key for route deepseek-official' },
  ];
  await mount();
  const out = await press('设置');
  assert.ok(out.includes('DeepSeek') && out.includes('这个提供方暂时不可用'), 'the broken provider is still listed, flagged');
  assert.ok(out.includes('MISSING_CREDENTIAL'), 'with the real reason underneath');
  CATALOG.providers = savedCatalog;
}

// ── 1b. clicking a drawing opens the picture — never the model's prose ──────
// The saved page holds the model's whole answer (an intro sentence, a ```html
// fence, then the SVG), so rendering that page put text next to the drawing.
// The viewer must fetch the extracted SVG instead.
{
  payload = basePayload;
  fetched.length = 0;
  await mount();
  const tiles = seen.imgs.length;
  assert.equal(tiles, IMAGES.length, 'the board previews each drawing once');
  const out = await pressWhere((b) => b.title === '看大图');
  assert.equal(seen.imgs.length, tiles + 1, 'the viewer adds exactly one image');
  assert.ok(seen.imgs[seen.imgs.length - 1].startsWith('/api/pelican-watch/image?id='),
    'and it is the drawing served as an image');
  assert.ok(!out.includes('<iframe'), 'no iframe: the page HTML is never rendered');
  assert.ok(!fetched.some((url) => url.includes('/raw')), 'the raw page is never fetched');
  assert.ok(out.includes('只测这个'), 'the viewer still offers a per-model probe');
  assert.ok(!/function|=>/.test(out), 'no stray source text in the viewer');
}

// ── 1c. the same model id under two providers is two bands ──────────────────
// The signed-in account and a third-party provider both serve `deepseek-flash`.
// Matching on the model name alone merged their drawings and statistics, and
// the board showed two identical bands that looked like "deepseek via taotoken".
{
  const shared = [
    { id: 'acc-1', time: '2026-10-19T02:39:00.000Z', model: 'deepseek-flash', provider: 'deepseek-account', ms: 1000, ok: true, bytes: 100, hasSvg: true },
    { id: 'tok-1', time: '2026-10-19T02:37:00.000Z', model: 'deepseek-flash', provider: 'taotoken', ms: 2000, ok: true, bytes: 100, hasSvg: true },
  ];
  payload = {
    ...basePayload,
    images: shared,
    summary: [
      { model: 'deepseek-flash', provider: 'deepseek-account', count: 1, avgMs: 1000, lastMs: 1000, refusals: 0, lastTime: shared[0].time },
      { model: 'deepseek-flash', provider: 'taotoken', count: 1, avgMs: 2000, lastMs: 2000, refusals: 0, lastTime: shared[1].time },
    ],
    targets: [
      { provider: 'deepseek-account', model: 'deepseek-flash' },
      { provider: 'taotoken', model: 'deepseek-flash' },
    ],
    errors: {},
  };
  const out = await mount();
  assert.equal(seen.tags.filter((tag) => tag === 'section').length, 2, 'two bands, one per provider');
  assert.ok(out.includes('DeepSeek 账号'), 'each band names its provider (display name)');
  assert.ok(out.includes('taotoken'), 'and the other one too');
  assert.equal(seen.imgs.length, 2, 'each band shows only its own drawing');
  assert.ok(out.includes('/api/pelican-watch/image?id=acc-1') && out.includes('/api/pelican-watch/image?id=tok-1'),
    'one preview per provider, no cross-contamination');
  assert.ok(out.includes('1 次检测'), 'each band reports its own count');
}

// ── 2. the gear opens the settings modal, which holds every action ──────────
// Probing costs tokens and the model list changes often, so this must be one
// click away from the board — but inside the panel, not in DSH Settings.
{
  payload = basePayload;
  await mount();
  const out = await press('设置');
  assert.ok(out.includes('检测节奏'), 'pace controls are in the modal');
  assert.ok(out.includes('检测的模型'), 'and so is the model list');
  assert.ok(out.includes('暂停自动检测'), 'auto probing can be paused from here');
  assert.ok(out.includes('保存间隔') && out.includes('停止本轮'), 'interval save and stop are offered');
  assert.ok(out.includes('间隔') && out.includes('value="30"'), 'the interval input shows the host value');
  assert.ok(/<button[^>]*disabled[^>]*>停止本轮/.test(out), '“stop this pass” is disabled while nothing runs');
  assert.ok(out.includes('自动检测开着') || out.includes('下次'), 'the schedule state is reported');
  assert.ok(out.includes('DeepSeek 账号') && out.includes('DeepSeek-V4.1-Flash'), 'the signed-in account route and its model names are listed');
  assert.ok(out.includes('deepseek-v4-flash-vision-exp'), 'and so is the pi-ai provider');
  assert.ok(out.includes('type="checkbox"') && out.includes('保存模型'), 'models can be ticked and saved');
  assert.ok(out.includes('关闭') && out.includes('保存模型'), 'the modal can be closed and the model list saved');
}

// ── 3. a pass in flight is legible (progress, waited so far, cap) ───────────
{
  payload = {
    ...basePayload,
    running: true, done: 1, total: 3, lastRunAt: null,
    inflight: ['taotoken|deepseek-flash', 'taotoken|deepseek-v4-flash'],
    inflightSince: { 'taotoken|deepseek-flash': Date.now() - 72000, 'taotoken|deepseek-v4-flash': Date.now() - 72000 },
  };
  const out = await mount();
  assert.ok(out.includes('已完成 1/3'), 'progress is shown');
  assert.ok(out.includes('启动首轮检测'), 'the boot round is labelled');
  assert.ok(out.includes('已等') && out.includes('上限'), 'waited-so-far and the cap are shown');
  assert.ok(out.includes('正在检测'), 'the in-flight models are named');
  assert.ok(seen.buttons.some((b) => b.label.includes('正在检测') && b.disabled === true),
    'the probe button is disabled while running');
}

// ── 4. empty states say what to do ─────────────────────────────────────────
{
  payload = { ...basePayload, images: [], summary: [], targets: [] };
  const out = await mount();
  assert.ok(out.includes('还没有选模型'), 'no targets → tells the user where to pick models');
  assert.ok(out.includes('点右上角「设置」'), 'and points at the gear');

  payload = { ...basePayload, images: [], summary: [
    { model: 'deepseek-flash', provider: 'taotoken', count: 1, avgMs: null, lastMs: null, refusals: 1, lastTime: null },
  ] };
  const out2 = await mount();
  assert.ok(out2.includes('还没有画'), 'targets but no drawings → explains the scheduler');
}

// ── 5. a model that ran but never produced a drawing is not "ok" ───────────
{
  payload = { ...basePayload, images: [], errors: {}, summary: [
    { model: 'deepseek-v4-flash', provider: 'taotoken', count: 6, avgMs: null, lastMs: null, refusals: 6, lastTime: null },
  ], targets: [TARGETS[1]] };
  const out = await mount();
  assert.ok(out.includes('没出图'), 'status reads “no drawing”, not “ok” (the error map is empty after a restart)');
  assert.ok(!out.includes('>正常<'), 'no green status for a model with zero drawings');
  assert.ok(out.includes('没出图 6 次'), 'the refusal count is shown');
}

// ── 6. paused: the board says so; resuming is one gear click away ──────────
{
  payload = { ...basePayload, autoEnabled: false, nextRunAt: null };
  const out = await mount();
  assert.ok(out.includes('自动检测已暂停'), 'the board shows that probing is paused');
  assert.ok(out.includes('点右上角「设置」恢复'), 'and points at the gear to turn it back on');
  assert.ok(!out.includes('保存间隔'), 'a paused board is still just a board');
  const settings = await press('设置', {});
  assert.ok(settings.includes('恢复自动检测'), 'the modal offers to resume');
  assert.ok(settings.includes('不会再消耗 token'), 'and says what pausing means for the bill');
}

// ── 7. stopping a pass is visible while it happens ────────────────────────
{
  payload = { ...basePayload, running: true, stopping: true, done: 1, total: 3, inflight: ['taotoken|deepseek-flash'] };
  const out = await mount();
  assert.ok(out.includes('正在停止'), 'the progress line says it is stopping');
  assert.ok(!out.includes('正在检测 deepseek-flash'), 'and stops naming models as “probing”');
  const settings = await press('设置', {});
  assert.ok(!/<button[^>]*disabled[^>]*>停止本轮/.test(settings), '“stop this pass” is live while a pass runs');
}

// ── 8. a model the user cut off is not reported as a timeout ──────────────
{
  payload = {
    ...basePayload,
    stopped: ['taotoken|deepseek-v4-flash'],
    errors: { 'taotoken|deepseek-v4-flash': '已手动停止（本轮检测被中断）' },
  };
  const out = await mount();
  assert.ok(out.includes('>已停止<'), 'the band says stopped');
  assert.ok(!out.includes('>超时<'), 'and not “timeout”');
  assert.ok(out.includes('已手动停止'), 'while still showing why');
}

console.log('pelican client render: OK');
