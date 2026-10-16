# @mi-lu-uncle/dsh-pelican-watch

A DeepSeek Harness **community plugin** that runs a long-term
**model-quality probe** (降智监测) on a schedule:

- **Scheduled drawing** — every 30 minutes (configurable) the plugin asks ONE
  configured model to draw a *pelican riding a bicycle* as a single-file HTML
  page with an inline SVG.
- **No skills, no tools** — each run is a bare `chat/completions` request with
  no tool definitions and no agent loop, so the result measures the model
  alone, never your local skills.
- **Gallery panel** — 「鹈鹕监视」 in the main sidebar (and Settings) lists every
  saved drawing with an inline preview; click a card for a sandboxed full-page
  viewer with model / time / duration. A "draw now" button triggers an extra
  run on demand.
- **Bounded history** — keeps the newest 12 drawings (configurable), pruning
  older ones automatically. Same prompt, same model, over days: degradation
  shows up as worse structure, refusals (saved and badged 「未检出 SVG」), or
  latency growth.

## Install

From this GitHub repository (recommended):

```sh
dsh plugin --profile desktop add https://github.com/mi-lu-uncle/dsh-pelican-watch.git
```

Or from a local path or tarball:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-pelican-watch
```

Note: `link:`-installed plugins are not watched by HMR, so editing
`lib/index.js` or `lib/client.js` requires an app restart to take effect.

## Configuration

Defaults match the usual profile setup; override any of them on a
`pelican-watch` row in your profile patch (`cordis.patch.yml`):

```yaml
- id: pelican-watch
  config:
    model: glm-5.3-flash                 # which model to probe
    baseURL: https://taotoken.net/api/v1 # OpenAI-compatible endpoint
    apiKeyEnv: TAOTOKEN_API_KEY          # env var holding the API key…
    # apiKey: sk-…                       # …or put the key here directly
    intervalMinutes: 30                  # drawing cadence
    maxImages: 12                        # history depth (≈6h at 30min)
    dir: ~/.dsh/pelican-watch            # where drawings are saved
    runOnStart: true                     # draw once ~8s after boot
    # temperature: 0.7                   # optional; omitted by default
    # prompt: …                          # only if you must change the benchmark
```

The benchmark prompt is deliberately fixed — changing it makes the history
incomparable, so treat `prompt` as a last resort.

## API key

The key is resolved at call time: first `process.env[apiKeyEnv]`, then the
`apiKey` config value. If neither is set the run is skipped and the panel
shows the reason (`缺少 API Key：…`) — fix either one and the next scheduled
run proceeds.

## Storage

Drawings live in `dir` (default `~/.dsh/pelican-watch`):

| File | Role |
|---|---|
| `<时间>_<模型>.html` | The full generated page; first line is a meta comment (model, time, duration, whether an SVG was detected) |
| `<时间>_<模型>.svg` | The extracted inline SVG, used for the panel's `<img>` preview |

Deleting files there is safe; the panel always lists what is on disk.

## Privacy & safety

- Every route is same-origin fenced like other plugin surfaces.
- Generated pages are served as `text/plain` and rendered inside a
  `sandbox`-less iframe (`sandbox=""`), so model output can never execute
  scripts in the app origin; SVG previews are served with
  `x-content-type-options: nosniff`.

## Layout

| File | Role |
|---|---|
| `lib/index.js` | Host half: scheduler, storage, `/api/pelican-watch/*` routes |
| `lib/client.js` | Client half: the gallery panel (React) |
| `cordis.patch.yml` | Bundle patch that mounts the package as one host row |
| `package.json` | npm metadata + `dsh.bundle`/`dsh.client`/`dsh.compatibility` |
| `test/pelican.test.mjs` | Offline test: helpers, storage lifecycle, route wiring with a fake fetch |

## Test

```sh
node test/pelican.test.mjs
```
