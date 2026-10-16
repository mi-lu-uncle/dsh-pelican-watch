# @mi-lu-uncle/dsh-pelican-watch

English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

A DeepSeek Harness **community plugin** that runs a long-term
**model-quality probe** (降智监测) on a schedule, across **any number of
models**:

- **Pick your models** — the panel's model picker lists every model the
  configured providers report (live `/models` discovery, merged with the models
  in your DSH profile) and probes a multi-selected set, each model through its
  own provider and API key.
- **Scheduled drawing** — every 30 minutes (configurable) each selected model is
  asked to draw a *pelican riding a bicycle* as a single-file HTML page with an
  inline SVG.
- **No skills, no tools** — each run is a bare `chat/completions` request with
  no tool definitions and no agent loop, so the result measures the model
  alone, never your local skills.
- **Per-model IQ board** — every model gets a 0-100 structural score for its
  newest drawing, the trend against its own history, the run count, the average
  duration and how often it failed to produce a drawing.
- **Gallery** — every saved drawing with an inline preview; click a card for a
  sandboxed full-page viewer with model / time / duration / score.
- **Bounded history** — keeps the newest N drawings (12 by default), pruning
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

## Choosing models

「选择模型」 opens the picker: every provider found in your DSH profiles, with
the models it serves (its own `/models` endpoint, merged with whatever the
profile already lists). Tick any number of models and **Save** — from the next
cycle on each selected model draws its own picture and gets its own row on the
IQ board.

That selection lives in `dir/settings.json` and is what the scheduler uses;
`config.model` / `config.targets` only seed the very first run. At most 12
models are probed per cycle — `concurrency` of them at the same time (3 by
default), one drawing each.

## Speed and timeouts

- **Models run in parallel** (3 at a time by default), so one slow model no
  longer delays the others: every drawing is written to disk the moment it
  arrives and shows up in the panel within seconds.
- **Each request has its own timeout** (`timeoutSeconds`, default 180). A model
  that exceeds it is reported as `超过 N 秒没有返回` on its own IQ card instead of
  hanging the whole pass. Reasoning models can genuinely be slow — measured
  against one provider: `qwen3.7-max` ~52s, `deepseek-flash` ~121s (15k of those
  completion tokens were reasoning), while `glm-5.3-flash` sometimes exceeded
  4 minutes.
- **A timeout or HTTP error is not a drawing**: nothing is saved and no score is
  recorded, because that is an infrastructure fact rather than model quality. A
  model that *answers* without an SVG (a refusal) is saved and scored — that is
  a real quality signal.
- `maxTokens` is not sent by default: reasoning models spend tens of thousands of
  completion tokens before they draw, and a tight ceiling would truncate the SVG
  instead of speeding anything up.

## Configuration

Defaults match the usual profile setup; override any of them on a
`pelican-watch` row in your profile patch (`cordis.patch.yml`):

```yaml
- id: pelican-watch
  config:
    model: glm-5.3-flash                 # seed model (the panel's selection wins)
    baseURL: https://taotoken.net/api/v1 # OpenAI-compatible endpoint
    apiKeyEnv: TAOTOKEN_API_KEY          # env var holding the API key…
    # apiKey: sk-…                       # …or put the key here directly
    # targets:                           # optional: seed several models at once
    #   - { provider: taotoken, baseURL: https://taotoken.net/api/v1, apiKeyEnv: TAOTOKEN_API_KEY, model: glm-5.3-flash }
    intervalMinutes: 30                  # drawing cadence
    maxImages: 12                        # history depth (per model ≈6h at 30min)
    timeoutSeconds: 180                  # per-request ceiling; raise it for slow models
    concurrency: 3                       # how many models are probed at once
    # maxTokens: 8192                    # optional; unset by default (see below)
    dir: ~/.dsh/pelican-watch            # where drawings are saved
    runOnStart: true                     # draw once ~8s after boot
    # temperature: 0.7                   # optional; omitted by default
    # prompt: …                          # only if you must change the benchmark
```

The benchmark prompt is deliberately fixed — changing it makes the history
incomparable, so treat `prompt` as a last resort.

## API key

The key is resolved at call time, in this order:

1. a literal `apiKey` in config;
2. `process.env[apiKeyEnv]` (default `TAOTOKEN_API_KEY`);
3. the same name in DSH's own credential store — `refs:` in
   `~/.dsh/.credentials.yaml` (override the path with `credentialsFile`).

Step 3 is why a DSH-configured provider key works with no extra setup: the
desktop app is launched from Finder/Dock and therefore does **not** inherit
environment variables exported in a shell, while `refs:` already holds the key
under the provider's `apiKeyEnv` name.

With none of the three the run is skipped and the panel shows the reason
(`缺少 API Key：…`) — set any one of them and the next scheduled run proceeds.

## IQ score

Every drawing is scored 0-100 offline against a fixed rubric — the things the
prompt actually asks for: an SVG at all (30), two wheels (10), spokes and
similar line work (8), a frame (8), handlebar (6), seat (6), pedals (6), a
pelican with beak/pouch (10), wings (6), a closed HTML page (6), a sane output
size (4). The panel shows the newest score per model, the trend against that
model's own previous runs, the run count, the average duration and the failure
count.

It is a **heuristic proxy, not a benchmark**: a model can score 100 with an ugly
drawing, and the numbers only mean something compared against the same model
over time. The rubric is plain code (`SCORE_FEATURES` in `lib/index.js`) and is
easy to tune.

## Storage

Drawings live in `dir` (default `~/.dsh/pelican-watch`):

| File | Role |
|---|---|
| `<时间>_<模型>.html` | The full generated page; first line is a meta comment (model, provider, time, duration, whether an SVG was detected) |
| `<时间>_<模型>.svg` | The extracted inline SVG, used for the panel's `<img>` preview |
| `settings.json` | The selected probe targets (written by the picker) |

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
| `lib/index.js` | Host half: multi-model scheduler, storage, scoring, `/api/pelican-watch/*` routes |
| `lib/client.js` | Client half: the model picker, IQ board and gallery (React） |
| `cordis.patch.yml` | Bundle patch that mounts the package as one host row |
| `package.json` | npm metadata + `dsh.bundle`/`dsh.client`/`dsh.compatibility` |
| `test/pelican.test.mjs` | Offline test: rubric, per-model roll-up, provider parsing, target selection, route wiring |

## Test

```sh
node test/pelican.test.mjs
```
