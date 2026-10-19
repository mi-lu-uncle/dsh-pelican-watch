/**
 * DSH pelican watch — a long-running model-quality (降智) probe.
 *
 * On a fixed interval the plugin asks ONE configured model — via a bare
 * chat-completions request with no tools, no skills and no agent loop — to
 * draw a single-file HTML page containing an inline SVG of a pelican riding
 * a bicycle. Every drawing is saved under a managed directory (newest N kept,
 * default 12) so the same prompt answered by the same model over days shows
 * whether quality, structure and latency are degrading.
 *
 * The client half registers a gallery panel (main sidebar + Settings) that
 * lists every saved drawing with an inline SVG preview and a sandboxed
 * full-page viewer. All data goes through the same-origin `/api/pelican-watch/*`
 * routes below.
 */
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';

/** Cordis plugin identity. */
export const name = 'pelican-watch';

/** Services this plugin uses: the web server for the panel's data routes, and
 *  DSH's own `llm` service — the only supported way to call a model, and the
 *  reason every provider the app knows (including the signed-in DeepSeek
 *  account, which has no API key at all) can be probed. */
export const inject = ['webServer', 'llm'];

/** Default managed directory holding the saved drawings. */
const DEFAULT_DIR = () => join(homedir(), '.dsh', 'pelican-watch');
/** Default cadence and history depth. */
const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_MAX_IMAGES = 10;
/** The selected probe targets live next to the drawings. */
const SETTINGS_FILE = 'settings.json';
/** Guard rail: probing more models than this per cycle stops being useful. */
const MAX_TARGETS = 12;
/** Guard rail: every kept drawing is an animated SVG the panel renders, so the
 *  history depth cannot be unbounded. */
const MAX_IMAGES_LIMIT = 100;
/** A provider's model list is re-read at most this often (the account catalog
 *  refreshes remotely, so the panel asks again on "refresh"). */
const CATALOG_TTL_MS = 60_000;

/** A single drawing request may not hang the scheduler for more than this
 *  (overridable per plugin with `timeoutSeconds`). Measured on a real provider:
 *  a fast model answers in ~40s, a reasoning-heavy one in 120-145s, so the
 *  default leaves room for a slow day instead of failing a model that works. */
const REQUEST_TIMEOUT_MS = 600_000;
/** How many models are probed at the same time (overridable with `concurrency`).
 *  Parallel, so one slow model never hides the results of the others. */
const DEFAULT_CONCURRENCY = 3;
/** Bounds for the interval a user may set from the panel. Probing costs tokens,
 *  so the floor is a minute and the ceiling a day. */
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 1440;
/** Per-model note left behind when the user stops a pass half-way. Requests
 *  already in flight are aborted, so nothing is written for those models. */
export const STOPPED_MESSAGE = '已手动停止（本轮检测被中断）';

/** The one prompt every run sends. Deliberately fixed: changes here would
 *  make the history incomparable, so it is only overridable in config. */
/** The one fixed task every model gets. It asks for an **animated** SVG so the
 *  board shows motion. The animation must be SMIL (`<animate>` /
 *  `<animateTransform>`): the panel displays the extracted SVG through an
 *  `<img>`, and browsers do not run CSS animations in an SVG used as an image
 *  (nor scripts, ever) — only declarative SMIL plays there. */
const PROMPT = [
  '创建一个 html，使用 svg 生成一个鹈鹕骑车的动图。',
  '',
  '要求：',
  '1. 输出一个完整的 HTML 文件，画面用单个内联 <svg> 实现；',
  '2. 必须是动图，动画用 SVG 的声明式动画实现（<animate> / <animateTransform>，例如让车轮转起来）；不要用 <script>，也不要用 <style> 里的 CSS 动画 —— 面板以图片方式显示 SVG，只播放 SVG 声明式动画；',
  '3. 不要编写或运行测试，不要调用任何 skill、工具或命令；',
  '4. 不要输出任何解释文字，不要使用 markdown 代码块，直接输出 HTML。',
].join('\n');

/** One drawing through DSH's model service.
 *
 *  `ctx.llm.stream()` is the supported path for calling a model: it resolves the
 *  provider, its credentials (API key, launch environment, or the signed-in
 *  DeepSeek account) and the protocol adapter, so this plugin never touches key
 *  material and every provider the app offers works here. The stream always
 *  ends with a `finish` chunk, so a failure is reported as text instead of a
 *  thrown adapter error.
 *
 *  `options.signal` aborts the request mid-flight (the user stopping a pass);
 *  `options.timeoutMs` cuts a single slow model off without hurting the rest. */
