/* ============================================================
   Autopay — Demo mode (sandbox)
   A fully functional in-browser replica of the Firebase backend,
   seeded with realistic Bangladeshi merchant/customer data so the
   app is usable instantly with no server. All money is simulated.
   ============================================================ */
(function () {
  "use strict";

  const DAY = 864e5;
  const HOUR = 36e5;
  const MIN = 6e4;
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const DEMO_USERS = {
    "demo-merchant@autopay.bd": { uid: "merchant-001", pass: "autopay", name: "Rahim Store", role: "merchant", phone: "01711-000001", company: "Rahim Traders" },
    "demo-customer@autopay.bd": { uid: "customer-001", pass: "autopay", name: "Karim Uddin", role: "customer", phone: "01811-000002", company: "" },
  };

  function seed(now) {
    const d = (days) => now - days * DAY;
    const mkTxn = (o) => ({ id: uid("txn"), fee: 0, currency: "BDT", status: "success", ...o });

    const users = {
      "merchant-001": { id: "merchant-001", name: "Rahim Store", company: "Rahim Traders", phone: "01711-000001", role: "merchant", email: "demo-merchant@autopay.bd" },
      "customer-001": { id: "customer-001", name: "Karim Uddin", company: "", phone: "01811-000002", role: "customer", email: "demo-customer@autopay.bd" },
      "customer-002": { id: "customer-002", name: "Salma Akter", company: "Salma Boutique", phone: "01611-000003", role: "customer", email: "salma@example.bd" },
      "customer-003": { id: "customer-003", name: "Jannat Rahman", company: "", phone: "01911-000004", role: "customer", email: "jannat@example.bd" },
    };

    const wallets = {
      "merchant-001": { balance: 24580, currency: "BDT" },
      "customer-001": { balance: 3200, currency: "BDT" },
      "customer-002": { balance: 0, currency: "BDT" },
      "customer-003": { balance: 0, currency: "BDT" },
    };

    const transactions = [
      mkTxn({ type: "topup", fromUid: null, toUid: "customer-001", amount: 5000, method: "bkash", description: "Wallet top-up", createdAt: d(9), gatewayRef: "TXN" + d(9) }),
      mkTxn({ type: "payment", fromUid: "customer-001", toUid: "merchant-001", amount: 1299, method: "rocket", description: "Order #1024", linkId: "link-1001", createdAt: d(8) }),
      mkTxn({ type: "payment", fromUid: "customer-002", toUid: "merchant-001", amount: 899, method: "bkash", description: "Dress order", linkId: "link-1000", createdAt: d(7) }),
      mkTxn({ type: "subscription", fromUid: "customer-001", toUid: "merchant-001", amount: 499, method: "wallet", description: "Auto-pay: Premium", subscriptionId: "sub-1", createdAt: d(6) }),
      mkTxn({ type: "payment", fromUid: "customer-003", toUid: "merchant-001", amount: 2500, method: "card", description: "Laptop service", linkId: "link-1000", createdAt: d(5) }),
      mkTxn({ type: "payment", fromUid: "customer-001", toUid: "merchant-001", amount: 750, method: "nagad", description: "Delivery fee", linkId: "link-1000", createdAt: d(4) }),
      mkTxn({ type: "payment", fromUid: "customer-002", toUid: "merchant-001", amount: 199, method: "wallet", description: "Membership card", linkId: "link-1000", createdAt: d(3) }),
      mkTxn({ type: "payout", fromUid: "merchant-001", toUid: null, amount: 3000, method: "bank", description: "Payout to bank", createdAt: d(2) }),
      mkTxn({ type: "subscription", fromUid: "customer-001", toUid: "merchant-001", amount: 499, method: "wallet", description: "Auto-pay: Premium", subscriptionId: "sub-1", createdAt: d(1) }),
      mkTxn({ type: "payment", fromUid: "customer-001", toUid: "merchant-001", amount: 1200, method: "upay", description: "Order #1031", linkId: "link-1003", createdAt: d(0) - 12 * HOUR }),
      mkTxn({ type: "topup", fromUid: null, toUid: "customer-001", amount: 2000, method: "nagad", description: "Wallet top-up", createdAt: d(0) - 2 * HOUR, gatewayRef: "TXN" + d(0) }),
    ];

    const paymentLinks = {
      "link-1001": { id: "link-1001", merchantId: "merchant-001", amount: 1299, currency: "BDT", description: "Order #1024", status: "paid", paidBy: "customer-001", createdAt: d(8) - HOUR, expiresAt: d(8) + 6 * DAY, paidAt: d(8) },
      "link-1002": { id: "link-1002", merchantId: "merchant-001", amount: 3500, currency: "BDT", description: "সার্ভিস চার্জ — AC maintenance", status: "active", createdAt: d(1), expiresAt: d(1) + 7 * DAY },
      "link-1003": { id: "link-1003", merchantId: "merchant-001", amount: 999, currency: "BDT", description: "Delivery fee — Dhaka", status: "active", createdAt: d(0) - 5 * HOUR, expiresAt: d(0) + 7 * DAY },
    };

    const invoices = {
      "inv-1": { id: "inv-1", merchantId: "merchant-001", customerEmail: "demo-customer@autopay.bd", amount: 5000, currency: "BDT", description: "Monthly supply — August", status: "open", createdAt: d(2), dueAt: d(2) + 7 * DAY },
      "inv-2": { id: "inv-2", merchantId: "merchant-001", customerEmail: "salma@example.bd", amount: 199, currency: "BDT", description: "Service charge", status: "paid", paidBy: "customer-002", createdAt: d(3), dueAt: d(3) + 7 * DAY, paidAt: d(3) },
    };

    const plans = {
      "plan-1": { id: "plan-1", merchantId: "merchant-001", name: "Premium Membership", amount: 499, currency: "BDT", interval: "monthly", description: "Full access + priority support", active: true, createdAt: d(30) },
      "plan-2": { id: "plan-2", merchantId: "merchant-001", name: "Weekly News Digest", amount: 150, currency: "BDT", interval: "weekly", description: "Weekly premium newsletter", active: true, createdAt: d(20) },
      "plan-3": { id: "plan-3", merchantId: "merchant-001", name: "Yearly Care", amount: 4999, currency: "BDT", interval: "yearly", description: "Annual maintenance plan", active: true, createdAt: d(10) },
    };

    const subscriptions = {
      "sub-1": { id: "sub-1", planId: "plan-1", merchantId: "merchant-001", customerId: "customer-001", planName: "Premium Membership", amount: 499, interval: "monthly", method: "wallet", status: "active", createdAt: d(30), nextChargeAt: d(0) + 12 * DAY, lastChargedAt: d(1), charges: [{ amount: 499, chargedAt: new Date(d(1)).toISOString(), txnId: "txn-x" }] },
      "sub-2": { id: "sub-2", planId: "plan-2", merchantId: "merchant-001", customerId: "customer-002", planName: "Weekly News Digest", amount: 150, interval: "weekly", method: "bkash", status: "active", createdAt: d(20), nextChargeAt: d(0) + 3 * DAY, lastChargedAt: d(3) },
      "sub-3": { id: "sub-3", planId: "plan-3", merchantId: "merchant-001", customerId: "customer-001", planName: "Yearly Care", amount: 4999, interval: "yearly", method: "wallet", status: "cancelled", createdAt: d(15), cancelledAt: d(2) },
    };

    const payouts = {
      "po-1": { id: "po-1", merchantId: "merchant-001", amount: 3000, fee: 0, method: "bank", account: "A/C 123456789", status: "processing", createdAt: d(2) },
    };

    return {
      users, wallets, transactions, paymentLinks, invoices, plans, subscriptions, payouts,
      events: [],
      meta: { seededAt: now },
    };
  }

  /* ---------------- persistence ---------------- */
  const KEY = "autopay_demo_db_v1";
  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return seed(Date.now());
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  /* ---------------- auth ---------------- */
  const SESSION_KEY = "autopay_demo_session";
  let current = loadSession();
  const listeners = [];

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function setSession(u) {
    current = u;
    try {
      if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
    listeners.forEach((fn) => fn(u));
  }

  const DemoAuth = {
    currentUser() { return current; },
    uid() { return current ? current.uid : null; },
    onAuthChange(fn) { listeners.push(fn); return () => {}; },
    async signIn(email, password) {
      const acc = DEMO_USERS[String(email).toLowerCase()];
      if (!acc || acc.pass !== password) {
        const err = new Error("invalid-credentials");
        err.code = "invalid-credentials";
        throw err;
      }
      const u = { uid: acc.uid, email: String(email).toLowerCase(), name: acc.name };
      setSession(u);
      return u;
    },
    async signUp(email, password, extra = {}) {
      const em = String(email).toLowerCase();
      if (DEMO_USERS[em]) { const err = new Error("email-exists"); err.code = "email-exists"; throw err; }
      const newUid = uid("user");
      db.users[newUid] = {
        id: newUid,
        name: extra.name || em.split("@")[0],
        company: extra.company || "",
        phone: extra.phone || "",
        role: extra.role === "merchant" ? "merchant" : "customer",
        email: em,
      };
      db.wallets[newUid] = { balance: 0, currency: "BDT" };
      save();
      const u = { uid: newUid, email: em, name: db.users[newUid].name };
      setSession(u);
      return u;
    },
    async signOut() { setSession(null); },
  };

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
    const u = DemoAuth.uid();
    if (!u) { const err = new Error("unauthenticated"); err.code = "unauthenticated"; throw err; }
    return u;
  }

  function transfer({ fromUid, toUid, amount, type, method, description, extra = {} }) {
    const amt = round2(amount);
    if (!db.wallets[fromUid]) db.wallets[fromUid] = { balance: 0, currency: "BDT" };
    if (!db.wallets[toUid]) db.wallets[toUid] = { balance: 0, currency: "BDT" };
    if ((db.wallets[fromUid].balance || 0) < amt) {
      const err = new Error("Insufficient wallet balance. Please top up first."); err.code = "insufficient-funds"; throw err;
    }
    db.wallets[fromUid].balance = round2(db.wallets[fromUid].balance - amt);
    db.wallets[toUid].balance = round2(db.wallets[toUid].balance + amt);
    const txn = { id: uid("txn"), type, fromUid, toUid, amount: amt, fee: 0, currency: "BDT", method, status: "success", description, createdAt: nowMs(), ...extra };
    db.transactions.push(txn);
    save();
    return txn;
  }

  function credit({ toUid, amount, type, method, description, extra = {} }) {
    if (!db.wallets[toUid]) db.wallets[toUid] = { balance: 0, currency: "BDT" };
    db.wallets[toUid].balance = round2((db.wallets[toUid].balance || 0) + round2(amount));
    const txn = { id: uid("txn"), type, fromUid: null, toUid, amount: round2(amount), fee: 0, currency: "BDT", method, status: "success", description, createdAt: nowMs(), ...extra };
    db.transactions.push(txn);
    save();
    return txn;
  }

  function gatewaySim(method, otp) {
    if (method !== "wallet" && (!otp || String(otp).trim().length < 4)) {
      const err = new Error("OTP/PIN is required to confirm the payment."); err.code = "otp-required"; throw err;
    }
    return { status: "success", reference: "TXN" + nowMs().toString(36).toUpperCase() };
  }

  function listForUser(u, limit = 300) {
    return db.transactions
      .filter((t) => t.fromUid === u || t.toUid === u)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  const listBy = (coll, key, u) => Object.values(db[coll]).filter((r) => r[key] === u).sort((a, b) => b.createdAt - a.createdAt);

  const DemoBackend = {
    async register(data = {}) {
      const u = requireUid();
      db.users[u] = { ...db.users[u], name: data.name || db.users[u]?.name || "", phone: data.phone || "", company: data.company || "", role: data.role === "merchant" ? "merchant" : "customer" };
      save();
      return { ok: true, user: { id: u, ...db.users[u] } };
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
      const txn = credit({ toUid: u, amount, type: "topup", method, description: "Wallet top-up", extra: { paymentId, gatewayRef: "TXN" + nowMs().toString(36).toUpperCase() } });
      return { ok: true, transaction: txn };
    },
    async getDashboard() {
      const u = requireUid();
      const user = db.users[u] || { role: "customer" };
      const wallet = db.wallets[u] || { balance: 0 };
      const mine = listForUser(u, 500);
      const totalReceived = round2(mine.filter((t) => t.toUid === u).reduce((s, t) => s + t.amount, 0));
      const totalPaid = round2(mine.filter((t) => t.fromUid === u).reduce((s, t) => s + t.amount, 0));
      return {
        ok: true,
        user,
        wallet,
        stats: { balance: round2(wallet.balance || 0), totalReceived, totalPaid, feeSaved: 0 },
        recent: mine.slice(0, 10),
      };
    },
    async createLink(data = {}) {
      const u = requireUid();
      const link = { id: uid("link"), merchantId: u, amount: round2(data.amount), currency: "BDT", description: data.description || "", status: "active", allowAutoPay: !!data.allowAutoPay, createdAt: nowMs(), expiresAt: nowMs() + (Number(data.expiresInDays) || 7) * DAY };
      db.paymentLinks[link.id] = link;
      save();
      return { ok: true, link };
    },
    async listLinks() {
      const u = requireUid();
      return { ok: true, links: listBy("paymentLinks", "merchantId", u) };
    },
    async getLink(linkId) {
      const link = db.paymentLinks[linkId];
      if (!link) { const err = new Error("not-found"); err.code = "not-found"; throw err; }
      const merchant = db.users[link.merchantId];
      return { ok: true, link, merchant: merchant ? { name: merchant.name, company: merchant.company } : null };
    },
    async payLink({ linkId, method = "wallet", otp }) {
      const u = requireUid();
      const link = db.paymentLinks[linkId];
      if (!link) { const err = new Error("not-found"); err.code = "not-found"; throw err; }
      if (link.status !== "active") { const err = new Error("link-inactive"); err.code = "link-inactive"; throw err; }
      if (link.expiresAt < nowMs()) { const err = new Error("link-expired"); err.code = "link-expired"; throw err; }
      let txn;
      if (method === "wallet") {
        txn = transfer({ fromUid: u, toUid: link.merchantId, amount: link.amount, type: "payment", method, description: link.description || "Payment", extra: { linkId, merchantId: link.merchantId } });
      } else {
        gatewaySim(method, otp);
        txn = credit({ toUid: link.merchantId, amount: link.amount, type: "payment", method, description: link.description || "Payment", extra: { linkId, merchantId: link.merchantId, payerUid: u } });
      }
      link.status = "paid"; link.paidBy = u; link.paidAt = nowMs();
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
    async listInvoices() {
      const u = requireUid();
      return { ok: true, invoices: listBy("invoices", "merchantId", u) };
    },
    async createPlan(data = {}) {
      const u = requireUid();
      const plan = { id: uid("plan"), merchantId: u, name: data.name || "", amount: round2(data.amount), currency: "BDT", interval: data.interval || "monthly", description: data.description || "", active: true, createdAt: nowMs() };
      db.plans[plan.id] = plan;
      save();
      return { ok: true, plan };
    },
    async listPlans() {
      const u = requireUid();
      return { ok: true, plans: listBy("plans", "merchantId", u) };
    },
    async createSubscription({ planId, method = "wallet" }) {
      const u = requireUid();
      const plan = db.plans[planId];
      if (!plan) { const err = new Error("not-found"); err.code = "not-found"; throw err; }
      const sub = { id: uid("sub"), planId, merchantId: plan.merchantId, customerId: u, planName: plan.name, amount: plan.amount, interval: plan.interval, method, status: "active", createdAt: nowMs(), nextChargeAt: nextCharge(plan.interval), charges: [] };
      db.subscriptions[sub.id] = sub;
      save();
      return { ok: true, subscription: sub };
    },
    async listSubscriptions() {
      const u = requireUid();
      return { ok: true, subscriptions: listBy("subscriptions", "customerId", u) };
    },
    async listMerchantSubscriptions() {
      const u = requireUid();
      return { ok: true, subscriptions: listBy("subscriptions", "merchantId", u) };
    },
    async cancelSubscription(subId) {
      const u = requireUid();
      const sub = db.subscriptions[subId];
      if (!sub) { const err = new Error("not-found"); err.code = "not-found"; throw err; }
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
          let txn;
          if (sub.method === "wallet") {
            const bal = db.wallets[sub.customerId]?.balance || 0;
            if (bal < sub.amount) { results.push({ subId: sub.id, status: "insufficient_funds" }); continue; }
            txn = transfer({ fromUid: sub.customerId, toUid: sub.merchantId, amount: sub.amount, type: "subscription", method: sub.method, description: "Auto-pay: " + sub.planName, extra: { subscriptionId: sub.id, merchantId: sub.merchantId } });
          } else {
            gatewaySim(sub.method, null);
            txn = credit({ toUid: sub.merchantId, amount: sub.amount, type: "subscription", method: sub.method, description: "Auto-pay: " + sub.planName, extra: { subscriptionId: sub.id, merchantId: sub.merchantId, payerUid: sub.customerId } });
          }
          sub.nextChargeAt = nextCharge(sub.interval);
          sub.lastChargedAt = nowMs();
          sub.charges = [...(sub.charges || []), { amount: sub.amount, chargedAt: new Date(nowMs()).toISOString(), txnId: txn.id }];
          results.push({ subId: sub.id, status: "charged", txnId: txn.id });
        } catch (e) {
          results.push({ subId: sub.id, status: "failed", error: e.message });
        }
      }
      save();
      return { ok: true, processed: results };
    },
    async requestPayout({ method = "bank", amount, account = "" }) {
      const u = requireUid();
      const amt = round2(amount);
      const bal = db.wallets[u]?.balance || 0;
      if (bal < amt) { const err = new Error("insufficient-funds"); err.code = "insufficient-funds"; throw err; }
      db.wallets[u].balance = round2(bal - amt);
      const payout = { id: uid("po"), merchantId: u, amount: amt, fee: 0, method, account, status: "processing", createdAt: nowMs() };
      db.payouts[payout.id] = payout;
      const txn = { id: uid("txn"), type: "payout", fromUid: u, toUid: null, amount: amt, fee: 0, currency: "BDT", method, status: "success", description: "Payout to " + method, createdAt: nowMs() };
      db.transactions.push(txn);
      save();
      return { ok: true, payout };
    },
    async listPayouts() {
      const u = requireUid();
      return { ok: true, payouts: listBy("payouts", "merchantId", u) };
    },
    async listTransactions({ limit = 100 } = {}) {
      const u = requireUid();
      return { ok: true, transactions: listForUser(u, limit) };
    },
    async listCustomers() {
      const u = requireUid();
      const by = new Map();
      db.transactions.filter((t) => t.toUid === u && t.fromUid).forEach((t) => {
        if (!by.has(t.fromUid)) by.set(t.fromUid, { customerId: t.fromUid, count: 0, total: 0, last: null });
        const row = by.get(t.fromUid);
        row.count += 1; row.total += t.amount; if (!row.last) row.last = t.description;
      });
      return { ok: true, customers: [...by.values()].map((c) => ({ ...c, total: round2(c.total) })) };
    },
  };

  window.Demo = { auth: DemoAuth, backend: DemoBackend, _db: () => db, _seed: seed };
})();
