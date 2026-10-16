# @mi-lu-uncle/dsh-pelican-watch

[English](README.md) | 简体中文 | [日本語](README.ja.md)

一个 DeepSeek Harness（DSH）**社区插件**：按固定间隔对同一个模型运行**长期降智探针**。

- **定时作画** — 每 30 分钟（可配置）向**一个指定模型**发一次请求，让它画一幅「鹈鹕骑自行车」的单文件 HTML 页面（内联 SVG）。
- **不用技能、不用工具** — 每次都是裸的 `chat/completions` 请求：不带工具定义、不走 agent 循环，测的只是模型本身，和你的本地技能无关。
- **画册面板** — 主侧边栏（和 Settings）里的「鹈鹕监视」列出每张保存的画，带内联 SVG 预览；点卡片打开沙箱化全页查看器，附模型 / 时间 / 耗时。还有「立即画一张」按钮。
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

## 配置

默认值贴合常见配置；如需覆盖，在 profile 补丁（`cordis.patch.yml`）的 `pelican-watch` 行上设置：

```yaml
- id: pelican-watch
  config:
    model: glm-5.3-flash                 # 探测哪个模型
    baseURL: https://taotoken.net/api/v1 # OpenAI 兼容端点
    apiKeyEnv: TAOTOKEN_API_KEY          # 存放 API Key 的环境变量…
    # apiKey: sk-…                       # …或者直接把 key 写在这里
    intervalMinutes: 30                  # 作画间隔
    maxImages: 12                        # 历史深度（30 分钟一张 ≈ 6 小时）
    dir: ~/.dsh/pelican-watch            # 保存目录
    runOnStart: true                     # 启动后 ~8 秒先画一张
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

## 存储

画保存在 `dir`（默认 `~/.dsh/pelican-watch`）：

| 文件 | 作用 |
|---|---|
| `<时间>_<模型>.html` | 生成的完整页面；首行是元信息注释（模型、时间、耗时、是否检出 SVG） |
| `<时间>_<模型>.svg` | 抽取出的内联 SVG，供面板 `<img>` 预览使用 |

手动删除这里的文件是安全的；面板永远以磁盘上的现状为准。

## 隐私与安全

- 所有路由与其他插件一致，做了同源校验。
- 生成的页面以 `text/plain` 返回、在无权限的沙箱 iframe（`sandbox=""`）里渲染，模型输出不可能在 App 源里执行脚本；SVG 预览带 `x-content-type-options: nosniff`。

## 布局

| 文件 | 作用 |
|---|---|
| `lib/index.js` | Host 半：调度器、存储、`/api/pelican-watch/*` 路由 |
| `lib/client.js` | Client 半：画册面板（React） |
| `cordis.patch.yml` | Bundle 补丁，把本包作为一个 host 行挂载 |
| `package.json` | npm 元数据 + `dsh.bundle`/`dsh.client`/`dsh.compatibility` |
| `test/pelican.test.mjs` | 离线测试：工具函数、存储生命周期、假 fetch 的路由接线 |

## 测试

```sh
node test/pelican.test.mjs
```