export async function drawWithLlm(llm, target, prompt, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outer = options.signal ?? null;
  const forward = () => controller.abort();
  if (outer !== null) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', forward, { once: true });
  }
  const request = {
    provider: target.provider,
    model: target.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    signal: controller.signal,
  };
  if (typeof options.temperature === 'number') request.temperature = options.temperature;
  if (Number.isFinite(options.maxTokens) && options.maxTokens > 0) request.maxTokens = options.maxTokens;
  let text = '';
  let finish = null;
  try {
    for await (const chunk of llm.stream(request)) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
      else if (chunk?.type === 'finish') finish = chunk.reason ?? null;
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      if (outer !== null && outer.aborted) throw new Error(STOPPED_MESSAGE);
      throw new Error(`超过 ${Math.round(timeoutMs / 1000)} 秒没有返回：这个模型可能太慢，可在插件配置里调大 timeoutSeconds`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (outer !== null) outer.removeEventListener('abort', forward);
  }
  if (finish?.kind === 'aborted') {
    if (outer !== null && outer.aborted) throw new Error(STOPPED_MESSAGE);
    throw new Error(`超过 ${Math.round(timeoutMs / 1000)} 秒没有返回：这个模型可能太慢，可在插件配置里调大 timeoutSeconds`);
  }
  if (finish?.kind === 'error') throw new Error(failureText(finish.failure, target));
  if (text.trim() === '') throw new Error('模型返回了空内容');
  return text;
}

/** Turn a provider-neutral failure into something a user can act on. The `code`
 *  is stable, the message is provider text, so both are kept. */
export function failureText(failure, target = {}) {
  const code = typeof failure?.code === 'string' ? failure.code : '';
  const detail = typeof failure?.message === 'string' && failure.message !== '' ? failure.message : '';
  const hints = {
    NO_ADAPTER: `没有注册的提供方「${target.provider ?? ''}」（在 DSH 设置里检查模型配置）`,
    MISSING_CREDENTIAL: '这个提供方还没有配置凭据（在 DSH 设置 → 模型里填好 API Key，或改用已登录的 DeepSeek 账号）',
    INVALID_CREDENTIAL: '凭据格式不对（在 DSH 设置 → 模型里检查该提供方）',
    AUTH: '鉴权失败（凭据无效或已过期）',
    ACCOUNT_SIGN_IN_REQUIRED: '需要先在 DSH 里登录 DeepSeek 账号',
    ACCOUNT_TOKEN_INVALID: 'DeepSeek 账号登录已失效，请重新登录',
    ACCOUNT_QUOTA: 'DeepSeek 账号额度不足',
    TRANSPORT: '连接被上游中断（多半是模型太慢或服务端抖动，重试一次通常就好）',
    TIMEOUT: '上游长时间没有输出（连接空闲超时）',
    ABORTED: '请求被中断',
    QUOTA: '额度不足',
    RATE_LIMIT: '被限流了，稍后再试',
    CONTEXT_WINDOW_EXCEEDED: '超出模型的上下文窗口',
    MODEL_UNSUPPORTED: '当前版本不支持这个模型',
    CLIENT_UPGRADE_REQUIRED: '需要升级 DSH 才能用这个模型',
  };
  const hint = hints[code];
  if (hint !== undefined) return detail === '' ? hint : `${hint}：${detail.slice(0, 200)}`;
  if (detail !== '') return detail.slice(0, 300);
  return `调用失败${code === '' ? '' : `（${code}）`}`;
}

