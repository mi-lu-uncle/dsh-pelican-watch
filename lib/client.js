// dsh-pelican-watch — client half.
//
// Registers the probe panel: an icon in the main sidebar (opens the panel in
// the main view) plus a matching Settings section. The layout is the fusion
// chosen in the UI prototype (`prototype/panel-redesign.html`, archived on the
// `prototype/pelican-panel-ui` branch):
//
//   rail   — one compact row per probed model (state dot, score, trend);
//            clicking a row filters everything to its right        [variant A]
//   hero   — the newest drawing for the current filter, large, with the score
//            overlaid, beside a stack of "latest few"              [variant B]
//   board  — the leaderboard: rank / score / trend / sparkline / runs / avg /
//            failures / status, collapsible, rows click to filter  [variant C]
//   gallery— dense grid of every saved drawing, sandboxed full-page viewer
//
// All data goes through the host half's same-origin `/api/pelican-watch/*`.
window.__ModuleLoader__.load({
  id: "@mi-lu-uncle/dsh-pelican-watch",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let PanelIcon = null;
    try {
      const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
      if (primitives && primitives.IconImageOutlineRegular) PanelIcon = primitives.IconImageOutlineRegular;
    } catch { /* icon package optional; fall back to the inline glyph below */ }

    // ── locale ──────────────────────────────────────────────────────────
    const zh = {
      nav: "鹈鹕监视",
      title: "鹈鹕监视",
      subtitle: "定时让选中的模型画同一道「鹈鹕骑车」，用来观察它们是否降智",
      pickerOpen: "选择模型",
      pickerTitle: "选择要检测的模型",
      pickerHint: "勾选后点保存；下一个周期开始，每个模型都会各画一张",
      search: "搜索模型…",
      refresh: "刷新列表",
      close: "关闭",
      selectAll: "全选",
      clearAll: "清空",
      save: "保存",
      saving: "保存中…",
      saved: "已保存，下个周期生效",
      saveFailed: "保存失败",
      noMatches: "没有匹配的模型",
      keyMissing: "缺少 API Key",
      keyOk: "密钥可用",
      noModels: "没有发现模型，点「刷新列表」试试",
      selectedNote: "已选 {n} 个模型",
      modelsCol: "模型",
      heroTitle: "最新作品",
      recent: "最新几张",
      boardTitle: "智商看板",
      boardHint: "点一行即可只看这个模型的画",
      collapse: "收起",
      expand: "展开",
      iqHint: "分数来自画面结构（SVG、车轮、辐条、车架、车把、车座、脚踏、鹈鹕与翅膀、页面完整性），满分 100",
      runs: "{n} 次",
      never: "还没跑过",
      avgLabel: "平均",
      noData: "—",
      colRank: "#",
      colModel: "模型",
      colScore: "当前分",
      colTrend: "趋势",
      colSpark: "走势",
      colRuns: "次数",
      colAvg: "平均耗时",
      colFails: "失败",
      colStatus: "状态",
      statusOk: "正常",
      statusTimeout: "超时",
      statusNever: "未跑",
      runAll: "全部检测一遍",
      runOne: "只测这个",
      running: "正在检测…",
      progress: "已完成 {done}/{total}",
      nowProbing: "正在检测",
      lastFailed: "上次失败",
      nextRun: "下次 {time}",
      intervalNote: "每 {n} 分钟一轮",
      parallelNote: "并行 {n}",
      maxNote: "最多保存 {n} 张",
      allWorks: "全部画作",
      worksCount: "{n} 张",
      empty: "还没有画",
      emptyHint: "点右上角「全部检测一遍」立即开始，或等调度器到点自动画",
      emptyPick: "先在「选择模型」里勾选要检测的模型",
      badgeNoSvg: "未检出 SVG",
      tookMs: "用时",
      started: "已开始检测，画完会自动出现在列表里",
      failed: "检测失败",
      loadFailed: "列表加载失败",
      errorLabel: "上次错误",
      placeholder: "没有可预览的 SVG",
      featuresLabel: "命中的结构",
      scoreLabel: "得分",
      scoreUnit: "结构分",
      viewBig: "放大",
      refusals: "{n} 次没出图",
    };
    const en = {
      nav: "Pelican Watch",
      title: "Pelican Watch",
      subtitle: "The same pelican-on-a-bicycle prompt on a schedule — a model-quality probe",
      pickerOpen: "Choose models",
      pickerTitle: "Models to probe",
      pickerHint: "Tick the models, save, and every cycle draws one picture per model",
      search: "Search models…",
      refresh: "Refresh list",
      close: "Close",
      selectAll: "Select all",
      clearAll: "Clear",
      save: "Save",
      saving: "Saving…",
      saved: "Saved — takes effect next cycle",
      saveFailed: "Save failed",
      noMatches: "No matching model",
      keyMissing: "No API key",
      keyOk: "Key available",
      noModels: "No models discovered — try “Refresh list”",
      selectedNote: "{n} model(s) selected",
      modelsCol: "Models",
      heroTitle: "Latest drawing",
      recent: "Latest few",
      boardTitle: "IQ board",
      boardHint: "Click a row to show only that model's drawings",
      collapse: "Collapse",
      expand: "Expand",
      iqHint: "Scored from the drawing's structure (SVG, wheels, spokes, frame, handlebar, seat, pedals, pelican and wings, page completeness); 100 max",
      runs: "{n} run(s)",
      never: "Not run yet",
      avgLabel: "Avg",
      noData: "—",
      colRank: "#",
      colModel: "Model",
      colScore: "Score",
      colTrend: "Trend",
      colSpark: "History",
      colRuns: "Runs",
      colAvg: "Avg time",
      colFails: "Failed",
      colStatus: "Status",
      statusOk: "ok",
      statusTimeout: "timeout",
      statusNever: "not run",
      runAll: "Probe all now",
      runOne: "Probe this one",
      running: "Probing…",
      progress: "{done}/{total} done",
      nowProbing: "Probing",
      lastFailed: "Last failure",
      nextRun: "Next {time}",
      intervalNote: "every {n} min",
      parallelNote: "{n} at a time",
      maxNote: "keeps {n}",
      allWorks: "All drawings",
      worksCount: "{n}",
      empty: "Nothing drawn yet",
      emptyHint: "Click “Probe all now”, or wait for the scheduler",
      emptyPick: "Pick the models to probe first",
      badgeNoSvg: "No SVG found",
      tookMs: "Took",
      started: "Started — results appear here automatically",
      failed: "Probe failed",
      loadFailed: "Failed to load the list",
      errorLabel: "Last error",
      placeholder: "No SVG to preview",
      featuresLabel: "Structure found",
      scoreLabel: "Score",
      scoreUnit: "score",
      viewBig: "Open",
      refusals: "{n} without a drawing",
    };

    // ── styles ──────────────────────────────────────────────────────────
    const ACCENT = "var(--dsw-accent, #6366f1)";
    const HAIRLINE = "var(--dsw-alias-border-l1)";
    const s = {
      root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
      headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", padding: "0 0 12px" },
      headerLead: { flex: "1 1 0", minWidth: 0 },
      title: { margin: 0, fontSize: "17px", fontWeight: 700, lineHeight: "24px", letterSpacing: "-.01em" },
      subtitle: { margin: "3px 0 0", color: "var(--dsw-alias-label-tertiary)", fontSize: "12.5px", lineHeight: "19px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      headerActions: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flex: "0 0 auto" },
      statusText: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
      progTrack: { height: "2px", background: "var(--dsw-alias-bg-layer-3)", overflow: "hidden", borderRadius: "999px" },
      progFill: { height: "100%", background: ACCENT, transition: "width .4s ease" },
      body: { flex: "1 1 auto", minHeight: 0, display: "flex" },
      rail: { width: "238px", flex: "0 0 auto", borderRight: `1px solid ${HAIRLINE}`, display: "flex", flexDirection: "column", minHeight: 0 },
      railHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", padding: "2px 12px 8px" },
      railHeadText: { fontSize: "11px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dsw-alias-label-tertiary)" },
      railList: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 8px 8px" },
      railRow: { display: "flex", alignItems: "center", gap: "9px", width: "100%", boxSizing: "border-box", textAlign: "left", padding: "8px 9px", borderRadius: "9px", border: "1px solid transparent", cursor: "pointer", background: "transparent", color: "inherit", font: "inherit" },
      railRowActive: { background: "color-mix(in srgb, var(--dsw-accent, #6366f1) 10%, transparent)", borderColor: `color-mix(in srgb, ${ACCENT} 38%, transparent)` },
      railMain: { flex: "1 1 auto", minWidth: 0 },
      railName: { display: "block", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", fontWeight: 600, lineHeight: "17px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      railSub: { display: "block", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      railTail: { flex: "0 0 auto", textAlign: "right" },
      railScore: { display: "block", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "18px", fontWeight: 700, lineHeight: "21px", fontVariantNumeric: "tabular-nums" },
      dot: { width: "7px", height: "7px", borderRadius: "999px", flex: "0 0 auto", background: "var(--dsw-alias-label-tertiary)" },
      railFoot: { flex: "0 0 auto", padding: "8px", borderTop: `1px solid ${HAIRLINE}` },
      work: { flex: "1 1 auto", minWidth: 0, minHeight: 0, overflowY: "auto", padding: "16px 18px 24px", boxSizing: "border-box" },
      hero: { display: "grid", gridTemplateColumns: "minmax(0, 1.75fr) minmax(200px, 1fr)", gap: "18px", alignItems: "stretch", marginBottom: "22px" },
      heroArt: { position: "relative", border: `1px solid ${HAIRLINE}`, borderRadius: "14px", overflow: "hidden", background: "var(--dsw-alias-bg-layer-3)", aspectRatio: "4 / 3", cursor: "pointer", padding: 0, display: "block", width: "100%" },
      heroImg: { width: "100%", height: "100%", objectFit: "contain", display: "block", background: "var(--dsw-alias-bg-layer-3)" },
      heroCap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px", background: "linear-gradient(transparent, rgba(0,0,0,.72))", color: "#fff", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "14px", textAlign: "left" },
      heroModel: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "14px", fontWeight: 600, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      heroMeta: { fontSize: "11.5px", lineHeight: "17px", opacity: 0.82, marginTop: "3px" },
      heroScore: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "38px", fontWeight: 700, lineHeight: "40px", letterSpacing: "-.02em", flex: "0 0 auto" },
      heroScoreUnit: { fontSize: "11.5px", fontWeight: 600, opacity: 0.66, marginLeft: "3px" },
      heroSide: { display: "flex", flexDirection: "column", gap: "9px", minWidth: 0 },
      heroSideHead: { fontSize: "11px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dsw-alias-label-tertiary)" },
      mini: { display: "grid", gridTemplateColumns: "78px 1fr", gap: "10px", alignItems: "center", padding: "6px", border: `1px solid ${HAIRLINE}`, borderRadius: "10px", background: "var(--dsw-alias-bg-layer-3)", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", minWidth: 0 },
      miniArt: { aspectRatio: "4 / 3", borderRadius: "7px", overflow: "hidden", background: "var(--dsw-alias-bg-layer-1)", display: "block" },
      miniImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
      miniName: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", fontWeight: 600, lineHeight: "17px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      miniMeta: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px", marginTop: "2px", fontVariantNumeric: "tabular-nums" },
      boardCard: { border: `1px solid ${HAIRLINE}`, borderRadius: "14px", background: "var(--dsw-alias-bg-layer-3)", overflow: "hidden", marginBottom: "20px" },
      boardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderBottom: `1px solid ${HAIRLINE}` },
      boardTitleRow: { display: "flex", alignItems: "baseline", gap: "9px", minWidth: 0, flexWrap: "wrap" },
      boardTitle: { margin: 0, fontSize: "13px", fontWeight: 700, lineHeight: "20px" },
      boardHint: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      tableWrap: { overflowX: "auto" },
      nameCell: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 },
      nameText: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      rankCell: { color: "var(--dsw-alias-label-tertiary)", fontVariantNumeric: "tabular-nums", width: "26px" },
      chipRow: { display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", margin: "0 0 14px" },
      chip: { cursor: "pointer", border: `1px solid ${HAIRLINE}`, background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-secondary)", font: "inherit", fontSize: "12px", lineHeight: "18px", borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap" },
      chipActive: { borderColor: ACCENT, background: "color-mix(in srgb, var(--dsw-accent, #6366f1) 12%, transparent)", color: "var(--dsw-alias-label-primary)", fontWeight: 600 },
      count: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", fontVariantNumeric: "tabular-nums" },
      grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "12px", alignItems: "start" },
      card: { display: "flex", flexDirection: "column", background: "var(--dsw-alias-bg-layer-3)", border: `1px solid ${HAIRLINE}`, borderRadius: "12px", padding: 0, cursor: "pointer", minWidth: 0, overflow: "hidden", textAlign: "left", font: "inherit", color: "inherit" },
      cardThumb: { position: "relative", aspectRatio: "4 / 3", background: "var(--dsw-alias-bg-layer-1)", display: "block" },
      cardImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
      cardPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", background: "var(--dsw-alias-bg-layer-1)" },
      cardScore: { position: "absolute", top: "7px", right: "7px" },
      cardFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "8px 10px", minWidth: 0 },
      cardModel: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
      cardMeta: { flex: "0 0 auto", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
      pill: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, lineHeight: "18px", padding: "1px 8px", borderRadius: "999px", whiteSpace: "nowrap" },
      pillScore: { background: "color-mix(in srgb, var(--dsw-accent, #6366f1) 16%, transparent)", color: ACCENT, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11.5px" },
      pillOk: { background: "color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 14%, transparent)", color: "var(--dsw-alias-state-success-primary, #16a34a)" },
      pillWarn: { background: "color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97706) 14%, transparent)", color: "var(--dsw-alias-state-warning-primary, #d97706)" },
      pillErr: { background: "color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 14%, transparent)", color: "var(--dsw-alias-state-error-primary, #dc2626)" },
      pillMute: { background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-tertiary)" },
      empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", padding: "48px 24px", gap: "6px" },
      emptyGlyph: { fontSize: "32px", lineHeight: 1, marginBottom: "4px" },
      emptyTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: "14px", fontWeight: 600 },
      error: { display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: "12.5px", marginTop: "8px" },
      backdrop: { position: "fixed", inset: 0, background: "rgba(6,8,12,.55)", zIndex: 400 },
      drawer: { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(760px, 94vw)", background: "var(--dsw-alias-bg-layer-1)", borderLeft: `1px solid ${HAIRLINE}`, zIndex: 401, display: "flex", flexDirection: "column", boxShadow: "-14px 0 36px rgba(0,0,0,.22)" },
      drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "13px 16px", borderBottom: `1px solid ${HAIRLINE}` },
      drawerTitle: { margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", fontWeight: 600, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      drawerMeta: { display: "flex", gap: "14px", flexWrap: "wrap", padding: "10px 16px", color: "var(--dsw-alias-label-secondary)", fontSize: "12px", fontVariantNumeric: "tabular-nums" },
      drawerBody: { flex: "1 1 auto", minHeight: 0, padding: "0 16px 16px", boxSizing: "border-box" },
      frame: { width: "100%", height: "100%", border: `1px solid ${HAIRLINE}`, borderRadius: "10px", background: "#fff", display: "block", boxSizing: "border-box" },
      modal: { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(620px, 94vw)", maxHeight: "84vh", background: "var(--dsw-alias-bg-layer-1)", border: `1px solid ${HAIRLINE}`, borderRadius: "14px", zIndex: 401, display: "flex", flexDirection: "column", boxShadow: "0 22px 52px rgba(0,0,0,.3)" },
      modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px 10px" },
      modalTitle: { margin: 0, fontSize: "14px", fontWeight: 700, lineHeight: "20px" },
      modalHint: { padding: "0 16px 10px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px" },
      modalTools: { display: "flex", alignItems: "center", gap: "8px", padding: "0 16px 10px", flexWrap: "wrap" },
      input: { flex: "1 1 150px", minWidth: 0, boxSizing: "border-box", font: "inherit", fontSize: "12.5px", padding: "6px 10px", borderRadius: "8px", border: `1px solid ${HAIRLINE}`, background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)" },
      modalBody: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 16px 8px" },
      providerRow: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 0 5px", position: "sticky", top: 0, background: "var(--dsw-alias-bg-layer-1)" },
      providerName: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", fontWeight: 700 },
      modelRow: { display: "flex", alignItems: "center", gap: "9px", padding: "5px 8px", borderRadius: "8px", cursor: "pointer", fontSize: "12.5px", minWidth: 0 },
      modelName: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto" },
      modalFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 16px 14px", borderTop: `1px solid ${HAIRLINE}` },
      toast: { position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)", border: `1px solid ${HAIRLINE}`, borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", zIndex: 500, boxShadow: "0 10px 28px rgba(0,0,0,.18)", maxWidth: "80vw" },
    };

    // ── helpers ─────────────────────────────────────────────────────────
    const p2 = (n) => String(n).padStart(2, "0");
    function fmtTime(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const now = new Date();
      const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      return sameDay ? hm : `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hm}`;
    }
    function fmtMs(value) {
      if (typeof value !== "number" || value < 0) return "";
      return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
    }
    const keyOf = (provider, model) => `${provider}|${model}`;
    const api = (path, body) => fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => r.json());
    const OK = "var(--dsw-alias-state-success-primary, #16a34a)";
    const WARN = "var(--dsw-alias-state-warning-primary, #d97706)";
    const ERR = "var(--dsw-alias-state-error-primary, #dc2626)";
    const MUTE = "var(--dsw-alias-label-tertiary)";
    const scoreColor = (score) => (score == null ? MUTE : score >= 90 ? OK : score >= 70 ? WARN : ERR);
    const trendText = (t) => (t > 0 ? `↑ +${t}` : t < 0 ? `↓ ${t}` : "→ 0");
    const trendColor = (t) => (t > 0 ? OK : t < 0 ? ERR : MUTE);
    const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

    /** Trend sparkline for a model's score history (oldest → newest). */
    function Sparkline({ values, color, width = 62, height = 18 }) {
      const list = Array.isArray(values) ? values : [];
      if (list.length < 2) return react.createElement("span", { style: { color: MUTE, fontSize: "11px" } }, "—");
      const min = Math.min(...list);
      const max = Math.max(...list);
      const span = Math.max(1, max - min);
      const points = list
        .map((v, i) => `${(1 + (i / (list.length - 1)) * (width - 2)).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
        .join(" ");
      return react.createElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": true, style: { display: "block" } },
        react.createElement("polyline", { points, fill: "none", stroke: color, strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" }));
    }

    function Btn({ onClick, primary, disabled, children, title }) {
      return react.createElement("button", {
        type: "button",
        onClick: disabled ? undefined : onClick,
        disabled,
        title,
        className: primary ? "pw-btn pw-btn-primary" : "pw-btn",
      }, children);
    }

    // ── panel ───────────────────────────────────────────────────────────
    function PelicanPanel({ t }) {
      const [state, setState] = react.useState({ status: "loading" });
      const [selected, setSelected] = react.useState(null);
      const [raw, setRaw] = react.useState(null);
      const [busy, setBusy] = react.useState(false);
      const [toast, setToast] = react.useState(null);
      const [failedPreviews, setFailedPreviews] = react.useState(() => new Set());
      const [filterModel, setFilterModel] = react.useState(null);
      const [boardOpen, setBoardOpen] = react.useState(true);
      const [pickerOpen, setPickerOpen] = react.useState(false);
      const [query, setQuery] = react.useState("");
      const [draft, setDraft] = react.useState(() => new Set());
      const [catalog, setCatalog] = react.useState({ status: "idle", providers: [] });
      const [saving, setSaving] = react.useState(false);
      const workRef = react.useRef(null);

      const load = react.useCallback(() => {
        fetch("/api/pelican-watch/list", { credentials: "include" }).then((r) => r.json()).then((payload) => {
          if (payload && payload.ok === true) setState({ status: "ready", ...payload });
          else setState({ status: "error" });
        }).catch(() => setState({ status: "error" }));
      }, []);

      // Poll while mounted: often while a pass is in flight, otherwise a slow
      // heartbeat so scheduled drawings appear on their own.
      react.useEffect(() => {
        load();
        const id = setInterval(load, state.running ? 4000 : 30000);
        return () => clearInterval(id);
      }, [load, state.running]);

      react.useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 2600);
        return () => clearTimeout(id);
      }, [toast]);

      // Load the generated page when the drawer target changes.
      react.useEffect(() => {
        if (!selected) { setRaw(null); return; }
        let current = true;
        setRaw(null);
        fetch(`/api/pelican-watch/raw?id=${encodeURIComponent(selected.id)}`, { credentials: "include" })
          .then((r) => r.text()).then((text) => { if (current) setRaw(text); })
          .catch(() => { if (current) setRaw(null); });
        return () => { current = false; };
      }, [selected]);

      // The host grows slot content with the content, so pin the scrolling
      // column to an exact height instead (see skill-console for the same fix).
      react.useLayoutEffect(() => {
        const el = workRef.current;
        if (!el) return;
        const measure = () => {
          const rect = el.getBoundingClientRect();
          const avail = Math.max(220, window.innerHeight - rect.top - 30);
          el.style.maxHeight = avail + "px";
          el.style.minHeight = avail + "px";
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
      }, [state, filterModel, boardOpen]);

      const loadCatalog = react.useCallback((refresh) => {
        setCatalog((prev) => ({ ...prev, status: "loading" }));
        api(`/api/pelican-watch/catalog${refresh ? "?refresh=1" : ""}`).then((payload) => {
          if (payload && payload.ok === true) setCatalog({ status: "ready", providers: Array.isArray(payload.providers) ? payload.providers : [] });
          else setCatalog({ status: "error", providers: [] });
        }).catch(() => setCatalog({ status: "error", providers: [] }));
      }, []);

      const openPicker = () => {
        const targets = Array.isArray(state.targets) ? state.targets : [];
        setDraft(new Set(targets.map((target) => keyOf(target.provider, target.model))));
        setQuery("");
        setPickerOpen(true);
        loadCatalog(false);
      };

      const toggleDraft = (key) => {
        setDraft((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        });
      };

      const saveTargets = async () => {
        const rows = [];
        for (const provider of catalog.providers) {
          for (const model of provider.models || []) {
            if (!draft.has(keyOf(provider.provider, model))) continue;
            rows.push({ provider: provider.provider, baseURL: provider.baseURL, apiKeyEnv: provider.apiKeyEnv, model });
          }
        }
        if (rows.length === 0) { setToast(t("emptyPick")); return; }
        setSaving(true);
        try {
          const payload = await api("/api/pelican-watch/targets", { targets: rows });
          if (payload && payload.ok === true) {
            setPickerOpen(false);
            setToast(t("saved"));
            setFilterModel(null);
            load();
          } else {
            setToast(`${t("saveFailed")}${payload && payload.error ? `：${payload.error}` : ""}`);
          }
        } catch (error) {
          setToast(`${t("saveFailed")}：${error.message}`);
        } finally {
          setSaving(false);
        }
      };

      const runAll = async () => {
        setBusy(true);
        try {
          await api("/api/pelican-watch/run", {});
          setToast(t("started"));
          setTimeout(load, 2500);
        } catch (error) {
          setToast(`${t("failed")}：${error.message}`);
        } finally {
          setBusy(false);
        }
      };

      const runOne = async (model, provider) => {
        try {
          await api("/api/pelican-watch/run", { model, provider });
          setToast(t("started"));
          setTimeout(load, 2500);
        } catch (error) {
          setToast(`${t("failed")}：${error.message}`);
        }
      };

      const markPreviewFailed = (id) => {
        setFailedPreviews((prev) => { if (prev.has(id)) return prev; const next = new Set(prev); next.add(id); return next; });
      };

      const ready = state.status === "ready";
      const images = ready && Array.isArray(state.images) ? state.images : [];
      const targets = ready && Array.isArray(state.targets) ? state.targets : [];
      const summary = ready && Array.isArray(state.summary) ? state.summary : [];
      const errors = ready && state.errors && typeof state.errors === "object" ? state.errors : {};
      const inflight = ready && Array.isArray(state.inflight) ? state.inflight : [];
      const filter = filterModel === null ? null : filterModel;
      const shown = filter === null ? images : images.filter((img) => img.model === filter);

      const errorFor = (model) => {
        const message = errors[model];
        return typeof message === "string" && message !== "" ? message : null;
      };

      // One row per probed model: its roll-up when it has runs, a placeholder
      // otherwise, plus any model that has drawings but is no longer selected.
      const rows = targets.map((target) => summary.find((row) => row.model === target.model) || {
        model: target.model, provider: target.provider, count: 0, latest: null, avg: null,
        best: null, worst: null, trend: 0, avgMs: null, refusals: 0, lastTime: null, scores: [],
      }).concat(summary.filter((row) => !targets.some((target) => target.model === row.model)));
      rows.sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1) || b.count - a.count);

      const hero = shown[0] || null;
      const minis = shown.slice(1, 5);
      const modelsWithDrawings = Array.from(new Set(images.map((img) => img.model).filter((model) => model !== "")));

      const toggleFilter = (model) => setFilterModel(filter === model ? null : model);

      const renderArt = (drawing, style, onError) => (drawing.hasSvg && !failedPreviews.has(drawing.id)
        ? react.createElement("img", {
            src: `/api/pelican-watch/image?id=${encodeURIComponent(drawing.id)}`,
            alt: "", loading: "lazy", style, onError: () => markPreviewFailed(drawing.id),
          })
        : react.createElement("div", { style: s.cardPlaceholder }, drawing.hasSvg ? t("placeholder") : t("badgeNoSvg")));

      const renderHeader = () => react.createElement("header", null,
        react.createElement("div", { style: s.headerRow },
          react.createElement("div", { style: s.headerLead },
            react.createElement("h1", { style: s.title }, t("title")),
            react.createElement("p", { style: s.subtitle }, ready
              ? [
                  t("intervalNote").replace("{n}", String(state.intervalMinutes || 30)),
                  t("parallelNote").replace("{n}", String(state.concurrency || 3)),
                  t("maxNote").replace("{n}", String(state.maxImages || 12)),
                  t("selectedNote").replace("{n}", String(targets.length)),
                ].join(" · ")
              : t("subtitle"))
          ),
          react.createElement("div", { style: s.headerActions },
            ready && state.running
              ? react.createElement("span", { style: s.statusText },
                  `${t("progress").replace("{done}", String(state.done || 0)).replace("{total}", String(state.total || 0))}` +
                  (inflight.length > 0 ? ` · ${t("nowProbing")} ${clip(inflight.join("、"), 42)}` : ""))
              : null,
            ready && !state.running && state.nextRunAt
              ? react.createElement("span", { style: s.statusText }, t("nextRun").replace("{time}", fmtTime(state.nextRunAt)))
              : null,
            react.createElement(Btn, { onClick: openPicker }, t("pickerOpen")),
            react.createElement(Btn, { primary: true, disabled: !ready || busy || state.running, onClick: runAll },
              state.running ? t("running") : t("runAll"))
          )
        ),
        ready && state.running
          ? react.createElement("div", { style: s.progTrack },
              react.createElement("div", { style: { ...s.progFill, width: `${state.total ? ((state.done || 0) / state.total) * 100 : 0}%` } }))
          : null
      );

      const renderRail = () => react.createElement("aside", { style: s.rail },
        react.createElement("div", { style: s.railHead },
          react.createElement("span", { style: s.railHeadText }, t("modelsCol")),
          react.createElement("span", { style: s.statusText }, t("selectedNote").replace("{n}", String(targets.length)))
        ),
        react.createElement("div", { style: s.railList },
          rows.map((row) => {
            const on = filter === row.model;
            const running = state.running && inflight.includes(row.model);
            const dotColor = running ? ACCENT : errorFor(row.model) ? ERR : row.count > 0 ? OK : MUTE;
            return react.createElement("button", {
              key: keyOf(row.provider, row.model),
              type: "button",
              onClick: () => toggleFilter(row.model),
              style: { ...s.railRow, ...(on ? s.railRowActive : {}) },
              className: on ? "" : "pw-row-hover",
              title: row.model,
            },
              react.createElement("span", { style: { ...s.dot, background: dotColor } }),
              react.createElement("span", { style: s.railMain },
                react.createElement("span", { style: s.railName }, row.model),
                react.createElement("span", { style: s.railSub },
                  errorFor(row.model) ? t("lastFailed") :
                  row.count === 0 ? t("never") :
                  `${t("runs").replace("{n}", String(row.count))} · ${t("avgLabel")} ${fmtMs(row.avgMs) || t("noData")}`)
              ),
              react.createElement("span", { style: s.railTail },
                react.createElement("span", { style: { ...s.railScore, color: scoreColor(row.latest) } }, row.count > 0 ? String(row.latest) : t("noData")),
                react.createElement("span", { style: { fontSize: "11px", fontWeight: 600, color: trendColor(row.trend) } }, row.count > 1 ? trendText(row.trend) : "")
              )
            );
          })
        ),
        react.createElement("div", { style: s.railFoot },
          react.createElement(Btn, { onClick: openPicker }, `＋ ${t("pickerOpen")}`))
      );

      const renderHero = () => {
        if (!hero) return null;
        return react.createElement("section", { style: s.hero },
          react.createElement("button", { type: "button", style: s.heroArt, onClick: () => setSelected(hero), title: t("viewBig") },
            renderArt(hero, s.heroImg),
            react.createElement("span", { style: s.heroCap },
              react.createElement("span", { style: { minWidth: 0 } },
                react.createElement("span", { style: { display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.78 } }, t("heroTitle")),
                react.createElement("span", { style: s.heroModel }, hero.model),
                react.createElement("span", { style: s.heroMeta }, `${fmtTime(hero.time)} · ${t("tookMs")} ${fmtMs(hero.ms)} · ${t("scoreUnit")}`)
              ),
              react.createElement("span", { style: { ...s.heroScore, color: scoreColor(hero.score) } },
                String(hero.score), react.createElement("span", { style: s.heroScoreUnit }, "/100"))
            )
          ),
          react.createElement("div", { style: s.heroSide },
            react.createElement("span", { style: s.heroSideHead }, t("recent")),
            minis.length === 0
              ? react.createElement("span", { style: s.statusText }, t("emptyHint"))
              : minis.map((drawing) => react.createElement("button", {
                  key: drawing.id, type: "button", style: s.mini, className: "pw-row-hover", onClick: () => setSelected(drawing),
                },
                  react.createElement("span", { style: s.miniArt }, renderArt(drawing, s.miniImg)),
                  react.createElement("span", { style: { minWidth: 0 } },
                    react.createElement("span", { style: s.miniName }, drawing.model),
                    react.createElement("span", { style: s.miniMeta }, `${fmtTime(drawing.time)} · ${t("scoreLabel")} ${drawing.score}`))
                ))
          )
        );
      };

      const renderBoard = () => {
        if (rows.length === 0) return null;
        return react.createElement("section", { style: s.boardCard },
          react.createElement("div", { style: s.boardHead },
            react.createElement("div", { style: s.boardTitleRow },
              react.createElement("h2", { style: s.boardTitle }, t("boardTitle")),
              react.createElement("span", { style: s.boardHint, title: t("iqHint") }, t("boardHint"))
            ),
            react.createElement(Btn, { onClick: () => setBoardOpen(!boardOpen) }, boardOpen ? t("collapse") : t("expand"))
          ),
          boardOpen
            ? react.createElement("div", { style: s.tableWrap },
                react.createElement("table", { className: "pw-table" },
                  react.createElement("thead", null,
                    react.createElement("tr", null,
                      react.createElement("th", null, t("colRank")),
                      react.createElement("th", null, t("colModel")),
                      react.createElement("th", null, t("colScore")),
                      react.createElement("th", { className: "pw-narrow" }, t("colTrend")),
                      react.createElement("th", { className: "pw-narrow2" }, t("colSpark")),
                      react.createElement("th", null, t("colRuns")),
                      react.createElement("th", { className: "pw-narrow" }, t("colAvg")),
                      react.createElement("th", { className: "pw-narrow2" }, t("colFails")),
                      react.createElement("th", null, t("colStatus"))
                    )
                  ),
                  react.createElement("tbody", null,
                    rows.map((row, index) => {
                      const failed = errorFor(row.model);
                      const on = filter === row.model;
                      return react.createElement("tr", {
                        key: keyOf(row.provider, row.model),
                        onClick: () => toggleFilter(row.model),
                        className: on ? "pw-on" : "",
                        title: failed || row.model,
                      },
                        react.createElement("td", { style: s.rankCell }, String(index + 1)),
                        react.createElement("td", null,
                          react.createElement("span", { style: s.nameCell },
                            react.createElement("span", { style: { ...s.dot, background: state.running && inflight.includes(row.model) ? ACCENT : failed ? ERR : row.count > 0 ? OK : MUTE } }),
                            react.createElement("span", { style: s.nameText }, row.model))),
                        react.createElement("td", { style: { fontWeight: 700, color: scoreColor(row.latest), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } },
                          row.count > 0 ? String(row.latest) : t("noData")),
                        react.createElement("td", { className: "pw-narrow", style: { color: trendColor(row.trend) } }, row.count > 1 ? trendText(row.trend) : t("noData")),
                        react.createElement("td", { className: "pw-narrow2" }, react.createElement(Sparkline, { values: row.scores, color: scoreColor(row.latest) })),
                        react.createElement("td", null, row.count > 0 ? String(row.count) : t("noData")),
                        react.createElement("td", { className: "pw-narrow" }, row.avgMs !== null ? fmtMs(row.avgMs) : t("noData")),
                        react.createElement("td", {
                          className: "pw-narrow2",
                          style: { color: row.refusals > 0 ? ERR : "inherit" },
                          title: t("refusals").replace("{n}", String(row.refusals)),
                        }, String(row.refusals)),
                        react.createElement("td", null,
                          react.createElement("span", {
                            style: { ...s.pill, ...(failed ? s.pillErr : row.count === 0 ? s.pillMute : s.pillOk) },
                          }, failed ? t("statusTimeout") : row.count === 0 ? t("statusNever") : t("statusOk")))
                      );
                    })
                  )
                )
              )
            : null
        );
      };

      const renderGallery = () => {
        if (shown.length === 0) {
          return react.createElement("div", { style: s.empty },
            react.createElement("div", { style: s.emptyGlyph }, "🦩"),
            react.createElement("div", { style: s.emptyTitle }, targets.length === 0 ? t("emptyPick") : t("empty")),
            react.createElement("div", null, targets.length === 0 ? t("emptyHint") : t("emptyHint")),
            state.lastError ? react.createElement("div", { style: s.error }, `${t("errorLabel")}：${state.lastError}`) : null
          );
        }
        return react.createElement("div", null,
          react.createElement("div", { style: s.chipRow },
            react.createElement("button", {
              type: "button", style: { ...s.chip, ...(filter === null ? s.chipActive : {}) }, onClick: () => setFilterModel(null),
            }, `${t("allWorks")} ${images.length}`),
            modelsWithDrawings.map((model) => react.createElement("button", {
              key: model, type: "button",
              style: { ...s.chip, ...(filter === model ? s.chipActive : {}) },
              onClick: () => toggleFilter(model),
            }, model)),
            react.createElement("span", { style: s.count }, t("worksCount").replace("{n}", String(shown.length)))
          ),
          react.createElement("div", { style: s.grid },
            shown.map((drawing) => react.createElement("button", {
              key: drawing.id, type: "button", style: s.card, className: "pw-card", onClick: () => setSelected(drawing),
            },
              react.createElement("span", { style: s.cardThumb },
                renderArt(drawing, s.cardImg),
                react.createElement("span", { style: { ...s.cardScore, ...s.pill, ...s.pillScore } }, String(drawing.score))),
              react.createElement("span", { style: s.cardFoot },
                react.createElement("span", { style: s.cardModel }, drawing.model),
                react.createElement("span", { style: s.cardMeta }, `${fmtTime(drawing.time)} · ${fmtMs(drawing.ms)}`))
            ))
          )
        );
      };

      const renderPicker = () => {
        if (!pickerOpen) return null;
        const needle = query.trim().toLowerCase();
        const providers = catalog.providers
          .map((provider) => ({ ...provider, models: (provider.models || []).filter((model) => needle === "" || model.toLowerCase().includes(needle)) }))
          .filter((provider) => provider.models.length > 0 || needle === "");
        return react.createElement("div", null,
          react.createElement("div", { style: s.backdrop, onClick: () => setPickerOpen(false) }),
          react.createElement("div", { style: s.modal, role: "dialog", "aria-label": t("pickerTitle") },
            react.createElement("div", { style: s.modalHead },
              react.createElement("h2", { style: s.modalTitle }, t("pickerTitle")),
              react.createElement(Btn, { onClick: () => setPickerOpen(false), title: t("close") }, "✕")),
            react.createElement("div", { style: s.modalHint }, t("pickerHint")),
            react.createElement("div", { style: s.modalTools },
              react.createElement("input", { style: s.input, value: query, placeholder: t("search"), onChange: (event) => setQuery(event.target.value) }),
              react.createElement(Btn, { onClick: () => loadCatalog(true), disabled: catalog.status === "loading" }, t("refresh")),
              react.createElement(Btn, {
                onClick: () => {
                  const all = new Set();
                  for (const provider of catalog.providers) for (const model of provider.models || []) all.add(keyOf(provider.provider, model));
                  setDraft(all);
                },
              }, t("selectAll")),
              react.createElement(Btn, { onClick: () => setDraft(new Set()) }, t("clearAll"))
            ),
            react.createElement("div", { style: s.modalBody },
              catalog.status === "loading" && catalog.providers.length === 0
                ? react.createElement("div", { style: { padding: "12px", color: MUTE, fontSize: "12.5px" } }, "…")
                : providers.length === 0
                  ? react.createElement("div", { style: { padding: "12px", color: MUTE, fontSize: "12.5px" } }, t("noModels"))
                  : providers.map((provider) => react.createElement("div", { key: provider.provider },
                      react.createElement("div", { style: s.providerRow },
                        react.createElement("span", { style: s.providerName }, provider.provider),
                        react.createElement("span", { style: { ...s.pill, ...(provider.keyAvailable ? s.pillOk : s.pillWarn) } },
                          provider.keyAvailable ? t("keyOk") : t("keyMissing")),
                        react.createElement("span", { style: s.statusText }, t("worksCount").replace("{n}", String((provider.models || []).length)))),
                      (provider.models || []).length === 0
                        ? react.createElement("div", { style: { padding: "0 8px 6px", color: MUTE, fontSize: "12px" } }, t("noMatches"))
                        : (provider.models || []).map((model) => {
                            const key = keyOf(provider.provider, model);
                            return react.createElement("label", { key, style: s.modelRow, className: "pw-row-hover" },
                              react.createElement("input", { type: "checkbox", checked: draft.has(key), onChange: () => toggleDraft(key) }),
                              react.createElement("span", { style: s.modelName }, model));
                          })
                    ))
            ),
            react.createElement("div", { style: s.modalFoot },
              react.createElement("span", { style: s.statusText }, t("selectedNote").replace("{n}", String(draft.size))),
              react.createElement("span", { style: { display: "flex", gap: "8px" } },
                react.createElement(Btn, { onClick: () => setPickerOpen(false) }, t("close")),
                react.createElement(Btn, { primary: true, disabled: saving, onClick: saveTargets }, saving ? t("saving") : t("save"))))
          )
        );
      };

      const renderDrawer = () => {
        if (!selected) return null;
        const features = Array.isArray(selected.features) ? selected.features : [];
        return react.createElement("div", null,
          react.createElement("div", { style: s.backdrop, onClick: () => setSelected(null) }),
          react.createElement("aside", { style: s.drawer, role: "dialog", "aria-label": selected.id },
            react.createElement("div", { style: s.drawerHead },
              react.createElement("h2", { style: s.drawerTitle }, selected.id),
              react.createElement(Btn, { onClick: () => setSelected(null), title: t("close") }, "✕")),
            react.createElement("div", { style: s.drawerMeta },
              react.createElement("span", null, selected.model),
              react.createElement("span", null, fmtTime(selected.time)),
              react.createElement("span", null, `${t("tookMs")} ${fmtMs(selected.ms)}`),
              react.createElement("span", null, `${t("scoreLabel")} ${selected.score}`),
              features.length > 0 ? react.createElement("span", null, `${t("featuresLabel")} ${features.join(", ")}`) : null),
            react.createElement("div", { style: { padding: "0 16px 10px" } },
              react.createElement(Btn, { onClick: () => runOne(selected.model, selected.provider) }, t("runOne"))),
            react.createElement("div", { style: s.drawerBody },
              raw !== null
                ? react.createElement("iframe", { srcDoc: raw, sandbox: "", title: selected.id, style: s.frame })
                : react.createElement("div", { style: s.cardPlaceholder }, "…"))));
      };

      return react.createElement("div", { style: s.root },
        renderHeader(),
        react.createElement("div", { style: s.body },
          ready ? renderRail() : null,
          react.createElement("div", { style: s.work, ref: workRef, className: "pw-scroll" },
            state.status === "error"
              ? react.createElement("div", { style: s.empty },
                  react.createElement("div", { style: s.emptyGlyph }, "⚠️"),
                  react.createElement("div", { style: s.emptyTitle }, t("loadFailed")))
              : react.createElement("div", null, renderHero(), renderBoard(), renderGallery())
          )
        ),
        renderPicker(),
        renderDrawer(),
        toast ? react.createElement("div", { style: s.toast }, toast) : null
      );
    }

    function PelicanPanelIcon({ size }) {
      if (PanelIcon) return react.createElement(PanelIcon, { size });
      // Inline fallback glyph: a tiny bicycle (two wheels + frame).
      return react.createElement("svg", { viewBox: "0 0 20 20", width: size, height: size, "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.6 },
        react.createElement("circle", { cx: 5, cy: 14, r: 3.2 }),
        react.createElement("circle", { cx: 15, cy: 14, r: 3.2 }),
        react.createElement("path", { d: "M5 14l3.4-6h4.2l2.4 6M8.4 8L7 5.6h2.6M12.6 8l1-2.4h1.6", strokeLinecap: "round", strokeLinejoin: "round" }));
    }

    // Main-view panel content: same fixed-height column wrapper for BOTH slots
    // so the Settings section looks identical to the sidebar panel.
    function PanelPage(props) {
      return react.createElement("div", { style: { padding: "22px 26px 0", maxWidth: "1320px", margin: "0 auto", height: "100%", boxSizing: "border-box", overflow: "hidden" } },
        react.createElement(PelicanPanel, props));
    }

    // Rules that inline styles cannot express (hover, media queries, table
    // chrome). Kept in one injected sheet, removed with the plugin.
    const STYLE_ID = "pelican-watch-styles";
    const STYLESHEET = `
.pw-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;border-radius:8px;padding:6px 12px;white-space:nowrap}
.pw-btn:hover{background:var(--dsw-alias-bg-layer-3)}
.pw-btn[disabled]{opacity:.45;cursor:not-allowed}
.pw-btn-primary{border-color:transparent;background:var(--dsw-accent,#6366f1);color:#fff}
.pw-btn-primary:hover{filter:brightness(1.08)}
.pw-row-hover:hover{background:var(--dsw-alias-bg-layer-1)}
.pw-card{transition:border-color .12s ease,transform .12s ease,box-shadow .12s ease}
.pw-card:hover{border-color:var(--dsw-alias-border-l2);transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,.10)}
.pw-scroll{scrollbar-width:thin}
.pw-table{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.pw-table th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-align:right;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap}
.pw-table td{padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;white-space:nowrap}
.pw-table th:first-child,.pw-table th:nth-child(2),.pw-table td:first-child,.pw-table td:nth-child(2){text-align:left}
.pw-table tbody tr{cursor:pointer}
.pw-table tbody tr:hover{background:var(--dsw-alias-bg-layer-1)}
.pw-table tbody tr.pw-on{background:color-mix(in srgb,var(--dsw-accent,#6366f1) 10%,transparent)}
.pw-table tbody tr:last-child td{border-bottom:0}
@media (max-width:980px){.pw-narrow{display:none}}
@media (max-width:820px){.pw-narrow2{display:none}}
`;

    const NS = "pelicanWatch";
    const inject = ["slots", "locale"];
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "pelican-watch: dictionaries");
      const t = ctx.locale.bind(NS);

      ctx.effect(() => {
        const style = document.createElement("style");
        style.setAttribute("data-pelican-watch", "");
        style.id = STYLE_ID;
        style.textContent = STYLESHEET;
        document.head.appendChild(style);
        return () => style.remove();
      }, "pelican-watch: stylesheet");

      const disposers = [];
      disposers.push(ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          { name: "sidebar.panellist", id: "pelican", order: 21, label: () => t("nav"), locale: NS },
          PelicanPanelIcon
        )
      ));
      disposers.push(ctx.slots.inject("main", () =>
        ctx.slots.register(
          { name: "main", key: "pelican", locale: NS, inject: () => ({}) },
          (props) => react.createElement(PanelPage, props)
        )
      ));
      disposers.push(ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          { name: "settings.section", id: "pelican", order: 13, label: () => t("nav"), locale: NS, inject: () => ({}) },
          (props) => react.createElement(PanelPage, props)
        )
      ));

      ctx.effect(() => () => {
        for (const dispose of disposers) if (typeof dispose === "function") dispose();
      }, "pelican-watch: slots");
    }

    // The client entry contract requires BOTH exports: `apply` (the hook) and
    // `inject` (the services the runtime must wire into it). Returning a bare
    // `{ apply }` makes the entry fail to activate — which aborts the whole
    // web boot ("1 entry did not activate"). Same shape as skill-console and
    // session-delete.
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
