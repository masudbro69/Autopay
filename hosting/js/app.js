/* ============================================================
   Autopay — application shell, router and views
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const t = (k) => window.I18N.t(k);
  const lang = () => window.I18N.getLang();

  const state = { user: null, profile: null, wallet: { balance: 0 }, route: "overview" };

  /* ---------------- helpers ---------------- */
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const fmt = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const money = (n) => "৳" + fmt(n);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toMs(v) {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (v instanceof Date) return v.getTime();
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const fmtDate = (v) => (v ? new Date(toMs(v)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const fmtDateTime = (v) => (v ? new Date(toMs(v)).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

  function errMsg(e) {
    const code = e && e.code;
    if (code === "insufficient-funds") return t("insufficientFunds");
    if (code === "otp-required") return t("otpRequired");
    if (code === "not-found") return t("notFound");
    if (code === "link-inactive") return t("payAlreadyPaid");
    if (code === "link-expired") return t("payExpired");
    if (code === "invalid-credentials") return t("invalidCreds");
    if (code === "email-exists") return t("emailExists");
    if (code === "permission-denied") return t("permissionDenied");
    if (code === "google-unavailable") return t("googleUnavailable");
    if (code === "functions/not-found" || code === "internal" || code === "unavailable") return t("backendNotDeployed");
    return (e && e.message) || "Error";
  }

  function initials(name) {
    return String(name || "?")
      .trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  }
  const AV_COLORS = ["#0e9f6e", "#e2136e", "#1a56db", "#8c3494", "#f59e0b", "#e4002b"];
  function colorFor(name) {
    let h = 0; const s = String(name || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AV_COLORS[h % AV_COLORS.length];
  }

  /* ---------------- icons ---------------- */
  const ICONS = {
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    wallet: '<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 5h4v2h-4z"/>',
    card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    payout: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  };
  function icon(name, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  }
  function logoMark(size = 36) {
    return `<span class="logo-mark" style="width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" fill="currentColor" width="${Math.round(size * 0.56)}" height="${Math.round(size * 0.56)}"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>`;
  }
  function googleLogo(size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
  }

  /* ---------------- gateway metadata ---------------- */
  const GW = {
    wallet: { label: "Autopay Wallet", short: "AP", color: "#0e9f6e", otp: false },
    bkash: { label: "bKash", short: "bK", color: "#e2136e", otp: true },
    nagad: { label: "Nagad", short: "NG", color: "#f6921e", otp: true },
    rocket: { label: "Rocket", short: "RK", color: "#8c3494", otp: true },
    upay: { label: "Upay", short: "UP", color: "#e4002b", otp: true },
    card: { label: "Visa / Mastercard", short: "VC", color: "#1a56db", otp: true },
    bank: { label: "Bank Transfer", short: "BK", color: "#334155", otp: false },
  };
  const gwShort = (id) => (GW[id] && GW[id].short) || "?";
  const gwColor = (id) => (GW[id] && GW[id].color) || "#64748b";
  const gwLabel = (id) => (GW[id] && GW[id].label) || id;

  function userName(id) {
    if (!id) return "—";
    return String(id).slice(0, 10);
  }

  // Platform fee helpers (mirrors the Cloud Functions fee engine)
  function feeConfig() {
    return (window.APP_CONFIG && window.APP_CONFIG.fee) || { rate: 0.02, minFee: 5, maxFee: 500, currency: "BDT" };
  }
  function calcFee(amount) {
    const f = feeConfig();
    const amt = round2(amount);
    if (amt <= 0) return 0;
    return round2(Math.min(Math.max(amt * (f.rate || 0), f.minFee || 0), f.maxFee || Infinity));
  }
  function feeRateText() {
    const f = feeConfig();
    return Math.round((f.rate || 0) * 100) + "%";
  }

  /* ---------------- toast & modal ---------------- */
  function toast(msg, type = "ok") {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = `<span class="t-ico">${type === "err" ? "✕" : "✓"}</span><span>${esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, 3200);
  }
  function openModal(html) {
    $("#modal-root").innerHTML = `<div class="modal-backdrop" data-backdrop><div class="modal">${html}</div></div>`;
    const backdrop = $("[data-backdrop]");
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
    $$("[data-x]", backdrop).forEach((b) => b.addEventListener("click", closeModal));
    return backdrop;
  }
  function closeModal() { $("#modal-root").innerHTML = ""; }

  function copyText(text, notify = false) {
    const done = () => { if (notify) toast(t("copied")); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done).catch(() => {});
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (e) { /* ignore */ }
  }

  /* ---------------- router ---------------- */
  function currentRoute() {
    const h = location.hash.replace(/^#\/app\/?/, "");
    return h || "overview";
  }
  function goto(hash) { location.hash = hash; }
  function isMerchant() { return state.profile && state.profile.role === "merchant"; }

  function render() {
    const h = location.hash || "#/";
    if (h.startsWith("#/pay/")) return renderCheckout(h.slice(6));
    if (h.startsWith("#/app")) {
      if (!state.user) { return renderAuth(); }
      state.route = currentRoute();
      return renderApp();
    }
    if (h.startsWith("#/auth")) return renderAuth();
    return renderLanding();
  }

  /* ================= LANDING ================= */
  function renderLanding() {
    $("#app").innerHTML = `
      <div class="landing-top">
        <div class="container">
          <div class="land-nav flex between">
            <div class="logo">${logoMark()} <span>Autopay</span></div>
            <div class="flex gap-12">
              <div class="lang-toggle">
                <button data-lang="bn" class="${lang() === "bn" ? "on" : ""}">বাং</button>
                <button data-lang="en" class="${lang() === "en" ? "on" : ""}">EN</button>
              </div>
              <button class="btn btn-outline" data-auth="login">${t("login")}</button>
              <button class="btn btn-primary" data-auth="signup">${t("getStarted")}</button>
            </div>
          </div>
          <div class="hero">
            <div class="hero-inner">
              <div>
                <span class="hero-badge"><span class="dot"></span>${t("heroBadge")}</span>
                <h1>${t("heroTitle")} <span class="grad">${t("heroTitleGrad")}</span></h1>
                <p class="lead">${t("heroLead")}</p>
                <div class="hero-ctas">
                  <button class="btn btn-primary btn-lg" data-auth="signup">${t("getStarted")} ${icon("arrowRight")}</button>
                  <button class="btn btn-outline btn-lg" data-auth="login">${t("login")}</button>
                </div>
                <div class="hero-stats">
                  <div class="hs"><b>${t("statSetupV")}</b><span>${t("statSetup")}</span></div>
                  <div class="hs"><b>${t("statFeeV")}</b><span>${t("statFee")}</span></div>
                  <div class="hs"><b>${t("statAutoV")}</b><span>${t("statAuto")}</span></div>
                  <div class="hs"><b>${t("statInstantV")}</b><span>${t("statInstant")}</span></div>
                </div>
              </div>
              <div class="phone-mock">
                <div class="pm-head"><span class="logo" style="font-size:15px">${logoMark(28)} Autopay</span><span class="badge badge-green"><span class="dot"></span>${t("liveNotice")}</span></div>
                <div class="pm-balance"><small>${t("dashBalance")}</small><b>${money(0)}</b>
                  <div class="flex between small" style="opacity:.9"><span>${t("wallet")} · BDT</span><span>${t("feeRateLabel")} ${feeRateText()}</span></div>
                </div>
                <div class="mt-8">
                  ${pmRow("bkash", "bKash", "bKash", t("statusActive"), "—")}
                  ${pmRow("nagad", "Nagad", "Nagad", t("statusActive"), "—")}
                  ${pmRow("card", "VC", "Visa/Mastercard", t("statusActive"), "—")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="section container">
        <div class="section-head"><span class="kicker">${t("featKicker")}</span><h2>${t("featTitle")}</h2><p>${t("featSub")}</p></div>
        <div class="feature-grid">
          ${feature(t("feat1Title"), t("feat1Desc"), "zap")}
          ${feature(t("feat2Title"), t("feat2Desc"), "refresh")}
          ${feature(t("feat3Title"), t("feat3Desc"), "banknote")}
          ${feature(t("feat4Title"), t("feat4Desc"), "link")}
          ${feature(t("feat5Title"), t("feat5Desc"), "download")}
          ${feature(t("feat6Title"), t("feat6Desc"), "shield")}
        </div>
      </div>

      <div class="section container" style="padding-top:0">
        <div class="section-head"><span class="kicker">${t("howKicker")}</span><h2>${t("howTitle")}</h2><p>${t("howSub")}</p></div>
        <div class="how-grid">
          <div class="how-step"><div class="num">1</div><h3>${t("how1Title")}</h3><p>${t("how1Desc")}</p></div>
          <div class="how-step"><div class="num">2</div><h3>${t("how2Title")}</h3><p>${t("how2Desc")}</p></div>
          <div class="how-step"><div class="num">3</div><h3>${t("how3Title")}</h3><p>${t("how3Desc")}</p></div>
        </div>
        <div class="methods-strip">
          ${["bkash", "nagad", "rocket", "upay", "card", "bank", "wallet"].map((m) => `<span class="method-pill"><span style="width:9px;height:9px;border-radius:50%;background:${gwColor(m)}"></span>${gwLabel(m)}</span>`).join("")}
        </div>
      </div>

      <div class="section container" style="padding-top:0">
        <div class="section-head"><span class="kicker">${t("pricingKicker")}</span><h2>${t("pricingTitle")}</h2><p>${t("pricingSub")}</p></div>
        <div class="pricing">
          <div class="price-card"><h3>${t("planStarter")}</h3><div class="price">${t("planStarterPrice")}</div>
            <p class="card-sub">${t("planStarterFee")}</p>
            <ul><li>${t("planItem1")}</li><li>${t("planItem2")}</li><li>${t("planItem3")}</li><li>${t("planItem4")}</li></ul>
            <button class="btn btn-outline btn-block" data-auth="signup">${t("choosePlan")}</button></div>
          <div class="price-card hot"><span class="pop-tag">POPULAR</span><h3>${t("planGrowth")}</h3><div class="price">${t("planGrowthPrice")}</div>
            <p class="card-sub">${t("planGrowthFee")} · ${t("planSoon")}</p>
            <ul><li>${t("planItem1")}</li><li>${t("planItem2")}</li><li>${t("planItem3")}</li><li>${t("planItem4")}</li><li>${t("planItem5")}</li><li>${t("planItem6")}</li></ul>
            <button class="btn btn-primary btn-block" data-auth="signup">${t("choosePlan")}</button></div>
          <div class="price-card"><h3>${t("planScale")}</h3><div class="price">${t("planScalePrice")}</div>
            <p class="card-sub">${t("planScaleFee")} · ${t("planSoon")}</p>
            <ul><li>${t("planItem1")}</li><li>${t("planItem2")}</li><li>${t("planItem3")}</li><li>${t("planItem7")}</li><li>${t("planItem8")}</li></ul>
            <button class="btn btn-outline btn-block" data-auth="signup">${t("choosePlan")}</button></div>
        </div>
      </div>

      <div class="container">
        <div class="cta-band"><h2>${t("ctaTitle")}</h2><p>${t("ctaSub")}</p><button class="btn btn-lg" data-auth="signup">${t("ctaBtn")} ${icon("arrowRight")}</button></div>
      </div>

      <footer>
        <div class="container">
          <div class="foot-grid">
            <div><div class="logo">${logoMark()} <span>Autopay</span></div><p class="mt-8" style="max-width:260px">${t("footDesc")}</p></div>
            <div class="foot-col"><h4>${t("footProduct")}</h4><ul><li>${t("footFees")}</li><li>${t("footAutoPay")}</li><li>${t("footCheckout")}</li><li>${t("footWallet")}</li></ul></div>
            <div class="foot-col"><h4>${t("footCompany")}</h4><ul><li>${t("footAbout")}</li><li>${t("footBlog")}</li><li>${t("footCareers")}</li></ul></div>
            <div class="foot-col"><h4>${t("footResources")}</h4><ul><li>${t("footDocs")}</li><li>${t("footApi")}</li><li>${t("footStatus")}</li></ul></div>
          </div>
          <div class="foot-bottom"><span>© ${new Date().getFullYear()} Autopay. ${t("footRights")}</span><span>${window.API.backend.live ? t("liveNotice") : t("sandboxNotice")} · v1.0</span></div>
        </div>
      </footer>`;
    $$("[data-lang]").forEach((b) => b.addEventListener("click", () => { window.I18N.setLang(b.dataset.lang); render(); }));
    $$("[data-auth]").forEach((b) => b.addEventListener("click", () => goto("#/auth?mode=" + b.dataset.auth)));
    window.scrollTo(0, 0);
  }

  function feature(title, desc, ic) {
    return `<div class="feature"><div class="f-ico">${icon(ic, 24)}</div><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>`;
  }
  function pmRow(method, short, label, status, amount) {
    return `<div class="pm-row"><span class="pm-ico" style="background:${gwColor(method)}">${short}</span><div class="grow"><b>${esc(label)}</b><div class="small muted">${esc(status)}</div></div><b class="text-success">${amount}</b></div>`;
  }

  /* ================= AUTH ================= */
  let authMode = "login";
  function renderAuth() {
    const m = new URLSearchParams(location.hash.split("?")[1] || "");
    authMode = m.get("mode") === "signup" ? "signup" : "login";
    const isSignup = authMode === "signup";

    $("#app").innerHTML = `
      <div class="auth-wrap">
        <div class="auth-side">
          <div class="logo">${logoMark()} <span>Autopay</span></div>
          <div><h1>${t("heroTitle")} <br>${t("heroTitleGrad")}</h1><p>${t("heroLead")}</p></div>
          <div class="methods-strip" style="justify-content:flex-start;margin-top:24px">
            ${["bkash", "nagad", "rocket", "upay", "card"].map((mm) => `<span class="method-pill" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:#fff"><span style="width:9px;height:9px;border-radius:50%;background:${gwColor(mm)}"></span>${gwLabel(mm)}</span>`).join("")}
          </div>
        </div>
        <div class="auth-form-side">
          <div class="auth-card">
            <h2>${isSignup ? t("createAccount") : t("welcomeBack")}</h2>
            <p class="muted mb-24">${isSignup ? t("signupSub") : t("loginSub")}</p>
            <form data-auth-form>
              ${isSignup ? `
                <div class="field"><label>${t("name")}</label><input class="input" name="name" placeholder="Rahim Uddin" required></div>
                <div class="field"><label>${t("company")}</label><input class="input" name="company" placeholder="Rahim Traders"></div>` : ""}
              <div class="field"><label>${t("email")}</label><input class="input" name="email" type="email" placeholder="you@example.com" required></div>
              ${isSignup ? `<div class="field"><label>${t("phone")}</label><input class="input" name="phone" placeholder="017XXXXXXXX"></div>` : ""}
              <div class="field"><label>${t("password")}</label><input class="input" name="password" type="password" placeholder="••••••••" required></div>
              ${isSignup ? `<label class="flex gap-8 mb-16" style="cursor:pointer"><input type="checkbox" name="role" value="merchant"> <span>${t("iAmMerchant")}</span></label>` : ""}
              <button class="btn btn-primary btn-lg btn-block" type="submit">${isSignup ? t("createAccount") : t("login")} ${icon("arrowRight")}</button>
            </form>
            <div class="flex center gap-8 mt-16" style="align-items:center"><span style="height:1px;background:var(--line);flex:1"></span><span class="small muted">${t("or")}</span><span style="height:1px;background:var(--line);flex:1"></span></div>
            ${window.API.backend.live ? `
              <button class="btn btn-outline btn-lg btn-block mt-16" data-google style="gap:10px">${googleLogo(18)} ${t("continueGoogle")}</button>
              <p class="small muted tac mt-8">${t("googleNote")}</p>` : ""}
            <p class="tac small mt-16">${isSignup ? t("haveAccount") : t("noAccount")} <a href="#/auth?mode=${isSignup ? "login" : "signup"}">${isSignup ? t("login") : t("signup")}</a></p>
          </div>
        </div>
      </div>`;

    $$("[data-lang]").forEach((b) => b.addEventListener("click", () => { window.I18N.setLang(b.dataset.lang); render(); }));
    $$("[data-google]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const u = await window.API.auth.signInWithGoogle();
        // Ensure the Firestore profile + wallet exist for Google users.
        try { await window.API.backend.register({ name: u.name || "", role: "customer" }); } catch (e) { /* non-fatal */ }
        await finishAuth();
      } catch (err) {
        const code = err && err.code;
        if (code === "auth/popup-blocked") toast(t("popupBlocked"), "err");
        else if (code === "auth/popup-closed-by-user") { /* silent */ }
        else if (code === "google-unavailable") toast(t("googleUnavailable"), "err");
        else toast((err && err.message) || "Error", "err");
      } finally { b.disabled = false; }
    }));
    const form = $("[data-auth-form]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = fd.get("email"), password = fd.get("password");
      if (!email || !password) return toast(t("fillAll"), "err");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (isSignup) {
          await window.API.auth.signUp(email, password, {
            name: fd.get("name") || "", company: fd.get("company") || "", phone: fd.get("phone") || "",
            role: fd.get("role") ? "merchant" : "customer",
          });
          await window.API.backend.register({ name: fd.get("name") || "", company: fd.get("company") || "", phone: fd.get("phone") || "", role: fd.get("role") ? "merchant" : "customer" });
        } else {
          await window.API.auth.signIn(email, password);
        }
        await finishAuth();
      } catch (err) {
        const code = err && err.code;
        toast(code === "invalid-credentials" ? t("invalidCreds") : code === "email-exists" ? t("emailExists") : (err && err.message) || "Error", "err");
      } finally { btn.disabled = false; }
    });
  }

  async function finishAuth() {
    await loadProfile();
    const next = new URLSearchParams(location.hash.split("?")[1] || "").get("next");
    goto(next || "#/app");
  }

  async function loadProfile() {
    try {
      const r = await window.API.backend.getProfile();
      state.profile = r.user || {};
      state.wallet = r.wallet || { balance: 0 };
    } catch (e) { state.profile = { role: "customer" }; }
    // Detect platform owner (unlocks the Earnings dashboard).
    state.isOwner = false;
    try {
      const er = await window.API.backend.getEarnings();
      state.isOwner = !!(er && er.isOwner);
      state.earnings = er;
    } catch (e) { state.isOwner = false; }
  }

  function isOwner() { return !!state.isOwner; }

  /* ================= APP SHELL ================= */
  const ROUTE_TITLES = {
    overview: "navOverview", wallet: "navWallet", links: "navLinks", invoices: "navInvoices",
    plans: "navPlans", subscriptions: "navSubscriptions", transactions: "navTransactions",
    customers: "navCustomers", payouts: "navPayouts", settings: "navSettings", earnings: "navEarnings",
  };

  function navItems() {
    const common = [
      { key: "overview", icon: "home" },
      { key: "wallet", icon: "wallet" },
      { key: "transactions", icon: "list" },
      { key: "settings", icon: "settings" },
    ];
    const items = [];
    items.push(common[0]);
    if (isOwner()) items.push({ key: "earnings", icon: "gift" });
    if (isMerchant()) {
      items.push(
        { key: "links", icon: "link" },
        { key: "invoices", icon: "file" },
        { key: "plans", icon: "repeat" },
        { key: "subscriptions", icon: "refresh" },
        common[1],
        { key: "transactions", icon: "list" },
        { key: "payouts", icon: "payout" },
        { key: "customers", icon: "users" },
        { key: "settings", icon: "settings" }
      );
    } else {
      items.push(
        common[1],
        { key: "links", icon: "link" },
        { key: "subscriptions", icon: "refresh" },
        { key: "transactions", icon: "list" },
        { key: "settings", icon: "settings" }
      );
    }
    return items;
  }

  function shell(body) {
    const nav = navItems().map((i) => `
      <a class="nav-item ${state.route === i.key ? "active" : ""}" href="#/app/${i.key}">${icon(i.icon)} <span>${t(ROUTE_TITLES[i.key])}</span></a>`).join("");

    return `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <a class="logo" href="#/app">${logoMark()} <span>Autopay</span></a>
          <div class="nav-label">${t("appName")}</div>
          ${nav}
          <div class="sidebar-foot">
            <div class="user-chip">
              <div class="avatar" style="background:${colorFor(state.user ? state.user.name : "")}">${initials(state.user ? state.user.name : "")}</div>
              <div class="grow"><b>${esc((state.user && state.user.name) || "")}</b><div class="small muted">${isMerchant() ? t("merchantAccount") : t("customerAccount")}</div></div>
              <button class="btn btn-ghost btn-sm" data-logout title="${t("logout")}">${icon("logout", 17)}</button>
            </div>
          </div>
        </aside>
        <div class="sidebar-backdrop" data-close-sidebar></div>
        <main class="grow">
          <header class="topbar">
            <button class="hamburger" data-open-sidebar>${icon("menu", 20)}</button>
            <h1>${t(ROUTE_TITLES[state.route])}</h1>
            <div class="spacer"></div>
            ${window.API.backend.live ? `<span class="badge badge-green"><span class="dot"></span>${t("liveNotice")}</span>` : `<span class="badge badge-amber">${icon("zap", 13)} ${t("sandboxNotice")}</span>`}
            <div class="lang-toggle">
              <button data-lang="bn" class="${lang() === "bn" ? "on" : ""}">বাং</button>
              <button data-lang="en" class="${lang() === "en" ? "on" : ""}">EN</button>
            </div>
          </header>
          <div class="content">${body}</div>
        </main>
      </div>`;
  }

  function bindShell() {
    $$("[data-lang]").forEach((b) => b.addEventListener("click", () => { window.I18N.setLang(b.dataset.lang); render(); }));
    $$("[data-open-sidebar]").forEach((b) => b.addEventListener("click", () => $("#sidebar").classList.add("open")));
    $$("[data-close-sidebar]").forEach((b) => b.addEventListener("click", () => $("#sidebar").classList.remove("open")));
    $$("[data-logout]").forEach((b) => b.addEventListener("click", async () => {
      await window.API.auth.signOut();
      state.user = null; state.profile = null;
      goto("#/");
    }));
    $$(".sidebar .nav-item").forEach((a) => a.addEventListener("click", () => $("#sidebar").classList.remove("open")));
  }

  /* ================= VIEWS ================= */
  async function renderApp() {
    let body = `<div class="empty">${t("loading")}</div>`;
    $("#app").innerHTML = shell(body);
    bindShell();
    try {
      switch (state.route) {
        case "overview": body = await viewOverview(); break;
        case "wallet": body = await viewWallet(); break;
        case "links": body = await viewLinks(); break;
        case "invoices": body = await viewInvoices(); break;
        case "plans": body = await viewPlans(); break;
        case "subscriptions": body = await viewSubscriptions(); break;
        case "transactions": body = await viewTransactions(); break;
        case "customers": body = await viewCustomers(); break;
        case "payouts": body = await viewPayouts(); break;
        case "earnings": body = await viewEarnings(); break;
        case "settings": body = await viewSettings(); break;
        default: body = await viewOverview();
      }
    } catch (e) {
      body = `<div class="empty"><div class="e-ico">${icon("x", 30)}</div>${esc(e.message || "Error")}</div>`;
    }
    $("#app").innerHTML = shell(body);
    bindShell();
    bindRoute();
    window.scrollTo(0, 0);
  }

  function bindRoute() {
    const r = state.route;
    if (r === "overview") bindOverview();
    if (r === "wallet") bindWallet();
    if (r === "links") bindLinks();
    if (r === "invoices") bindInvoices();
    if (r === "plans") bindPlans();
    if (r === "subscriptions") bindSubscriptions();
    if (r === "transactions") bindTransactions();
    if (r === "payouts") bindPayouts();
    if (r === "earnings") bindEarnings();
    if (r === "settings") bindSettings();
  }

  /* ---------- shared: txn rendering ---------- */
  function txnTypeLabel(type) {
    return ({ topup: t("txnTopup"), payment: t("txnPayment"), invoice: t("txnInvoice"), subscription: t("txnSubscription"), payout: t("txnPayout"), refund: t("txnRefund"), fee: t("platformFee") })[type] || type || "—";
  }
  function txnRow(txn) {
    const me = state.user.uid;
    const incoming = txn.toUid === me;
    const topup = txn.type === "topup" && txn.toUid === me;
    const cls = topup ? "topup" : incoming ? "in" : "out";
    const sign = incoming ? "+" : "−";
    const icn = topup ? "arrowDown" : incoming ? "arrowDown" : "arrowRight";
    const other = incoming ? txn.fromUid : txn.toUid;
    const who = topup ? gwLabel(txn.method) : txn.type === "payout" && !txn.toUid ? gwLabel(txn.method) : userName(other);
    return `
      <div class="txn-row">
        <span class="txn-ico ${cls}">${icon(icn)}</span>
        <div class="grow">
          <b>${esc(txn.description || txnTypeLabel(txn.type))}</b>
          <div class="small muted">${txnTypeLabel(txn.type)} · ${who} · ${gwLabel(txn.method)}</div>
        </div>
        <div class="tar">
          <b class="${incoming ? "text-success" : "text-danger"}">${sign}${money(txn.amount)}</b>
          <div class="small muted">${fmtDateTime(txn.createdAt)}</div>
        </div>
      </div>`;
  }
  function emptyState(msg, ic = "list") {
    return `<div class="empty"><div class="e-ico">${icon(ic, 30)}</div><p>${esc(msg)}</p></div>`;
  }
  function statusBadge(status) {
    const map = {
      active: ["badge-green", t("statusActive")],
      paid: ["badge-blue", t("statusPaid")],
      open: ["badge-amber", t("statusOpen")],
      expired: ["badge-gray", t("statusExpired")],
      cancelled: ["badge-gray", t("statusCancelled")],
      processing: ["badge-amber", t("statusProcessing")],
      success: ["badge-green", t("statusSuccess")],
      failed: ["badge-red", t("statusFailed")],
    };
    const m = map[status] || ["badge-gray", status || "—"];
    return `<span class="badge ${m[0]}"><span class="dot"></span>${m[1]}</span>`;
  }
  function feeNote() {
    const f = feeConfig();
    return `<div class="fee-note">${icon("shield")} <span>${t("platformFee")}: ${feeRateText()} (${money(f.minFee)} – ${money(f.maxFee)})</span></div>`;
  }

  /* ---------- overview ---------- */
  async function viewOverview() {
    const d = await window.API.backend.getDashboard();
    state.wallet = d.wallet;
    const me = state.user.uid;
    const recent = d.recent || [];
    const merchant = isMerchant();

    // 14-day chart
    const days = [];
    const nowMs = Date.now();
    for (let i = 13; i >= 0; i--) {
      const start = nowMs - i * 864e5 - (nowMs % 864e5);
      days.push({ start, end: start + 864e5, label: new Date(start).getDate(), v: 0 });
    }
    recent.forEach((tx) => {
      const ms = toMs(tx.createdAt);
      const bucket = days.find((bd) => ms >= bd.start && ms < bd.end);
      const val = tx.toUid === me ? tx.amount : 0;
      if (bucket) bucket.v += val;
    });
    const maxV = Math.max(1, ...days.map((x) => x.v));
    const chart = `<div class="chart">${days.map((bd) => `<div class="bar-wrap"><div class="bar" style="height:${Math.max(3, (bd.v / maxV) * 100)}%"></div><span class="bar-label">${bd.label}</span></div>`).join("")}</div>`;

    // upcoming charges
    let upcoming = [];
    let subsList = [];
    try {
      if (merchant) { const r = await window.API.backend.listMerchantSubscriptions(); subsList = r.subscriptions || []; }
      else { const r = await window.API.backend.listSubscriptions(); subsList = r.subscriptions || []; }
    } catch (e) { subsList = []; }
    upcoming = subsList.filter((s) => s.status === "active").sort((a, b) => toMs(a.nextChargeAt) - toMs(b.nextChargeAt)).slice(0, 5);

    const upHtml = upcoming.length
      ? upcoming.map((s) => `<div class="txn-row"><span class="txn-ico topup">${icon("refresh")}</span><div class="grow"><b>${esc(s.planName)}</b><div class="small muted">${merchant ? userName(s.customerId) : t("autopay")} · ${t(s.interval)}</div></div><div class="tar"><b>${money(s.amount)}</b><div class="small muted">${fmtDate(s.nextChargeAt)}</div></div></div>`).join("")
      : `<div class="small muted">${t("noUpcoming")}</div>`;

    const quick = merchant
      ? `<button class="btn btn-outline" data-qa="link">${icon("link")} ${t("qaNewLink")}</button>
         <button class="btn btn-outline" data-qa="invoice">${icon("file")} ${t("qaNewInvoice")}</button>
         <button class="btn btn-outline" data-qa="plan">${icon("repeat")} ${t("qaNewPlan")}</button>
         <button class="btn btn-outline" data-qa="topup">${icon("plus")} ${t("qaTopUp")}</button>`
      : `<button class="btn btn-outline" data-qa="topup">${icon("plus")} ${t("qaTopUp")}</button>
         <button class="btn btn-outline" data-qa="subs">${icon("refresh")} ${t("navSubscriptions")}</button>`;

    const stats = d.stats || {};
    const statCards = `
      <div class="stat tone-green"><div class="flex between"><span class="s-label">${t("dashBalance")}</span><span class="s-ico">${icon("wallet")}</span></div><div class="s-value">${money(stats.balance || 0)}</div><div class="s-sub">${t("wallet")} · BDT</div></div>
      <div class="stat tone-blue"><div class="flex between"><span class="s-label">${merchant ? t("dashReceived") : t("dashPaid")}</span><span class="s-ico">${icon("trending")}</span></div><div class="s-value">${money(merchant ? stats.totalReceived : stats.totalPaid)}</div><div class="s-sub">${t("dashSeeAll")} → <a href="#/app/transactions">${t("navTransactions")}</a></div></div>
      <div class="stat tone-red"><div class="flex between"><span class="s-label">${t("feeRateLabel")}</span><span class="s-ico">${icon("gift")}</span></div><div class="s-value">${feeRateText()}</div><div class="s-sub">${t("platformFee")} · ${t("amount")} +</div></div>
      <div class="stat tone-amber"><div class="flex between"><span class="s-label">${merchant ? t("dashSubs") : t("dashSubs")}</span><span class="s-ico">${icon("refresh")}</span></div><div class="s-value">${subsList.filter((s) => s.status === "active").length}</div><div class="s-sub">${t("navSubscriptions")}</div></div>`;

    return `
      <div class="page-head">
        <div><h2>${t("welcome")}, ${esc((state.user && state.user.name) || "")} 👋</h2><p>${t("tagline")}</p></div>
        <button class="btn btn-primary" data-qa="${merchant ? "link" : "topup"}">${icon("plus")} ${merchant ? t("qaNewLink") : t("qaTopUp")}</button>
      </div>
      <div class="stat-grid">${statCards}</div>
      <div class="grid-2">
        <div class="card card-pad">
          <div class="flex between mb-8"><h3 class="card-title">${t("dashRevenue")}</h3></div>
          ${chart}
        </div>
        <div class="card card-pad">
          <h3 class="card-title">${t("dashQuick")}</h3>
          <div class="flex col gap-8 mt-16" style="align-items:stretch">${quick}</div>
          <h3 class="card-title mt-24">${t("upNext")}</h3>
          <div class="mt-8">${upHtml}</div>
        </div>
      </div>
      <div class="card mt-16">
        <div class="card-pad">
          <div class="flex between mb-8"><h3 class="card-title">${t("dashRecent")}</h3><a class="small text-brand" href="#/app/transactions">${t("dashSeeAll")} ${icon("arrowRight", 13)}</a></div>
          ${recent.length ? recent.slice(0, 8).map(txnRow).join("") : emptyState(t("dashEmpty"))}
        </div>
      </div>`;
  }
  function bindOverview() {
    $$("[data-qa]").forEach((b) => b.addEventListener("click", () => {
      const q = b.dataset.qa;
      if (q === "link") goto("#/app/links");
      else if (q === "invoice") goto("#/app/invoices");
      else if (q === "plan") goto("#/app/plans");
      else if (q === "topup") openTopUp();
      else if (q === "subs") goto("#/app/subscriptions");
    }));
  }

  /* ---------- wallet ---------- */
  async function viewWallet() {
    const d = await window.API.backend.getDashboard();
    state.wallet = d.wallet;
    const balance = state.wallet.balance || 0;
    return `
      <div class="page-head"><div><h2>${t("walletTitle")}</h2><p>${t("walletSub")}</p></div>
        <button class="btn btn-primary" data-topup>${icon("plus")} ${t("addMoney")}</button></div>
      <div class="grid-2b">
        <div class="card card-pad">
          <div class="s-label muted">${t("walletBalance")}</div>
          <div class="amount-hero" style="text-align:left"><div class="big-amount"><span class="cur">৳</span>${fmt(balance)}</div></div>
          ${feeNote()}
          <div class="mt-16"><button class="btn btn-primary btn-lg" data-topup>${icon("plus")} ${t("addMoney")}</button></div>
        </div>
        <div class="card card-pad">
          <h3 class="card-title">${t("dashRecent")}</h3>
          <div class="mt-8">${(d.recent || []).slice(0, 6).map(txnRow).join("") || emptyState(t("dashEmpty"))}</div>
        </div>
      </div>`;
  }
  function bindWallet() {
    $$("[data-topup]").forEach((b) => b.addEventListener("click", openTopUp));
  }

  /* ---------- top-up flow (collect payment modal) ---------- */
  function openTopUp() {
    const methods = ["wallet", "bkash", "nagad", "rocket", "upay", "card"].filter((m) => m !== "wallet");
    collectPayment({ title: t("addMoney"), amountLabel: t("topupAmount"), methods, defaultMethod: "bkash", hasAmount: true, confirmWallet: false }).then(async (res) => {
      if (!res) return;
      if (res.amount <= 0) return toast(t("fillAll"), "err");
      try {
        const r = await window.API.backend.topUp({ method: res.method, amount: res.amount });
        if (res.method !== "wallet") {
          await window.API.backend.confirmTopUp({ method: res.method, paymentId: r.payment.paymentId, otp: res.otp, amount: res.amount });
        }
        toast(t("topupSuccess"));
        render();
      } catch (e) { toast(errMsg(e), "err"); }
    });
  }

  /* Generic payment collection modal. Returns Promise<{amount,method,otp}|null>. */
  function collectPayment(opts) {
    return new Promise((resolve) => {
      let method = opts.defaultMethod || "wallet";
      let otp = "";
      const methods = (opts.methods || ["wallet", "bkash", "nagad", "rocket", "upay", "card"]);
      const confirmWallet = opts.confirmWallet !== false;

      const backdrop = openModal(`
        <div class="modal-head"><h3>${esc(opts.title || t("payNow"))}</h3><button class="modal-x" data-x>×</button></div>
        <div class="modal-body">
          ${opts.hasAmount ? `<div class="field"><label>${esc(opts.amountLabel || t("topupAmount"))}</label>
            <div class="input-wrap"><span class="prefix">৳</span><input class="input" data-amount type="number" min="1" placeholder="500" value="${opts.fixedAmount || ""}" ${opts.fixedAmount ? "disabled" : ""}></div></div>` : `
            <div class="amount-hero"><span class="muted small">${t("topupAmount")}</span><div class="big-amount"><span class="cur">৳</span>${fmt(opts.fixedAmount || 0)}</div></div>`}
          ${feeNote()}
          <div class="field mt-16"><label>${t("selectMethod")}</label></div>
          <div class="method-grid" data-methods>
            ${methods.map((m) => `<button class="method-opt ${m === method ? "sel" : ""}" data-m="${m}">
              <span class="mo-ico" style="background:${gwColor(m)}">${gwShort(m)}</span>
              <span class="grow"><span class="mo-name">${esc(gwLabel(m))}</span><span class="mo-sub">${GW[m].otp ? "OTP" : t("wallet")}</span></span>
              <span class="mo-check">${m === method ? "✓" : ""}</span></button>`).join("")}
          </div>
          <div data-otp-wrap class="${method !== "wallet" && GW[method].otp ? "" : "hidden"} mt-16">
            <div class="field"><label>${t("otpTitle")}</label></div>
            ${!window.API.backend.live ? `<div class="fee-note mb-8" style="background:var(--blue-soft);border-color:#c7d8ff;color:#1e40af">${icon("phone")} ${t("sandboxNotice")} — ${t("otpIs")} <b>1234</b></div>` : ""}
            <input class="input" data-otp inputmode="numeric" placeholder="1234" maxlength="6">
          </div>
          <button class="btn btn-primary btn-lg btn-block mt-16" data-confirm>${t("payNow")} ${icon("arrowRight")}</button>
        </div>`);

      const amtInput = $("[data-amount]", backdrop);
      const otpWrap = $("[data-otp-wrap]", backdrop);
      const otpInput = $("[data-otp]", backdrop);
      const confirmBtn = $("[data-confirm]", backdrop);

      function setMethod(m) {
        method = m;
        $$("[data-m]", backdrop).forEach((b) => {
          const on = b.dataset.m === m;
          b.classList.toggle("sel", on);
          b.querySelector(".mo-check").textContent = on ? "✓" : "";
        });
        const needsOtp = method !== "wallet" && GW[method].otp;
        otpWrap.classList.toggle("hidden", !needsOtp);
        confirmBtn.innerHTML = (method === "wallet" && confirmWallet ? t("payFromWallet") : needsOtp ? t("confirmOtp") : t("payNow")) + " " + icon("arrowRight");
      }
      $$("[data-m]", backdrop).forEach((b) => b.addEventListener("click", () => setMethod(b.dataset.m)));

      confirmBtn.addEventListener("click", async () => {
        const amount = opts.fixedAmount != null ? opts.fixedAmount : Number(amtInput ? amtInput.value : 0);
        if (method === "wallet") { closeModal(); resolve({ amount, method: "wallet", otp: null }); return; }
        const o = (otpInput.value || "").trim();
        if (o.length < 4) { toast(t("otpTitle") + ": 1234", "err"); return; }
        closeModal();
        resolve({ amount, method, otp: o });
      });
      $("[data-x]", backdrop).addEventListener("click", () => { closeModal(); resolve(null); });
    });
  }

  /* ---------- links ---------- */
  async function viewLinks() {
    const r = await window.API.backend.listLinks();
    const links = r.links || [];
    const origin = location.origin + location.pathname;
    const rows = links.length ? links.map((l) => `
      <tr>
        <td><b>${money(l.amount)}</b></td>
        <td class="muted" style="max-width:240px"><span class="ellipsis" style="display:block">${esc(l.description || "—")}</span></td>
        <td>${statusBadge(l.status)}</td>
        <td class="muted">${fmtDate(l.createdAt)}</td>
        <td class="muted">${fmtDate(l.expiresAt)}</td>
        <td><div class="flex gap-8">
          <button class="btn btn-outline btn-sm" data-copy="${esc(l.id)}">${icon("copy", 14)} ${t("copyLink")}</button>
          <a class="btn btn-ghost btn-sm" href="#/pay/${esc(l.id)}" target="_blank">${icon("external", 14)}</a>
        </div></td>
      </tr>`).join("") : `<tr><td colspan="6">${emptyState(t("noLinks"), "link")}</td></tr>`;

    return `
      <div class="page-head"><div><h2>${t("linksTitle")}</h2><p>${t("linksSub")}</p></div>
        <button class="btn btn-primary" data-new>${icon("plus")} ${t("newLink")}</button></div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>${t("amount")}</th><th>${t("description")}</th><th>${t("status")}</th><th>${t("created")}</th><th>${t("expires")}</th><th>${t("actions")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindLinks() {
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
      const url = location.origin + location.pathname + "#/pay/" + b.dataset.copy;
      copyText(url, true);
    }));
    $$("[data-new]").forEach((b) => b.addEventListener("click", () => {
      openModal(`
        <div class="modal-head"><h3>${t("newLink")}</h3><button class="modal-x" data-x>×</button></div>
        <div class="modal-body">
          <div class="field"><label>${t("linkAmount")}</label><div class="input-wrap"><span class="prefix">৳</span><input class="input" data-amount type="number" min="1" placeholder="1000"></div></div>
          <div class="field"><label>${t("linkDesc")}</label><input class="input" data-desc placeholder="${t("linkDescPh")}"></div>
          <div class="field"><label>${t("linkExpiry")}</label><input class="input" data-days type="number" min="1" max="365" value="7"></div>
          ${feeNote()}
          <button class="btn btn-primary btn-lg btn-block mt-16" data-create>${t("createLink")}</button>
        </div>`);
      $("[data-create]").addEventListener("click", async () => {
        const amount = Number($("[data-amount]").value);
        const desc = $("[data-desc]").value;
        const days = Number($("[data-days]").value) || 7;
        if (!amount || amount <= 0) return toast(t("fillAll"), "err");
        const r = await window.API.backend.createLink({ amount, description: desc, expiresInDays: days });
        closeModal();
        toast(t("linkCreated"));
        render();
        // offer copy
        const url = location.origin + location.pathname + "#/pay/" + r.link.id;
        copyText(url);
      });
    }));
  }

  /* ---------- invoices ---------- */
  async function viewInvoices() {
    const r = await window.API.backend.listInvoices();
    const invs = r.invoices || [];
    const rows = invs.length ? invs.map((inv) => `
      <tr>
        <td><b>${esc(inv.id)}</b></td>
        <td class="muted">${esc(inv.customerEmail || "—")}</td>
        <td><b>${money(inv.amount)}</b></td>
        <td class="muted" style="max-width:240px"><span class="ellipsis" style="display:block">${esc(inv.description || "—")}</span></td>
        <td>${statusBadge(inv.status)}</td>
        <td class="muted">${fmtDate(inv.dueAt)}</td>
        <td class="muted">${fmtDate(inv.createdAt)}</td>
      </tr>`).join("") : `<tr><td colspan="7">${emptyState(t("noInvoices"), "file")}</td></tr>`;
    return `
      <div class="page-head"><div><h2>${t("invoicesTitle")}</h2><p>${t("invoicesSub")}</p></div>
        <button class="btn btn-primary" data-new>${icon("plus")} ${t("newInvoice")}</button></div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>${t("custEmail")}</th><th>${t("amount")}</th><th>${t("description")}</th><th>${t("status")}</th><th>${t("due")}</th><th>${t("created")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindInvoices() {
    $$("[data-new]").forEach((b) => b.addEventListener("click", () => {
      openModal(`
        <div class="modal-head"><h3>${t("newInvoice")}</h3><button class="modal-x" data-x>×</button></div>
        <div class="modal-body">
          <div class="field"><label>${t("custEmail")}</label><input class="input" data-email type="email" placeholder="customer@example.com"></div>
          <div class="field"><label>${t("linkAmount")}</label><div class="input-wrap"><span class="prefix">৳</span><input class="input" data-amount type="number" min="1" placeholder="1000"></div></div>
          <div class="field"><label>${t("linkDesc")}</label><input class="input" data-desc placeholder="${t("linkDescPh")}"></div>
          <div class="field"><label>${t("dueDays")}</label><input class="input" data-days type="number" min="1" max="365" value="7"></div>
          ${feeNote()}
          <button class="btn btn-primary btn-lg btn-block mt-16" data-create>${t("createInvoice")}</button>
        </div>`);
      $("[data-create]").addEventListener("click", async () => {
        const email = $("[data-email]").value;
        const amount = Number($("[data-amount]").value);
        if (!amount || amount <= 0) return toast(t("fillAll"), "err");
        await window.API.backend.createInvoice({ customerEmail: email, amount, description: $("[data-desc]").value, dueDays: Number($("[data-days]").value) || 7 });
        closeModal(); toast(t("invoiceCreated")); render();
      });
    }));
  }

  /* ---------- plans ---------- */
  async function viewPlans() {
    const [pl, ss] = await Promise.all([window.API.backend.listPlans(), window.API.backend.listMerchantSubscriptions()]);
    const plans = pl.plans || [];
    const subs = ss.subscriptions || [];
    const subCount = (planId) => subs.filter((s) => s.planId === planId && s.status === "active").length;
    const rows = plans.length ? plans.map((p) => `
      <tr>
        <td><b>${esc(p.name)}</b><div class="small muted">${esc(p.description || "")}</div></td>
        <td><b>${money(p.amount)}</b><span class="small muted"> / ${t(p.interval)}</span></td>
        <td>${statusBadge(p.active ? "active" : "cancelled")}</td>
        <td><span class="badge badge-blue">${subCount(p.id)}</span></td>
        <td class="muted">${fmtDate(p.createdAt)}</td>
      </tr>`).join("") : `<tr><td colspan="5">${emptyState(t("noPlans"), "repeat")}</td></tr>`;
    return `
      <div class="page-head"><div><h2>${t("plansTitle")}</h2><p>${t("plansSub")}</p></div>
        <button class="btn btn-primary" data-new>${icon("plus")} ${t("newPlan")}</button></div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>${t("planName")}</th><th>${t("amount")}</th><th>${t("status")}</th><th>${t("subscribers")}</th><th>${t("created")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindPlans() {
    $$("[data-new]").forEach((b) => b.addEventListener("click", () => {
      openModal(`
        <div class="modal-head"><h3>${t("newPlan")}</h3><button class="modal-x" data-x>×</button></div>
        <div class="modal-body">
          <div class="field"><label>${t("planName")}</label><input class="input" data-name placeholder="${t("planNamePh")}"></div>
          <div class="field"><label>${t("linkAmount")}</label><div class="input-wrap"><span class="prefix">৳</span><input class="input" data-amount type="number" min="1" placeholder="499"></div></div>
          <div class="field"><label>${t("planInterval")}</label>
            <select class="input" data-interval>
              <option value="daily">${t("daily")}</option><option value="weekly">${t("weekly")}</option>
              <option value="monthly" selected>${t("monthly")}</option><option value="yearly">${t("yearly")}</option>
            </select></div>
          <div class="field"><label>${t("linkDesc")}</label><input class="input" data-desc></div>
          ${feeNote()}
          <button class="btn btn-primary btn-lg btn-block mt-16" data-create>${t("createPlan")}</button>
        </div>`);
      $("[data-create]").addEventListener("click", async () => {
        const name = $("[data-name]").value;
        const amount = Number($("[data-amount]").value);
        if (!name || !amount || amount <= 0) return toast(t("fillAll"), "err");
        await window.API.backend.createPlan({ name, amount, interval: $("[data-interval]").value, description: $("[data-desc]").value });
        closeModal(); toast(t("planCreated")); render();
      });
    }));
  }

  /* ---------- subscriptions ---------- */
  async function viewSubscriptions() {
    if (isMerchant()) {
      const r = await window.API.backend.listMerchantSubscriptions();
      const subs = r.subscriptions || [];
      const rows = subs.length ? subs.map((s) => `
        <tr>
          <td><b>${esc(s.planName)}</b></td>
          <td class="muted">${esc(userName(s.customerId))}</td>
          <td><b>${money(s.amount)}</b> / ${t(s.interval)}</td>
          <td>${gwLabel(s.method)}</td>
          <td>${statusBadge(s.status)}</td>
          <td class="muted">${fmtDate(s.nextChargeAt)}</td>
        </tr>`).join("") : `<tr><td colspan="6">${emptyState(t("noSubs"), "refresh")}</td></tr>`;
      return `
        <div class="page-head"><div><h2>${t("subsTitle")}</h2><p>${t("subsSub")}</p></div>
          <button class="btn btn-dark" data-run>${icon("refresh")} ${t("runDue")}</button></div>
        <div class="card card-pad">
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>${t("planName")}</th><th>${t("customersTitle")}</th><th>${t("amount")}</th><th>${t("method")}</th><th>${t("status")}</th><th>${t("nextCharge")}</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        </div>`;
    }
    const r = await window.API.backend.listSubscriptions();
    const subs = r.subscriptions || [];
    const rows = subs.length ? subs.map((s) => `
      <tr>
        <td><b>${esc(s.planName)}</b><div class="small muted">${esc(userName(s.merchantId))}</div></td>
        <td><b>${money(s.amount)}</b> / ${t(s.interval)}</td>
        <td>${gwLabel(s.method)}</td>
        <td>${statusBadge(s.status)}</td>
        <td class="muted">${fmtDate(s.nextChargeAt)}</td>
        <td>${s.status === "active" ? `<button class="btn btn-danger btn-sm" data-cancel="${esc(s.id)}">${t("cancelSub")}</button>` : "—"}</td>
      </tr>`).join("") : `<tr><td colspan="6">${emptyState(t("noSubs"), "refresh")}</td></tr>`;
    return `
      <div class="page-head"><div><h2>${t("subsTitle")}</h2><p>${t("subsSub")}</p></div></div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>${t("planName")}</th><th>${t("amount")}</th><th>${t("method")}</th><th>${t("status")}</th><th>${t("nextCharge")}</th><th>${t("actions")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindSubscriptions() {
    $$("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(t("confirmCancel"))) return;
      await window.API.backend.cancelSubscription(b.dataset.cancel);
      toast(t("cancelled")); render();
    }));
    $$("[data-run]").forEach((b) => b.addEventListener("click", async () => {
      const r = await window.API.backend.processDueSubscriptions();
      const done = (r.processed || []).filter((x) => x.status === "charged").length;
      toast(done ? t("dueCharged") + " (" + done + ")" : t("noDueCharges"));
      render();
    }));
  }

  /* ---------- transactions ---------- */
  async function viewTransactions() {
    const r = await window.API.backend.listTransactions({ limit: 200 });
    const txns = r.transactions || [];
    const rows = txns.length ? txns.map((tx) => {
      const me = state.user.uid;
      const incoming = tx.toUid === me;
      const topup = tx.type === "topup" && tx.toUid === me;
      const other = incoming ? tx.fromUid : tx.toUid;
      const who = topup ? "—" : tx.type === "payout" && !tx.toUid ? "—" : userName(other);
      return `<tr>
        <td>${fmtDateTime(tx.createdAt)}</td>
        <td><span class="badge ${topup ? "badge-blue" : incoming ? "badge-green" : "badge-red"}">${txnTypeLabel(tx.type)}</span></td>
        <td>${esc(tx.description || "—")}</td>
        <td class="muted">${who}</td>
        <td>${gwLabel(tx.method)}</td>
        <td class="tar"><b class="${incoming ? "text-success" : "text-danger"}">${incoming ? "+" : "−"}${money(tx.amount)}</b></td>
        <td class="muted">${money(tx.fee || 0)}</td>
        <td class="muted mono small">${esc(String(tx.id).slice(0, 8))}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="8">${emptyState(t("dashEmpty"), "list")}</td></tr>`;
    return `
      <div class="page-head"><div><h2>${t("txnTitle")}</h2><p>${t("txnSub")}</p></div></div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>${t("date")}</th><th>${t("type")}</th><th>${t("description")}</th><th>${t("counterparty")}</th><th>${t("method")}</th><th class="tar">${t("amount")}</th><th>${t("fee")}</th><th>${t("ref")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindTransactions() {}

  /* ---------- customers ---------- */
  async function viewCustomers() {
    const r = await window.API.backend.listCustomers();
    const cs = r.customers || [];
    const rows = cs.length ? cs.map((c) => `
      <tr>
        <td><div class="flex gap-8"><span class="avatar" style="background:${colorFor(userName(c.customerId))};width:34px;height:34px;border-radius:10px">${initials(userName(c.customerId))}</span><div><b>${esc(userName(c.customerId))}</b><div class="small muted mono">${esc(c.customerId)}</div></div></div></td>
        <td><span class="badge badge-blue">${c.count}</span></td>
        <td><b>${money(c.total)}</b></td>
        <td class="muted">${esc(c.last || "—")}</td>
      </tr>`).join("") : `<tr><td colspan="4">${emptyState(t("noCustomers"), "users")}</td></tr>`;
    return `
      <div class="page-head"><div><h2>${t("customersTitle")}</h2><p>${t("customersSub")}</p></div></div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>${t("customersTitle")}</th><th>${t("payments")}</th><th>${t("totalPaid")}</th><th>${t("lastPayment")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindCustomers() {}

  /* ---------- payouts ---------- */
  async function viewPayouts() {
    const r = await window.API.backend.listPayouts();
    const ps = r.payouts || [];
    const d = await window.API.backend.getDashboard();
    const balance = (d.wallet && d.wallet.balance) || 0;
    const rows = ps.length ? ps.map((p) => `
      <tr>
        <td class="mono small">${esc(p.id)}</td>
        <td><b>${money(p.amount)}</b></td>
        <td>${gwLabel(p.method)}</td>
        <td class="muted">${esc(p.account || "—")}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="muted">${fmtDate(p.createdAt)}</td>
      </tr>`).join("") : `<tr><td colspan="6">${emptyState(t("noPayouts"), "payout")}</td></tr>`;
    return `
      <div class="page-head"><div><h2>${t("payoutsTitle")}</h2><p>${t("payoutsSub")}</p></div>
        <button class="btn btn-primary" data-new>${icon("payout")} ${t("newPayout")}</button></div>
      <div class="card card-pad mb-16" style="max-width:520px">
        <div class="flex between"><div><div class="s-label muted">${t("available")}</div><div class="s-value" style="font-size:24px">${money(balance)}</div></div>
        <span class="s-ico" style="width:46px;height:46px;background:var(--brand-soft);color:var(--brand-dark);border-radius:13px;display:flex;align-items:center;justify-content:center">${icon("wallet", 22)}</span></div>
      </div>
      <div class="card card-pad">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>#</th><th>${t("amount")}</th><th>${t("method")}</th><th>${t("accountInfo")}</th><th>${t("status")}</th><th>${t("date")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindPayouts() {
    $$("[data-new]").forEach((b) => b.addEventListener("click", () => {
      openModal(`
        <div class="modal-head"><h3>${t("newPayout")}</h3><button class="modal-x" data-x>×</button></div>
        <div class="modal-body">
          <div class="field"><label>${t("payoutAmount")}</label><div class="input-wrap"><span class="prefix">৳</span><input class="input" data-amount type="number" min="100" placeholder="1000"></div></div>
          <div class="field"><label>${t("method")}</label>
            <select class="input" data-method>
              <option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="rocket">Rocket</option><option value="bank">Bank</option>
            </select></div>
          <div class="field"><label>${t("accountInfo")}</label><input class="input" data-account placeholder="${t("accountPh")}"></div>
          ${feeNote()}
          <button class="btn btn-primary btn-lg btn-block mt-16" data-create>${t("requestPayout")}</button>
        </div>`);
      $("[data-create]").addEventListener("click", async () => {
        const amount = Number($("[data-amount]").value);
        if (!amount || amount < 100) return toast(t("fillAll"), "err");
        try {
          await window.API.backend.requestPayout({ amount, method: $("[data-method]").value, account: $("[data-account]").value });
          closeModal(); toast(t("payoutDone")); render();
        } catch (e) { toast(e.message || "Error", "err"); }
      });
    }));
  }

  /* ---------- earnings (platform owner) ---------- */
  async function viewEarnings() {
    let data = state.earnings;
    try { data = await window.API.backend.getEarnings(); } catch (e) { data = null; }
    if (!data || !data.isOwner) {
      return `
        <div class="page-head"><div><h2>${t("earningsTitle")}</h2><p>${t("earningsSub")}</p></div></div>
        <div class="card card-pad">${emptyState(t("earningsAvailable"), "key")}</div>`;
    }
    const stats = data.stats || {};
    const fees = data.fees || [];
    const rows = fees.length ? fees.map((fx) => {
      const me = state.user.uid;
      const incoming = fx.toUid === me;
      return `<tr>
        <td>${fmtDateTime(fx.createdAt)}</td>
        <td>${esc(fx.description || t("platformFee"))}</td>
        <td class="muted">${esc(String((fx.fromUid || "")).slice(0, 10) || "—")}</td>
        <td class="tar"><b class="text-success">+${money(fx.amount)}</b></td>
      </tr>`;
    }).join("") : `<tr><td colspan="4">${emptyState(t("noEarnings"), "gift")}</td></tr>`;

    return `
      <div class="page-head"><div><h2>${t("earningsTitle")}</h2><p>${t("earningsSub")}</p></div></div>
      <div class="stat-grid">
        <div class="stat tone-green"><div class="flex between"><span class="s-label">${t("totalFees")}</span><span class="s-ico">${icon("gift")}</span></div><div class="s-value">${money(stats.totalFees || 0)}</div><div class="s-sub">${t("feeRateLabel")} ${feeRateText()}</div></div>
        <div class="stat tone-blue"><div class="flex between"><span class="s-label">${t("feeCount")}</span><span class="s-ico">${icon("list")}</span></div><div class="s-value">${stats.feeCount || 0}</div><div class="s-sub">${t("platformFee")}</div></div>
        <div class="stat tone-amber"><div class="flex between"><span class="s-label">${t("feeBalance")}</span><span class="s-ico">${icon("wallet")}</span></div><div class="s-value">${money(stats.balance || 0)}</div><div class="s-sub">${t("wallet")} · BDT</div></div>
        <div class="stat tone-red"><div class="flex between"><span class="s-label">${t("feeRateLabel")}</span><span class="s-ico">${icon("chart")}</span></div><div class="s-value">${feeRateText()}</div><div class="s-sub">${t("platformFee")}</div></div>
      </div>
      <div class="card card-pad">
        <h3 class="card-title">${t("feeTxns")}</h3>
        <div class="table-wrap mt-16"><table class="tbl">
          <thead><tr><th>${t("date")}</th><th>${t("description")}</th><th>${t("counterparty")}</th><th class="tar">${t("amount")}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }
  function bindEarnings() {}

  /* ---------- settings ---------- */
  async function viewSettings() {
    const p = state.profile || {};
    const f = feeConfig();
    const apiKey = window.API.backend.live ? "pk_live_••••••••••••" : "pk_sandbox_" + state.user.uid.slice(0, 8);
    return `
      <div class="page-head"><div><h2>${t("settingsTitle")}</h2><p>${t("settingsSub")}</p></div></div>
      <div class="grid-2b">
        <div class="card card-pad">
          <h3 class="card-title">${t("profile")}</h3>
          <div class="field mt-16"><label>${t("name")}</label><input class="input" data-name value="${esc(p.name || "")}"></div>
          <div class="field"><label>${t("company")}</label><input class="input" data-company value="${esc(p.company || "")}"></div>
          <div class="field"><label>${t("phone")}</label><input class="input" data-phone value="${esc(p.phone || "")}"></div>
          <div class="field"><label>${t("email")}</label><input class="input" value="${esc(state.user ? state.user.email : "")}" disabled></div>
          <button class="btn btn-primary" data-save>${icon("check")} ${t("save")}</button>
        </div>
        <div class="card card-pad">
          <h3 class="card-title">${t("integration")}</h3>
          <div class="flex gap-8 mt-8 wrap">
            <span class="badge ${window.API.backend.live ? "badge-green" : "badge-amber"}"><span class="dot"></span>${window.API.backend.live ? "Firebase · " + t("liveNotice") : t("sandboxNotice")}</span>
            <span class="badge badge-blue">${t("feeRateLabel")} ${feeRateText()}</span>
            <span class="badge badge-gray">BDT</span>
          </div>
          <div class="fee-note mt-16">${icon("shield")} ${t("platformFee")}: ${feeRateText()} (${money(f.minFee)} – ${money(f.maxFee)})</div>
          <h3 class="card-title mt-24">${t("apiKeys")}</h3>
          <p class="card-sub">${t("apiKeyHint")}</p>
          <div class="copy-field mt-16"><input class="input mono" readonly value="${esc(apiKey)}"><button class="btn btn-outline" data-copy="${esc(apiKey)}">${icon("copy", 15)}</button></div>
        </div>
      </div>`;
  }
  function bindSettings() {
    $$("[data-save]").forEach((b) => b.addEventListener("click", async () => {
      const name = $("[data-name]").value, company = $("[data-company]").value, phone = $("[data-phone]").value;
      await window.API.backend.register({ name, company, phone, role: isMerchant() ? "merchant" : "customer" });
      toast(t("saved")); loadProfile();
    }));
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
      copyText(b.dataset.copy, true);
    }));
  }

  /* ================= CHECKOUT (public payment link) ================= */
  async function renderCheckout(linkId) {
    $("#app").innerHTML = `
      <div style="min-height:100vh;background:var(--bg);display:flex;flex-direction:column">
        <div class="container" style="padding:16px 22px">
          <div class="flex between">
            <a class="logo" href="#/">${logoMark()} <span>Autopay</span></a>
            <div class="lang-toggle">
              <button data-lang="bn" class="${lang() === "bn" ? "on" : ""}">বাং</button>
              <button data-lang="en" class="${lang() === "en" ? "on" : ""}">EN</button>
            </div>
          </div>
        </div>
        <div class="container grow" style="display:flex;align-items:center;justify-content:center;padding:32px 22px 64px">
          <div class="checkout-wrap" id="co-body"><div class="empty">${t("loading")}</div></div>
        </div>
        <div class="container tac small muted" style="padding:12px 22px 24px">${feeNote()}</div>
      </div>`;
    $$("[data-lang]").forEach((b) => b.addEventListener("click", () => { window.I18N.setLang(b.dataset.lang); render(); }));

    const body = $("#co-body");
    let link, merchant;
    try {
      const r = await window.API.backend.getLink(linkId);
      link = r.link; merchant = r.merchant;
    } catch (e) {
      body.innerHTML = checkoutCard(`<div class="empty"><div class="e-ico">${icon("x", 30)}</div><p>${t("payFailed")}</p></div>`);
      return;
    }

    function draw() {
      const expired = link.expiresAt && toMs(link.expiresAt) < Date.now();
      if (link.status === "paid") {
        body.innerHTML = checkoutCard(`
          <div class="tac" style="padding:10px 0">
            <div class="s-ico" style="width:72px;height:72px;border-radius:20px;background:var(--brand-soft);color:var(--brand-dark);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">${icon("checkCircle", 36)}</div>
            <h3 style="font-size:20px;margin:0 0 6px">${t("paySuccess")}</h3>
            <p class="muted">${t("paySuccessSub")} ${money(link.amount)}</p>
            <a class="btn btn-outline mt-16" href="#/">${t("backHome")}</a>
          </div>`);
      } else if (expired) {
        body.innerHTML = checkoutCard(`<div class="empty"><div class="e-ico">${icon("clock", 30)}</div><p>${t("payExpired")}</p></div>`);
      } else {
        const fee = calcFee(link.amount);
        const merchantGets = round2(link.amount - fee);
        body.innerHTML = checkoutCard(`
          <div class="checkout-brand">
            <div class="merchant">${t("payingTo")} · ${esc(merchant ? merchant.name || merchant.company : "—")}</div>
            <div class="amount">${money(link.amount)}</div>
            <div class="merchant">${esc(link.description || "")}</div>
          </div>
          <div class="checkout-body">
            <div class="card" style="background:var(--bg);border:1px solid var(--line)">
              <div class="card-pad" style="padding:14px 16px">
                <div class="small muted mb-8">${t("feeBreakdown")}</div>
                <div class="flex between" style="padding:5px 0"><span class="small">${t("buyerPays")}</span><b>${money(link.amount)}</b></div>
                <div class="flex between" style="padding:5px 0"><span class="small">${t("platformFee")} (${feeRateText()})</span><b class="text-danger">− ${money(fee)}</b></div>
                <div class="flex between" style="padding:5px 0;border-top:1px dashed var(--line);margin-top:4px"><span class="small">${t("merchantReceives")}</span><b class="text-success">${money(merchantGets)}</b></div>
              </div>
            </div>
            <button class="btn btn-primary btn-lg btn-block mt-16" data-pay>${t("payNow")} ${icon("arrowRight")}</button>
          </div>`);
        $("[data-pay]", body).addEventListener("click", async () => {
          if (!state.user) {
            goto(`#/auth?mode=login&next=${encodeURIComponent("#/pay/" + linkId)}`);
            return;
          }
          collectPayment({ title: t("payNow"), fixedAmount: link.amount, methods: ["wallet", "bkash", "nagad", "rocket", "upay", "card"], defaultMethod: "wallet", hasAmount: false }).then(async (res) => {
            if (!res) return;
            try {
              await window.API.backend.payLink({ linkId, method: res.method, otp: res.otp });
              link.status = "paid";
              toast(t("paySuccess")); draw();
            } catch (e) {
              toast(errMsg(e), "err");
            }
          });
        });
      }
    }
    draw();
  }
  function checkoutCard(inner) {
    return `<div class="checkout-card"><div style="text-align:center;padding:14px 0 0"><span class="badge badge-green">🔒 Secure · ${feeRateText()} ${t("platformFee")}</span></div>${inner}</div>`;
  }

  /* ================= boot ================= */
  function boot() {
    document.documentElement.lang = lang();
    window.addEventListener("hashchange", render);
    window.API.auth.onAuthChange((u) => {
      state.user = u;
      if (!u) { state.profile = null; state.wallet = { balance: 0 }; }
      render();
    });
    render();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