/** Run `worker` over `items` with at most `limit` in flight at a time. */
export async function pool(items, limit, worker) {
  const queue = [...items];
  const size = Math.max(1, Math.min(Math.floor(limit) || 1, queue.length));
  const runners = Array.from({ length: size }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/** Strip markdown code fences models like to wrap HTML in. */
export function stripFences(text) {
  return String(text)
    .replace(/^\s*```[a-zA-Z]*\s*\r?\n/, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
}

/** Pull the inline SVG out of the generated page, or null when the model
 *  refused / produced something without one (itself a quality signal). */
export function extractSvg(html) {
  const text = String(html ?? '');
  const start = text.search(/<svg[\s>]/i);
  if (start === -1) return null;
  // Up to the FIRST closing tag: a model that emits two drawings (or an icon
  // before the real one) used to produce a "drawing" spanning both plus the
  // prose between them, which no `<img>` can parse.
  const end = text.toLowerCase().indexOf('</svg>', start);
  if (end === -1) return null;
  return text.slice(start, end + '</svg>'.length);
}

/** The first few hundred bytes of a saved page — enough for its meta comment.
 *  Reading only the head keeps the polling list route off the full files. */
function readHead(file, length = 400) {
  let fd = null;
  try {
    fd = openSync(file, 'r');
    const buf = Buffer.alloc(length);
    const read = readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, read).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

/** Filename-safe model slug. */
export function modelSafe(model) {
  return String(model).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48) || 'model';
}

function fileStamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Persist one run: the full HTML page (meta comment first), plus a bare
 *  `.svg` side file for the panel's <img> preview. Two runs within the same
 *  second (rapid manual triggers) get a `-2`, `-3`… suffix instead of
 *  overwriting each other. */
export function saveRun(dir, model, html, ms, provider = '') {
  mkdirSync(dir, { recursive: true });
  const base = `${fileStamp(new Date())}_${modelSafe(model)}`;
  let id = base;
  let n = 2;
  while (existsSync(join(dir, `${id}.html`))) {
    id = `${base}-${n}`;
    n += 1;
  }
  const meta = { time: new Date().toISOString(), model, ms, ok: extractSvg(html) !== null };
  if (provider !== '') meta.provider = provider;
  const page = `<!-- pelican-watch: ${JSON.stringify(meta)} -->\n${String(html).trim()}\n`;
  writeFileSync(join(dir, `${id}.html`), page);
  const svg = extractSvg(html);
  if (svg !== null) writeFileSync(join(dir, `${id}.svg`), svg);
  return { id, ...meta };
}

/** Parse the meta comment back off a saved page. */
export function parseMeta(content) {
  const m = /^<!-- pelican-watch: (.+?) -->/.exec(String(content ?? '').slice(0, 400));
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

/** Newest-first list of saved drawings, at most `max` **per provider+model**.
 *
 *  The cap has to match `prune()`: a single global cap divided the history
 *  between the models being probed (four models → three drawings each), which
 *  is not what "keep the last 12" means to someone watching one model. Reading
 *  every file is affordable because pruning already bounds the folder. */
export function listGallery(dir, max) {
  if (!existsSync(dir)) return [];
  const htmls = readdirSync(dir).filter((f) => f.endsWith('.html'));
  const rows = [];
  for (const file of htmls) {
    let stat;
    try { stat = statSync(join(dir, file)); } catch { continue; }
    const id = file.slice(0, -'.html'.length);
    // No full read: the meta comment lives in the first few hundred bytes, and
    // the side file already tells us whether there is a drawing to show.
    const meta = parseMeta(readHead(join(dir, file)));
    const hasSvg = existsSync(join(dir, `${id}.svg`));
    rows.push({
      mtime: stat.mtimeMs,
      row: {
        id,
        time: meta.time || new Date(stat.mtimeMs).toISOString(),
        model: typeof meta.model === 'string' ? meta.model : '',
        // A page saved before providers existed belongs to the only route that
        // existed then; without this it would form a separate, unlabelable band.
        provider: typeof meta.provider === 'string' && meta.provider !== '' ? meta.provider : 'deepseek-account',
        ms: typeof meta.ms === 'number' ? meta.ms : null,
        ok: meta.ok !== false && hasSvg,
        bytes: stat.size,
        hasSvg,
      },
    });
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  const seen = new Map();
  const out = [];
  for (const { row } of rows) {
    const key = targetId(row);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count <= max) out.push(row);
  }
  return out;
}

/** Drop everything older than the newest `max` drawings **per model**.
 *
 *  A global cap would divide the history between the models being probed (four
 *  models → three drawings each), which is not what "keep the last N" means to
 *  a user watching one model. The provider is part of the identity here too:
 *  `deepseek-flash` served by the signed-in account and by a third-party
 *  provider are two different histories, kept separately. */
export function prune(dir, max) {
  if (!existsSync(dir)) return 0;
  const htmls = readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      let m = 0;
      let key = f;
      try {
        m = statSync(join(dir, f)).mtimeMs;
        const meta = parseMeta(readHead(join(dir, f)));
        key = targetId({ provider: typeof meta.provider === 'string' ? meta.provider : '', model: typeof meta.model === 'string' ? meta.model : '' });
      } catch { /* unreadable: fall back to a per-name bucket */ }
      return { f, m, key };
    })
    .sort((a, b) => b.m - a.m);
  const seen = new Map();
  let removed = 0;
  for (const { f, key } of htmls) {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count <= max) continue;
    try { rmSync(join(dir, f), { force: true }); } catch { /* ignore */ }
    try { rmSync(join(dir, `${f.slice(0, -'.html'.length)}.svg`), { force: true }); } catch { /* ignore */ }
    removed += 1;
  }
  return removed;
}

/** Per-model roll-up of the saved drawings: how many, how long, how many came
 *  back without a drawing, and when the newest one landed. No scoring — the
 *  pictures are the result. */
export function summarizeRuns(images) {
  const buckets = new Map();
  for (const img of Array.isArray(images) ? images : []) {
    const model = typeof img?.model === 'string' && img.model !== '' ? img.model : 'unknown';
    const provider = typeof img?.provider === 'string' ? img.provider : '';
    // Two providers can serve a model with the same id, so the bucket key is
    // the pair: otherwise their drawings and statistics would be merged.
    const key = `${provider}|${model}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { key, model, provider, runs: [] }; buckets.set(key, bucket); }
    bucket.runs.push(img); // listGallery is newest-first
  }
  const out = [];
  for (const bucket of buckets.values()) {
    const durations = bucket.runs.map((r) => r.ms).filter((v) => typeof v === 'number');
    out.push({
      key: bucket.key,
      model: bucket.model,
      provider: bucket.provider,
      count: bucket.runs.length,
      avgMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      lastMs: typeof bucket.runs[0]?.ms === 'number' ? bucket.runs[0].ms : null,
      refusals: bucket.runs.filter((r) => r.ok === false).length,
      lastTime: bucket.runs[0]?.time ?? null,
    });
  }
  // Newest activity first: with no score to rank by, the order says who is
  // still being probed and when.
  out.sort((a, b) => String(b.lastTime ?? '').localeCompare(String(a.lastTime ?? '')) || b.count - a.count);
  return out;
}

/** One probe target: which model, through which provider/key. */
export function targetId(target) {
  const provider = typeof target?.provider === 'string' && target.provider !== '' ? target.provider : 'deepseek-account';
  return `${provider}|${typeof target?.model === 'string' ? target.model : ''}`;
}

/** Validate + de-duplicate a target list coming from config, settings or HTTP.
 *  Falls back to `fallback` when nothing usable is left. */
export function normalizeTargets(input, fallback = []) {
  const rows = Array.isArray(input) ? input : [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const model = typeof row.model === 'string' ? row.model.trim() : '';
    if (model === '' || model.length > 120) continue;
    const provider = typeof row.provider === 'string' && row.provider.trim() !== '' ? row.provider.trim() : 'deepseek-account';
    const target = { provider, model };
    if (!out.some((t) => targetId(t) === targetId(target))) out.push(target);
    if (out.length >= MAX_TARGETS) break;
  }
  return out.length > 0 ? out : fallback;
}

/** Read the persisted target selection (sits next to the drawings). */
export function loadSettings(dir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, SETTINGS_FILE), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist settings. Merges into what is on disk: every caller patches its own
 *  keys (targets, schedule) and must not drop the others. */
export function saveSettings(dir, data) {
  mkdirSync(dir, { recursive: true });
  const merged = { ...loadSettings(dir), ...data };
  writeFileSync(join(dir, SETTINGS_FILE), `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

/** Reject cross-site requests (same-origin fence, per the skill-console pattern). */
function isSameOriginRequest(req) {
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string' && site === 'cross-site') return false;
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== '' && origin !== 'null') {
    const host = req.headers.host;
    if (typeof host !== 'string' || host === '') return false;
    try { if (new URL(origin).host !== host) return false; } catch { return false; }
  }
  return true;
}

function requireSameOrigin(req, res) {
  if (isSameOriginRequest(req)) return true;
  json(res, 403, { ok: false, error: 'cross-site-request-blocked' });
  return false;
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (body.trim() === '') return {};
  try { return JSON.parse(body); } catch { return {}; }
}

/** An id is a filename stem we generate ourselves; keep it strict and make
 *  sure it can never escape the managed directory. */
function safeId(id, dir) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(id) || id.includes('..')) return null;
  const base = resolve(dir) + sep;
  const target = resolve(dir, `${id}.html`);
  if (!target.startsWith(base)) return null;
  return target;
}

/** Cordis apply(): schedule the probe and register the panel routes. */
export function apply(ctx, config = {}) {
  const configuredDir = typeof config.dir === 'string' && config.dir !== '' ? config.dir : DEFAULT_DIR();
  // `~` is not expanded by the filesystem: without this, pasting the README's
  // `dir: ~/.dsh/pelican-watch` silently created a folder named `~`.
  const dir = configuredDir === '~'
    ? homedir()
    : configuredDir.startsWith('~/') ? join(homedir(), configuredDir.slice(2)) : configuredDir;
  const maxImages = Math.min(MAX_IMAGES_LIMIT, Math.max(1, Math.round(Number(config.maxImages)) || DEFAULT_MAX_IMAGES));
  const runOnStart = config.runOnStart !== false;
  // Capped so the timer cannot overflow either (an absurd timeoutSeconds would
  // abort every request instantly).
  const timeoutSeconds = Math.min(3600, Math.max(5, Math.round(Number(config.timeoutSeconds) || REQUEST_TIMEOUT_MS / 1000)));
  const timeoutMs = timeoutSeconds * 1000;
  // No max_tokens by default: reasoning models spend tens of thousands of
  // completion tokens thinking before they draw, and a tight ceiling would
  // truncate the SVG instead of speeding anything up.
  const maxTokens = Number(config.maxTokens) > 0 ? Number(config.maxTokens) : undefined;
  const concurrency = Math.max(1, Math.min(MAX_TARGETS, Number(config.concurrency) || DEFAULT_CONCURRENCY));
  const prompt = typeof config.prompt === 'string' && config.prompt !== '' ? config.prompt : PROMPT;

  // `config.model` / `config.provider` only seed a fresh install; the panel's
  // picker (which reads DSH's own provider catalogue) is the real interface.
  const seedTarget = typeof config.model === 'string' && config.model !== ''
    ? { provider: typeof config.provider === 'string' && config.provider !== '' ? config.provider : 'deepseek-account', model: config.model }
    : null;

  mkdirSync(dir, { recursive: true });
  const stored = loadSettings(dir);
  let targets = normalizeTargets(
    stored.targets,
    normalizeTargets(config.targets, seedTarget === null ? [] : [seedTarget]),
  );
  // Probing costs tokens, so both knobs are changeable from the panel and
  // persist next to the selection. Stored values beat the plugin config so a
  // change made in the UI survives a restart; `autoEnabled: false` means only
  // the manual "probe now" button ever spends anything.
  // Clamped on BOTH ends: `setTimeout` silently turns any delay above 2^31-1 ms
  // into 1 ms, so an oversized interval (or a typo) would probe in a tight loop.
  const storedMinutes = Number(stored.intervalMinutes) > 0 ? Number(stored.intervalMinutes) : Number(config.intervalMinutes);
  const intervalMinutes = Math.min(
    MAX_INTERVAL_MINUTES,
    Math.max(MIN_INTERVAL_MINUTES, Number.isFinite(storedMinutes) && storedMinutes > 0 ? Math.round(storedMinutes) : DEFAULT_INTERVAL_MINUTES),
  );
  let intervalMs = intervalMinutes * 60_000;
  let autoEnabled = stored.autoEnabled !== false;
  prune(dir, maxImages);

  // Shared, observable scheduler state the list route reports to the panel:
  // which models are in flight, how far the pass is, and the last failure per
  // model (a timeout is an infrastructure fact, not a drawing).
  const state = {
    running: false,
    stopping: false,
    inflight: [],
    inflightSince: {},
    startedAt: null,
    done: 0,
    total: 0,
    errors: {},
    /** Models whose request the user cut off in the pass that just ran: an
     *  interrupted model is not a slow one, and must not be reported as one. */
    stopped: [],
    nextRunAt: null,
    lastError: null,
    lastRunAt: null,
  };
  /** Targets with a request in flight (id → its own AbortController) and the
   *  queue waiting for a slot.
   *
   *  One controller per request, not one per pass: a click on a single band used
   *  to be refused while anything else ran, and "stop" cancelled everything.
   *  Independent runs may now overlap (up to `concurrency` at a time), a click
   *  only ever touches its own model, and stop still stops them all. */
  const active = new Map();
  const pending = [];
  let batchStartedAt = null;
  let idleWaiters = [];

  const syncProgress = () => {
    const now = Date.now();
    for (const id of active.keys()) if (state.inflightSince[id] === undefined) state.inflightSince[id] = now;
    for (const id of Object.keys(state.inflightSince)) if (!active.has(id)) delete state.inflightSince[id];
    state.inflight = [...active.keys()];
    state.running = active.size > 0;
  };

  /** Resolves once nothing is in flight or queued (the schedule chains on it, so
   *  a pass never overlaps itself). */
  const whenIdle = () => (active.size === 0 && pending.length === 0
    ? Promise.resolve()
    : new Promise((resolve) => { idleWaiters.push(resolve); }));

  const settleIfIdle = () => {
    if (active.size > 0 || pending.length > 0) return;
    state.stopping = false;
    state.startedAt = null;
    batchStartedAt = null;
    state.lastRunAt = new Date().toISOString();
    state.total = 0;
    state.done = 0;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const runOne = async (target, signal = null) => {
    const started = Date.now();
    const html = stripFences(await drawWithLlm(ctx.llm, target, prompt, {
      temperature: config.temperature,
      timeoutMs,
      maxTokens,
      signal,
    }));
    const saved = saveRun(dir, target.model, html, Date.now() - started, target.provider);
    return { ok: true, id: saved.id, model: target.model };
  };

  const execute = async (target, id, controller) => {
    try {
      // A stop between enqueue and start costs nothing: skip the request
      // instead of firing one that is aborted on arrival.
      if (controller.signal.aborted) {
        state.errors[id] = STOPPED_MESSAGE;
        state.stopped = [...state.stopped, id];
        return;
      }
      await runOne(target, controller.signal);
      delete state.errors[id];
      state.stopped = state.stopped.filter((key) => key !== id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.errors[id] = message;
      if (message === STOPPED_MESSAGE) state.stopped = [...state.stopped, id];
      state.lastError = `${target.model}: ${message}`;
    } finally {
      active.delete(id);
      state.done += 1;
      try { prune(dir, maxImages); } catch { /* ignore */ }
      syncProgress();
      pump(); // a slot is free again
    }
  };

  const pump = () => {
    while (pending.length > 0 && active.size < concurrency) {
      const { target, id } = pending.shift();
      const controller = new AbortController();
      if (batchStartedAt === null) batchStartedAt = Date.now();
      state.startedAt = batchStartedAt;
      active.set(id, controller);
      syncProgress();
      void execute(target, id, controller).catch(() => {});
    }
    settleIfIdle();
  };

  /** Queue targets, skipping any already queued or in flight — that is what makes
   *  a second click harmless instead of a duplicate request. */
  const enqueue = (queue) => {
    let added = 0;
    for (const target of queue) {
      const id = targetId(target);
      if (active.has(id) || pending.some((entry) => entry.id === id)) continue;
      pending.push({ target, id });
      state.total += 1;
      added += 1;
    }
    if (added > 0) state.lastError = null;
    pump();
    return added;
  };

  /** Which targets a request means: every selected one, or the single band the
   *  user clicked. Shared by the pass and the route, so "nothing to probe" is
   *  answered instead of pretending to start. */
  const queueFor = (only) => (only === null
    ? [...targets]
    : targets.filter((t) => t.model === only.model && (only.provider === '' || t.provider === only.provider)));

  const runAll = async (only = null) => {
    const queue = queueFor(only);
    if (queue.length === 0) return { ok: false, error: '没有可用的探测目标' };
    // Clear the previous attempt's failure for the models about to run, so a
    // stale "stopped"/"timeout" does not colour a model being retried.
    for (const target of queue) delete state.errors[targetId(target)];
    const added = enqueue(queue);
    return { ok: added > 0, started: added > 0, queued: added, running: state.running };
  };

  /** Stop everything: requests in flight are aborted, queued models are skipped
   *  without a request being sent, and the panel shows them as stopped. */
  const stopRound = () => {
    if (active.size === 0 && pending.length === 0) return false;
    state.stopping = true;
    for (const { id } of pending) {
      state.errors[id] = STOPPED_MESSAGE;
      state.stopped = [...state.stopped, id];
      state.done += 1;
    }
    pending.length = 0;
    state.total = state.done;
    for (const controller of active.values()) controller.abort();
    settleIfIdle();
    return true;
  };

  // The schedule: one pass shortly after boot (so there is something to see),
  // then a self-chaining timeout — no overlap, no drift accumulation, and the
  // timer is cleared when the plugin unloads. `reschedule` is republished so the
  // panel's "pause / change interval" takes effect at once instead of after the
  // pending timer, which is what makes stopping actually save tokens.
  let reschedule = () => {};
  ctx.effect(() => {
    let timer = null;
    let booted = false;
    // The pass may still be running when the plugin is unloaded: aborting it
    // resolves the timer callback, whose `finally` would then arm a fresh
    // 30-minute timer that nothing can ever clear — probing after unload.
    let disposed = false;
    const arm = (delay) => {
      state.nextRunAt = Date.now() + delay;
      timer = setTimeout(async () => {
        timer = null;
        try {
          await runAll();
          await whenIdle();
        } catch (error) {
          // A throw here used to stop the chain for good: the plugin would show
          // "next run" once and then never probe again.
          state.lastError = error instanceof Error ? error.message : String(error);
        } finally {
          scheduleNext();
        }
      }, delay);
    };
    const scheduleNext = () => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (disposed) { state.nextRunAt = null; return; }
      if (!autoEnabled) { state.nextRunAt = null; return; }
      const delay = !booted && runOnStart ? 8_000 : intervalMs;
      booted = true;
      arm(delay);
    };
    reschedule = scheduleNext;
    scheduleNext();
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      state.nextRunAt = null;
      reschedule = () => {};
      // Unloading or reloading the plugin mid-pass used to leave the request
      // running (and paying) with nobody listening: cancel every run.
      for (const controller of active.values()) controller.abort();
    };
  }, 'pelican-watch: schedule');

  /** Provider id → the display name DSH uses ("DeepSeek 账号", "DeepSeek"…).
   *  The board labels each band with it so two providers serving the same model
   *  id stay distinguishable. */
  const providerNames = () => {
    const names = {};
    try {
      for (const route of ctx.llm.listProviders?.() ?? []) {
        if (typeof route?.id !== 'string' || route.id === '') continue;
        names[route.id] = typeof route?.name === 'string' && route.name !== '' ? route.name : route.id;
      }
    } catch { /* a broken registry must not break the panel */ }
    return names;
  };

  /** Delete every drawing whose model is not in `keep` (a Set of target ids).
   *
   *  The gallery is meant to mirror the selection: a drawing the board cannot
   *  show is invisible dead weight, and these probe drawings are cheap to redraw.
   *  Returns the number removed, so the panel can say so after a save.
   *
   *  Never called with an empty selection: "nothing selected" must not mean
   *  "delete everything" (a corrupt settings file would otherwise wipe the
   *  gallery). */
  const dropUnselected = (keep) => {
    const dropped = new Set();
    let removed = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      const meta = parseMeta(readHead(join(dir, file)));
      const id = targetId({ provider: typeof meta.provider === 'string' ? meta.provider : '', model: typeof meta.model === 'string' ? meta.model : '' });
      if (keep.has(id)) continue;
      dropped.add(id);
      try { rmSync(join(dir, file), { force: true }); } catch { /* ignore */ }
      try { rmSync(join(dir, `${file.slice(0, -'.html'.length)}.svg`), { force: true }); } catch { /* ignore */ }
      removed += 1;
    }
    for (const id of dropped) {
      delete state.errors[id];
      state.stopped = state.stopped.filter((key) => key !== id);
    }
    return removed;
  };
  // Tidy up on boot too, so a model removed by an older version does not linger
  // as files nothing can display.
  if (targets.length > 0) dropUnselected(new Set(targets.map((target) => targetId(target))));

  // A target is just provider + model — there is no key material to hide any
  // more, because the model service resolves credentials itself.
  const publicTargets = () => targets.map(({ provider, model }) => ({ provider, model }));

  /** The picker's catalogue: every provider route DSH has registered (the
   *  signed-in DeepSeek account, the official API route, any pi-ai provider…)
   *  and the models each one advertises. Model discovery is asynchronous and
   *  cached, so opening the panel never waits on a slow provider twice. */
  let catalogCache = { at: 0, rows: [] };
  const buildCatalog = async (refresh) => {
    if (!refresh && Date.now() - catalogCache.at < CATALOG_TTL_MS && catalogCache.rows.length > 0) {
      return catalogCache.rows;
    }
    const routes = typeof ctx.llm?.listProviders === 'function' ? ctx.llm.listProviders() : [];
    const rows = await Promise.all(routes
      .filter((route) => typeof route?.id === 'string' && route.id !== '')
      .map(async (route) => {
        const provider = route.id;
        const row = { provider, displayName: typeof route?.name === 'string' && route.name !== '' ? route.name : provider, models: [] };
        try {
          // One slow provider used to delay the whole list; they are independent
          // queries, so ask them together.
          const models = await ctx.llm.listModels(provider);
          row.models = (Array.isArray(models) ? models : [])
            .map((model) => ({
              id: typeof model?.id === 'string' ? model.id : '',
              name: typeof model?.name === 'string' && model.name !== '' ? model.name : (typeof model?.id === 'string' ? model.id : ''),
            }))
            .filter((model) => model.id !== '');
        } catch (error) {
          // A provider that cannot list its models (not signed in, bad key) is
          // still worth showing: the panel explains it instead of hiding it.
          row.error = error instanceof Error ? error.message : String(error);
        }
        return row;
      }));
    catalogCache = { at: Date.now(), rows };
    return rows;
  };

  // Panel data routes; same-origin fenced like every plugin surface.
  const route = (method, path, handler) => ({
    kind: 'exact',
    path,
    handler: async (req, res) => {
      if (req.method !== method) return json(res, 405, { ok: false, error: 'method-not-allowed' });
      if (!requireSameOrigin(req, res)) return;
      try {
        await handler(req, res);
      } catch (error) {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  });

  try {
    ctx.effect(() => {
      const disposers = [
        route('GET', '/api/pelican-watch/list', async (req, res) => {
          const images = listGallery(dir, maxImages);
          json(res, 200, {
            ok: true,
            images,
            summary: summarizeRuns(images),
            targets: publicTargets(),
            providerNames: providerNames(),
            maxImages,
            maxTargets: MAX_TARGETS,
            intervalMinutes: Math.round(intervalMs / 60_000),
            autoEnabled,
            minIntervalMinutes: MIN_INTERVAL_MINUTES,
            maxIntervalMinutes: MAX_INTERVAL_MINUTES,
            model: targets[0]?.model ?? (seedTarget === null ? '' : seedTarget.model),
            running: state.running,
            stopping: state.stopping,
            inflight: state.inflight,
            // Models waiting for a slot: they already have a request coming, so
            // the panel must not offer their button as if it were idle.
            queued: pending.map((entry) => entry.id),
            inflightSince: state.inflightSince,
            startedAt: state.startedAt,
            done: state.done,
            total: state.total,
            errors: state.errors,
            stopped: state.stopped,
            timeoutSeconds: Math.round(timeoutMs / 1000),
            concurrency,
            nextRunAt: state.nextRunAt,
            lastRunAt: state.lastRunAt,
            lastError: state.lastError,
          });
        }),
        route('GET', '/api/pelican-watch/catalog', async (req, res) => {
          const url = new URL(req.url, 'http://local');
          const rows = await buildCatalog(url.searchParams.get('refresh') === '1');
          json(res, 200, { ok: true, providers: rows, targets: publicTargets() });
        }),
        route('POST', '/api/pelican-watch/targets', async (req, res) => {
          const body = await readJson(req);
          const next = normalizeTargets(body?.targets, []);
          if (next.length === 0) return json(res, 400, { ok: false, error: '至少选择一个模型' });
          const removed = dropUnselected(new Set(next.map((target) => targetId(target))));
          targets = next;
          saveSettings(dir, { targets: publicTargets() });
          json(res, 200, { ok: true, targets: publicTargets(), count: targets.length, removed });
        }),
        route('GET', '/api/pelican-watch/image', async (req, res) => {
          const url = new URL(req.url, 'http://local');
          const id = url.searchParams.get('id');
          const target = safeId(id, dir);
          const svg = target === null ? null : `${target.slice(0, -'.html'.length)}.svg`;
          if (target === null || !existsSync(svg)) {
            return json(res, 404, { ok: false, error: '图片不存在' });
          }
          res.writeHead(200, {
            'content-type': 'image/svg+xml; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
            // One id is one immutable drawing. `no-store` made the browser
            // refetch every preview on each poll, which also restarted the
            // animation; a private long cache keeps them still and quiet.
            'cache-control': 'private, max-age=31536000, immutable',
          });
          res.end(readFileSync(svg));
        }),
        route('POST', '/api/pelican-watch/schedule', async (req, res) => {
          const body = await readJson(req);
          // Validate the whole patch first. Mutating `autoEnabled` before the
          // interval check meant a rejected request still flipped the live
          // state: the panel said "paused" while the timer kept running.
          const patch = {};
          if (typeof body?.autoEnabled === 'boolean') patch.autoEnabled = body.autoEnabled;
          if (body?.intervalMinutes !== undefined) {
            const minutes = Number(body.intervalMinutes);
            if (!Number.isFinite(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > MAX_INTERVAL_MINUTES) {
              return json(res, 400, { ok: false, error: `间隔要在 ${MIN_INTERVAL_MINUTES} 到 ${MAX_INTERVAL_MINUTES} 分钟之间` });
            }
            patch.intervalMinutes = Math.round(minutes);
          }
          if (Object.keys(patch).length === 0) {
            return json(res, 400, { ok: false, error: '没有要修改的调度设置' });
          }
          if (patch.autoEnabled !== undefined) autoEnabled = patch.autoEnabled;
          if (patch.intervalMinutes !== undefined) intervalMs = patch.intervalMinutes * 60_000;
          saveSettings(dir, patch);
          reschedule();
          json(res, 200, {
            ok: true,
            autoEnabled,
            intervalMinutes: Math.round(intervalMs / 60_000),
            nextRunAt: state.nextRunAt,
          });
        }),
        route('POST', '/api/pelican-watch/stop', async (req, res) => {
          const stopped = stopRound();
          json(res, 200, { ok: true, stopped, running: state.running });
        }),
        route('POST', '/api/pelican-watch/run', async (req, res) => {
          const body = await readJson(req);
          const only = typeof body?.model === 'string' && body.model !== ''
            ? { model: body.model, provider: typeof body.provider === 'string' ? body.provider : '' }
            : null;
          const queue = queueFor(only);
          if (queue.length === 0) {
            return json(res, 400, {
              ok: false,
              error: only === null ? '还没有选择要检测的模型' : '这个模型已经不在检测列表里了（历史画作仍会保留）',
            });
          }
          // Runs overlap: a band's button starts its own request while others are
          // in flight, so there is no "a pass is running" refusal any more — only
          // a duplicate of something already queued is a no-op.
          const fresh = queue.filter((target) => {
            const id = targetId(target);
            return !active.has(id) && !pending.some((entry) => entry.id === id);
          });
          if (fresh.length === 0) return json(res, 200, { ok: true, started: false, running: true });
          // Fire and forget; the panel picks the result up on its next poll. The
          // rejection handler keeps a failed save from becoming an unhandled
          // rejection that takes the host down.
          void runAll(only).catch((error) => {
            state.lastError = error instanceof Error ? error.message : String(error);
          });
          json(res, 200, { ok: true, started: true, running: true, models: fresh.map((t) => t.model) });
        }),
      ].map((r) => ctx.webServer.register(r));
      return () => { for (const d of disposers) d(); };
    }, 'pelican-watch: routes');
  } catch (error) {
    console.error('[pelican-watch] route registration failed:', error);
  }
}

/** Exposed for tests (the rest are inline-exported above). */
export { PROMPT, readJson, safeId };
