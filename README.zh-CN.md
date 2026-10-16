# @mi-lu-uncle/dsh-pelican-watch

[English](README.md) | 简体中文 | [日本語](README.ja.md)

一个 DeepSeek Harness（DSH）**社区插件**：按固定间隔对**任意多个模型**运行**长期降智探针**。

- **自己挑模型** — 「设置 → 鹈鹕监视」里的「选择模型」会列出各 provider 提供的全部模型（实时调 `/models` 发现，并合并你 DSH profile 里已配置的模型），可多选；每个模型走自己的 provider 与 API Key。
- **定时作画** — 每 30 分钟（可配置）让每个已选模型画一幅「鹈鹕骑自行车」的单文件 HTML 页面（内联 SVG）。
- **不用技能、不用工具** — 每次都是裸的 `chat/completions` 请求：不带工具定义、不走 agent 循环，测的只是模型本身，和你的本地技能无关。
- **全部平铺、零点击** — 主面板是只读的：每个模型一条横幅，左边是它的全部指标（最新得分与趋势、走势线、跑了几次 / 平均耗时 / 最好最差 / 没出图几次，以及失败原因），右边是它画过的每一张，一次铺满整页 —— 不折叠、不筛选、不需要点任何东西。
- **跑动状态在顶部** — 检测中直接显示「已完成 n/m」「正在检测哪个模型」「已等 m:ss」「超时上限 m:ss」，一眼分清「慢」和「卡住」。
- **动作集中在设置里** — 选模型、立刻检测、打开某张画的原始页面都在「设置 → 鹈鹕监视」；主面板永远保持纯查看。
- **有界历史** — 默认保留最新 12 张，旧的自动清理。同一道题、同一个模型、坚持几天，退化会直接体现在结构变差、拒画（会保存并标上「未检出 SVG」）、或耗时变长上。

## 安装

推荐从 GitHub 仓库安装：

```sh
dsh plugin --profile desktop add https://github.com/mi-lu-uncle/dsh-pelican-watch.git
```

也支持本地路径或 tarball：

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-pelican-watch
```

注意：以 `link:` 方式安装的插件不走 HMR 监听，修改 `lib/index.js` 或 `lib/client.js` 后需要重启 App 才能生效。

## 选择模型

「设置 → 鹈鹕监视」里的「选择模型」会打开选择器：列出你 DSH profile 里发现的每个 provider，以及它提供的模型（调该 provider 自己的 `/models`，并与 profile 里已有的清单合并）。勾选任意多个后点**保存**——从下一个周期起，每个选中的模型各画一张，并在看板上各占一条横幅。

这份选择存在 `dir/settings.json`，调度器以它为准；`config.model` / `config.targets` 只用于第一次运行的初始值。每轮最多探测 12 个模型，**`concurrency` 个同时进行**（默认 3 个），每个模型各画一张。

## 速度与超时

- **模型并行检测**（默认同时 3 个）：一个慢模型不再拖住其他人——每张画一画完就落盘，几秒内出现在面板里。
- **每个请求有独立超时**（`timeoutSeconds`，默认 180 秒）。超时只在**它自己的**智商卡片上显示「超过 N 秒没有返回」，不会卡住整轮。推理型模型确实可能很慢——同一 provider 实测：`qwen3.7-max` 约 52 秒、`deepseek-flash` 约 121 秒（其中 1.5 万 token 是"思考"），而 `glm-5.3-flash` 有时超过 4 分钟。
- **超时或 HTTP 报错不算画**：既不落盘也不计分，因为那是基础设施问题、不是模型质量。而模型**答了却没画**（拒答）会被保存出来并计低分——那才是真实的质量信号。
- 默认**不发送** `maxTokens`：推理型模型动笔前可能花掉几万 completion token，卡一个上限只会把 SVG 截断，并不会更快。

## 配置

默认值贴合常见配置；如需覆盖，在 profile 补丁（`cordis.patch.yml`）的 `pelican-watch` 行上设置：

```yaml
- id: pelican-watch
  config:
    model: glm-5.3-flash                 # 初始模型（面板里的选择优先）
    baseURL: https://taotoken.net/api/v1 # OpenAI 兼容端点
    apiKeyEnv: TAOTOKEN_API_KEY          # 存放 API Key 的环境变量…
    # apiKey: sk-…                       # …或者直接把 key 写在这里
    # targets:                           # 可选：一次给多个模型做初始值
    #   - { provider: taotoken, baseURL: https://taotoken.net/api/v1, apiKeyEnv: TAOTOKEN_API_KEY, model: glm-5.3-flash }
    intervalMinutes: 30                  # 作画间隔
    maxImages: 12                        # 每个模型的历史深度（30 分钟一张 ≈ 6 小时）
    timeoutSeconds: 180                  # 单个请求超时；慢模型可调大
    concurrency: 3                       # 同时检测几个模型
    # maxTokens: 8192                    # 可选；默认不发送（见下文）
    dir: ~/.dsh/pelican-watch            # 保存目录
    runOnStart: true                     # 启动后 ~8 秒先画一轮
    # temperature: 0.7                   # 可选；默认不带该参数
    # prompt: …                          # 万不得已才改基准题面
