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
    let value = match[2].trim();
    // Both `"key"  # note` and `key # note` are valid YAML, while a `#` inside
    // a quoted scalar belongs to the value — so only strip a trailing comment
    // when the scalar is not fully quoted, then unwrap quotes.
    const fullyQuoted = /^(['"]).*\1$/.test(value);
    if (!fullyQuoted) value = value.replace(/\s+#.*$/, '').trim();
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    if (value === '' || value === '~' || value === 'null') return null;
    return value;
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
export function saveRun(dir, model, html, ms) {
  mkdirSync(dir, { recursive: true });
  const base = `${fileStamp(new Date())}_${modelSafe(model)}`;
  let id = base;
  let n = 2;
  while (existsSync(join(dir, `${id}.html`))) {
    id = `${base}-${n}`;
    n += 1;
  }
  const meta = { time: new Date().toISOString(), model, ms, ok: extractSvg(html) !== null };
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
    try { meta = parseMeta(readFileSync(join(dir, file), 'utf8')); } catch { /* unreadable */ }
    return {
      id: file.slice(0, -'.html'.length),
      time: meta.time || new Date(mtime).toISOString(),
      model: meta.model || '',
      ms: typeof meta.ms === 'number' ? meta.ms : null,
      ok: meta.ok !== false,
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
  const model = typeof config.model === 'string' && config.model !== '' ? config.model : DEFAULT_MODEL;
  const baseURL = typeof config.baseURL === 'string' && config.baseURL !== '' ? config.baseURL : DEFAULT_BASE_URL;
  const apiKeyEnv = typeof config.apiKeyEnv === 'string' && config.apiKeyEnv !== '' ? config.apiKeyEnv : DEFAULT_API_KEY_ENV;
  const credentialsFile = typeof config.credentialsFile === 'string' && config.credentialsFile !== ''
    ? config.credentialsFile
    : DEFAULT_CREDENTIALS_FILE();
  const intervalMs = Math.max(1, Number(config.intervalMinutes) || DEFAULT_INTERVAL_MINUTES) * 60_000;
  const maxImages = Math.max(1, Number(config.maxImages) || DEFAULT_MAX_IMAGES);
  const runOnStart = config.runOnStart !== false;
  const prompt = typeof config.prompt === 'string' && config.prompt !== '' ? config.prompt : PROMPT;
  mkdirSync(dir, { recursive: true });
  prune(dir, maxImages);

  // Shared, observable scheduler state the list route reports to the panel.
  const state = { running: false, nextRunAt: null, lastError: null, lastRunAt: null };

  // Key resolution order: explicit config, then the process environment, then
  // DSH's own credential store. The third step matters because the desktop app
  // is launched from Finder/Dock and so does NOT inherit env vars exported in a
  // shell — while a key configured through DSH itself is already recorded there
  // under the provider's `apiKeyEnv` name.
  const resolveKey = () => {
    if (typeof config.apiKey === 'string' && config.apiKey !== '') return config.apiKey;
    const envKey = process.env[apiKeyEnv];
    if (typeof envKey === 'string' && envKey !== '') return envKey;
    return readKeyFromCredentials(apiKeyEnv, credentialsFile);
  };

  const runOnce = async () => {
    if (state.running) return { ok: false, skipped: true };
    const key = resolveKey();
    if (key === null) {
      state.lastError = `缺少 API Key：设置环境变量 ${apiKeyEnv}、在插件配置里填 apiKey，或写进 ${credentialsFile} 的 refs`;
      return { ok: false, error: state.lastError };
    }
    state.running = true;
    state.lastError = null;
    try {
      const started = Date.now();
      const html = stripFences(await chatCompletion(baseURL, model, key, prompt, config.temperature));
      const saved = saveRun(dir, model, html, Date.now() - started);
      state.lastRunAt = saved.time;
      return { ok: true, id: saved.id };
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      return { ok: false, error: state.lastError };
    } finally {
      state.running = false;
    }
  };

  // The schedule: one run shortly after boot (so there is something to see),
  // then a self-chaining timeout — no overlap, no drift accumulation, and the
  // timer is cleared when the plugin unloads.
  ctx.effect(() => {
    let timer = null;
    const arm = (delay) => {
      state.nextRunAt = Date.now() + delay;
      timer = setTimeout(async () => {
        await runOnce();
        arm(intervalMs);
      }, delay);
    };
    if (runOnStart) arm(8_000); else arm(intervalMs);
    return () => { if (timer) clearTimeout(timer); state.nextRunAt = null; };
  }, 'pelican-watch: schedule');

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
          json(res, 200, {
            ok: true,
            images: listGallery(dir, maxImages),
            maxImages,
            model,
            running: state.running,
            nextRunAt: state.nextRunAt,
            lastError: state.lastError,
          });
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
          void runOnce(); // fire and forget; the panel picks the result up on its next poll
          json(res, 200, { ok: true, started: true });
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
