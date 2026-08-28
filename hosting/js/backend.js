/* ============================================================
   Autopay — backend abstraction
   Auto-selects the demo (in-browser sandbox) backend unless a real
   Firebase project is configured. Drop your config below (or set
   window.FIREBASE_CONFIG before this file loads) to go live.
   ============================================================ */
(function () {
  "use strict";

  // ---------- Firebase config (optional — go live here) ----------
  window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
  // Example:
  // window.FIREBASE_CONFIG = {
  //   apiKey: "...", authDomain: "autopay-bd.firebaseapp.com",
  //   projectId: "autopay-bd", storageBucket: "autopay-bd.appspot.com",
  //   messagingSenderId: "...", appId: "...",
  // };

  const USE_FIREBASE = !!window.FIREBASE_CONFIG && typeof firebase !== "undefined";

  function fAuth() { return firebase.auth(); }
  function fDb() { return firebase.firestore(); }
  function fFn() { return firebase.functions(); }

  function firebaseCall(name, data) {
    return fFn().httpsCallable(name)(data).then((r) => r.data);
  }

  /* -------------------- auth -------------------- */
  const auth = {
    onAuthChange(fn) {
      if (USE_FIREBASE) return fAuth().onAuthStateChanged((u) => fn(u ? { uid: u.uid, email: u.email, name: u.displayName } : null));
      return Demo.auth.onAuthChange(fn);
    },
    currentUser() {
      if (USE_FIREBASE) { const u = fAuth().currentUser; return u ? { uid: u.uid, email: u.email, name: u.displayName } : null; }
      return Demo.auth.currentUser();
    },
    uid() {
      if (USE_FIREBASE) { const u = fAuth().currentUser; return u ? u.uid : null; }
      return Demo.auth.uid();
    },
    async signIn(email, password) {
      if (USE_FIREBASE) {
        const c = await fAuth().signInWithEmailAndPassword(email, password);
        return { uid: c.user.uid, email: c.user.email };
      }
      return Demo.auth.signIn(email, password);
    },
    async signUp(email, password, extra) {
      if (USE_FIREBASE) {
        const c = await fAuth().createUserWithEmailAndPassword(email, password);
        await c.user.updateProfile({ displayName: extra.name || "" });
        return { uid: c.user.uid, email: c.user.email };
      }
      return Demo.auth.signUp(email, password, extra);
    },
    async signOut() {
      if (USE_FIREBASE) return fAuth().signOut();
      return Demo.auth.signOut();
    },
  };

  /* -------------------- backend -------------------- */
  const backend = {
    useFirebase: USE_FIREBASE,
    register: (d) => (USE_FIREBASE ? firebaseCall("autopay_register", d) : Demo.backend.register(d)),
    getProfile: () => (USE_FIREBASE ? firebaseCall("autopay_getProfile") : Demo.backend.getProfile()),
    getDashboard: () => (USE_FIREBASE ? firebaseCall("autopay_getDashboard") : Demo.backend.getDashboard()),
    topUp: (d) => (USE_FIREBASE ? firebaseCall("autopay_topUp", d) : Demo.backend.topUp(d)),
    confirmTopUp: (d) => (USE_FIREBASE ? firebaseCall("autopay_confirmTopUp", d) : Demo.backend.confirmTopUp(d)),
    createLink: (d) => (USE_FIREBASE ? firebaseCall("autopay_createLink", d) : Demo.backend.createLink(d)),
    listLinks: () => (USE_FIREBASE ? firebaseCall("autopay_listLinks") : Demo.backend.listLinks()),
    getLink: (id) => (USE_FIREBASE ? firebaseCall("autopay_getLink", { linkId: id }) : Demo.backend.getLink(id)),
    payLink: (d) => (USE_FIREBASE ? firebaseCall("autopay_payLink", d) : Demo.backend.payLink(d)),
    createInvoice: (d) => (USE_FIREBASE ? firebaseCall("autopay_createInvoice", d) : Demo.backend.createInvoice(d)),
    listInvoices: () => (USE_FIREBASE ? firebaseCall("autopay_listInvoices") : Demo.backend.listInvoices()),
    createPlan: (d) => (USE_FIREBASE ? firebaseCall("autopay_createPlan", d) : Demo.backend.createPlan(d)),
    listPlans: () => (USE_FIREBASE ? firebaseCall("autopay_listPlans") : Demo.backend.listPlans()),
    createSubscription: (d) => (USE_FIREBASE ? firebaseCall("autopay_createSubscription", d) : Demo.backend.createSubscription(d)),
    listSubscriptions: () => (USE_FIREBASE ? firebaseCall("autopay_listSubscriptions") : Demo.backend.listSubscriptions()),
    listMerchantSubscriptions: () => (USE_FIREBASE ? firebaseCall("autopay_listMerchantSubscriptions") : Demo.backend.listMerchantSubscriptions()),
    cancelSubscription: (id) => (USE_FIREBASE ? firebaseCall("autopay_cancelSubscription", { subId: id }) : Demo.backend.cancelSubscription(id)),
    processDueSubscriptions: () => (USE_FIREBASE ? firebaseCall("autopay_processDueSubscriptions") : Demo.backend.processDueSubscriptions()),
    requestPayout: (d) => (USE_FIREBASE ? firebaseCall("autopay_requestPayout", d) : Demo.backend.requestPayout(d)),
    listPayouts: () => (USE_FIREBASE ? firebaseCall("autopay_listPayouts") : Demo.backend.listPayouts()),
    listTransactions: (d) => (USE_FIREBASE ? firebaseCall("autopay_listTransactions", d) : Demo.backend.listTransactions(d)),
    listCustomers: () => (USE_FIREBASE ? firebaseCall("autopay_listCustomers") : Demo.backend.listCustomers()),
  };

  window.API = { auth, backend };
})();
