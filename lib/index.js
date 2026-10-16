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

/** Services this plugin uses: just the web server (panel data routes). */
export const inject = ['webServer'];

/** Default managed directory holding the saved drawings. */
const DEFAULT_DIR = () => join(homedir(), '.dsh', 'pelican-watch');
/** Default model settings: the profile's current default provider/model. */
const DEFAULT_MODEL = 'glm-5.3-flash';
const DEFAULT_BASE_URL = 'https://taotoken.net/api/v1';
const DEFAULT_API_KEY_ENV = 'TAOTOKEN_API_KEY';
/** Default cadence and history depth. */
const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_MAX_IMAGES = 12;
/** The selected probe targets live next to the drawings. */
const SETTINGS_FILE = 'settings.json';
/** Guard rail: probing more models than this per cycle stops being useful. */
const MAX_TARGETS = 12;
/** A provider's model list is re-discovered at most this often. */
const CATALOG_TTL_MS = 10 * 60_000;
/** Discovery must never stall the panel. */
const DISCOVERY_TIMEOUT_MS = 8_000;
/** Where DSH keeps each profile's patch layer (provider + model config). */
const PROFILES_DIR = () => join(homedir(), '.dsh', 'profiles');

/**
 * The "IQ" rubric: deterministic, offline, and explainable. Every feature is a
 * structural thing the drawing prompt explicitly asked for, so the score moves
 * when a model stops following the brief (or starts refusing) — which is the
 * degradation signal this plugin exists to catch. Weights sum to 100.
 */
const SCORE_FEATURES = [
  ['svg', 30, (h) => /<svg[\s>]/i.test(h)],
  ['wheels', 10, (h) => (h.match(/<circle/gi) || []).length >= 2],
  ['spokes', 8, (h) => (h.match(/<(line|polyline|path)\b/gi) || []).length >= 8],
  ['frame', 8, (h) => /<(path|polyline|polygon|line|rect)\b/i.test(h)],
  ['handlebar', 6, (h) => /(handlebar|handlebar|steer|车把)/i.test(h)],
  ['seat', 6, (h) => /(saddle|seat|车座|坐垫)/i.test(h)],
  ['pedals', 6, (h) => /(pedal|crank|chainring|脚踏|曲柄|牙盘)/i.test(h)],
  ['pelican', 10, (h) => /(pelican|鹈鹕|beak|pouch|喉囊|喙)/i.test(h)],
  ['wings', 6, (h) => /(wing|翅膀|羽翼)/i.test(h)],
  ['closed', 6, (h) => /<\/svg>/i.test(h) && /<\/html>/i.test(h)],
  ['size', 4, (h) => h.length >= 400 && h.length <= 200_000],
];
/** A single drawing request may not hang the scheduler for more than this. */
const REQUEST_TIMEOUT_MS = 120_000;

/** The one prompt every run sends. Deliberately fixed: changes here would
 *  make the history incomparable, so it is only overridable in config. */
const PROMPT = [
  '请画一幅画：一只鹈鹕骑着自行车。',
  '',
  '要求：',
  '1. 输出一个完整的 HTML 文件，画面用单个内联 <svg> 实现；',
  '2. 自行车结构要合理：车架、两个带辐条的车轮、脚踏板、车把、车座都要有；',
  '3. 鹈鹕坐在车座上，姿态自然，有大喙和喉囊，翅膀扶着车把；',
  '4. 风格：扁平插画，用色不超过 6 种，构图居中，画面比例约 4:3；',
  '5. 不要输出任何解释文字，不要使用 markdown 代码块，直接输出 HTML。',
].join('\n');

/** DSH's own credential store. Provider keys configured through DSH live here
 *  as `refs: { ENV_NAME: value }` — which is how a GUI-launched app that does
 *  not inherit the shell environment can still resolve `apiKeyEnv`. */
const DEFAULT_CREDENTIALS_FILE = () => join(homedir(), '.dsh', '.credentials.yaml');

/** Unwrap a YAML scalar: strip a trailing comment (unless fully quoted) and
 *  the surrounding quotes. Shared by the credential store and profile readers. */
