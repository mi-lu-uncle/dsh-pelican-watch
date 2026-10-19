# @mi-lu-uncle/dsh-pelican-watch

English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

A DeepSeek Harness **community plugin** that runs a long-term
**model-quality probe** (降智监测) on a schedule, across **any number of
models**:

- **Pick your models** — the gear in the panel's top-right corner lists every model the
  configured providers report (live `/models` discovery, merged with the models
  in your DSH profile) and probes a multi-selected set, each model through its
  own provider and API key.
- **Scheduled drawing** — every 30 minutes (configurable) each selected model is
  asked to draw an **animated** *pelican riding a bicycle*: a single-file HTML
  page with an inline SVG whose motion is SVG declarative animation (`<animate>`
  / `<animateTransform>`).
- **No skills, no tools** — each run is a bare `chat/completions` request with
  no tool definitions and no agent loop, so the result measures the model
  alone, never your local skills.
- **Everything flat, nothing to click** — the main board is read-only: one band
  per model, its status and figures on the left (when its newest drawing landed,
  runs, average duration, how many came back without a drawing, and the failure
  reason) and every drawing it ever made on the right, all laid out at once —
  nothing collapsed, filtered, or hidden behind a click.
- **Run state in the header** — while probing: “n/m done”, which models are in
  flight, how long the slowest has waited (m:ss) and the timeout cap (m:ss), so a
  slow model and a stuck one are told apart at a glance.
- **One gear button** — the panel's own top-right corner opens a settings sheet:
  pick models, probe now, see one drawing bigger. The board below stays pure
  viewing, so nothing has to be clicked to be read.
- **Stop it, retune it** — that same sheet can **pause / resume automatic
  probing**, change the **interval** (1–1440 minutes), and **stop the pass that is
  running right now**: requests in flight are aborted, models that had not started
  are skipped without a request being sent. Pausing is written to
  `settings.json` immediately and survives a restart, so a plugin you only probe
  by hand never costs a token on its own.
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

The gear in the panel's top-right corner opens the settings sheet: every provider found in your DSH profiles, with
the models it serves (its own `/models` endpoint, merged with whatever the
profile already lists). Tick any number of models and **Save models** — from the next
cycle on each selected model draws its own picture and gets its own band on the
board.

That selection lives in `dir/settings.json` and is what the scheduler uses;
`config.model` / `config.targets` only seed the first run. The same file holds
two knobs that decide what you spend, both changeable from the panel's gear
without touching any config file:

| key | default | meaning |
| --- | --- | --- |
| `autoEnabled` | `true` | Off disarms the timer at once (`nextRunAt` goes empty); only the manual “probe now” then spends anything, and the choice survives a restart. |
| `intervalMinutes` | follows `config.intervalMinutes` (30) | Changing it in the panel re-arms the countdown immediately — no restart. |
`config.model` / `config.targets` only seed the very first run. At most 12
models are probed per cycle — `concurrency` of them at the same time (3 by
default), one drawing each.

## Speed and timeouts

- **Models run in parallel** (3 at a time by default), so one slow model no
  longer delays the others: every drawing is written to disk the moment it
  arrives and shows up in the panel within seconds.
- **Each request has its own timeout** (`timeoutSeconds`, default 180). A model
  that exceeds it is reported as `超过 N 秒没有返回` on its own band instead of
  hanging the whole pass. Reasoning models can genuinely be slow — measured
  against one provider: `qwen3.7-max` ~52s, `deepseek-flash` ~121s (15k of those
  completion tokens were reasoning), while `glm-5.3-flash` sometimes exceeded
  4 minutes.
- **A timeout or HTTP error is not a drawing**: nothing is saved and it does not
  count as a drawing, because that is an infrastructure fact rather than model
  behaviour. A model that *answers* without an SVG (a refusal) is saved and
  marked `没出图` — that is the signal worth looking at.
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

The animation has to be SMIL, and that is not a preference: the panel shows the
extracted SVG through an `<img>`, and a browser running an SVG *as an image*
**does not play CSS animations and never runs scripts** — only declarative SMIL
moves. An animated picture driven by `@keyframes` or `<script>` will look frozen
here.

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

## Display only — no scoring

This plugin **does not score anything**. It does two things: it asks every model
the same drawing prompt on a schedule, and it lays the drawings out as they are.

Earlier versions computed a 0-100 "structural score" offline (is there an SVG, two
wheels, a frame, wings…). That has been removed on request: such a number can
only approximate “did these elements appear”, and it lends a false precision.
The judgement is left to whoever looks at the pictures (or to a vision model):
**same prompt, same model, over consecutive days — the drawings themselves are
the finding**, and no digit has to stand in for them.

The numbers that remain on the board are not grades, just facts: how many runs,
average duration, when the newest drawing landed, and how many runs came back
without a drawing. `没有出图` means the request returned but carried no usable
SVG (typically a refusal). The raw answer is stored on disk next to the SVG,
  but the panel never renders it — clicking a drawing shows the picture alone.

## Storage

Drawings live in `dir` (default `~/.dsh/pelican-watch`):

| File | Role |
|---|---|
| `<时间>_<模型>.html` | The full generated page; first line is a meta comment (model, provider, time, duration, whether an SVG was detected) |
| `<时间>_<模型>.svg` | The extracted inline SVG, used for the panel's `<img>` preview |
| `settings.json` | The selected probe targets (written by the picker) plus the two pace knobs `autoEnabled` / `intervalMinutes` |

Deleting files there is safe; the panel always lists what is on disk.

## Privacy & safety

- Every route is same-origin fenced like other plugin surfaces.
- Drawings are served as `image/svg+xml` with `x-content-type-options: nosniff`
  and a `default-src 'none'` CSP, and are only ever shown through `<img>`: the
  model's surrounding prose, markdown fences and any `<script>` are never
  rendered, and nothing from a model can execute in the app origin. There is no
  route that serves the stored page as HTML.

## Layout

| File | Role |
|---|---|
| `lib/index.js` | Host half: multi-model scheduler, schedule control, storage, `/api/pelican-watch/*` routes |
| `lib/client.js` | Client half: the flat board (one band per model with all its drawings) plus the gear-opened settings sheet (React) |
| `cordis.patch.yml` | Bundle patch that mounts the package as one host row |
| `package.json` | npm metadata + `dsh.bundle`/`dsh.client`/`dsh.compatibility` |
| `test/pelican.test.mjs` | Offline test: per-model roll-up, provider parsing, target selection, schedule control, route wiring |

## Test

```sh
node test/pelican.test.mjs
```
