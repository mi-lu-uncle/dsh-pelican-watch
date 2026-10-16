// dsh-pelican-watch — client half.
//
// Registers the probe panel: an icon in the main sidebar (opens the panel in
// the main view) plus a matching Settings section.
//
// The layout is variant F from the UI prototypes (`prototype/panel-flat.html`,
// archived on branch `prototype/pelican-panel-ui`): **everything flat, zero
// clicks**. One band per probed model — its whole metric block on the left,
// every drawing it ever made laid out on the right — with the run state in the
// header. Nothing is collapsed, filtered or opened by clicking, so the main
// view holds no button and no handler at all.
//
// The things that are genuinely actions (choosing which models to probe,
// probing right now, opening one drawing's original page) live in the Settings
// section, which renders the same board with controls switched on. That split
// is the point: viewing never costs a click, controlling stays possible.
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
      subtitle: "每 {n} 分钟一轮 · 并行 {p} · 保留最新 {m} 张 · 已选 {c} 个模型",
      subtitleIdle: "定时让选中的模型画同一道「鹈鹕骑车」，用来看它们是否降智",
      modelsTitle: "每个模型的全部画作",
      modelsHint: "按最新得分排序 · 共 {n} 张 · 全部铺在这里，不需要点任何东西",
      bandRuns: "{n} 次检测",
      bandAvg: "均耗时 {t}",
      bandBestWorst: "最好 {a} · 最差 {b}",
      bandRefusals: "没出图 {n} 次",
      noneYet: "这个模型到现在一张都没画出来（{n} 次尝试）",
      scoreUnit: "分",
      statusOk: "正常",
      statusTimeout: "超时",
      statusNoDrawing: "没出图",
      statusStopped: "已停止",
      statusNever: "没跑过",
      running: "正在检测…",
      progress: "已完成 {done}/{total}",
      nowProbing: "正在检测",
      bootRound: "启动首轮检测",
      elapsed: "已等 {t}",
      capNote: "上限 {t}",
      nextRun: "下次 {time}",
      lastRun: "上一轮 {time}",
      emptyPick: "还没有选模型",
      empty: "还没有画",
      emptyHint: "调度器到点会自动画一轮，画完直接出现在这一页；要改模型或立刻测一遍，去「设置 → 鹈鹕监视」",
      loadFailed: "列表加载失败",
      errorLabel: "上次错误",
      badgeNoSvg: "未检出 SVG",
      placeholder: "没有可预览的 SVG",
      iqHint: "分数来自画面结构（SVG、车轮、辐条、车架、车把、车座、脚踏、鹈鹕与翅膀、页面完整性），满分 100",
      // 节奏控制（也只在「设置」那一侧出现）
      tempoTitle: "检测节奏",
      pauseAuto: "暂停自动检测",
      resumeAuto: "恢复自动检测",
      intervalLabel: "间隔",
      minutesUnit: "分钟",
      saveInterval: "保存间隔",
      stopRound: "停止本轮",
      stopping: "正在停止…",
      pausedShort: "自动检测已暂停",
      pausedWhere: "在「设置 → 鹈鹕监视」里恢复或改间隔",
      pausedNote: "自动检测已暂停 · 不会再消耗 token",
      autoEnabledNote: "自动检测开着，等待下一轮",
      autoPaused: "已暂停自动检测",
      autoResumed: "已恢复自动检测",
      intervalSaved: "间隔已改为 {n} 分钟",
      intervalInvalid: "间隔要填 1–1440 之间的整数分钟",
      scheduleFailed: "调度设置失败",
      stoppedToast: "已发送停止，正在跑的请求已中断",
      nothingRunning: "现在没有在跑的检测",
      // 只在「设置」那一侧出现（是动作，不是查看）
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
      runAll: "全部检测一遍",
      runOne: "只测这个",
      started: "已开始检测，画完会自动出现在这里",
      failed: "检测失败",
      viewBig: "看原始页面",
      featuresLabel: "命中的结构",
      sizeLabel: "大小",
      controlHint: "这个面板负责动作：选模型、立刻检测、看某一页的原始效果",
    };
    const en = {
      nav: "Pelican Watch",
      title: "Pelican Watch",
      subtitle: "every {n} min · {p} at a time · keeps {m} · {c} model(s) selected",
      subtitleIdle: "The same pelican-on-a-bicycle prompt on a schedule — a model-quality probe",
      modelsTitle: "Every drawing, per model",
      modelsHint: "sorted by newest score · {n} in total · all laid out, nothing to click",
      bandRuns: "{n} run(s)",
      bandAvg: "avg {t}",
      bandBestWorst: "best {a} · worst {b}",
      bandRefusals: "{n} without a drawing",
      noneYet: "This model has not produced a single drawing yet ({n} attempts)",
      scoreUnit: "pt",
      statusOk: "ok",
      statusTimeout: "timeout",
      statusNoDrawing: "no drawing",
      statusStopped: "stopped",
      statusNever: "not run",
      running: "Probing…",
      progress: "{done}/{total} done",
      nowProbing: "Probing",
      bootRound: "startup round",
      elapsed: "waited {t}",
      capNote: "cap {t}",
      nextRun: "next {time}",
      lastRun: "last {time}",
      emptyPick: "No models selected yet",
      empty: "Nothing drawn yet",
      emptyHint: "The scheduler draws a round on its own and it shows up here; to change models or probe now, open Settings → Pelican Watch",
      loadFailed: "Failed to load the list",
      errorLabel: "Last error",
      badgeNoSvg: "No SVG found",
      placeholder: "No SVG to preview",
      iqHint: "Scored from the drawing's structure (SVG, wheels, spokes, frame, handlebar, seat, pedals, pelican and wings, page completeness); 100 max",
      // pace controls (settings side only as well)
      tempoTitle: "Probing pace",
      pauseAuto: "Pause auto probing",
      resumeAuto: "Resume auto probing",
      intervalLabel: "every",
      minutesUnit: "min",
      saveInterval: "Save interval",
      stopRound: "Stop this pass",
      stopping: "Stopping…",
      pausedShort: "Auto probing paused",
      pausedWhere: "resume or change it in Settings → Pelican Watch",
      pausedNote: "auto probing is off — nothing else is spent",
      autoEnabledNote: "auto probing is on, waiting for the next pass",
      autoPaused: "Automatic probing paused",
      autoResumed: "Automatic probing resumed",
      intervalSaved: "Interval set to {n} min",
      intervalInvalid: "The interval must be a whole number of minutes between 1 and 1440",
      scheduleFailed: "Could not change the schedule",
      stoppedToast: "Stop sent — the requests in flight were cut off",
      nothingRunning: "Nothing is running right now",
      // settings side only (actions, not viewing)
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
      runAll: "Probe all now",
      runOne: "Probe this one",
      started: "Started — results appear here automatically",
      failed: "Probe failed",
      viewBig: "Open the page",
      featuresLabel: "Structure found",
      sizeLabel: "Size",
      controlHint: "This side holds the actions: pick models, probe now, open one page",
    };

    // ── styles ──────────────────────────────────────────────────────────
    const ACCENT = "var(--dsw-accent, #6366f1)";
    const HAIRLINE = "var(--dsw-alias-border-l1)";
    const s = {
      root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
      headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", padding: "0 0 12px" },
      headerLead: { flex: "1 1 0", minWidth: 0 },
      title: { margin: 0, fontSize: "17px", fontWeight: 700, lineHeight: "24px", letterSpacing: "-.01em" },
      subtitle: { margin: "3px 0 0", color: "var(--dsw-alias-label-tertiary)", fontSize: "12.5px", lineHeight: "19px" },
      headerActions: { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", flex: "0 0 auto" },
      statusText: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
      tempo: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 12px", margin: "0 0 12px", border: `1px solid ${HAIRLINE}`, borderRadius: "12px", background: "var(--dsw-alias-bg-layer-3)" },
      tempoLabel: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px" },
      numInput: { width: "68px", boxSizing: "border-box", font: "inherit", fontSize: "12.5px", padding: "5px 8px", borderRadius: "8px", border: `1px solid ${HAIRLINE}`, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", textAlign: "right" },
      progWrap: { minWidth: "210px" },
      progTrack: { height: "3px", background: "var(--dsw-alias-bg-layer-3)", overflow: "hidden", borderRadius: "999px" },
      progFill: { height: "100%", background: ACCENT, transition: "width .4s ease" },
      body: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "2px 2px 24px", boxSizing: "border-box" },
      boardHead: { display: "flex", alignItems: "baseline", gap: "10px", margin: "0 0 10px", flexWrap: "wrap" },
      boardTitle: { margin: 0, fontSize: "13px", fontWeight: 700, lineHeight: "20px" },
      boardHint: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", lineHeight: "18px" },
      band: { display: "grid", gridTemplateColumns: "250px minmax(0, 1fr)", gap: "18px", padding: "16px", border: `1px solid ${HAIRLINE}`, borderRadius: "14px", background: "var(--dsw-alias-bg-layer-3)", marginBottom: "14px" },
      bandLead: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 },
      bandTop: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
      bandName: { margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px", fontWeight: 600, lineHeight: "19px", wordBreak: "break-all" },
      bigScore: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "34px", fontWeight: 700, lineHeight: 1, letterSpacing: "-.02em" },
      bigScoreUnit: { fontSize: "11.5px", fontWeight: 600, color: "var(--dsw-alias-label-tertiary)", marginLeft: "3px" },
      bandStats: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", lineHeight: "18px", fontVariantNumeric: "tabular-nums" },
      bandArts: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "12px", alignItems: "start", minWidth: 0 },
      tile: { display: "block", minWidth: 0, padding: 0, border: 0, background: "transparent", color: "inherit", font: "inherit", textAlign: "left" },
      tileArt: { position: "relative", background: "var(--dsw-alias-bg-layer-1)", border: `1px solid ${HAIRLINE}`, borderRadius: "10px", overflow: "hidden", aspectRatio: "4 / 3" },
      tileImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
      tileScore: { position: "absolute", top: "6px", right: "6px" },
      tilePlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", textAlign: "center", padding: "10px", boxSizing: "border-box" },
      tileCap: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", padding: "5px 2px 0", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", fontVariantNumeric: "tabular-nums" },
      tileTime: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--dsw-alias-label-secondary)" },
      missBox: { aspectRatio: "4 / 3", border: "1px dashed var(--dsw-alias-border-l2)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", textAlign: "center", padding: "12px", boxSizing: "border-box", lineHeight: "1.5" },
      dot: { width: "8px", height: "8px", borderRadius: "999px", flex: "0 0 auto", background: "var(--dsw-alias-label-tertiary)" },
      pill: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, lineHeight: "18px", padding: "1px 8px", borderRadius: "999px", whiteSpace: "nowrap" },
      pillOk: { background: "color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 14%, transparent)", color: "var(--dsw-alias-state-success-primary, #16a34a)" },
      pillWarn: { background: "color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97706) 14%, transparent)", color: "var(--dsw-alias-state-warning-primary, #d97706)" },
      pillErr: { background: "color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 14%, transparent)", color: "var(--dsw-alias-state-error-primary, #dc2626)" },
      pillMute: { background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-tertiary)" },
      trend: { fontSize: "11.5px", fontWeight: 600 },
      errLine: { color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: "11.5px", lineHeight: "1.45", wordBreak: "break-word" },
      empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", padding: "56px 24px", gap: "6px" },
      emptyGlyph: { fontSize: "34px", lineHeight: 1, marginBottom: "6px" },
      emptyTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: "14px", fontWeight: 600 },
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
    /** m:ss — language-neutral, for the "waited so far / cap" readouts. */
    function fmtClock(ms) {
      const total = Math.max(0, Math.round((ms || 0) / 1000));
      return `${Math.floor(total / 60)}:${p2(total % 60)}`;
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

    /** Score history sparkline (oldest → newest). */
    function Sparkline({ values, color, width = 200, height = 30 }) {
      const list = Array.isArray(values) ? values : [];
      if (list.length < 2) return react.createElement("span", { style: { color: MUTE, fontSize: "11px" } }, "—");
      const min = Math.min(...list);
      const max = Math.max(...list);
      const span = Math.max(1, max - min);
      const points = list
        .map((v, i) => `${(1 + (i / (list.length - 1)) * (width - 2)).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
        .join(" ");
      return react.createElement("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": true, style: { display: "block", maxWidth: "100%" } },
        react.createElement("polyline", { points, fill: "none", stroke: color, strokeWidth: 1.7, strokeLinejoin: "round", strokeLinecap: "round" }));
    }

    /** Score badge style for a tile (colour follows the score band). */
    const scoreStyle = (score) => (score == null ? s.pillMute : score >= 90 ? s.pillOk : score >= 70 ? s.pillWarn : s.pillErr);

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
    // `control` false (the main view) renders the read-only board: no button,
    // no click handler, nothing hidden. True (the Settings section) adds the
    // picker, the manual probe and the full-page viewer.
    function PelicanPanel({ t, control }) {
      const [state, setState] = react.useState({ status: "loading" });
      const [selected, setSelected] = react.useState(null);
      const [raw, setRaw] = react.useState(null);
      const [busy, setBusy] = react.useState(false);
      const [toast, setToast] = react.useState(null);
      const [failedPreviews, setFailedPreviews] = react.useState(() => new Set());
      const [pickerOpen, setPickerOpen] = react.useState(false);
      const [query, setQuery] = react.useState("");
      const [draft, setDraft] = react.useState(() => new Set());
      const [catalog, setCatalog] = react.useState({ status: "idle", providers: [] });
      const [saving, setSaving] = react.useState(false);
      const [clock, setClock] = react.useState(0);
      // null = show the interval the host reports; a string = the user is typing.
      const [editing, setEditing] = react.useState(null);
      const [scheduleBusy, setScheduleBusy] = react.useState(false);
      const bodyRef = react.useRef(null);

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

      // Tick every second while a pass runs so "waited 2:25" counts up: a slow
      // model and a stuck one must be distinguishable at a glance.
      react.useEffect(() => {
        if (!state.running) return;
        setClock(Date.now());
        const id = setInterval(() => setClock(Date.now()), 1000);
        return () => clearInterval(id);
      }, [state.running]);

      // Load the generated page when the viewer target changes (control side).
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
        const el = bodyRef.current;
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
      }, [state]);

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

      // ── pace: pause, retune, stop ─────────────────────────────────────
      // Probing costs tokens, so the two things that save them are one click
      // away on this side: disarm the schedule, or cut off the pass in flight.
      const changeSchedule = async (patch, done) => {
        setScheduleBusy(true);
        try {
          const payload = await api("/api/pelican-watch/schedule", patch);
          if (payload && payload.ok === true) {
            setEditing(null);
            setToast(done);
            load();
          } else {
            setToast(`${t("scheduleFailed")}${payload && payload.error ? `：${payload.error}` : ""}`);
          }
        } catch (error) {
          setToast(`${t("scheduleFailed")}：${error.message}`);
        } finally {
          setScheduleBusy(false);
        }
      };
      const autoOn = state.status === "ready" && state.autoEnabled !== false;
      const toggleAuto = () => changeSchedule({ autoEnabled: !autoOn }, autoOn ? t("autoPaused") : t("autoResumed"));
      const saveInterval = () => {
        const minutes = Number(editing);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { setToast(t("intervalInvalid")); return; }
        changeSchedule({ intervalMinutes: minutes }, t("intervalSaved").replace("{n}", String(minutes)));
      };
      const stopNow = async () => {
        setScheduleBusy(true);
        try {
          const payload = await api("/api/pelican-watch/stop", {});
          setToast(payload && payload.stopped === true ? t("stoppedToast") : t("nothingRunning"));
          setTimeout(load, 800);
        } catch (error) {
          setToast(`${t("scheduleFailed")}：${error.message}`);
        } finally {
          setScheduleBusy(false);
        }
      };

      const ready = state.status === "ready";
      const images = ready && Array.isArray(state.images) ? state.images : [];
      const targets = ready && Array.isArray(state.targets) ? state.targets : [];
      const summary = ready && Array.isArray(state.summary) ? state.summary : [];
      const errors = ready && state.errors && typeof state.errors === "object" ? state.errors : {};
      const stoppedModels = ready && Array.isArray(state.stopped) ? state.stopped : [];
      const inflight = ready && Array.isArray(state.inflight) ? state.inflight : [];
      const errorFor = (model) => (typeof errors[model] === "string" && errors[model] !== "" ? errors[model] : null);

      // How long each in-flight model has been waiting, and the cap it will be
      // cut off at.
      const nowMs = clock || Date.now();
      const waitedFor = (model) => {
        const since = ready && state.inflightSince && typeof state.inflightSince[model] === "number" ? state.inflightSince[model] : null;
        return since === null ? 0 : Math.max(0, nowMs - since);
      };
      const slowestWait = inflight.reduce((max, model) => Math.max(max, waitedFor(model)), 0);
      const capMs = (ready && Number(state.timeoutSeconds) > 0 ? Number(state.timeoutSeconds) : 300) * 1000;

      // One band per probed model — every drawing it made, nothing hidden — plus
      // a band for any model that still has drawings but is no longer selected.
      const emptyRow = (model, provider) => ({ model, provider, count: 0, latest: null, avg: null, best: null, worst: null, trend: 0, avgMs: null, refusals: 0, lastTime: null, scores: [] });
      const bands = targets
        .map((target) => ({ row: summary.find((r) => r.model === target.model) || emptyRow(target.model, target.provider) }))
        .concat(summary
          .filter((row) => !targets.some((target) => target.model === row.model))
          .map((row) => ({ row })))
        .map((entry) => ({ ...entry, drawings: images.filter((img) => img.model === entry.row.model) }));
      bands.sort((a, b) => (b.row.latest ?? -1) - (a.row.latest ?? -1) || b.row.count - a.row.count || a.row.model.localeCompare(b.row.model));

      // A model that has run but never produced a drawing must not read as
      // "ok" just because the current error map is empty (it is empty until
      // the next failure, e.g. right after a restart). A model the user cut off
      // is neither a timeout nor a failure of the model.
      const statusOf = (row) => {
        if (stoppedModels.includes(row.model)) return { text: t("statusStopped"), style: s.pillMute };
        if (errorFor(row.model)) return { text: t("statusTimeout"), style: s.pillErr };
        if (row.count > 0 && row.latest === null) return { text: t("statusNoDrawing"), style: s.pillWarn };
        if (row.count === 0) return { text: t("statusNever"), style: s.pillMute };
        return { text: t("statusOk"), style: s.pillOk };
      };
      const dotColor = (row) => (state.running && inflight.includes(row.model) ? ACCENT
        : stoppedModels.includes(row.model) ? MUTE
          : errorFor(row.model) ? ERR
            : row.count > 0 && row.latest === null ? WARN
              : row.count > 0 ? OK : MUTE);

      // One drawing. A `div` in the read-only board; a `button` (opening the
      // sandboxed page) only on the control side — that is the whole click
      // budget of this panel.
      const renderTile = (drawing) => {
        const art = drawing.hasSvg && !failedPreviews.has(drawing.id)
          ? react.createElement("img", {
              src: `/api/pelican-watch/image?id=${encodeURIComponent(drawing.id)}`,
              alt: "", loading: "lazy", style: s.tileImg,
              onError: () => markPreviewFailed(drawing.id),
            })
          : react.createElement("div", { style: s.tilePlaceholder }, drawing.hasSvg ? t("placeholder") : t("badgeNoSvg"));
        const inner = [
          react.createElement("div", { key: "art", style: s.tileArt },
            art,
            react.createElement("span", { style: { ...s.tileScore, ...s.pill, ...scoreStyle(drawing.score) } }, String(drawing.score))),
          react.createElement("div", { key: "cap", style: s.tileCap },
            react.createElement("span", { style: s.tileTime }, fmtTime(drawing.time)),
            react.createElement("span", null, `${drawing.score} ${t("scoreUnit")} · ${fmtMs(drawing.ms)}`)),
        ];
        if (!control) return react.createElement("div", { key: drawing.id, style: s.tile }, inner);
        return react.createElement("button", {
          key: drawing.id, type: "button", style: { ...s.tile, cursor: "pointer" },
          className: "pw-tile-click", title: t("viewBig"), onClick: () => setSelected(drawing),
        }, inner);
      };

      const renderHeader = () => react.createElement("header", null,
        react.createElement("div", { style: s.headerRow },
          react.createElement("div", { style: s.headerLead },
            react.createElement("h1", { style: s.title }, t("title")),
            react.createElement("p", { style: s.subtitle }, ready
              ? [
                  t("subtitle").replace("{n}", String(state.intervalMinutes || 30)).replace("{p}", String(state.concurrency || 3)).replace("{m}", String(state.maxImages || 12)).replace("{c}", String(targets.length)),
                  state.lastRunAt ? t("lastRun").replace("{time}", fmtTime(state.lastRunAt)) : null,
                ].filter(Boolean).join(" · ")
              : t("subtitleIdle"))
          ),
          react.createElement("div", { style: s.headerActions },
            ready && state.running
              ? react.createElement("div", { style: s.progWrap },
                  react.createElement("div", { style: s.progTrack },
                    react.createElement("div", { style: { ...s.progFill, width: `${state.total ? ((state.done || 0) / state.total) * 100 : 0}%` } })),
                  react.createElement("div", { style: { ...s.statusText, marginTop: "6px" } },
                    (state.lastRunAt === null ? `${t("bootRound")} · ` : "") +
                    t("progress").replace("{done}", String(state.done || 0)).replace("{total}", String(state.total || 0)) +
                    (inflight.length > 0 && state.stopping !== true ? ` · ${t("nowProbing")} ${inflight.join("、")}` : "") +
                    (state.stopping === true ? ` · ${t("stopping")}` : "") +
                    ` · ${t("elapsed").replace("{t}", fmtClock(slowestWait))} · ${t("capNote").replace("{t}", fmtClock(capMs))}`))
              : null,
            // Idle: either the next pass is scheduled, or the schedule is off —
            // say so on the read-only board too, so a paused plugin never looks
            // like a broken one.
            ready && !state.running
              ? (state.autoEnabled === false
                  ? react.createElement("span", { style: s.statusText }, `⏸ ${t("pausedShort")} · ${t("pausedWhere")}`)
                  : (state.nextRunAt ? react.createElement("span", { style: s.statusText }, t("nextRun").replace("{time}", fmtTime(state.nextRunAt))) : null))
              : null,
            control
              ? react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  react.createElement(Btn, { onClick: openPicker }, t("pickerOpen")),
                  react.createElement(Btn, { primary: true, disabled: !ready || busy || state.running, onClick: runAll },
                    state.running ? t("running") : t("runAll")))
              : null
          )
        )
      );

      // The pace strip (settings side only): pause the schedule, retune the
      // interval, or cut off the pass that is running right now.
      const renderTempo = () => {
        if (!control || !ready) return null;
        const minutes = editing !== null ? editing : String(state.intervalMinutes || 30);
        const paused = state.autoEnabled === false;
        return react.createElement("div", { style: s.tempo },
          react.createElement("span", { style: { ...s.tempoLabel, fontWeight: 600 } }, t("tempoTitle")),
          react.createElement(Btn, { onClick: toggleAuto, disabled: scheduleBusy, title: t("pausedNote") },
            paused ? t("resumeAuto") : t("pauseAuto")),
          react.createElement("span", { style: s.tempoLabel }, t("intervalLabel")),
          react.createElement("input", {
            style: s.numInput, type: "number", min: 1, max: 1440, value: minutes,
            "aria-label": t("intervalLabel"),
            onChange: (event) => setEditing(event.target.value),
            onKeyDown: (event) => { if (event.key === "Enter") saveInterval(); },
          }),
          react.createElement("span", { style: s.tempoLabel }, t("minutesUnit")),
          react.createElement(Btn, {
            primary: true, disabled: scheduleBusy || editing === null || editing === "", onClick: saveInterval,
          }, t("saveInterval")),
          react.createElement(Btn, { onClick: stopNow, disabled: scheduleBusy || state.running !== true }, t("stopRound")),
          react.createElement("span", { style: s.statusText },
            paused ? t("pausedNote") : (state.nextRunAt ? t("nextRun").replace("{time}", fmtTime(state.nextRunAt)) : t("autoEnabledNote"))));
      };

      const renderBand = (entry) => {
        const { row, drawings } = entry;
        const status = statusOf(row);
        const failed = errorFor(row.model);
        const lead = react.createElement("div", { style: s.bandLead },
          react.createElement("div", { style: s.bandTop },
            react.createElement("span", { style: { ...s.dot, background: dotColor(row) } }),
            react.createElement("span", { style: { ...s.pill, ...status.style } }, status.text),
            control ? react.createElement(Btn, { onClick: () => runOne(row.model, row.provider), title: t("runOne") }, "▷") : null),
          react.createElement("h3", { style: s.bandName, title: row.model }, row.model),
          react.createElement("div", null,
            react.createElement("span", { style: { ...s.bigScore, color: scoreColor(row.latest) } }, row.count > 0 ? String(row.latest) : "—"),
            row.count > 0 ? react.createElement("span", { style: s.bigScoreUnit }, "/100") : null,
            row.count > 1
              ? react.createElement("span", { style: { ...s.trend, color: trendColor(row.trend), marginLeft: "10px" } }, trendText(row.trend))
              : null),
          react.createElement(Sparkline, { values: row.scores, color: scoreColor(row.latest) }),
          react.createElement("div", { style: s.bandStats },
            `${t("bandRuns").replace("{n}", String(row.count))}`,
            row.avgMs !== null ? ` · ${t("bandAvg").replace("{t}", fmtMs(row.avgMs))}` : "",
            react.createElement("br"),
            `${t("bandBestWorst").replace("{a}", row.best === null ? "—" : String(row.best)).replace("{b}", row.worst === null ? "—" : String(row.worst))}`,
            ` · ${t("bandRefusals").replace("{n}", String(row.refusals))}`),
          failed ? react.createElement("div", { style: s.errLine, title: t("errorLabel") }, failed) : null
        );
        const arts = drawings.length === 0
          ? react.createElement("div", { style: s.missBox },
              `${t("noneYet").replace("{n}", String(row.refusals))}${failed ? ` — ${failed}` : ""}`)
          : drawings.map((drawing) => renderTile(drawing));
        return react.createElement("section", { key: keyOf(row.provider, row.model), className: "pw-band", style: s.band },
          lead,
          react.createElement("div", { style: s.bandArts }, arts));
      };

      const renderEmpty = (title) => react.createElement("div", { style: s.empty },
        react.createElement("div", { style: s.emptyGlyph }, "🦩"),
        react.createElement("div", { style: s.emptyTitle }, title),
        react.createElement("div", null, t("emptyHint")),
        state.lastError ? react.createElement("div", { style: s.errLine }, `${t("errorLabel")}：${state.lastError}`) : null);

      const renderBoard = () => {
        if (bands.length === 0) return renderEmpty(t("emptyPick"));
        // With nothing drawn yet the hint goes *above* the bands rather than
        // instead of them: the per-model status and the failure reason are
        // exactly what one wants to see on a fresh install.
        return react.createElement("div", null,
          images.length === 0 ? renderEmpty(t("empty")) : null,
          react.createElement("div", { style: s.boardHead },
            react.createElement("h2", { style: s.boardTitle }, t("modelsTitle")),
            react.createElement("span", { style: s.boardHint, title: t("iqHint") },
              t("modelsHint").replace("{n}", String(images.length)))),
          bands.map(renderBand));
      };

      const renderPicker = () => {
        if (!control || !pickerOpen) return null;
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
                        react.createElement("span", { style: { ...s.pill, ...(provider.keyAvailable ? s.pillOk : s.pillMute) } },
                          provider.keyAvailable ? t("keyOk") : t("keyMissing")),
                        react.createElement("span", { style: s.statusText }, t("selectedNote").replace("{n}", String((provider.models || []).length)))),
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
              react.createElement("span", { style: s.statusText }, t("controlHint")),
              react.createElement("span", { style: { display: "flex", gap: "8px" } },
                react.createElement(Btn, { onClick: () => setPickerOpen(false) }, t("close")),
                react.createElement(Btn, { primary: true, disabled: saving, onClick: saveTargets }, saving ? t("saving") : t("save"))))
          )
        );
      };

      const renderViewer = () => {
        if (!control || !selected) return null;
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
              react.createElement("span", null, fmtMs(selected.ms)),
              react.createElement("span", null, `${selected.score} ${t("scoreUnit")}`),
              typeof selected.bytes === "number" ? react.createElement("span", null, `${t("sizeLabel")} ${(selected.bytes / 1024).toFixed(1)} KB`) : null,
              features.length > 0 ? react.createElement("span", null, `${t("featuresLabel")} ${features.join(", ")}`) : null),
            react.createElement("div", { style: { padding: "0 16px 10px" } },
              react.createElement(Btn, { onClick: () => runOne(selected.model, selected.provider) }, t("runOne"))),
            react.createElement("div", { style: s.drawerBody },
              raw !== null
                ? react.createElement("iframe", { srcDoc: raw, sandbox: "", title: selected.id, style: s.frame })
                : react.createElement("div", { style: s.tilePlaceholder }, "…"))));
      };

      return react.createElement("div", { style: s.root },
        renderHeader(),
        renderTempo(),
        react.createElement("div", { style: s.body, ref: bodyRef, className: "pw-scroll" },
          state.status === "error"
            ? react.createElement("div", { style: s.empty },
                react.createElement("div", { style: s.emptyGlyph }, "⚠️"),
                react.createElement("div", { style: s.emptyTitle }, t("loadFailed")))
            : renderBoard()),
        renderPicker(),
        renderViewer(),
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

    // Same fixed-height column wrapper for BOTH slots so the Settings section
    // looks identical to the sidebar panel.
    function PanelPage(props) {
      return react.createElement("div", { style: { padding: "22px 26px 0", maxWidth: "1320px", margin: "0 auto", height: "100%", boxSizing: "border-box", overflow: "hidden" } },
        react.createElement(PelicanPanel, props));
    }

    // Rules that inline styles cannot express (hover, media queries). Kept in
    // one injected sheet, removed with the plugin.
    const STYLE_ID = "pelican-watch-styles";
    const STYLESHEET = `
.pw-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;border-radius:8px;padding:6px 12px;white-space:nowrap}
.pw-btn:hover{background:var(--dsw-alias-bg-layer-3)}
.pw-btn[disabled]{opacity:.45;cursor:not-allowed}
.pw-btn-primary{border-color:transparent;background:var(--dsw-accent,#6366f1);color:#fff}
.pw-btn-primary:hover{filter:brightness(1.08)}
.pw-row-hover:hover{background:var(--dsw-alias-bg-layer-1)}
.pw-tile-click{transition:transform .12s ease}
.pw-tile-click:hover{transform:translateY(-1px)}
.pw-tile-click:hover > div:first-child{border-color:var(--dsw-alias-border-l2);box-shadow:0 8px 22px rgba(0,0,0,.12)}
.pw-scroll{scrollbar-width:thin}
@media (max-width:900px){.pw-band{grid-template-columns:minmax(0,1fr)}}
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
      // Main view: the read-only board — zero clicks.
      disposers.push(ctx.slots.inject("main", () =>
        ctx.slots.register(
          { name: "main", key: "pelican", locale: NS, inject: () => ({}) },
          (props) => react.createElement(PanelPage, { ...props, control: false })
        )
      ));
      // Settings section: the same board plus the actions (picker, probe, viewer).
      disposers.push(ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          { name: "settings.section", id: "pelican", order: 13, label: () => t("nav"), locale: NS, inject: () => ({}) },
          (props) => react.createElement(PanelPage, { ...props, control: true })
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
