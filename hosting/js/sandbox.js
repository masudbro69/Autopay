/* ============================================================
   Autopay — Sandbox backend (development only)
   ------------------------------------------------------------
   A clean, empty in-browser replica of the Firebase backend used
   ONLY when no live backend is reachable (local development /
   offline). It starts EMPTY — no demo accounts, no seeded money.

   It implements the SAME fee engine as functions/index.js so the
   monetization math is identical between sandbox and production.
   ============================================================ */
(function () {
  "use strict";

  const DAY = 864e5;
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function emptyDb() {
    return { users: {}, wallets: {}, transactions: [], paymentLinks: {}, invoices: {}, plans: {}, subscriptions: {}, payouts: {}, events: [] };
  }

  /* ---------------- persistence ---------------- */
  const KEY = "autopay_sandbox_db_v1";
  let db = load();
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
    return emptyDb();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } }

  /* ---------------- auth (local only) ---------------- */
  const SESSION_KEY = "autopay_sandbox_session";
  let current = null;
  const listeners = [];
  try { current = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { current = null; }
  function setSession(u) {
    current = u;
    try { u ? localStorage.setItem(SESSION_KEY, JSON.stringify(u)) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    listeners.forEach((fn) => fn(u));
  }

  const SandboxAuth = {
    currentUser: () => current,
    uid: () => (current ? current.uid : null),
    onAuthChange: (fn) => { listeners.push(fn); return () => {}; },
    async signIn(email, password) {
      const em = String(email || "").toLowerCase();
      if (!em || !password) { const e = new Error("invalid-credentials"); e.code = "invalid-credentials"; throw e; }
      const existing = Object.values(db.users).find((x) => x.email === em);
      const id = existing ? existing.id : uid("user");
      const u = { uid: id, email: em, name: existing ? existing.name : em.split("@")[0] };
      setSession(u);
      return u;
    },
    async signUp(email, password, extra = {}) {
      const em = String(email || "").toLowerCase();
      if (!em || !password) { const e = new Error("invalid-credentials"); e.code = "invalid-credentials"; throw e; }
      if (Object.values(db.users).some((x) => x.email === em)) { const e = new Error("email-exists"); e.code = "email-exists"; throw e; }
      const id = uid("user");
      db.users[id] = { id, name: extra.name || em.split("@")[0], company: extra.company || "", phone: extra.phone || "", role: extra.role === "merchant" ? "merchant" : "customer", email: em, createdAt: Date.now() };
      save();
      setSession({ uid: id, email: em, name: db.users[id].name });
      return { uid: id, email: em };
    },
    async signOut() { setSession(null); },
  };

  /* ---------------- fee engine (shared with production) ---------------- */
  const CFG = () => (window.APP_CONFIG && window.APP_CONFIG.fee) || { rate: 0.02, minFee: 5, maxFee: 500, currency: "BDT" };
  function calcFee(amount) {
    const f = CFG();
    const amt = round2(amount);
    if (amt <= 0) return 0;
    return round2(Math.min(Math.max(amt * (f.rate || 0), f.minFee || 0), f.maxFee || Infinity));
  }

  const OWNER = () => (window.APP_CONFIG && window.APP_CONFIG.ownerEmail) || "";

  function ensureWallet(id) { if (!db.wallets[id]) db.wallets[id] = { balance: 0, currency: "BDT" }; }
  function isOwner(u) {
    if (!OWNER() || !u) return false;
    const prof = db.users[u] || Object.values(db.users).find((x) => x.id === u);
    return !!(prof && String(prof.email || "").toLowerCase() === OWNER().toLowerCase());
  }

  /* ---------------- backend helpers ---------------- */
  const nowMs = () => Date.now();
  const nextCharge = (interval, from = new Date()) => {
    const d = new Date(from.getTime());
    if (interval === "daily") d.setDate(d.getDate() + 1);
    else if (interval === "weekly") d.setDate(d.getDate() + 7);
    else if (interval === "monthly") d.setMonth(d.getMonth() + 1);
    else if (interval === "yearly") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.getTime();
  };

  function requireUid() {
    const u = SandboxAuth.uid();
    if (!u) { const e = new Error("unauthenticated"); e.code = "unauthenticated"; throw e; }
    return u;
  }

  function newTxn(partial) {
    return { id: uid("txn"), fee: 0, currency: "BDT", status: "success", createdAt: nowMs(), ...partial };
  }

  function ledger(fromUid, toUid, amount, opts = {}) {
    // Moves `amount` from -> to, and (when opt.collectFee) the platform fee to the owner wallet.
    const amt = round2(amount);
    ensureWallet(fromUid); ensureWallet(toUid);
    if (amt > 0) {
      if ((db.wallets[fromUid].balance || 0) < amt) { const e = new Error("Insufficient wallet balance. Please top up first."); e.code = "insufficient-funds"; throw e; }
      db.wallets[fromUid].balance = round2(db.wallets[fromUid].balance - amt);
      db.wallets[toUid].balance = round2(db.wallets[toUid].balance + amt);
    }
    let fee = 0, feeTxn = null;
    if (opts.collectFee && amt > 0) {
      fee = calcFee(amt);
      const ownerWallet = OWNER();
      if (fee > 0 && ownerWallet && toUid !== ownerWallet && fromUid !== ownerWallet) {
        ensureWallet(ownerWallet);
        db.wallets[ownerWallet].balance = round2(db.wallets[ownerWallet].balance + fee);
        feeTxn = newTxn({ type: "fee", fromUid: fromUid, toUid: ownerWallet, amount: fee, fee: 0, method: opts.method || "system", description: "Platform fee", status: "success", extra: opts.extra || {} });
        db.transactions.push(feeTxn);
      }
    }
    const txn = newTxn({ type: opts.type || "payment", fromUid, toUid, amount: amt, fee, method: opts.method || "wallet", description: opts.description || "", status: "success", extra: opts.extra || {} });
    db.transactions.push(txn);
    save();
    return { txn, feeTxn };
  }

  function credit(toUid, amount, opts = {}) {
    ensureWallet(toUid);
    db.wallets[toUid].balance = round2((db.wallets[toUid].balance || 0) + round2(amount));
    const txn = newTxn({ type: opts.type || "topup", fromUid: null, toUid, amount: round2(amount), fee: 0, method: opts.method || "system", description: opts.description || "", status: "success", extra: opts.extra || {} });
    db.transactions.push(txn);
    save();
    return txn;
  }

  function gatewaySim(method, otp) {
    if (method !== "wallet" && (!otp || String(otp).trim().length < 4)) { const e = new Error("OTP/PIN is required to confirm the payment."); e.code = "otp-required"; throw e; }
    return { status: "success", reference: "TXN" + nowMs().toString(36).toUpperCase() };
  }

  function listForUser(u, limit = 300) {
    return db.transactions.filter((t) => t.fromUid === u || t.toUid === u).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  const listBy = (coll, key, u) => Object.values(db[coll]).filter((r) => r[key] === u).sort((a, b) => b.createdAt - a.createdAt);

  const SandboxBackend = {
    async register(data = {}) {
      const u = requireUid();
      const existing = db.users[u] || {};
      db.users[u] = { id: u, name: data.name || existing.name || "", company: data.company || "", phone: data.phone || "", role: data.role === "merchant" ? "merchant" : "customer", email: existing.email || (current ? current.email : "") };
      ensureWallet(u);
      save();
      return { ok: true, user: db.users[u] };
    },
    async getProfile() {
      const u = requireUid();
      return { ok: true, user: db.users[u] || null, wallet: db.wallets[u] || { balance: 0 } };
    },
    async topUp({ method = "bkash", amount }) {
      requireUid();
      return { ok: true, payment: { paymentId: uid("PY"), gateway: method, status: "pending", mode: "sandbox", meta: { otp: method !== "wallet", sandbox: true } }, amount: round2(amount), fee: 0 };
    },
    async confirmTopUp({ method = "bkash", paymentId, otp, amount }) {
      const u = requireUid();
      gatewaySim(method, otp);
      const txn = credit(u, amount, { type: "topup", method, description: "Wallet top-up", extra: { paymentId, gatewayRef: "TXN" + nowMs().toString(36).toUpperCase() } });
      return { ok: true, transaction: txn };
    },
    async getDashboard() {
      const u = requireUid();
      const user = db.users[u] || { role: "customer" };
      const wallet = db.wallets[u] || { balance: 0 };
      const mine = listForUser(u, 500);
      const totalReceived = round2(mine.filter((t) => t.toUid === u).reduce((s, t) => s + t.amount, 0));
      const totalPaid = round2(mine.filter((t) => t.fromUid === u).reduce((s, t) => s + t.amount, 0));
      return { ok: true, user, wallet, stats: { balance: round2(wallet.balance || 0), totalReceived, totalPaid, feeCollected: 0 }, recent: mine.slice(0, 10) };
    },
    async createLink(data = {}) {
      const u = requireUid();
      const link = { id: uid("link"), merchantId: u, amount: round2(data.amount), currency: "BDT", description: data.description || "", status: "active", allowAutoPay: !!data.allowAutoPay, createdAt: nowMs(), expiresAt: nowMs() + (Number(data.expiresInDays) || 7) * DAY };
      db.paymentLinks[link.id] = link;
      save();
      return { ok: true, link };
    },
    async listLinks() { const u = requireUid(); return { ok: true, links: listBy("paymentLinks", "merchantId", u) }; },
    async getLink(linkId) {
      const link = db.paymentLinks[linkId];
      if (!link) { const e = new Error("not-found"); e.code = "not-found"; throw e; }
      const merchant = db.users[link.merchantId];
      return { ok: true, link, merchant: merchant ? { name: merchant.name, company: merchant.company } : null };
    },
    async payLink({ linkId, method = "wallet", otp }) {
      const u = requireUid();
      const link = db.paymentLinks[linkId];
      if (!link) { const e = new Error("not-found"); e.code = "not-found"; throw e; }
      if (link.status !== "active") { const e = new Error("link-inactive"); e.code = "link-inactive"; throw e; }
      if (link.expiresAt < nowMs()) { const e = new Error("link-expired"); e.code = "link-expired"; throw e; }
      if (method === "wallet") {
        const { txn, feeTxn } = ledger(u, link.merchantId, link.amount, { type: "payment", method, description: link.description || "Payment", collectFee: true, extra: { linkId, merchantId: link.merchantId } });
        link.status = "paid"; link.paidBy = u; link.paidAt = nowMs(); link.fee = feeTxn ? feeTxn.amount : 0;
        save();
        return { ok: true, transaction: txn };
      }
      gatewaySim(method, otp);
      const fee = calcFee(link.amount);
      const txn = credit(link.merchantId, link.amount, { type: "payment", method, description: link.description || "Payment", extra: { linkId, merchantId: link.merchantId, payerUid: u } });
      link.status = "paid"; link.paidBy = u; link.paidAt = nowMs(); link.fee = fee;
      save();
      return { ok: true, transaction: txn };
    },
    async createInvoice(data = {}) {
      const u = requireUid();
      const inv = { id: uid("inv"), merchantId: u, customerEmail: data.customerEmail || "", amount: round2(data.amount), currency: "BDT", description: data.description || "", status: "open", createdAt: nowMs(), dueAt: nowMs() + (Number(data.dueDays) || 7) * DAY };
      db.invoices[inv.id] = inv;
      save();
      return { ok: true, invoice: inv };
    },
    async listInvoices() { const u = requireUid(); return { ok: true, invoices: listBy("invoices", "merchantId", u) }; },
    async createPlan(data = {}) {
      const u = requireUid();
      const plan = { id: uid("plan"), merchantId: u, name: data.name || "", amount: round2(data.amount), currency: "BDT", interval: data.interval || "monthly", description: data.description || "", active: true, createdAt: nowMs() };
      db.plans[plan.id] = plan;
      save();
      return { ok: true, plan };
    },
    async listPlans() { const u = requireUid(); return { ok: true, plans: listBy("plans", "merchantId", u) }; },
    async createSubscription({ planId, method = "wallet" }) {
      const u = requireUid();
      const plan = db.plans[planId];
      if (!plan) { const e = new Error("not-found"); e.code = "not-found"; throw e; }
      const sub = { id: uid("sub"), planId, merchantId: plan.merchantId, customerId: u, planName: plan.name, amount: plan.amount, interval: plan.interval, method, status: "active", createdAt: nowMs(), nextChargeAt: nextCharge(plan.interval), charges: [] };
      db.subscriptions[sub.id] = sub;
      save();
      return { ok: true, subscription: sub };
    },
    async listSubscriptions() { const u = requireUid(); return { ok: true, subscriptions: listBy("subscriptions", "customerId", u) }; },
    async listMerchantSubscriptions() { const u = requireUid(); return { ok: true, subscriptions: listBy("subscriptions", "merchantId", u) }; },
    async cancelSubscription(subId) {
      const u = requireUid();
      const sub = db.subscriptions[subId];
      if (!sub) { const e = new Error("not-found"); e.code = "not-found"; throw e; }
      sub.status = "cancelled"; sub.cancelledAt = nowMs();
      save();
      return { ok: true };
    },
    async processDueSubscriptions() {
      const u = requireUid();
      const due = Object.values(db.subscriptions).filter((s) => s.merchantId === u && s.status === "active" && s.nextChargeAt <= nowMs());
      const results = [];
      for (const sub of due) {
        try {
          if (sub.method === "wallet") {
            const bal = db.wallets[sub.customerId]?.balance || 0;
            if (bal < sub.amount) { results.push({ subId: sub.id, status: "insufficient_funds" }); continue; }
            const { txn } = ledger(sub.customerId, sub.merchantId, sub.amount, { type: "subscription", method: sub.method, description: "Auto-pay: " + sub.planName, collectFee: true, extra: { subscriptionId: sub.id, merchantId: sub.merchantId } });
            results.push({ subId: sub.id, status: "charged", txnId: txn.id });
          } else {
            gatewaySim(sub.method, null);
            const txn = credit(sub.merchantId, sub.amount, { type: "subscription", method: sub.method, description: "Auto-pay: " + sub.planName, extra: { subscriptionId: sub.id, merchantId: sub.merchantId, payerUid: sub.customerId } });
            results.push({ subId: sub.id, status: "charged", txnId: txn.id });
          }
          sub.nextChargeAt = nextCharge(sub.interval);
          sub.lastChargedAt = nowMs();
          sub.charges = [...(sub.charges || []), { amount: sub.amount, chargedAt: new Date(nowMs()).toISOString() }];
        } catch (e) { results.push({ subId: sub.id, status: "failed", error: e.message }); }
      }
      save();
      return { ok: true, processed: results };
    },
    async requestPayout({ method = "bank", amount, account = "" }) {
      const u = requireUid();
      const amt = round2(amount);
      const bal = db.wallets[u]?.balance || 0;
      if (bal < amt) { const e = new Error("insufficient-funds"); e.code = "insufficient-funds"; throw e; }
      db.wallets[u].balance = round2(bal - amt);
      const payout = { id: uid("po"), merchantId: u, amount: amt, fee: 0, method, account, status: "processing", createdAt: nowMs() };
      db.payouts[payout.id] = payout;
      db.transactions.push(newTxn({ type: "payout", fromUid: u, toUid: null, amount: amt, fee: 0, method, description: "Payout to " + method }));
      save();
      return { ok: true, payout };
    },
    async listPayouts() { const u = requireUid(); return { ok: true, payouts: listBy("payouts", "merchantId", u) }; },
    async listTransactions({ limit = 100 } = {}) { const u = requireUid(); return { ok: true, transactions: listForUser(u, limit) }; },
    async listCustomers() {
      const u = requireUid();
      const by = new Map();
      db.transactions.filter((t) => t.toUid === u && t.fromUid && t.type !== "fee").forEach((t) => {
        if (!by.has(t.fromUid)) by.set(t.fromUid, { customerId: t.fromUid, count: 0, total: 0, last: null });
        const row = by.get(t.fromUid);
        row.count += 1; row.total += t.amount; if (!row.last) row.last = t.description;
      });
      return { ok: true, customers: [...by.values()].map((c) => ({ ...c, total: round2(c.total) })) };
    },
    async getEarnings() {
      const u = requireUid();
      if (!isOwner(u)) { const e = new Error("permission-denied"); e.code = "permission-denied"; throw e; }
      const ownerWallet = OWNER();
      const fees = db.transactions.filter((t) => t.type === "fee" && t.toUid === ownerWallet);
      const total = round2(fees.reduce((s, t) => s + t.amount, 0));
      return { ok: true, isOwner: true, stats: { totalFees: total, feeCount: fees.length, balance: round2(db.wallets[ownerWallet]?.balance || 0) }, fees: fees.slice(0, 50) };
    },
  };

  window.Sandbox = { auth: SandboxAuth, backend: SandboxBackend, calcFee };
})();
