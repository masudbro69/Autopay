/* ============================================================
   Autopay — backend abstraction layer
   ------------------------------------------------------------
   PRIMARY  : live Firebase (Auth + Firestore + Cloud Functions)
   FALLBACK : in-browser sandbox (dev only, starts EMPTY)

   Mode resolution (window.APP_CONFIG.mode):
     "live"    → always live
     "sandbox" → always sandbox (dev)
     "auto"    → live on production hosts, sandbox elsewhere
   A `?mode=live` / `?mode=sandbox` query string overrides the config.
   ============================================================ */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};

  function resolveMode() {
    const q = new URLSearchParams(location.search);
    if (q.get("mode") === "live") return "live";
    if (q.get("mode") === "sandbox") return "sandbox";
    const cfg = CFG.mode || "auto";
    if (cfg === "live" || cfg === "sandbox") return cfg;
    const host = location.hostname || "";
    const prod = (CFG.productionHosts || []).some((h) => host.includes(h));
    return prod ? "live" : "sandbox";
  }

  const MODE = resolveMode();
  const FIREBASE_READY = typeof firebase !== "undefined" && !!CFG.firebase;

  function initFirebase() {
    if (firebase.apps.length) return;
    firebase.initializeApp(CFG.firebase);
  }
  function fAuth() { return firebase.auth(); }
  function fDb() { return firebase.firestore(); }
  function fFn() { return firebase.functions(); }
  function firebaseCall(name, data) {
    return fFn().httpsCallable(name)(data).then((r) => r.data);
  }

  /* -------------------- auth -------------------- */
  const auth = {
    mode: MODE,
    live: MODE === "live" && FIREBASE_READY,
    onAuthChange(fn) {
      if (this.live) { initFirebase(); return fAuth().onAuthStateChanged((u) => fn(u ? { uid: u.uid, email: u.email, name: u.displayName } : null)); }
      return window.Sandbox.auth.onAuthChange(fn);
    },
    currentUser() {
      if (this.live) { initFirebase(); const u = fAuth().currentUser; return u ? { uid: u.uid, email: u.email, name: u.displayName } : null; }
      return window.Sandbox.auth.currentUser();
    },
    uid() {
      if (this.live) { initFirebase(); const u = fAuth().currentUser; return u ? u.uid : null; }
      return window.Sandbox.auth.uid();
    },
    async signIn(email, password) {
      if (this.live) { initFirebase(); const c = await fAuth().signInWithEmailAndPassword(email, password); return { uid: c.user.uid, email: c.user.email, name: c.user.displayName }; }
      return window.Sandbox.auth.signIn(email, password);
    },
    async signUp(email, password, extra) {
      if (this.live) {
        initFirebase();
        const c = await fAuth().createUserWithEmailAndPassword(email, password);
        if (extra && extra.name) { try { await c.user.updateProfile({ displayName: extra.name }); } catch (e) { /* non-fatal */ } }
        return { uid: c.user.uid, email: c.user.email, name: extra ? extra.name : "" };
      }
      return window.Sandbox.auth.signUp(email, password, extra);
    },
    async signInWithGoogle() {
      if (!this.live) { const e = new Error("google-unavailable"); e.code = "google-unavailable"; throw e; }
      initFirebase();
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const c = await fAuth().signInWithPopup(provider);
      return { uid: c.user.uid, email: c.user.email, name: c.user.displayName, photo: c.user.photoURL };
    },
    async signOut() {
      if (this.live) { initFirebase(); return fAuth().signOut(); }
      return window.Sandbox.auth.signOut();
    },
  };

  /* -------------------- backend -------------------- */
  const backend = {
    mode: MODE,
    live: auth.live,
    register: (d) => (auth.live ? firebaseCall("autopay_register", d) : window.Sandbox.backend.register(d)),
    getProfile: () => (auth.live ? firebaseCall("autopay_getProfile") : window.Sandbox.backend.getProfile()),
    getDashboard: () => (auth.live ? firebaseCall("autopay_getDashboard") : window.Sandbox.backend.getDashboard()),
    getEarnings: () => (auth.live ? firebaseCall("autopay_getEarnings") : window.Sandbox.backend.getEarnings()),
    topUp: (d) => (auth.live ? firebaseCall("autopay_topUp", d) : window.Sandbox.backend.topUp(d)),
    confirmTopUp: (d) => (auth.live ? firebaseCall("autopay_confirmTopUp", d) : window.Sandbox.backend.confirmTopUp(d)),
    createLink: (d) => (auth.live ? firebaseCall("autopay_createLink", d) : window.Sandbox.backend.createLink(d)),
    listLinks: () => (auth.live ? firebaseCall("autopay_listLinks") : window.Sandbox.backend.listLinks()),
    getLink: (id) => (auth.live ? firebaseCall("autopay_getLink", { linkId: id }) : window.Sandbox.backend.getLink(id)),
    payLink: (d) => (auth.live ? firebaseCall("autopay_payLink", d) : window.Sandbox.backend.payLink(d)),
    createInvoice: (d) => (auth.live ? firebaseCall("autopay_createInvoice", d) : window.Sandbox.backend.createInvoice(d)),
    listInvoices: () => (auth.live ? firebaseCall("autopay_listInvoices") : window.Sandbox.backend.listInvoices()),
    createPlan: (d) => (auth.live ? firebaseCall("autopay_createPlan", d) : window.Sandbox.backend.createPlan(d)),
    listPlans: () => (auth.live ? firebaseCall("autopay_listPlans") : window.Sandbox.backend.listPlans()),
    createSubscription: (d) => (auth.live ? firebaseCall("autopay_createSubscription", d) : window.Sandbox.backend.createSubscription(d)),
    listSubscriptions: () => (auth.live ? firebaseCall("autopay_listSubscriptions") : window.Sandbox.backend.listSubscriptions()),
    listMerchantSubscriptions: () => (auth.live ? firebaseCall("autopay_listMerchantSubscriptions") : window.Sandbox.backend.listMerchantSubscriptions()),
    cancelSubscription: (id) => (auth.live ? firebaseCall("autopay_cancelSubscription", { subId: id }) : window.Sandbox.backend.cancelSubscription(id)),
    processDueSubscriptions: () => (auth.live ? firebaseCall("autopay_processDueSubscriptions") : window.Sandbox.backend.processDueSubscriptions()),
    requestPayout: (d) => (auth.live ? firebaseCall("autopay_requestPayout", d) : window.Sandbox.backend.requestPayout(d)),
    listPayouts: () => (auth.live ? firebaseCall("autopay_listPayouts") : window.Sandbox.backend.listPayouts()),
    listTransactions: (d) => (auth.live ? firebaseCall("autopay_listTransactions", d) : window.Sandbox.backend.listTransactions(d)),
    listCustomers: () => (auth.live ? firebaseCall("autopay_listCustomers") : window.Sandbox.backend.listCustomers()),
  };

  window.API = { auth, backend, mode: MODE };
})();
