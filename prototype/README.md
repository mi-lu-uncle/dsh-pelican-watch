# 界面方案原型（一次性，已归档）

`panel-redesign.html` 是鹈鹕监视面板的 4 个界面方案原型：用 `?variant=A|B|C|D` 切换，
底部浮动栏可用 `←`/`→`（或 1–4）翻转，并能切换「就绪 / 检测中 / 无数据」三种状态与深浅主题。
数据取自真实 `settings.json` 与实测耗时，画作是内联占位 SVG。

## 结论（2026-10-16）

采用 **A + B「最新作品」 + C「排名」的融合**：

- **A 的左栏模型清单** —— 状态点 / 分数 / 趋势，点击即筛选；
- **B 的最新作品 hero** —— 大图 + 分数压在图上，右侧「最新几张」小图堆；
- **C 的智商排行榜** —— 排名 / 当前分 / 趋势 / 走势 / 次数 / 平均耗时 / 失败 / 状态，可收起；
- 下方保留原有画册网格（A 的密度）。

未采用：方案 D（KPI 卡片 + 奖牌焦点榜）。

融合后的正式实现见 `lib/client.js`（main 分支）。原型本身只留在本分支，不进主线：
main 的 `.gitignore` 忽略了 `prototype/`。

## 查看方式

```sh
git show prototype/pelican-panel-ui:prototype/panel-redesign.html > /tmp/pelican-ui.html
open /tmp/pelican-ui.html
```

若本地工作区还留有该文件，直接 `open prototype/panel-redesign.html` 即可。
