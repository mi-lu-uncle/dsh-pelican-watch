// dsh-pelican-watch — client half.
//
// Registers a gallery panel for the drawings the host half's scheduler saves:
// an icon in the main sidebar (opens the panel in the main view) plus a
// matching Settings section. Every card shows an inline SVG preview of one
// scheduled "pelican riding a bicycle" drawing; clicking a card opens a
// sandboxed full-page viewer with the run's meta (model, time, duration).
// All data goes through the host half's same-origin `/api/pelican-watch/*`
// routes, which the panel polls so new drawings appear on their own.
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
      subtitle: "定时让模型画同一道「鹈鹕骑车」，用来观察它是否降智",
      runNow: "立即画一张",
      running: "正在画…",
      nextRun: "下次 {time}",
      maxNote: "最多保存 {n} 张，超出自动清理最旧的",
      empty: "还没有画",
      emptyHint: "调度器每隔一段时间自动画一张，也可以点右上角「立即画一张」",
      badgeOk: "已出图",
      badgeNoSvg: "未检出 SVG",
      tookMs: "用时",
      close: "关闭",
      started: "已开始绘制，画完会自动出现在列表里",
      failed: "绘制失败",
      loadFailed: "列表加载失败",
      errorLabel: "上次错误",
      placeholder: "没有可预览的 SVG",
    };
    const en = {
      nav: "Pelican Watch",
      title: "Pelican Watch",
      subtitle: "The same pelican-on-a-bicycle prompt on a schedule — a model-quality probe",
      runNow: "Draw now",
      running: "Drawing…",
      nextRun: "Next {time}",
      maxNote: "Keeps the latest {n}; older ones are pruned",
      empty: "Nothing drawn yet",
      emptyHint: "The scheduler draws on its interval, or click “Draw now”",
      badgeOk: "SVG ok",
      badgeNoSvg: "No SVG found",
      tookMs: "Took",
      close: "Close",
      started: "Started — the result appears in the list automatically",
      failed: "Drawing failed",
      loadFailed: "Failed to load the list",
      errorLabel: "Last error",
      placeholder: "No SVG to preview",
    };

    // ── styles ──────────────────────────────────────────────────────────
    const s = {
      root: { display: "flex", flexDirection: "column", gap: "16px", height: "100%", minHeight: 0 },
      headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" },
      headerLead: { flex: "1 1 0", minWidth: 0 },
      headerActions: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flex: "0 0 auto" },
      title: { margin: 0, fontSize: "18px", fontWeight: 700, lineHeight: "26px" },
      subtitle: { margin: "3px 0 0", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      btn: { cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-primary)", font: "inherit", fontSize: "12.5px", borderRadius: "8px", padding: "6px 12px", whiteSpace: "nowrap" },
      btnPrimary: { cursor: "pointer", border: "1px solid transparent", background: "var(--dsw-accent, #6366f1)", color: "#fff", font: "inherit", fontSize: "12.5px", borderRadius: "8px", padding: "6px 12px", whiteSpace: "nowrap" },
      btnDisabled: { opacity: 0.45, cursor: "not-allowed" },
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
      }, [state]);

      const runNow = async () => {
        setBusy(true);
        try {
          await fetch("/api/pelican-watch/run", { method: "POST", credentials: "include" });
          setToast(t("started"));
          setTimeout(load, 2500);
        } catch (error) {
          setToast(t("failed") + "：" + error.message);
        } finally {
          setBusy(false);
        }
      };

      const markPreviewFailed = (id) => {
        setFailedPreviews((prev) => { if (prev.has(id)) return prev; const next = new Set(prev); next.add(id); return next; });
      };

      const images = state.status === "ready" && Array.isArray(state.images) ? state.images : [];

      const renderHeader = () => react.createElement("header", { style: s.headerRow },
        react.createElement("div", { style: s.headerLead },
          react.createElement("h1", { style: s.title }, t("title")),
          react.createElement("p", { style: s.subtitle }, (t("subtitle") + " · " + t("maxNote").replace("{n}", String(state.maxImages || 12)) + (state.model ? " · " + state.model : "")))
        ),
        react.createElement("div", { style: s.headerActions },
          state.status === "ready" && state.nextRunAt && !state.running
            ? react.createElement("span", { style: s.cardMeta }, t("nextRun").replace("{time}", fmtTime(state.nextRunAt)))
            : null,
          state.running ? react.createElement("span", { style: s.cardMeta }, t("running")) : null,
          react.createElement(Btn, { primary: true, disabled: busy || state.running, onClick: runNow }, busy || state.running ? t("running") : t("runNow"))
        )
      );

      const renderCard = (img) => react.createElement("article", { key: img.id, style: s.card, onClick: () => setSelected(img) },
        img.hasSvg && !failedPreviews.has(img.id)
          ? react.createElement("img", { src: `/api/pelican-watch/image?id=${encodeURIComponent(img.id)}`, alt: "", loading: "lazy", style: s.preview, onError: () => markPreviewFailed(img.id) })
          : react.createElement("div", { style: s.placeholder }, img.ok ? t("placeholder") : t("badgeNoSvg")),
        react.createElement("div", { style: s.cardFoot },
          react.createElement("div", { style: s.cardModel }, img.model || img.id),
          react.createElement("div", { style: s.cardMeta }, fmtTime(img.time) + (img.ms !== null ? " · " + fmtMs(img.ms) : ""))
        ),
        react.createElement(Badge, { ok: img.ok, t })
      );

      const renderBody = () => {
        if (state.status !== "ready") {
          return react.createElement("div", { style: s.empty, ref: contentRef },
            react.createElement("div", { style: s.emptyGlyph }, state.status === "error" ? "⚠️" : "🎨"),
            react.createElement("div", null, state.status === "error" ? t("loadFailed") : t("empty")));
        }
        if (images.length === 0) {
          return react.createElement("div", { style: s.empty, ref: contentRef },
            react.createElement("div", { style: s.emptyGlyph }, "🦩"),
            react.createElement("div", { style: { fontWeight: 600 } }, t("empty")),
            react.createElement("div", { style: { fontSize: "12.5px" } }, t("emptyHint")),
            state.lastError ? react.createElement("div", { style: s.error }, t("errorLabel") + "：" + state.lastError) : null);
        }
        return react.createElement("div", { style: s.grid, ref: contentRef }, images.map(renderCard));
      };

      const renderDrawer = () => {
        if (!selected) return null;
        return react.createElement("div", null,
          react.createElement("div", { style: s.backdrop, onClick: () => setSelected(null) }),
          react.createElement("aside", { style: s.drawer, role: "dialog", "aria-label": selected.id },
            react.createElement("div", { style: s.drawerHead },
              react.createElement("h2", { style: s.drawerTitle }, selected.id),
              react.createElement(Btn, { onClick: () => setSelected(null), "aria-label": t("close") }, "✕")),
            react.createElement("div", { style: s.drawerMeta },
              (selected.model || "") + " · " + fmtTime(selected.time) +
              (selected.ms !== null ? " · " + t("tookMs") + " " + fmtMs(selected.ms) : "") +
              (selected.bytes ? " · " + Math.round(selected.bytes / 1024) + "KB" : "")),
            react.createElement("div", { style: s.drawerBody },
              raw !== null
                ? react.createElement("iframe", { srcDoc: raw, sandbox: "", title: selected.id, style: s.frame })
                : react.createElement("div", { style: s.placeholder }, "…"))));
      };

      return react.createElement("div", { style: s.root },
        renderHeader(), renderBody(), renderDrawer(), toast ? react.createElement("div", { style: s.toast }, toast) : null);
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

    return { apply };
  },
});
