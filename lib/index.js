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
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
const DEFAULT_MAX_IMAGES = 12;
/** The selected probe targets live next to the drawings. */
const SETTINGS_FILE = 'settings.json';
/** Guard rail: probing more models than this per cycle stops being useful. */
const MAX_TARGETS = 12;
/** A provider's model list is re-read at most this often (the account catalog
 *  refreshes remotely, so the panel asks again on "refresh"). */
const CATALOG_TTL_MS = 60_000;

/** A single drawing request may not hang the scheduler for more than this
 *  (overridable per plugin with `timeoutSeconds`). Measured on a real provider:
 *  a fast model answers in ~40s, a reasoning-heavy one in 120-145s, so the
 *  default leaves room for a slow day instead of failing a model that works. */
const REQUEST_TIMEOUT_MS = 300_000;
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
      throw new Error(`超过 ${Math.round(timeoutMs / 1000)} 秒没有返回（可在插件配置里调大 timeoutSeconds）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (outer !== null) outer.removeEventListener('abort', forward);
  }
  if (finish?.kind === 'aborted') {
    if (outer !== null && outer.aborted) throw new Error(STOPPED_MESSAGE);
    throw new Error(`超过 ${Math.round(timeoutMs / 1000)} 秒没有返回（可在插件配置里调大 timeoutSeconds）`);
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
  const end = text.toLowerCase().lastIndexOf('</svg>');
  if (end === -1 || end < start) return null;
  return text.slice(start, end + '</svg>'.length);
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

/** Newest-first list of saved drawings (bounded by `max`). */
export function listGallery(dir, max) {
  if (!existsSync(dir)) return [];
  const htmls = readdirSync(dir).filter((f) => f.endsWith('.html'));
  const rows = [];
  for (const file of htmls) {
    const p = join(dir, file);
    let stat;
    try { stat = statSync(p); } catch { continue; }
    rows.push({ file, p, mtime: stat.mtimeMs, bytes: stat.size });
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows.slice(0, max).map(({ file, mtime, bytes }) => {
    let meta = {};
    let page = '';
    try {
      page = readFileSync(join(dir, file), 'utf8');
      meta = parseMeta(page);
    } catch { /* unreadable */ }
    const svg = extractSvg(page);
    // Display only: no scoring. A run with no drawing is still listed, because
    // "this model refused" is worth seeing next to the pictures that worked.
    return {
      id: file.slice(0, -'.html'.length),
      time: meta.time || new Date(mtime).toISOString(),
      model: meta.model || '',
      provider: typeof meta.provider === 'string' ? meta.provider : '',
      ms: typeof meta.ms === 'number' ? meta.ms : null,
      ok: meta.ok !== false && svg !== null,
      bytes,
      hasSvg: existsSync(join(dir, `${file.slice(0, -'.html'.length)}.svg`)),
    };
  });
}

/** Drop everything older than the newest `max` drawings. */
export function prune(dir, max) {
  if (!existsSync(dir)) return 0;
  const htmls = readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ f, m: (() => { try { return statSync(join(dir, f)).mtimeMs; } catch { return 0; } })() }))
    .sort((a, b) => b.m - a.m);
  let removed = 0;
  for (const { f } of htmls.slice(max)) {
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
    let bucket = buckets.get(model);
    if (!bucket) { bucket = { model, provider: img.provider || '', runs: [] }; buckets.set(model, bucket); }
    if (!bucket.provider && img.provider) bucket.provider = img.provider;
    bucket.runs.push(img); // listGallery is newest-first
  }
  const out = [];
  for (const bucket of buckets.values()) {
    const durations = bucket.runs.map((r) => r.ms).filter((v) => typeof v === 'number');
    out.push({
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
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders });
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
  const dir = typeof config.dir === 'string' && config.dir !== '' ? config.dir : DEFAULT_DIR();
  const maxImages = Math.max(1, Number(config.maxImages) || DEFAULT_MAX_IMAGES);
  const runOnStart = config.runOnStart !== false;
  const timeoutMs = Math.max(5, Number(config.timeoutSeconds) || Math.round(REQUEST_TIMEOUT_MS / 1000)) * 1000;
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
  let intervalMs = Math.max(
    MIN_INTERVAL_MINUTES,
    Number(stored.intervalMinutes) || Number(config.intervalMinutes) || DEFAULT_INTERVAL_MINUTES,
  ) * 60_000;
  let autoEnabled = stored.autoEnabled !== false;
  prune(dir, maxImages);

  // Shared, observable scheduler state the list route reports to the panel:
  // which models are in flight, how far the pass is, and the last failure per
  // model (a timeout is an infrastructure fact, not a drawing).
  const state = {
    running: false,
    stopping: false,
    runningModel: null,
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
  /** Aborts the pass in flight when the user stops it from the panel. */
  let roundController = null;

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

  /** Draw one picture per selected model, `concurrency` of them at a time: a
   *  slow model no longer delays the others, and each finished drawing is on
   *  disk (and therefore in the panel) immediately. */
  const runAll = async (only = null) => {
    if (state.running) return { ok: false, skipped: true };
    const queue = only === null
      ? targets
      : targets.filter((t) => t.model === only.model && (only.provider === '' || t.provider === only.provider));
    if (queue.length === 0) return { ok: false, error: '没有可用的探测目标' };
    state.running = true;
    state.lastError = null;
    state.total = queue.length;
    state.done = 0;
    state.startedAt = Date.now();
    state.inflightSince = {};
    state.inflight = queue.map((target) => target.model);
    state.stopping = false;
    state.stopped = [];
    roundController = new AbortController();
    const { signal } = roundController;
    const results = [];
    try {
      await pool(queue, concurrency, async (target) => {
        try {
          // Queued models cost nothing once a stop was requested: skip them
          // instead of firing a request that is aborted on arrival.
          if (signal.aborted) {
            state.errors[target.model] = STOPPED_MESSAGE;
            state.stopped = [...state.stopped, target.model];
            results.push({ ok: false, model: target.model, error: STOPPED_MESSAGE });
            return;
          }
          state.inflightSince[target.model] = Date.now();
          const result = await runOne(target, signal);
          if (result.ok === false) {
            state.errors[target.model] = result.error;
            if (result.error === STOPPED_MESSAGE) state.stopped = [...state.stopped, target.model];
            state.lastError = result.error;
          } else {
            delete state.errors[target.model];
            state.stopped = state.stopped.filter((model) => model !== target.model);
          }
          results.push(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          state.errors[target.model] = message;
          if (message === STOPPED_MESSAGE) state.stopped = [...state.stopped, target.model];
          state.lastError = `${target.model}: ${message}`;
          results.push({ ok: false, model: target.model, error: message });
        } finally {
          state.inflight = state.inflight.filter((model) => model !== target.model);
          delete state.inflightSince[target.model];
          state.done += 1;
          try { prune(dir, maxImages); } catch { /* ignore */ }
        }
      });
      if (signal.aborted) {
        state.lastError = STOPPED_MESSAGE;
        return { ok: false, stopped: true, results };
      }
      state.lastRunAt = new Date().toISOString();
      return { ok: results.some((r) => r.ok), results };
    } finally {
      state.inflight = [];
      state.inflightSince = {};
      state.startedAt = null;
      state.runningModel = null;
      state.running = false;
      state.stopping = false;
      roundController = null;
    }
  };

  /** Abort the pass in flight. Requests already sent are cut off at the socket,
   *  queued models are skipped, and the round ends within a tick. */
  const stopRound = () => {
    if (!state.running || roundController === null) return false;
    state.stopping = true;
    roundController.abort();
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
    const arm = (delay) => {
      state.nextRunAt = Date.now() + delay;
      timer = setTimeout(async () => {
        timer = null;
        await runAll();
        scheduleNext();
      }, delay);
    };
    const scheduleNext = () => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      if (!autoEnabled) { state.nextRunAt = null; return; }
      const delay = !booted && runOnStart ? 8_000 : intervalMs;
      booted = true;
      arm(delay);
    };
    reschedule = scheduleNext;
    scheduleNext();
    return () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      state.nextRunAt = null;
      reschedule = () => {};
    };
  }, 'pelican-watch: schedule');

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
    const rows = [];
    for (const route of routes) {
      const provider = typeof route?.id === 'string' ? route.id : '';
      if (provider === '') continue;
      const row = { provider, displayName: typeof route?.name === 'string' && route.name !== '' ? route.name : provider, models: [] };
      try {
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
      rows.push(row);
    }
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
            maxImages,
            intervalMinutes: Math.round(intervalMs / 60_000),
            autoEnabled,
            minIntervalMinutes: MIN_INTERVAL_MINUTES,
            maxIntervalMinutes: MAX_INTERVAL_MINUTES,
            model: targets[0]?.model ?? (seedTarget === null ? '' : seedTarget.model),
            running: state.running,
            stopping: state.stopping,
            runningModel: state.runningModel,
            inflight: state.inflight,
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
          targets = next;
          saveSettings(dir, { targets: publicTargets() });
          json(res, 200, { ok: true, targets: publicTargets(), count: targets.length });
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
            'cache-control': 'no-store',
          });
          res.end(readFileSync(svg));
        }),
        route('POST', '/api/pelican-watch/schedule', async (req, res) => {
          const body = await readJson(req);
          const patch = {};
          if (typeof body?.autoEnabled === 'boolean') {
            autoEnabled = body.autoEnabled;
            patch.autoEnabled = autoEnabled;
          }
          if (body?.intervalMinutes !== undefined) {
            const minutes = Number(body.intervalMinutes);
            if (!Number.isFinite(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > MAX_INTERVAL_MINUTES) {
              return json(res, 400, { ok: false, error: `间隔要在 ${MIN_INTERVAL_MINUTES} 到 ${MAX_INTERVAL_MINUTES} 分钟之间` });
            }
            intervalMs = Math.round(minutes) * 60_000;
            patch.intervalMinutes = Math.round(intervalMs / 60_000);
          }
          if (Object.keys(patch).length === 0) {
            return json(res, 400, { ok: false, error: '没有要修改的调度设置' });
          }
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
          void runAll(only); // fire and forget; the panel picks the result up on its next poll
          json(res, 200, { ok: true, started: true, models: only === null ? targets.map((t) => t.model) : [only.model] });
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
