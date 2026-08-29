/* ============================================================
   Autopay — application configuration
   ------------------------------------------------------------
   Firebase web app keys are PUBLIC by design (they only identify
   the project). Server-side security lives in Firestore rules +
   Cloud Functions. To change the project, replace `firebase`.
   ============================================================ */
window.APP_CONFIG = {
  // ---- Firebase project (auto-pay-66e8c) ----
  firebase: {
    apiKey: "AIzaSyDwxmqyX1Rb2XGLS1u0msg2vdKeteORvBs",
    authDomain: "auto-pay-66e8c.firebaseapp.com",
    databaseURL: "https://auto-pay-66e8c-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "auto-pay-66e8c",
    storageBucket: "auto-pay-66e8c.firebasestorage.app",
    messagingSenderId: "933010303426",
    appId: "1:933010303426:web:b564a7a5af6707af090e5b",
    measurementId: "G-WXN3VJNTE9"
  },

  // ---- Platform monetization (how the owner earns) ----
  // Every payment/invoice/subscription charge is subject to a small,
  // transparent platform fee. The fee is settled to the platform wallet.
  // These defaults mirror functions/index.js (override there with env vars).
  fee: {
    rate: 0.02,   // 2% per transaction
    minFee: 5,    // minimum ৳5
    maxFee: 500,  // cap ৳500
    currency: "BDT"
  },

  // ---- Owner / earnings ----
  // Sign in with this email (Google) to unlock the "Earnings" dashboard
  // (platform revenue). In Cloud Functions, also set AUTOPAY_OWNER_EMAIL
  // to the same address (deploy.sh does this automatically).
  ownerEmail: "officialmasudbro@gmail.com",

  // ---- Runtime mode ----
  // "auto" → Firebase Hosting (*.web.app / *.firebaseapp.com) runs LIVE
  //          (real Auth + Firestore + Cloud Functions). Everything else
  //          (including the GitHub Pages preview) runs the built-in
  //          sandbox so the site is never a broken error screen — it
  //          starts EMPTY, with no fake/demo data.
  // "live" | "sandbox" → force a mode (or use ?mode=live / ?mode=sandbox).
  mode: "auto",
  productionHosts: [".web.app", ".firebaseapp.com"]
};
