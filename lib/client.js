// dsh-pelican-watch — client half.
//
// Registers the probe panel: an icon in the main sidebar (opens the panel in
// the main view) plus a matching Settings section.
//
// The layout is variant F from the UI prototypes (`prototype/panel-flat.html`,
// archived on branch `prototype/pelican-panel-ui`): **everything flat**. One
// band per probed model — its status and figures on the left, every drawing it
// ever made on the right — with the run state in the header. Nothing is
// collapsed or filtered, so the board itself is pure content that needs no
// interaction at all.
//
// The handful of real actions sit behind one gear button in the panel's own
// header — pick models, pause or retune the schedule, stop the pass in flight,
// probe now. There is no DSH Settings section: everything lives in the panel,
// one click from the board it belongs to.
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
      subtitle: "每 {n} 分钟一轮 · 并行 {p} · 每个模型保留最新 {m} 张 · 已选 {c} 个模型",
      subtitleIdle: "定时让选中的模型画同一道「鹈鹕骑车」，用来看它们是否降智",
      modelsTitle: "每个模型的全部画作",
      modelsHint: "按最近一次检测排序 · 共 {n} 张 · 全部铺在这里，不需要点任何东西",
      bandRuns: "{n} 次检测",
      bandAvg: "均耗时 {t}",
      bandLatest: "最新 {time}",
      bandRefusals: "没出图 {n} 次",
      neverRan: "还没有跑过",
      noneYet: "这个模型到现在一张都没画出来（{n} 次尝试）",
      statusTimeout: "超时",
      statusNoDrawing: "没出图",
      statusStopped: "已停止",
      statusNever: "没跑过",
      running: "正在检测…",
      alreadyRunning: "上一轮还在跑，完成后再点一次",
      progress: "已完成 {done}/{total}",
      nowProbing: "正在检测",
      bootRound: "启动首轮检测",
      elapsed: "已等 {t}",
      capNote: "上限 {t}",
      nextRun: "下次 {time}",
      lastRun: "上一轮 {time}",
      emptyPick: "还没有选模型",
      empty: "还没有画",
      emptyHint: "调度器到点会自动画一轮，画完直接出现在这一页；要改检测的模型或立刻测一遍，点右上角「设置」",
      loadFailed: "列表加载失败",
      errorLabel: "上次错误",
      badgeNoSvg: "未检出 SVG",
      placeholder: "没有可预览的 SVG",
      // 设置弹窗（面板右上角「设置」按钮打开）
      settingsBtn: "设置",
      settingsTitle: "设置",
      sectionPace: "检测节奏",
      sectionModels: "检测的模型",
      pauseAuto: "暂停自动检测",
      resumeAuto: "恢复自动检测",
      intervalLabel: "间隔",
      minutesUnit: "分钟",
      saveInterval: "保存间隔",
      stopRound: "停止本轮",
      stopping: "正在停止…",
      pausedShort: "自动检测已暂停",
      pausedWhere: "点右上角「设置」恢复",
      pausedNote: "自动检测已暂停 · 不会再消耗 token",
      autoEnabledNote: "自动检测开着，等待下一轮",
      autoPaused: "已暂停自动检测",
      autoResumed: "已恢复自动检测",
      intervalSaved: "间隔已改为 {n} 分钟",
      intervalInvalid: "间隔要填 1–1440 之间的整数分钟",
      scheduleFailed: "调度设置失败",
      stoppedToast: "已发送停止，正在跑的请求已中断",
      nothingRunning: "现在没有在跑的检测",
      // 设置弹窗（模型列表那一节）
      pickerHint: "勾选后点「保存模型」；从下一个周期起，每个选中的模型各画一张",
      search: "搜索模型…",
      refresh: "刷新列表",
      close: "关闭",
      selectAll: "全选",
      clearAll: "清空",
      save: "保存模型",
      saving: "保存中…",
      saved: "已保存，下个周期生效",
      saveFailed: "保存失败",
      noMatches: "没有匹配的模型",
      noModels: "没有发现模型，点「刷新列表」试试",
      providerUnavailable: "这个提供方暂时不可用",
      selectedNote: "已选 {n} / {total}",
      tooManyTargets: "最多同时检测 {n} 个模型",
      statusFailed: "失败",
      runAll: "全部检测一遍",
      runOne: "单独检测",
      runOneHint: "立刻给这个模型画一张，只发一个请求",
      started: "已开始检测，画完会自动出现在这里",
      failed: "检测失败",
      viewBig: "看大图",
      controlHint: "节奏改动立即生效；模型选择点「保存模型」后，从下一个周期开始生效",
    };
    const en = {
      nav: "Pelican Watch",
      title: "Pelican Watch",
      subtitle: "every {n} min · {p} at a time · newest {m} per model · {c} model(s) selected",
      subtitleIdle: "The same pelican-on-a-bicycle prompt on a schedule — a model-quality probe",
      modelsTitle: "Every drawing, per model",
      modelsHint: "sorted by newest activity · {n} in total · all laid out, nothing to click",
      bandRuns: "{n} run(s)",
      bandAvg: "avg {t}",
      bandLatest: "newest {time}",
      bandRefusals: "{n} without a drawing",
      neverRan: "Not probed yet",
      noneYet: "This model has not produced a single drawing yet ({n} attempts)",
      statusTimeout: "timeout",
      statusNoDrawing: "no drawing",
      statusStopped: "stopped",
      statusNever: "not run",
      running: "Probing…",
      alreadyRunning: "A pass is still running — try again when it finishes",
      progress: "{done}/{total} done",
      nowProbing: "Probing",
      bootRound: "startup round",
      elapsed: "waited {t}",
      capNote: "cap {t}",
      nextRun: "next {time}",
      lastRun: "last {time}",
      emptyPick: "No models selected yet",
      empty: "Nothing drawn yet",
      emptyHint: "The scheduler draws a round on its own and it shows up here; to change models or probe now, hit the gear in the top-right corner",
      loadFailed: "Failed to load the list",
      errorLabel: "Last error",
      badgeNoSvg: "No SVG found",
      placeholder: "No SVG to preview",
      // pace controls (settings side only as well)
      // settings modal, opened by the gear in the panel's own header
      settingsBtn: "Settings",
      settingsTitle: "Settings",
      sectionPace: "Probing pace",
      sectionModels: "Models to probe",
      pauseAuto: "Pause auto probing",
      resumeAuto: "Resume auto probing",
      intervalLabel: "every",
      minutesUnit: "min",
      saveInterval: "Save interval",
      stopRound: "Stop this pass",
      stopping: "Stopping…",
      pausedShort: "Auto probing paused",
      pausedWhere: "resume from the gear in the top-right corner",
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
      // settings modal — the model list
      pickerHint: "Tick the models and hit Save; from the next cycle on, each one draws a picture",
      search: "Search models…",
      refresh: "Refresh list",
      close: "Close",
      selectAll: "Select all",
      clearAll: "Clear",
      save: "Save models",
      saving: "Saving…",
      saved: "Saved — takes effect next cycle",
      saveFailed: "Save failed",
      noMatches: "No matching model",
      noModels: "No models discovered — try “Refresh list”",
      providerUnavailable: "This provider is unavailable",
      selectedNote: "{n} / {total} selected",
      tooManyTargets: "At most {n} models can be probed at once",
      statusFailed: "failed",
      runAll: "Probe all now",
      runOne: "Probe once",
      runOneHint: "Draw one picture for this model now — one request only",
      started: "Started — results appear here automatically",
      failed: "Probe failed",
      viewBig: "View bigger",
      controlHint: "Pace changes apply at once; a model selection applies to the next cycle after you save it",
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
      bandName: { margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13.5px", fontWeight: 600, lineHeight: "20px", wordBreak: "break-all" },
      bandProvider: { fontFamily: "inherit", fontSize: "10.5px", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-layer-3)", borderRadius: "5px", padding: "1.5px 6px", whiteSpace: "nowrap" },
      bandLatest: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "15px", fontWeight: 700, lineHeight: "20px", letterSpacing: "-.01em" },
      bandStats: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", lineHeight: "18px", fontVariantNumeric: "tabular-nums" },
      bandArts: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "12px", alignItems: "start", minWidth: 0 },
      tile: { display: "block", minWidth: 0, padding: 0, border: 0, background: "transparent", color: "inherit", font: "inherit", textAlign: "left" },
      tileArt: { position: "relative", background: "var(--dsw-alias-bg-layer-1)", border: `1px solid ${HAIRLINE}`, borderRadius: "10px", overflow: "hidden", aspectRatio: "4 / 3" },
      tileImg: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
      tilePlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", textAlign: "center", padding: "10px", boxSizing: "border-box" },
      tileCap: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", padding: "5px 2px 0", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", fontVariantNumeric: "tabular-nums" },
      tileTime: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--dsw-alias-label-secondary)" },
      missBox: { aspectRatio: "4 / 3", border: "1px dashed var(--dsw-alias-border-l2)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", textAlign: "center", padding: "12px", boxSizing: "border-box", lineHeight: "1.5" },
      dot: { width: "8px", height: "8px", borderRadius: "999px", flex: "0 0 auto", background: "var(--dsw-alias-label-tertiary)" },
      pill: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, lineHeight: "18px", padding: "1px 8px", borderRadius: "999px", whiteSpace: "nowrap" },
      pillWarn: { background: "color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97706) 14%, transparent)", color: "var(--dsw-alias-state-warning-primary, #d97706)" },
      pillErr: { background: "color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 14%, transparent)", color: "var(--dsw-alias-state-error-primary, #dc2626)" },
      pillMute: { background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-tertiary)" },
      errLine: { color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: "11.5px", lineHeight: "1.45", wordBreak: "break-word" },
      empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", padding: "56px 24px", gap: "6px" },
      emptyGlyph: { fontSize: "34px", lineHeight: 1, marginBottom: "6px" },
      emptyTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: "14px", fontWeight: 600 },
      backdrop: { position: "fixed", inset: 0, background: "rgba(6,8,12,.55)", zIndex: 400 },
      drawer: { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(760px, 94vw)", background: "var(--dsw-alias-bg-layer-1)", borderLeft: `1px solid ${HAIRLINE}`, zIndex: 401, display: "flex", flexDirection: "column", boxShadow: "-14px 0 36px rgba(0,0,0,.22)" },
      drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "13px 16px", borderBottom: `1px solid ${HAIRLINE}` },
      drawerTitle: { margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", fontWeight: 600, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      drawerBody: { flex: "1 1 auto", minHeight: 0, padding: "0 16px 16px", boxSizing: "border-box" },
      bigArt: { width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#fff", borderRadius: "10px", border: `1px solid ${HAIRLINE}`, boxSizing: "border-box" },
      modal: { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(620px, 94vw)", maxHeight: "84vh", background: "var(--dsw-alias-bg-layer-1)", border: `1px solid ${HAIRLINE}`, borderRadius: "14px", zIndex: 401, display: "flex", flexDirection: "column", boxShadow: "0 22px 52px rgba(0,0,0,.3)" },
      modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px 10px" },
      modalTitle: { margin: 0, fontSize: "14px", fontWeight: 700, lineHeight: "20px" },
      // hint/tools now live inside modalBody, which already carries the 16px
      // side padding.
      modalHint: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", margin: "0 0 10px" },
      modalTools: { display: "flex", alignItems: "center", gap: "8px", margin: "0 0 8px", flexWrap: "wrap" },
      sectionTitle: { margin: "2px 0 8px", fontSize: "12.5px", fontWeight: 700, letterSpacing: ".01em" },
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
    // One panel, one place for everything: the board below is pure content,
    // and the handful of real actions live behind the gear in its header.
    function PelicanPanel({ t }) {
      const [state, setState] = react.useState({ status: "loading" });
      const [selected, setSelected] = react.useState(null);
      const [busy, setBusy] = react.useState(false);
      const [toast, setToast] = react.useState(null);
      const [failedPreviews, setFailedPreviews] = react.useState(() => new Set());
      const [settingsOpen, setSettingsOpen] = react.useState(false);
      const [query, setQuery] = react.useState("");
      const [draft, setDraft] = react.useState(() => new Set());
      const [catalog, setCatalog] = react.useState({ status: "idle", providers: [] });
      const [saving, setSaving] = react.useState(false);
      const [clock, setClock] = react.useState(0);
      // null = show the interval the host reports; a string = the user is typing.
      const [editing, setEditing] = react.useState(null);
      const [scheduleBusy, setScheduleBusy] = react.useState(false);
      const bodyRef = react.useRef(null);

      // Responses can arrive out of order (the poll plus the one-off reloads
      // fired after a run/stop), and a stale one used to put the panel back into
      // "probing" or hide a selection that had just been saved.
      const loadSeq = react.useRef(0);
      const load = react.useCallback(() => {
        const seq = loadSeq.current + 1;
        loadSeq.current = seq;
        fetch("/api/pelican-watch/list", { credentials: "include" }).then((r) => r.json()).then((payload) => {
          if (seq !== loadSeq.current) return;
          if (payload && payload.ok === true) {
            setState({ status: "ready", ...payload });
            // A preview that failed once (server restart, a pruned side file)
            // must get another chance instead of staying broken for the life of
            // the panel.
            setFailedPreviews(new Set());
          } else setState({ status: "error" });
        }).catch(() => { if (seq === loadSeq.current) setState({ status: "error" }); });
      }, []);

      // Poll while mounted: often while a pass is in flight — and for a minute
      // after it finished, so the panel never keeps showing "probing" (or a
      // half-filled pass) until the slow heartbeat comes round — otherwise a
      // slow beat so scheduled drawings appear on their own.
      const justFinished = typeof state.lastRunAt === "string"
        && Math.abs(Date.now() - Date.parse(state.lastRunAt)) < 60_000;
      const pollMs = state.running || justFinished ? 4000 : 30000;
      react.useEffect(() => {
        load();
        const id = setInterval(load, pollMs);
        return () => clearInterval(id);
      }, [load, pollMs]);

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

      const catalogSeq = react.useRef(0);
      const loadCatalog = react.useCallback((refresh) => {
        const seq = catalogSeq.current + 1;
        catalogSeq.current = seq;
        setCatalog((prev) => ({ ...prev, status: "loading" }));
        api(`/api/pelican-watch/catalog${refresh ? "?refresh=1" : ""}`).then((payload) => {
          if (seq !== catalogSeq.current) return;
          if (payload && payload.ok === true) setCatalog({ status: "ready", providers: Array.isArray(payload.providers) ? payload.providers : [] });
          else setCatalog({ status: "error", providers: [] });
        }).catch(() => { if (seq === catalogSeq.current) setCatalog({ status: "error", providers: [] }); });
      }, []);

      const openSettings = () => {
        const targets = Array.isArray(state.targets) ? state.targets : [];
        setDraft(new Set(targets.map((target) => keyOf(target.provider, target.model))));
        setEditing(null);
        setSettingsOpen(true);
        loadCatalog(false);
      };

      const toggleDraft = (key) => {
        setDraft((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        });
      };

      const maxTargets = Number(state.maxTargets) > 0 ? Number(state.maxTargets) : 12;
      const saveTargets = async () => {
        const rows = [];
        const saved = new Set();
        for (const provider of catalog.providers) {
          for (const model of provider.models || []) {
            const key = keyOf(provider.provider, model.id);
            if (!draft.has(key)) continue;
            rows.push({ provider: provider.provider, model: model.id });
            saved.add(key);
          }
        }
        // A target can be selected without a checkbox: its provider may have
        // failed to list models, or it may no longer be registered. Dropping it
        // here would quietly stop probing a model the user never unselected.
        for (const target of Array.isArray(state.targets) ? state.targets : []) {
          const key = keyOf(target.provider, target.model);
          if (!draft.has(key) || saved.has(key)) continue;
          rows.push({ provider: target.provider, model: target.model });
          saved.add(key);
        }
        if (rows.length === 0) { setToast(t("emptyPick")); return; }
        if (rows.length > maxTargets) { setToast(t("tooManyTargets").replace("{n}", String(maxTargets))); return; }
        setSaving(true);
        try {
          const payload = await api("/api/pelican-watch/targets", { targets: rows });
          if (payload && payload.ok === true) {
            setSettingsOpen(false);
            setToast(payload.count !== undefined && payload.count < rows.length
              ? t("tooManyTargets").replace("{n}", String(payload.count))
              : t("saved"));
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
          const payload = await api("/api/pelican-watch/run", {});
          if (payload && payload.ok === false) { setToast(payload.error || t("emptyPick")); return; }
          setToast(payload && payload.started === false ? t("running") : t("started"));
          setTimeout(load, 2500);
        } catch (error) {
          setToast(`${t("failed")}：${error.message}`);
        } finally {
          setBusy(false);
        }
      };

      const runOne = async (model, provider) => {
        try {
          const payload = await api("/api/pelican-watch/run", { model, provider });
          if (payload && payload.ok === false) { setToast(payload.error || t("failed")); return; }
          setToast(payload && payload.started === false ? t("alreadyRunning") : t("started"));
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
      const queuedModels = ready && Array.isArray(state.queued) ? state.queued : [];
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
      // A model id is not unique: the signed-in account and a third-party
      // provider can both serve `deepseek-flash`. Everything below therefore
      // matches on the pair (provider + model), which is what the host keys its
      // gallery, errors and progress by.
      const rowKey = (row) => `${row.provider ?? ""}|${row.model ?? ""}`;
      const providerLabel = (provider) => (state.providerNames && state.providerNames[provider]) || provider || "";
      const emptyRow = (target) => ({ key: rowKey(target), model: target.model, provider: target.provider, count: 0, avgMs: null, lastMs: null, refusals: 0, lastTime: null });
      const bands = targets
        .map((target) => ({ row: summary.find((r) => rowKey(r) === rowKey(target)) || emptyRow(target) }))
        .concat(summary
          .filter((row) => !targets.some((target) => rowKey(target) === rowKey(row)))
          .map((row) => ({ row })))
        .map((entry) => ({ ...entry, drawings: images.filter((img) => rowKey(img) === rowKey(entry.row)) }));
      // Newest activity first — with no score there is nothing else to rank by.
      bands.sort((a, b) => String(b.row.lastTime ?? "").localeCompare(String(a.row.lastTime ?? ""))
        || b.row.count - a.row.count
        || String(a.row.provider).localeCompare(String(b.row.provider))
        || a.row.model.localeCompare(b.row.model));
      // A model that has run but never produced a drawing is "no drawing", not
      // "ok": its error entry may legitimately be empty right after a restart.
      const allRefused = (row) => row.count > 0 && row.refusals >= row.count;
      const isStopped = (row) => stoppedModels.includes(rowKey(row));
      const statusOf = (row) => {
        const failure = errorFor(rowKey(row));
        if (isStopped(row)) return { text: t("statusStopped"), style: s.pillMute };
        // Any failure used to read "超时", which points at latency even when the
        // real cause is a missing credential, a quota or an empty answer.
        if (failure !== null) return { text: /^超过|timeout/i.test(failure) ? t("statusTimeout") : t("statusFailed"), style: s.pillErr };
        if (allRefused(row)) return { text: t("statusNoDrawing"), style: s.pillWarn };
        if (row.count === 0) return { text: t("statusNever"), style: s.pillMute };
        // Nothing to say when everything is fine: a board where every band is
        // normal only needs its bad news labelled.
        return null;
      };
      const dotColor = (row) => (state.running && inflight.includes(rowKey(row)) ? ACCENT
        : isStopped(row) ? MUTE
          : errorFor(rowKey(row)) ? ERR
            : allRefused(row) ? WARN
              : row.count > 0 ? OK : MUTE);

      // One drawing. Every drawing is a button that opens it big — image only,
      // never the model's prose. Optional: nothing on the board needs a click
      // to be read.
      const renderTile = (drawing) => {
        const art = drawing.hasSvg && !failedPreviews.has(drawing.id)
          ? react.createElement("img", {
              src: `/api/pelican-watch/image?id=${encodeURIComponent(drawing.id)}`,
              alt: "", loading: "lazy", style: s.tileImg,
              onError: () => markPreviewFailed(drawing.id),
            })
          : react.createElement("div", { style: s.tilePlaceholder }, drawing.hasSvg ? t("placeholder") : t("badgeNoSvg"));
        const inner = [
          react.createElement("div", { key: "art", style: s.tileArt }, art),
          react.createElement("div", { key: "cap", style: s.tileCap },
            react.createElement("span", { style: s.tileTime }, fmtTime(drawing.time)),
            react.createElement("span", null, fmtMs(drawing.ms))),
        ];
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
                  t("subtitle").replace("{n}", String(state.intervalMinutes || 30)).replace("{p}", String(state.concurrency || 3)).replace("{m}", String(state.maxImages || 10)).replace("{c}", String(targets.length)),
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
                    (inflight.length > 0 && state.stopping !== true ? ` · ${t("nowProbing")} ${inflight.map((id) => String(id).split("|").pop()).join("、")}` : "") +
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
            react.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
              react.createElement(Btn, { primary: true, disabled: !ready || busy || state.running, onClick: runAll },
                state.running ? t("running") : t("runAll")),
              react.createElement(Btn, { onClick: openSettings, title: t("settingsTitle") },
                `⚙ ${t("settingsBtn")}`))
          )
        )
      );

      // Pace controls, inside the settings modal: pause the schedule, retune
      // the interval, or cut off the pass that is running right now.
      const renderPaceCard = () => {
        if (!ready) return null;
        const minutes = editing !== null ? editing : String(state.intervalMinutes || 30);
        const paused = state.autoEnabled === false;
        return react.createElement("div", { style: s.tempo },
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
        const failed = errorFor(rowKey(row));
        // A selected band can be probed on its own — one model, one request,
        // without spending on the rest of the list.
        const selectable = targets.some((target) => rowKey(target) === rowKey(row));
        const lead = react.createElement("div", { style: s.bandLead },
          react.createElement("div", { style: s.bandTop },
            react.createElement("span", { style: { ...s.dot, background: dotColor(row) } }),
            // The provider is what makes two bands with the same model name
            // different, so it leads: 「taotoken」 above, the model below.
            row.provider === "" ? null : react.createElement("span", { style: s.bandProvider, title: row.provider }, providerLabel(row.provider)),
            status === null ? null : react.createElement("span", { style: { ...s.pill, ...status.style } }, status.text),
            react.createElement("span", { style: { flex: "1 1 auto" } }),
            selectable
              ? react.createElement(Btn, {
                  onClick: () => runOne(row.model, row.provider),
                  // Queued counts as busy: the request is already on its way,
                  // clicking again would only be silently dropped.
                  disabled: !ready || busy || inflight.includes(rowKey(row)) || queuedModels.includes(rowKey(row)),
                  title: t("runOneHint"),
                }, t("runOne"))
              : null),
          react.createElement("h3", { style: s.bandName, title: `${row.model} · ${row.provider}` }, row.model),
          react.createElement("div", { style: s.bandLatest, title: t("bandLatest").replace("{time}", row.lastTime ? fmtTime(row.lastTime) : "") },
            row.lastTime ? t("bandLatest").replace("{time}", fmtTime(row.lastTime)) : "—"),
          react.createElement("div", { style: s.bandStats },
            `${t("bandRuns").replace("{n}", String(row.count))}`,
            row.avgMs !== null ? ` · ${t("bandAvg").replace("{t}", fmtMs(row.avgMs))}` : "",
            react.createElement("br"),
            `${t("bandRefusals").replace("{n}", String(row.refusals))}`),
          failed ? react.createElement("div", { style: s.errLine, title: t("errorLabel") }, failed) : null
        );
        const arts = drawings.length === 0
          ? react.createElement("div", { style: s.missBox },
              failed !== null
                ? failed
                : row.count === 0
                  ? t("neverRan")
                  : t("noneYet").replace("{n}", String(row.refusals)))
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
            react.createElement("span", { style: s.boardHint },
              t("modelsHint").replace("{n}", String(images.length)))),
          bands.map(renderBand));
      };

      // The settings modal — everything that is an action, one gear click away
      // from the board: pace (pause / interval / stop) and the model list.
      const renderSettings = () => {
        if (!settingsOpen) return null;
        const needle = query.trim().toLowerCase();
        const providers = catalog.providers
          .map((provider) => ({
            ...provider,
            models: (provider.models || []).filter((model) => needle === ""
              || model.id.toLowerCase().includes(needle)
              || String(model.name || "").toLowerCase().includes(needle)),
          }))
          .filter((provider) => provider.models.length > 0 || needle === "");
        return react.createElement("div", null,
          react.createElement("div", { style: s.backdrop, onClick: () => setSettingsOpen(false) }),
          react.createElement("div", { style: s.modal, role: "dialog", "aria-label": t("settingsTitle") },
            react.createElement("div", { style: s.modalHead },
              react.createElement("h2", { style: s.modalTitle }, t("settingsTitle")),
              react.createElement(Btn, { onClick: () => setSettingsOpen(false), title: t("close") }, "✕")),
            react.createElement("div", { style: s.modalBody },
              react.createElement("h3", { style: s.sectionTitle }, t("sectionPace")),
              renderPaceCard(),
              react.createElement("h3", { style: { ...s.sectionTitle, marginTop: "18px" } }, t("sectionModels")),
              react.createElement("div", { style: s.modalHint }, t("pickerHint")),
              react.createElement("div", { style: s.modalTools },
                react.createElement("input", { style: s.input, value: query, placeholder: t("search"), onChange: (event) => setQuery(event.target.value) }),
                react.createElement(Btn, { onClick: () => loadCatalog(true), disabled: catalog.status === "loading" }, t("refresh")),
                react.createElement(Btn, {
                  onClick: () => {
                    const all = new Set();
                    for (const provider of catalog.providers) {
                      for (const model of provider.models || []) {
                        if (all.size >= maxTargets) break;
                        all.add(keyOf(provider.provider, model.id));
                      }
                      if (all.size >= maxTargets) break;
                    }
                    setDraft(all);
                    if (all.size >= maxTargets) setToast(t("tooManyTargets").replace("{n}", String(maxTargets)));
                  },
                }, t("selectAll")),
                react.createElement(Btn, { onClick: () => setDraft(new Set()) }, t("clearAll"))
              ),
              catalog.status === "loading" && catalog.providers.length === 0
                ? react.createElement("div", { style: { padding: "12px", color: MUTE, fontSize: "12.5px" } }, "…")
                : providers.length === 0
                  ? react.createElement("div", { style: { padding: "12px", color: MUTE, fontSize: "12.5px" } }, t("noModels"))
                  : providers.map((provider) => react.createElement("div", { key: provider.provider },
                      react.createElement("div", { style: s.providerRow },
                        react.createElement("span", { style: s.providerName }, provider.displayName || provider.provider),
                        react.createElement("span", { style: s.statusText }, t("selectedNote")
                          .replace("{n}", String((provider.models || []).filter((model) => draft.has(keyOf(provider.provider, model.id))).length))
                          .replace("{total}", String((provider.models || []).length))),
                        provider.error
                          ? react.createElement("span", { style: { ...s.pill, ...s.pillWarn }, title: provider.error }, t("providerUnavailable"))
                          : null),
                      provider.error ? react.createElement("div", { style: { ...s.errLine, padding: "0 0 6px 2px" } }, provider.error) : null,
                      (provider.models || []).length === 0
                        ? react.createElement("div", { style: { padding: "0 8px 6px", color: MUTE, fontSize: "12px" } }, needle === "" ? t("noModels") : t("noMatches"))
                        : (provider.models || []).map((model) => {
                            const key = keyOf(provider.provider, model.id);
                            return react.createElement("label", { key, style: s.modelRow, className: "pw-row-hover", title: model.id },
                              react.createElement("input", { type: "checkbox", checked: draft.has(key), onChange: () => toggleDraft(key) }),
                              react.createElement("span", { style: s.modelName }, model.name || model.id));
                          })
                    ))
            ),
            react.createElement("div", { style: s.modalFoot },
              react.createElement("span", { style: s.statusText }, t("controlHint")),
              react.createElement("span", { style: { display: "flex", gap: "8px" } },
                react.createElement(Btn, { onClick: () => setSettingsOpen(false) }, t("close")),
                react.createElement(Btn, { primary: true, disabled: saving, onClick: saveTargets }, saving ? t("saving") : t("save"))))
          )
        );
      };

      // The drawing, big — and nothing else. The stored page holds the model's
      // whole answer (often an intro sentence plus a ```html fence around the
      // SVG), so rendering that page would put prose next to the picture. The
      // `image` route serves just the extracted `<svg>` as an image, which the
      // browser cannot execute and cannot mix with text.
      const renderViewer = () => {
        if (!selected) return null;
        const head = react.createElement("div", { style: s.drawerHead },
          react.createElement("h2", { style: s.drawerTitle, title: selected.id },
            selected.model,
            selected.provider === "" ? null : react.createElement("span", { style: s.bandProvider }, providerLabel(selected.provider))),
          react.createElement("span", { style: { display: "flex", gap: "6px" } },
            react.createElement(Btn, { onClick: () => runOne(selected.model, selected.provider), title: t("runOneHint") }, "▷"),
            react.createElement(Btn, { onClick: () => setSelected(null), title: t("close") }, "✕")));
        const art = selected.hasSvg && !failedPreviews.has(selected.id)
          ? react.createElement("img", {
              src: `/api/pelican-watch/image?id=${encodeURIComponent(selected.id)}`,
              alt: "", style: s.bigArt,
              onError: () => markPreviewFailed(selected.id),
            })
          : react.createElement("div", { style: s.tilePlaceholder }, t("placeholder"));
        return react.createElement("div", null,
          react.createElement("div", { style: s.backdrop, onClick: () => setSelected(null) }),
          react.createElement("aside", { style: s.drawer, role: "dialog", "aria-label": `${selected.model} · ${selected.provider}` },
            head,
            react.createElement("div", { style: s.drawerBody }, art)));
      };

      return react.createElement("div", { style: s.root },
        renderHeader(),
        react.createElement("div", { style: s.body, ref: bodyRef, className: "pw-scroll" },
          state.status === "error"
            ? react.createElement("div", { style: s.empty },
                react.createElement("div", { style: s.emptyGlyph }, "⚠️"),
                react.createElement("div", { style: s.emptyTitle }, t("loadFailed")))
            : renderBoard()),
        renderSettings(),
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

    // Fixed-height column wrapper for the panel: DSH grows the slot with the
    // content, so the scrolling column is pinned to the viewport instead.
    function PanelPage(props) {
      return react.createElement("div", { style: { padding: "22px 26px 0", maxWidth: "1320px", margin: "0 auto", height: "100%", boxSizing: "border-box", overflow: "hidden" } },
        react.createElement(PelicanPanel, props));
    }

    // Rules that inline styles cannot express (hover, media queries). Kept in
    // one injected sheet, removed with the plugin.
    const STYLE_ID = "pelican-watch-styles";
    const STYLESHEET = `
.pw-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;border-radius:8px;padding:6px 12px;white-space:nowrap}
/* The plain hover must not touch the filled button: .pw-btn:hover outranks
   .pw-btn-primary, which used to repaint a primary button light grey on hover
   and leave its white label invisible. */
.pw-btn:not(.pw-btn-primary):hover{background:var(--dsw-alias-bg-layer-3)}
.pw-btn:not(.pw-btn-primary)[disabled]:hover{background:transparent}
.pw-btn[disabled]{opacity:.45;cursor:not-allowed}
.pw-btn-primary{border-color:transparent;background:var(--dsw-accent,#6366f1);color:#fff}
.pw-btn-primary:hover{background:var(--dsw-accent,#6366f1);filter:brightness(1.08)}
.pw-btn-primary[disabled]:hover{filter:none}
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
      // The panel lives in the main view. Its own header carries the actions
      // (`全部检测一遍` and the gear), so no DSH Settings section is registered:
      // the settings belong where the drawings are.
      disposers.push(ctx.slots.inject("main", () =>
        ctx.slots.register(
          { name: "main", key: "pelican", locale: NS, inject: () => ({}) },
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
