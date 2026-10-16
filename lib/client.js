// dsh-pelican-watch — client half.
//
// Registers the probe panel: an icon in the main sidebar (opens the panel in
// the main view) plus a matching Settings section. The panel has three parts:
//
//   1. a model picker — multi-select over every model the configured providers
//      report (live `/models` discovery), saved as the probe targets;
//   2. an "IQ" board — per model: rubric score of its newest drawing, the trend
//      against its own history, run count, average duration and failures;
//   3. the gallery — every saved drawing for the selected models, with a
//      sandboxed full-page viewer.
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
      iqTitle: "智商检测",
      iqHint: "分数来自画面结构（是否有 SVG、车轮、辐条、车架、车把、车座、脚踏、鹈鹕与翅膀、页面完整性），满分 100",
      runs: "{n} 次",
      never: "还没跑过",
      trend: "趋势",
      avgMs: "平均",
      refusals: "{n} 次没出图",
      noData: "—",
      runAll: "全部检测一遍",
      runOne: "只测这个",
      running: "正在检测…",
      runningModel: "正在检测 {model}…",
      nextRun: "下次 {time}",
      intervalNote: "每 {n} 分钟一轮",
      maxNote: "最多保存 {n} 张，超出自动清理最旧的",
      filterAll: "全部",
      galleryTitle: "画作",
      empty: "还没有画",
      emptyHint: "点右上角「全部检测一遍」立即开始，或等调度器到点自动画",
      emptyPick: "先在「选择模型」里勾选要检测的模型",
      badgeOk: "已出图",
      badgeNoSvg: "未检出 SVG",
      tookMs: "用时",
      started: "已开始检测，画完会自动出现在列表里",
      failed: "绘制失败",
      loadFailed: "列表加载失败",
      errorLabel: "上次错误",
      placeholder: "没有可预览的 SVG",
      featuresLabel: "命中的结构",
      scoreLabel: "得分",
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
      iqTitle: "IQ check",
      iqHint: "Scored from the drawing's structure (SVG present, wheels, spokes, frame, handlebar, seat, pedals, pelican and wings, page completeness); 100 max",
      runs: "{n} run(s)",
      never: "Not run yet",
      trend: "Trend",
      avgMs: "Avg",
      refusals: "{n} without a drawing",
      noData: "—",
      runAll: "Probe all now",
      runOne: "Probe this one",
      running: "Probing…",
      runningModel: "Probing {model}…",
      nextRun: "Next {time}",
      intervalNote: "every {n} min",
      maxNote: "Keeps the latest {n}; older ones are pruned",
      filterAll: "All",
      galleryTitle: "Drawings",
      empty: "Nothing drawn yet",
      emptyHint: "Click “Probe all now”, or wait for the scheduler",
      emptyPick: "Pick the models to probe first",
      badgeOk: "SVG ok",
      badgeNoSvg: "No SVG found",
      tookMs: "Took",
      started: "Started — results appear here automatically",
      failed: "Drawing failed",
      loadFailed: "Failed to load the list",
      errorLabel: "Last error",
      placeholder: "No SVG to preview",
      featuresLabel: "Structure found",
      scoreLabel: "Score",
    };

    // ── styles ──────────────────────────────────────────────────────────
    const s = {
      root: { display: "flex", flexDirection: "column", gap: "12px", height: "100%", minHeight: 0 },
      headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" },
      headerLead: { flex: "1 1 0", minWidth: 0 },
      headerActions: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flex: "0 0 auto" },
      title: { margin: 0, fontSize: "18px", fontWeight: 700, lineHeight: "26px" },
      subtitle: { margin: "3px 0 0", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      btn: { cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-primary)", font: "inherit", fontSize: "12.5px", borderRadius: "8px", padding: "6px 12px", whiteSpace: "nowrap" },
      btnPrimary: { cursor: "pointer", border: "1px solid transparent", background: "var(--dsw-accent, #6366f1)", color: "#fff", font: "inherit", fontSize: "12.5px", borderRadius: "8px", padding: "6px 12px", whiteSpace: "nowrap" },
      btnDisabled: { opacity: 0.45, cursor: "not-allowed" },
      sectionHead: { display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, flexWrap: "wrap" },
      sectionTitle: { margin: 0, fontSize: "13px", fontWeight: 700, lineHeight: "20px" },
      sectionHint: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto", minWidth: 0 },
      iqRow: { display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px", flex: "0 0 auto" },
      iqCard: { flex: "0 0 auto", width: "176px", boxSizing: "border-box", textAlign: "left", background: "var(--dsw-alias-bg-layer-3)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "12px", padding: "10px 12px", cursor: "pointer", font: "inherit", color: "inherit" },
      iqCardActive: { borderColor: "var(--dsw-accent, #6366f1)" },
      iqTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", minWidth: 0 },
      iqScore: { fontSize: "26px", fontWeight: 700, lineHeight: "30px", fontVariantNumeric: "tabular-nums" },
      iqTrend: { fontSize: "12px", fontWeight: 600, fontVariantNumeric: "tabular-nums", flex: "none" },
      iqModel: { marginTop: "2px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", fontWeight: 600, lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      iqMeta: { marginTop: "4px", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" },
      chips: { display: "flex", gap: "6px", flexWrap: "wrap", flex: "0 0 auto" },
      chip: { cursor: "pointer", border: "1px solid var(--dsw-alias-border-l1)", background: "transparent", color: "var(--dsw-alias-label-secondary)", font: "inherit", fontSize: "11.5px", lineHeight: "18px", borderRadius: "999px", padding: "2px 10px", whiteSpace: "nowrap" },
      chipActive: { borderColor: "var(--dsw-accent, #6366f1)", color: "var(--dsw-alias-label-primary)", background: "color-mix(in srgb, var(--dsw-accent, #6366f1) 12%, transparent)" },
      grid: { flex: "1 1 auto", minWidth: 0, minHeight: 0, boxSizing: "border-box", overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", alignItems: "start", gap: "12px" },
      card: { display: "flex", flexDirection: "column", background: "var(--dsw-alias-bg-layer-3)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "12px", padding: "10px", cursor: "pointer", minWidth: 0 },
      preview: { width: "100%", aspectRatio: "4 / 3", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", display: "block", objectFit: "contain" },
      placeholder: { width: "100%", aspectRatio: "4 / 3", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-1)", border: "1px dashed var(--dsw-alias-border-l2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" },
      cardFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "9px", minWidth: 0 },
      cardModel: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600, fontSize: "12.5px", lineHeight: "18px" },
      cardMeta: { flex: "none", color: "var(--dsw-alias-label-tertiary)", fontSize: "11.5px", lineHeight: "18px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
      badge: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 600, lineHeight: "16px", padding: "2px 8px", borderRadius: "999px", whiteSpace: "nowrap", flex: "none" },
      badgeOk: { background: "color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 14%, transparent)", color: "var(--dsw-alias-state-success-primary, #16a34a)" },
      badgeNoSvg: { background: "color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d97706) 14%, transparent)", color: "var(--dsw-alias-state-warning-primary, #d97706)" },
      badgeScore: { background: "color-mix(in srgb, var(--dsw-accent, #6366f1) 14%, transparent)", color: "var(--dsw-accent, #6366f1)" },
      empty: { flex: "1 1 auto", minHeight: 0, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", padding: "24px", gap: "6px" },
      emptyGlyph: { fontSize: "30px", lineHeight: 1 },
      error: { display: "flex", alignItems: "center", gap: "10px", color: "var(--dsw-alias-state-error-primary)", fontSize: "13px", lineHeight: "20px" },
      backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 400 },
      drawer: { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(720px, 92vw)", background: "var(--dsw-alias-bg-layer-1)", borderLeft: "1px solid var(--dsw-alias-border-l1)", zIndex: 401, display: "flex", flexDirection: "column", boxShadow: "-12px 0 32px rgba(0,0,0,.18)" },
      drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px", borderBottom: "1px solid var(--dsw-alias-border-l1)" },
      drawerTitle: { margin: 0, fontSize: "14px", fontWeight: 700, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      drawerMeta: { padding: "10px 16px", color: "var(--dsw-alias-label-secondary)", fontSize: "12px", lineHeight: "18px", fontVariantNumeric: "tabular-nums" },
      drawerBody: { flex: "1 1 auto", minHeight: 0, padding: "0 16px 16px", boxSizing: "border-box" },
      frame: { width: "100%", height: "100%", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "10px", background: "#fff", display: "block", boxSizing: "border-box" },
      modal: { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(620px, 92vw)", maxHeight: "82vh", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "14px", zIndex: 401, display: "flex", flexDirection: "column", boxShadow: "0 20px 48px rgba(0,0,0,.28)" },
      modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 16px 10px" },
      modalTitle: { margin: 0, fontSize: "14px", fontWeight: 700, lineHeight: "20px" },
      modalHint: { padding: "0 16px 10px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px" },
      modalTools: { display: "flex", alignItems: "center", gap: "8px", padding: "0 16px 10px", flexWrap: "wrap" },
      input: { flex: "1 1 160px", minWidth: 0, boxSizing: "border-box", font: "inherit", fontSize: "12.5px", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--dsw-alias-border-l1)", background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)" },
      modalBody: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 16px 8px" },
      providerRow: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0 4px" },
      providerName: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12.5px", fontWeight: 700 },
      modelRow: { display: "flex", alignItems: "center", gap: "9px", padding: "5px 8px", borderRadius: "8px", cursor: "pointer", fontSize: "12.5px", minWidth: 0 },
      modelName: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto" },
      modalFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "10px 16px 14px", borderTop: "1px solid var(--dsw-alias-border-l1)" },
      toast: { position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "10px", padding: "9px 14px", fontSize: "12.5px", zIndex: 500, boxShadow: "0 8px 24px rgba(0,0,0,.16)", maxWidth: "80vw" },
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
    function fmtMs(ms) {
      if (typeof ms !== "number" || ms < 0) return "";
      return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    }
    const keyOf = (provider, model) => `${provider}|${model}`;
    const api = (path, body) => fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => r.json());

    const scoreColor = (score) => (score >= 80
      ? "var(--dsw-alias-state-success-primary, #16a34a)"
      : score >= 50 ? "var(--dsw-alias-state-warning-primary, #d97706)" : "var(--dsw-alias-state-error-primary, #dc2626)");

    function Badge({ ok, t }) {
      return react.createElement("span", { style: Object.assign({}, s.badge, ok ? s.badgeOk : s.badgeNoSvg) }, ok ? t("badgeOk") : t("badgeNoSvg"));
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
      const [pickerOpen, setPickerOpen] = react.useState(false);
      const [query, setQuery] = react.useState("");
      const [draft, setDraft] = react.useState(() => new Set());
      const [catalog, setCatalog] = react.useState({ status: "idle", providers: [] });
      const [saving, setSaving] = react.useState(false);
      const contentRef = react.useRef(null);

      const load = react.useCallback(() => {
        fetch("/api/pelican-watch/list", { credentials: "include" }).then((r) => r.json()).then((payload) => {
          if (payload && payload.ok === true) setState({ status: "ready", ...payload });
          else setState({ status: "error" });
        }).catch(() => setState({ status: "error" }));
      }, []);

      // Poll while mounted: often while a draw is in flight, otherwise a slow
      // heartbeat so scheduled drawings appear on their own.
      react.useEffect(() => {
        load();
        const period = state.running ? 4000 : 30000;
        const id = setInterval(load, period);
        return () => clearInterval(id);
      }, [load, state.running]);

      // Toast auto-dismiss.
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

      // Pin the gallery to an exact height so the panel is the same size no
      // matter how many cards are in it (same reasoning as skill-console).
      react.useLayoutEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const measure = () => {
          const rect = el.getBoundingClientRect();
          const avail = Math.max(200, window.innerHeight - rect.top - 32);
          el.style.maxHeight = avail + "px";
          el.style.minHeight = avail + "px";
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
      }, [state, filterModel]);

      const loadCatalog = react.useCallback((refresh) => {
        setCatalog((prev) => ({ ...prev, status: "loading" }));
        api(`/api/pelican-watch/catalog${refresh ? "?refresh=1" : ""}`).then((payload) => {
          if (payload && payload.ok === true) {
            setCatalog({ status: "ready", providers: Array.isArray(payload.providers) ? payload.providers : [] });
          } else {
            setCatalog({ status: "error", providers: [] });
          }
        }).catch(() => setCatalog({ status: "error", providers: [] }));
      }, []);

      const openPicker = () => {
        const targets = Array.isArray(state.targets) ? state.targets : [];
        setDraft(new Set(targets.map((tg) => keyOf(tg.provider, tg.model))));
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
            setToast(t("saveFailed") + (payload && payload.error ? "：" + payload.error : ""));
          }
        } catch (error) {
          setToast(t("saveFailed") + "：" + error.message);
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
          setToast(t("failed") + "：" + error.message);
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
          setToast(t("failed") + "：" + error.message);
        }
      };

      const markPreviewFailed = (id) => {
        setFailedPreviews((prev) => { if (prev.has(id)) return prev; const next = new Set(prev); next.add(id); return next; });
      };

      const images = state.status === "ready" && Array.isArray(state.images) ? state.images : [];
      const targets = state.status === "ready" && Array.isArray(state.targets) ? state.targets : [];
      const summary = state.status === "ready" && Array.isArray(state.summary) ? state.summary : [];
      const shown = filterModel === null ? images : images.filter((img) => img.model === filterModel);
      const modelsWithDrawings = Array.from(new Set(images.map((img) => img.model).filter((m) => m !== "")));

      // One IQ row per selected model: its summary when it has runs, otherwise
      // a placeholder row so "not run yet" is visible rather than absent.
      const iqRows = targets.map((target) => {
        const found = summary.find((row) => row.model === target.model && (row.provider === target.provider || row.provider === ""));
        return found || {
          model: target.model, provider: target.provider, count: 0, latest: null,
          avg: null, best: null, worst: null, trend: 0, avgMs: null, refusals: 0, lastTime: null,
        };
      });
      const extraRows = summary.filter((row) => !targets.some((target) => target.model === row.model));
      const iqAll = iqRows.concat(extraRows);

      const renderHeader = () => react.createElement("header", { style: s.headerRow },
        react.createElement("div", { style: s.headerLead },
          react.createElement("h1", { style: s.title }, t("title")),
          react.createElement("p", { style: s.subtitle }, t("subtitle"))
        ),
        react.createElement("div", { style: s.headerActions },
          state.status === "ready" && state.running
            ? react.createElement("span", { style: s.cardMeta }, state.runningModel ? t("runningModel").replace("{model}", state.runningModel) : t("running"))
            : null,
          state.status === "ready" && state.nextRunAt && !state.running
            ? react.createElement("span", { style: s.cardMeta }, t("nextRun").replace("{time}", fmtTime(state.nextRunAt)))
            : null,
          react.createElement(Btn, { onClick: openPicker }, t("pickerOpen")),
          react.createElement(Btn, { primary: true, disabled: busy || state.running, onClick: runAll }, busy || state.running ? t("running") : t("runAll"))
        )
      );

      const renderIq = () => {
        if (state.status !== "ready") return null;
        if (iqAll.length === 0) return null;
        return react.createElement("section", { style: { flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "6px" } },
          react.createElement("div", { style: s.sectionHead },
            react.createElement("h2", { style: s.sectionTitle }, t("iqTitle")),
            react.createElement("span", { style: s.sectionHint }, t("iqHint"))
          ),
          react.createElement("div", { style: s.iqRow }, iqAll.map((row) => {
            const active = filterModel === row.model;
            const hasRuns = row.count > 0;
            const trendText = row.trend > 0 ? `↑ +${row.trend}` : row.trend < 0 ? `↓ ${row.trend}` : "→ 0";
            const trendColor = row.trend > 0
              ? "var(--dsw-alias-state-success-primary, #16a34a)"
              : row.trend < 0 ? "var(--dsw-alias-state-error-primary, #dc2626)" : "var(--dsw-alias-label-tertiary)";
            return react.createElement("button", {
              key: keyOf(row.provider, row.model),
              type: "button",
              onClick: () => setFilterModel(active ? null : row.model),
              style: Object.assign({}, s.iqCard, active ? s.iqCardActive : {}),
              title: hasRuns ? `${t("scoreLabel")} ${row.latest} · ${t("trend")} ${row.trend}` : t("never"),
            },
              react.createElement("div", { style: s.iqTop },
                react.createElement("span", { style: Object.assign({}, s.iqScore, hasRuns ? { color: scoreColor(row.latest) } : { color: "var(--dsw-alias-label-tertiary)" }) }, hasRuns ? String(row.latest) : t("noData")),
                hasRuns && row.count > 1 ? react.createElement("span", { style: Object.assign({}, s.iqTrend, { color: trendColor }) }, trendText) : null
              ),
              react.createElement("div", { style: s.iqModel }, row.model),
              react.createElement("div", { style: s.iqMeta }, hasRuns
                ? `${t("runs").replace("{n}", String(row.count))}` +
                  (row.avgMs !== null ? ` · ${t("avgMs")} ${fmtMs(row.avgMs)}` : "") +
                  (row.refusals > 0 ? ` · ${t("refusals").replace("{n}", String(row.refusals))}` : "")
                : t("never"))
            );
          }))
        );
      };

      const renderFilters = () => {
        if (modelsWithDrawings.length <= 1) return null;
        return react.createElement("div", { style: s.chips },
          react.createElement("button", {
            type: "button",
            onClick: () => setFilterModel(null),
            style: Object.assign({}, s.chip, filterModel === null ? s.chipActive : {}),
          }, t("filterAll")),
          modelsWithDrawings.map((model) => react.createElement("button", {
            key: model,
            type: "button",
            onClick: () => setFilterModel(filterModel === model ? null : model),
            style: Object.assign({}, s.chip, filterModel === model ? s.chipActive : {}),
          }, model))
        );
      };

      const renderCard = (img) => react.createElement("article", { key: img.id, style: s.card, onClick: () => setSelected(img) },
        img.hasSvg && !failedPreviews.has(img.id)
          ? react.createElement("img", { src: `/api/pelican-watch/image?id=${encodeURIComponent(img.id)}`, alt: "", loading: "lazy", style: s.preview, onError: () => markPreviewFailed(img.id) })
          : react.createElement("div", { style: s.placeholder }, img.ok ? t("placeholder") : t("badgeNoSvg")),
        react.createElement("div", { style: s.cardFoot },
          react.createElement("div", { style: s.cardModel }, img.model || img.id),
          react.createElement("div", { style: s.cardMeta }, fmtTime(img.time) + (img.ms !== null ? " · " + fmtMs(img.ms) : ""))
        ),
        react.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "6px" } },
          react.createElement("span", { style: Object.assign({}, s.badge, s.badgeScore) }, `${t("scoreLabel")} ${img.score}`),
          react.createElement(Badge, { ok: img.ok, t })
        )
      );

      const renderBody = () => {
        if (state.status !== "ready") {
          return react.createElement("div", { style: s.empty, ref: contentRef },
            react.createElement("div", { style: s.emptyGlyph }, state.status === "error" ? "⚠️" : "🎨"),
            react.createElement("div", null, state.status === "error" ? t("loadFailed") : t("empty")));
        }
        if (shown.length === 0) {
          return react.createElement("div", { style: s.empty, ref: contentRef },
            react.createElement("div", { style: s.emptyGlyph }, "🦩"),
            react.createElement("div", { style: { fontWeight: 600 } }, t("empty")),
            react.createElement("div", { style: { fontSize: "12.5px" } }, targets.length === 0 ? t("emptyPick") : t("emptyHint")),
            state.lastError ? react.createElement("div", { style: s.error }, t("errorLabel") + "：" + state.lastError) : null);
        }
        return react.createElement("div", { style: s.grid, ref: contentRef }, shown.map(renderCard));
      };

      const renderPicker = () => {
        if (!pickerOpen) return null;
        const needle = query.trim().toLowerCase();
        const providers = catalog.providers
          .map((provider) => Object.assign({}, provider, {
            models: (provider.models || []).filter((model) => needle === "" || model.toLowerCase().includes(needle)),
          }))
          .filter((provider) => provider.models.length > 0 || needle === "");
        return react.createElement("div", null,
          react.createElement("div", { style: s.backdrop, onClick: () => setPickerOpen(false) }),
          react.createElement("div", { style: s.modal, role: "dialog", "aria-label": t("pickerTitle") },
            react.createElement("div", { style: s.modalHead },
              react.createElement("h2", { style: s.modalTitle }, t("pickerTitle")),
              react.createElement(Btn, { onClick: () => setPickerOpen(false), "aria-label": t("close") }, "✕")),
            react.createElement("div", { style: s.modalHint }, t("pickerHint")),
            react.createElement("div", { style: s.modalTools },
              react.createElement("input", {
                style: s.input,
                value: query,
                placeholder: t("search"),
                onChange: (event) => setQuery(event.target.value),
              }),
              react.createElement(Btn, { onClick: () => loadCatalog(true), disabled: catalog.status === "loading" }, t("refresh")),
              react.createElement(Btn, {
                onClick: () => {
                  const all = new Set();
                  for (const provider of catalog.providers) {
                    for (const model of provider.models || []) all.add(keyOf(provider.provider, model));
                  }
                  setDraft(all);
                },
              }, t("selectAll")),
              react.createElement(Btn, { onClick: () => setDraft(new Set()) }, t("clearAll"))
            ),
            react.createElement("div", { style: s.modalBody },
              catalog.status === "loading" && catalog.providers.length === 0
                ? react.createElement("div", { style: { padding: "12px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12.5px" } }, "…")
                : providers.length === 0
                  ? react.createElement("div", { style: { padding: "12px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12.5px" } }, t("noModels"))
                  : providers.map((provider) => react.createElement("div", { key: provider.provider },
                      react.createElement("div", { style: s.providerRow },
                        react.createElement("span", { style: s.providerName }, provider.provider),
                        react.createElement("span", { style: Object.assign({}, s.badge, provider.keyAvailable ? s.badgeOk : s.badgeNoSvg) }, provider.keyAvailable ? t("keyOk") : t("keyMissing")),
                        react.createElement("span", { style: s.cardMeta }, (provider.models || []).length)),
                      (provider.models || []).length === 0
                        ? react.createElement("div", { style: { padding: "0 8px 6px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } }, t("noMatches"))
                        : (provider.models || []).map((model) => {
                            const key = keyOf(provider.provider, model);
                            return react.createElement("label", { key, style: s.modelRow },
                              react.createElement("input", {
                                type: "checkbox",
                                checked: draft.has(key),
                                onChange: () => toggleDraft(key),
                              }),
                              react.createElement("span", { style: s.modelName }, model));
                          })
                    ))
            ),
            react.createElement("div", { style: s.modalFoot },
              react.createElement("span", { style: s.cardMeta }, t("selectedNote").replace("{n}", String(draft.size))),
              react.createElement("div", { style: { display: "flex", gap: "8px" } },
                react.createElement(Btn, { onClick: () => setPickerOpen(false) }, t("close")),
                react.createElement(Btn, { primary: true, disabled: saving, onClick: saveTargets }, saving ? t("saving") : t("save")))
            ))
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
              react.createElement(Btn, { onClick: () => setSelected(null), "aria-label": t("close") }, "✕")),
            react.createElement("div", { style: s.drawerMeta },
              (selected.model || "") + " · " + fmtTime(selected.time) +
              (selected.ms !== null ? " · " + t("tookMs") + " " + fmtMs(selected.ms) : "") +
              (selected.bytes ? " · " + Math.round(selected.bytes / 1024) + "KB" : "") +
              " · " + t("scoreLabel") + " " + selected.score +
              (features.length > 0 ? " · " + t("featuresLabel") + " " + features.join(", ") : "")),
            react.createElement("div", { style: { padding: "0 16px 10px", display: "flex", gap: "8px" } },
              react.createElement(Btn, { onClick: () => runOne(selected.model, selected.provider) }, t("runOne"))),
            react.createElement("div", { style: s.drawerBody },
              raw !== null
                ? react.createElement("iframe", { srcDoc: raw, sandbox: "", title: selected.id, style: s.frame })
                : react.createElement("div", { style: s.placeholder }, "…"))));
      };

      return react.createElement("div", { style: s.root },
        renderHeader(),
        state.status === "ready"
          ? react.createElement("div", { style: s.sectionHead },
              react.createElement("span", { style: s.cardMeta },
                t("intervalNote").replace("{n}", String(state.intervalMinutes || 30)) + " · " +
                t("maxNote").replace("{n}", String(state.maxImages || 12)) + " · " +
                t("selectedNote").replace("{n}", String(targets.length))))
          : null,
        renderIq(),
        renderFilters(),
        renderBody(),
        renderPicker(), renderDrawer(),
        toast ? react.createElement("div", { style: s.toast }, toast) : null);
    }

    function Btn({ onClick, primary, disabled, children }) {
      return react.createElement("button", {
        type: "button",
        onClick: disabled ? undefined : onClick,
        disabled,
        style: Object.assign({}, primary ? s.btnPrimary : s.btn, disabled ? s.btnDisabled : {}),
      }, children);
    }

    function PelicanPanelIcon({ size }) {
      if (PanelIcon) return react.createElement(PanelIcon, { size });
      // Inline fallback glyph: a tiny bicycle (two wheels + frame).
      return react.createElement("svg", { viewBox: "0 0 20 20", width: size, height: size, "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.6 },
        react.createElement("circle", { cx: 5, cy: 14, r: 3.2 }),
        react.createElement("circle", { cx: 15, cy: 14, r: 3.2 }),
        react.createElement("path", { d: "M5 14l3.4-6h4.2l2.4 6M8.4 8L7 5.6h2.6M12.6 8l1-2.4h1.6", strokeLinecap: "round", strokeLinejoin: "round" }));
    }

    // Main-view panel content: same fixed-height column wrapper as the
    // skill-console panel, used for BOTH slots so Settings looks identical.
    function PanelPage(props) {
      return react.createElement("div", { style: { padding: "24px 28px", maxWidth: "1280px", margin: "0 auto", height: "100%", boxSizing: "border-box", overflow: "hidden" } },
        react.createElement(PelicanPanel, props));
    }

    const NS = "pelicanWatch";
    const inject = ["slots", "locale"];
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "pelican-watch: dictionaries");
      const t = ctx.locale.bind(NS);

      ctx.effect(() => {
        const style = document.createElement("style");
        style.setAttribute("data-pelican-watch", "");
        style.textContent = [
          '[data-pw="card"]{transition:border-color .12s ease, transform .12s ease, box-shadow .12s ease}',
          '[data-pw="card"]:hover{border-color:var(--dsw-alias-border-l2); transform:translateY(-1px); box-shadow:0 8px 24px rgba(0,0,0,.10)}',
        ].join("\n");
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