```

基准提示词是刻意固定的——改了它历史就不可比了，所以 `prompt` 请当作最后手段。

## API Key

Key 在调用时按以下顺序解析：

1. 配置里的 `apiKey`；
2. 环境变量 `process.env[apiKeyEnv]`（默认 `TAOTOKEN_API_KEY`）；
3. DSH 自己的凭据库——`~/.dsh/.credentials.yaml` 里 `refs:` 的同名条目（可用 `credentialsFile` 改路径）。

第 3 条的意义：桌面版 DSH 从访达/程序坞启动，**不继承**你 shell 里 export 的环境变量；而通过 DSH 配置的 provider key 本来就已记在 `refs:` 里（键名就是该 provider 的 `apiKeyEnv`），所以开箱即用、无需重复配置。

三者都没有时跳过本次作画，并在面板显示原因（`缺少 API Key：…`）；补上任意一种，下一次定时作画即正常进行。

## 智商分

每张画都会被离线打个 0–100 的结构分，评分项就是提示词里真正要求的东西：有没有 SVG（30）、两个车轮（10）、辐条一类线条（8）、车架（8）、车把（6）、车座（6）、脚踏（6）、鹈鹕与喙/喉囊（10）、翅膀（6）、页面是否完整闭合（6）、输出体量是否合理（4）。看板上显示每个模型最新得分、相对它自己此前成绩的趋势、跑了几次、平均耗时和失败次数。

它是**启发式近似，不是权威基准**：画得丑也可能满分，这个分数只有拿同一个模型的历次结果对比才有意义。评分规则就是普通代码（`lib/index.js` 里的 `SCORE_FEATURES`），想调随时可调。

## 存储

画保存在 `dir`（默认 `~/.dsh/pelican-watch`）：

| 文件 | 作用 |
|---|---|
| `<时间>_<模型>.html` | 生成的完整页面；首行是元信息注释（模型、provider、时间、耗时、是否检出 SVG） |
| `<时间>_<模型>.svg` | 抽取出的内联 SVG，供面板 `<img>` 预览使用 |
| `settings.json` | 已选中的探测目标（由选择器写入） |

手动删除这里的文件是安全的；面板永远以磁盘上的现状为准。

## 隐私与安全

- 所有路由与其他插件一致，做了同源校验。
- 生成的页面以 `text/plain` 返回、在无权限的沙箱 iframe（`sandbox=""`）里渲染，模型输出不可能在 App 源里执行脚本；SVG 预览带 `x-content-type-options: nosniff`。

## 布局

| 文件 | 作用 |
|---|---|
| `lib/index.js` | Host 半：多模型调度器、存储、评分、`/api/pelican-watch/*` 路由 |
| `lib/client.js` | Client 半：只读平铺看板（每个模型一条横幅 + 它的全部画作），动作项在设置侧（React） |
| `cordis.patch.yml` | Bundle 补丁，把本包作为一个 host 行挂载 |
| `package.json` | npm 元数据 + `dsh.bundle`/`dsh.client`/`dsh.compatibility` |
| `test/pelican.test.mjs` | 离线测试：评分规则、按模型汇总、provider 解析、目标选择、路由接线 |

## 测试

```sh
node test/pelican.test.mjs
```