function yamlScalar(raw) {
  let value = String(raw ?? '').trim();
  const fullyQuoted = /^(['"]).*\1$/.test(value);
  if (!fullyQuoted) value = value.replace(/\s+#.*$/, '').trim();
  const quoted = /^(['"])(.*)\1$/.exec(value);
  if (quoted) value = quoted[2];
  if (value === '' || value === '~' || value === 'null') return null;
  return value;
}

/**
 * Look up one env-named ref in DSH's `.credentials.yaml`. Deliberately a tiny
 * targeted reader rather than a YAML dependency: it walks the top-level `refs:`
 * block, keeps only the requested key, and returns null on anything unexpected
 * (missing file, a different shape, a value kept in the OS keychain, …) so a
 * future format change degrades to "no key here" instead of an exception.
 */
export function readKeyFromCredentials(envName, file = DEFAULT_CREDENTIALS_FILE()) {
  if (typeof envName !== 'string' || envName === '') return null;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let inRefs = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^refs:\s*(#.*)?$/.test(raw)) { inRefs = true; continue; }
    if (!inRefs) continue;
    if (/^\S/.test(raw)) break; // left the refs block
    const match = /^\s+([A-Za-z0-9_.-]+):\s*(.*)$/.exec(raw);
    if (!match || match[1] !== envName) continue;
    return yamlScalar(match[2]);
  }
  return null;
}

/** POST a chat completion to the configured provider. */
async function chatCompletion(baseURL, model, apiKey, prompt, temperature) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body = { model, messages: [{ role: 'user', content: prompt }], stream: false };
    if (typeof temperature === 'number') body.temperature = temperature;
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') throw new Error('模型返回了空内容');
    return content;
  } finally {
    clearTimeout(timer);
  }
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
    // Score the drawing itself; without one, score the raw answer — a refusal
    // or a prose apology then lands near zero, which is the point.
    const { score, features } = scoreDrawing(svg ?? page);
    return {
      id: file.slice(0, -'.html'.length),
      time: meta.time || new Date(mtime).toISOString(),
      model: meta.model || '',
      provider: typeof meta.provider === 'string' ? meta.provider : '',
      ms: typeof meta.ms === 'number' ? meta.ms : null,
      ok: meta.ok !== false,
      score,
      features,
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

/** Score one drawing against the rubric. Returns 0-100 plus which structural
 *  features were actually found, so the panel can explain the number. */
export function scoreDrawing(html) {
  const text = String(html ?? '');
  const features = [];
  let score = 0;
  for (const [key, weight, test] of SCORE_FEATURES) {
    let hit = false;
    try { hit = test(text); } catch { hit = false; }
    if (hit) { score += weight; features.push(key); }
  }
  return { score, features };
}

/** Per-model roll-up of the saved drawings: the panel's "IQ" board. */
export function summarizeRuns(images) {
  const buckets = new Map();
  for (const img of Array.isArray(images) ? images : []) {
    const model = typeof img?.model === 'string' && img.model !== '' ? img.model : 'unknown';
    let bucket = buckets.get(model);
    if (!bucket) { bucket = { model, provider: img.provider || '', runs: [] }; buckets.set(model, bucket); }
    if (!bucket.provider && img.provider) bucket.provider = img.provider;
    bucket.runs.push(img); // listGallery is newest-first
  }
  const round1 = (n) => Math.round(n * 10) / 10;
  const out = [];
  for (const bucket of buckets.values()) {
    const scores = bucket.runs.map((r) => (typeof r.score === 'number' ? r.score : 0));
    const latest = scores[0] ?? 0;
    const older = scores.slice(1);
    const avg = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : latest;
    const durations = bucket.runs.map((r) => r.ms).filter((v) => typeof v === 'number');
    out.push({
      model: bucket.model,
      provider: bucket.provider,
      count: bucket.runs.length,
      latest,
      avg: round1(avg),
      best: Math.max(...scores),
      worst: Math.min(...scores),
      trend: round1(latest - olderAvg),
      avgMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      refusals: bucket.runs.filter((r) => r.ok === false).length,
      lastTime: bucket.runs[0]?.time ?? null,
    });
  }
  out.sort((a, b) => b.latest - a.latest || b.count - a.count);
  return out;
}

/** One probe target: which model, through which provider/key. */
export function targetId(target) {
  const provider = typeof target?.provider === 'string' && target.provider !== '' ? target.provider : 'default';
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
    const baseURL = typeof row.baseURL === 'string' ? row.baseURL.trim() : '';
    const apiKeyEnv = typeof row.apiKeyEnv === 'string' ? row.apiKeyEnv.trim() : '';
    const provider = typeof row.provider === 'string' && row.provider.trim() !== '' ? row.provider.trim() : (baseURL || 'default');
    const target = { provider, baseURL, apiKeyEnv, model };
    if (typeof row.apiKey === 'string' && row.apiKey !== '') target.apiKey = row.apiKey;
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

/** Persist the target selection. */
export function saveSettings(dir, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, SETTINGS_FILE), `${JSON.stringify(data, null, 2)}\n`);
}

/** Pull the provider rows (name, baseURL, apiKeyEnv, model ids) out of one
 *  profile patch layer. A deliberate indentation walk instead of a YAML
 *  dependency: unknown shapes degrade to "nothing discovered". */
export function parseProviderRows(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const found = [];
  let i = 0;
  while (i < lines.length) {
    const head = /^(\s*)providers:\s*$/.exec(lines[i]);
    if (!head) { i += 1; continue; }
    const providersIndent = head[1].length;
    i += 1;
    let current = null;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || /^\s*#/.test(line)) { i += 1; continue; }
      const indent = line.match(/^\s*/)[0].length;
      if (indent <= providersIndent) break; // left the providers block
      const entry = /^\s*([A-Za-z0-9._-]+):\s*$/.exec(line);
      if (indent === providersIndent + 2 && entry) {
        current = { provider: entry[1], baseURL: '', apiKeyEnv: '', ids: [], names: [] };
        found.push(current);
        i += 1;
        continue;
      }
      if (current) {
        const kv = /^\s*([A-Za-z0-9._-]+):\s*(.*)$/.exec(line);
        if (kv) {
          const [, key, rawValue] = kv;
          if (key === 'baseURL' && rawValue !== '') current.baseURL = yamlScalar(rawValue) ?? '';
          else if (key === 'apiKeyEnv' && rawValue !== '') current.apiKeyEnv = yamlScalar(rawValue) ?? '';
        }
        const idItem = /^\s*-\s*id:\s*(.+)$/.exec(line);
        if (idItem) {
          const id = yamlScalar(idItem[1]);
          if (id) current.ids.push(id);
        } else {
          const nameItem = /^\s*-\s*name:\s*(.+)$/.exec(line);
          if (nameItem) {
            const name = yamlScalar(nameItem[1]);
            if (name) current.names.push(name);
          }
        }
      }
      i += 1;
    }
  }
  return found
    .map((row) => ({
      provider: row.provider,
      baseURL: row.baseURL,
      apiKeyEnv: row.apiKeyEnv,
      models: row.ids.length > 0 ? row.ids : row.names,
    }))
    .filter((row) => row.baseURL !== '' || row.models.length > 0);
}

/** Every provider configured in any DSH profile (first one per name wins). */
export function readProfileProviders(profilesDir = PROFILES_DIR()) {
  const merged = [];
  let entries = [];
  try { entries = readdirSync(profilesDir); } catch { return merged; }
  for (const name of entries) {
    let text;
    try { text = readFileSync(join(profilesDir, name, 'cordis.patch.yml'), 'utf8'); } catch { continue; }
    for (const row of parseProviderRows(text)) {
      if (!merged.some((p) => p.provider === row.provider)) merged.push(row);
    }
  }
  return merged;
}

/** Ask a provider which models it serves (the dynamic part of the picker). */
export async function listRemoteModels(baseURL, apiKey) {
  if (typeof baseURL !== 'string' || baseURL === '') return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const payload = await res.json();
    const rows = Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.models) ? payload.models
        : [];
    return rows
      .map((row) => (typeof row === 'string' ? row : row?.id ?? row?.name))
      .filter((id) => typeof id === 'string' && id !== '');
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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
  const credentialsFile = typeof config.credentialsFile === 'string' && config.credentialsFile !== ''
    ? config.credentialsFile
    : DEFAULT_CREDENTIALS_FILE();
  const intervalMs = Math.max(1, Number(config.intervalMinutes) || DEFAULT_INTERVAL_MINUTES) * 60_000;
  const maxImages = Math.max(1, Number(config.maxImages) || DEFAULT_MAX_IMAGES);
  const runOnStart = config.runOnStart !== false;
  const prompt = typeof config.prompt === 'string' && config.prompt !== '' ? config.prompt : PROMPT;

  // The single-target config (model/baseURL/apiKeyEnv) doubles as the seed for
  // a fresh install and as the fallback provider row in the picker.
  const seedTarget = {
    provider: typeof config.provider === 'string' && config.provider !== '' ? config.provider : 'default',
    baseURL: typeof config.baseURL === 'string' && config.baseURL !== '' ? config.baseURL : DEFAULT_BASE_URL,
    apiKeyEnv: typeof config.apiKeyEnv === 'string' && config.apiKeyEnv !== '' ? config.apiKeyEnv : DEFAULT_API_KEY_ENV,
    model: typeof config.model === 'string' && config.model !== '' ? config.model : DEFAULT_MODEL,
  };

  mkdirSync(dir, { recursive: true });
  const stored = loadSettings(dir);
  let targets = normalizeTargets(
    stored.targets,
    normalizeTargets(config.targets, [seedTarget]),
  );
  prune(dir, maxImages);

  // Shared, observable scheduler state the list route reports to the panel.
  const state = { running: false, runningModel: null, nextRunAt: null, lastError: null, lastRunAt: null };

  // Key resolution order: an explicit per-target key, an explicit config key,
  // the process environment, then DSH's own credential store. The last step
  // matters because the desktop app is launched from Finder/Dock and so does
  // NOT inherit env vars exported in a shell — while a key configured through
  // DSH itself is already recorded there under the provider's apiKeyEnv name.
  const resolveKeyFor = (target) => {
    if (typeof target?.apiKey === 'string' && target.apiKey !== '') return target.apiKey;
    if (typeof config.apiKey === 'string' && config.apiKey !== '') return config.apiKey;
    const envName = target?.apiKeyEnv || config.apiKeyEnv || DEFAULT_API_KEY_ENV;
    const envKey = process.env[envName];
    if (typeof envKey === 'string' && envKey !== '') return envKey;
    return readKeyFromCredentials(envName, credentialsFile);
  };

  const runOne = async (target) => {
    const baseURL = target.baseURL || DEFAULT_BASE_URL;
    const key = resolveKeyFor(target);
    if (key === null) {
      const envName = target.apiKeyEnv || config.apiKeyEnv || DEFAULT_API_KEY_ENV;
      return {
        ok: false,
        model: target.model,
        error: `缺少 API Key（${target.model}）：设置环境变量 ${envName}、在插件配置里填 apiKey，或写进 ${credentialsFile} 的 refs`,
      };
    }
    const started = Date.now();
    const html = stripFences(await chatCompletion(baseURL, target.model, key, prompt, config.temperature));
    const saved = saveRun(dir, target.model, html, Date.now() - started, target.provider);
    return { ok: true, id: saved.id, model: target.model };
  };

  /** Draw one picture per selected model, sequentially — a comparable,
   *  unhurried sample per model, and no request storms against the provider. */
  const runAll = async (only = null) => {
    if (state.running) return { ok: false, skipped: true };
    const queue = only === null
      ? targets
      : targets.filter((t) => t.model === only.model && (only.provider === '' || t.provider === only.provider));
    if (queue.length === 0) return { ok: false, error: '没有可用的探测目标' };
    state.running = true;
    state.lastError = null;
    const results = [];
    try {
      for (const target of queue) {
        state.runningModel = target.model;
        try {
          const result = await runOne(target);
          if (result.ok === false) state.lastError = result.error;
          results.push(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          state.lastError = `${target.model}: ${message}`;
          results.push({ ok: false, model: target.model, error: message });
        }
        prune(dir, maxImages);
      }
      state.lastRunAt = new Date().toISOString();
      return { ok: results.some((r) => r.ok), results };
    } finally {
      state.runningModel = null;
      state.running = false;
    }
  };

  // The schedule: one pass shortly after boot (so there is something to see),
  // then a self-chaining timeout — no overlap, no drift accumulation, and the
  // timer is cleared when the plugin unloads.
  ctx.effect(() => {
    let timer = null;
    const arm = (delay) => {
      state.nextRunAt = Date.now() + delay;
      timer = setTimeout(async () => {
        await runAll();
        arm(intervalMs);
      }, delay);
    };
    if (runOnStart) arm(8_000); else arm(intervalMs);
    return () => { if (timer) clearTimeout(timer); state.nextRunAt = null; };
  }, 'pelican-watch: schedule');

  // Never hand key material to the browser: targets go out without any key.
  const publicTargets = () => targets.map(({ provider, baseURL, apiKeyEnv, model }) => ({ provider, baseURL, apiKeyEnv, model }));

  /** Provider rows for the picker, from the DSH profiles plus this plugin's own
   *  config — no network, so it is safe to include in every list response. */
  const configProviders = () => {
    const rows = [];
    const push = (provider, baseURL, apiKeyEnv, models) => {
      if (rows.some((r) => r.provider === provider)) return;
      rows.push({
        provider,
        baseURL,
        apiKeyEnv,
        models: [...models],
        keyAvailable: resolveKeyFor({ provider, baseURL, apiKeyEnv }) !== null,
      });
    };
    for (const row of readProfileProviders()) {
      push(row.provider, row.baseURL || seedTarget.baseURL, row.apiKeyEnv || seedTarget.apiKeyEnv, row.models);
    }
    push(seedTarget.provider, seedTarget.baseURL, seedTarget.apiKeyEnv, [seedTarget.model]);
    for (const target of targets) {
      const row = rows.find((r) => r.provider === target.provider);
      if (row) {
        if (!row.models.includes(target.model)) row.models.push(target.model);
      } else {
        push(target.provider, target.baseURL || seedTarget.baseURL, target.apiKeyEnv || seedTarget.apiKeyEnv, [target.model]);
      }
    }
    return rows;
  };

  /** The picker's model list: profile config plus whatever each provider's
   *  /models endpoint reports. Cached, so opening the panel never waits on a
   *  provider that happens to be slow or unreachable. */
  let catalogCache = { at: 0, rows: [] };
  const buildCatalog = async (refresh) => {
    if (!refresh && Date.now() - catalogCache.at < CATALOG_TTL_MS && catalogCache.rows.length > 0) {
      return catalogCache.rows;
    }
    const rows = configProviders();
    for (const row of rows) {
      const key = resolveKeyFor({ provider: row.provider, baseURL: row.baseURL, apiKeyEnv: row.apiKeyEnv });
      row.keyAvailable = key !== null;
      const live = key === null ? [] : await listRemoteModels(row.baseURL, key);
      row.models = Array.from(new Set([...row.models, ...live])).sort();
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
            providers: configProviders(),
            maxImages,
            intervalMinutes: Math.round(intervalMs / 60_000),
            model: targets[0]?.model ?? seedTarget.model,
            running: state.running,
            runningModel: state.runningModel,
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
        route('GET', '/api/pelican-watch/raw', async (req, res) => {
          const url = new URL(req.url, 'http://local');
          const target = safeId(url.searchParams.get('id'), dir);
          if (target === null || !existsSync(target)) {
            return json(res, 404, { ok: false, error: '记录不存在' });
          }
          // text/plain on purpose: the client renders it inside a sandboxed
          // iframe (srcdoc), so the generated page can never execute in the
          // app origin if the raw URL is ever opened directly.
          res.writeHead(200, {
            'content-type': 'text/plain; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store',
          });
          res.end(readFileSync(target));
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
export { chatCompletion, PROMPT, readJson, safeId };
