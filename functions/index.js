/**
 * Autopay — Firebase Functions backend.
 *
 * 0% fee passthrough payment + auto-pay (recurring subscription) system for
 * Bangladesh. Money moves straight from payer to payee with zero markup; the
 * wallet is an auditable ledger, not a fee collector.
 *
 * Exposed callable functions:
 *   autopay_register / autopay_getProfile
 *   autopay_topUp / autopay_confirmTopUp
 *   autopay_getDashboard
 *   autopay_createLink / autopay_getLink / autopay_payLink
 *   autopay_createInvoice / autopay_payInvoice
 *   autopay_createPlan / autopay_createSubscription / autopay_cancelSubscription
 *   autopay_requestPayout
 *   autopay_listTransactions / autopay_listCustomers
 *
 * Scheduled:
 *   autopay_processDueSubscriptions — charges subscriptions whose
 *   nextChargeAt has passed.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");
const gateways = require("./lib/gateways");

initializeApp();
const db = getFirestore();

const ZERO_FEE = 0; // Autopay charges no fee on any flow.

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function requireAuth(context) {
  if (!context.auth || !context.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return context.auth.uid;
}

function requireAmount(amount, { min = 1, max = 10000000 } = {}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < min || amt > max) {
    throw new HttpsError(
      "invalid-argument",
      `Amount must be between ৳${min} and ৳${max}.`
    );
  }
  return round2(amt);
}

async function getUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getWallet(uid) {
  const snap = await db.collection("wallets").doc(uid).get();
  return snap.exists
    ? { balance: round2(snap.data().balance || 0), ...snap.data() }
    : { balance: 0 };
}

async function ensureWallet(uid) {
  const ref = db.collection("wallets").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ balance: 0, currency: "BDT", createdAt: FieldValue.serverTimestamp() });
  }
  return ref;
}

function now() {
  return Timestamp.now();
}

/**
 * Atomic transfer between two wallets. Fee is always 0 (passthrough).
 * Writes two wallet updates + one transaction record inside a transaction.
 */
async function transfer({ fromUid, toUid, amount, type, method, description, extra = {} }) {
  const amt = round2(amount);
  if (amt <= 0) throw new HttpsError("invalid-argument", "Transfer amount must be positive.");

  return db.runTransaction(async (t) => {
    const fromRef = db.collection("wallets").doc(fromUid);
    const toRef = db.collection("wallets").doc(toUid);

    const [fromSnap, toSnap] = await Promise.all([t.get(fromRef), t.get(toRef)]);

    const fromBalance = fromSnap.exists ? fromSnap.data().balance || 0 : 0;
    if (fromBalance < amt) {
      throw new HttpsError(
        "failed-precondition",
        "Insufficient wallet balance. Please top up first."
      );
    }
    const toBalance = toSnap.exists ? toSnap.data().balance || 0 : 0;

    const txnRef = db.collection("transactions").doc();
    const txn = {
      id: txnRef.id,
      type,
      fromUid,
      toUid,
      amount: amt,
      fee: ZERO_FEE,
      currency: "BDT",
      method,
      status: "success",
      description,
      createdAt: now(),
      ...extra,
    };

    t.set(fromRef, { balance: round2(fromBalance - amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(toRef, { balance: round2(toBalance + amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(txnRef, txn);

    return txn;
  });
}

/** Credit a wallet directly (top-up result / external gateway settlement). */
async function credit({ toUid, amount, type, method, description, extra = {} }) {
  const amt = round2(amount);
  return db.runTransaction(async (t) => {
    const ref = db.collection("wallets").doc(toUid);
    const snap = await t.get(ref);
    const balance = snap.exists ? snap.data().balance || 0 : 0;

    const txnRef = db.collection("transactions").doc();
    const txn = {
      id: txnRef.id,
      type,
      toUid,
      fromUid: null,
      amount: amt,
      fee: ZERO_FEE,
      currency: "BDT",
      method,
      status: "success",
      description,
      createdAt: now(),
      ...extra,
    };
    t.set(ref, { balance: round2(balance + amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(txnRef, txn);
    return txn;
  });
}

async function recordEvent(payload) {
  await db.collection("events").add({
    ...payload,
    createdAt: now(),
  });
}

/* ------------------------------------------------------------------ */
/* Auth / profile                                                      */
/* ------------------------------------------------------------------ */

exports.autopay_register = onCall(async (request) => {
  const uid = requireAuth(request);
  const { name = "", phone = "", company = "", role = "customer" } = request.data || {};
  const user = {
    name: String(name).slice(0, 120),
    phone: String(phone).slice(0, 20),
    company: String(company).slice(0, 120),
    role: role === "merchant" ? "merchant" : "customer",
    email: (request.auth.token && request.auth.token.email) || "",
    updatedAt: now(),
  };
  await db.collection("users").doc(uid).set(user, { merge: true });
  await ensureWallet(uid);
  return { ok: true, user: { id: uid, ...user } };
});

exports.autopay_getProfile = onCall(async (request) => {
  const uid = requireAuth(request);
  const user = await getUser(uid);
  const wallet = await getWallet(uid);
  return { ok: true, user, wallet };
});

/* ------------------------------------------------------------------ */
/* Wallet top-up                                                       */
/* ------------------------------------------------------------------ */

exports.autopay_topUp = onCall(async (request) => {
  const uid = requireAuth(request);
  const { method = "bkash", amount } = request.data || {};
  const amt = requireAmount(amount, { min: 50 });

  const created = await gateways.createPayment(method, {
    amount: amt,
    payerUid: uid,
  });

  await recordEvent({ kind: "topup.initiated", uid, method, amount: amt, paymentId: created.paymentId });

  return { ok: true, payment: created, amount: amt, fee: ZERO_FEE };
});

exports.autopay_confirmTopUp = onCall(async (request) => {
  const uid = requireAuth(request);
  const { method = "bkash", paymentId, otp } = request.data || {};
  if (!paymentId) throw new HttpsError("invalid-argument", "Missing paymentId.");

  const result = await gateways.executePayment(method, paymentId, otp);

  // For top-ups the funds come from the gateway, so they are credited 1:1.
  const amount = round2(Number(request.data.amount));
  const txn = await credit({
    toUid: uid,
    amount,
    type: "topup",
    method,
    description: `Wallet top-up via ${gateways.GATEWAYS[method]?.label || method}`,
    extra: { paymentId, gatewayRef: result.reference },
  });

  await recordEvent({ kind: "topup.completed", uid, method, amount, txnId: txn.id });
  return { ok: true, transaction: txn };
});

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

exports.autopay_getDashboard = onCall(async (request) => {
  const uid = requireAuth(request);
  const user = await getUser(uid) || { role: "customer" };
  const wallet = await getWallet(uid);

  const txns = await db
    .collection("transactions")
    .where("fromUid", "==", uid)
    .where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 30 * 864e5)))
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  const received = await db
    .collection("transactions")
    .where("toUid", "==", uid)
    .get();

  const totalReceived = received.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const totalPaid = txns.docs.reduce((s, d) => s + (d.data().amount || 0), 0);

  return {
    ok: true,
    user,
    wallet,
    stats: {
      balance: wallet.balance,
      totalReceived: round2(totalReceived),
      totalPaid: round2(totalPaid),
      feeSaved: round2((totalReceived + totalPaid) * 0), // 0% fee — always ৳0
    },
    recent: txns.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })),
  };
});

/* ------------------------------------------------------------------ */
/* Payment links (hosted checkout)                                     */
/* ------------------------------------------------------------------ */

exports.autopay_createLink = onCall(async (request) => {
  const uid = requireAuth(request);
  const { amount, description = "", expiresInDays = 7, allowAutoPay = false } = request.data || {};
  const amt = requireAmount(amount, { min: 1 });

  const linkRef = db.collection("paymentLinks").doc();
  const link = {
    id: linkRef.id,
    merchantId: uid,
    amount: amt,
    currency: "BDT",
    description: String(description).slice(0, 300),
    status: "active",
    allowAutoPay: Boolean(allowAutoPay),
    createdAt: now(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + Number(expiresInDays) * 864e5)),
  };
  await linkRef.set(link);
  return { ok: true, link };
});

exports.autopay_getLink = onCall(async (request) => {
  const { linkId } = request.data || {};
  if (!linkId) throw new HttpsError("invalid-argument", "Missing linkId.");
  const snap = await db.collection("paymentLinks").doc(linkId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment link not found.");
  const link = { id: snap.id, ...snap.data() };
  const merchant = await getUser(link.merchantId);
  return { ok: true, link, merchant: merchant ? { name: merchant.name, company: merchant.company } : null };
});

exports.autopay_payLink = onCall(async (request) => {
  const uid = requireAuth(request);
  const { linkId, method = "wallet" } = request.data || {};
  if (!linkId) throw new HttpsError("invalid-argument", "Missing linkId.");

  const linkSnap = await db.collection("paymentLinks").doc(linkId).get();
  if (!linkSnap.exists) throw new HttpsError("not-found", "Payment link not found.");
  const link = linkSnap.data();
  if (link.status !== "active") throw new HttpsError("failed-precondition", "This payment link is no longer active.");
  if (link.expiresAt && link.expiresAt.toDate() < new Date()) {
    throw new HttpsError("failed-precondition", "This payment link has expired.");
  }

  if (method === "wallet") {
    const txn = await transfer({
      fromUid: uid,
      toUid: link.merchantId,
      amount: link.amount,
      type: "payment",
      method,
      description: link.description || `Payment for link ${linkId}`,
      extra: { linkId, merchantId: link.merchantId },
    });
    await db.collection("paymentLinks").doc(linkId).update({ status: "paid", paidBy: uid, paidAt: now() });
    await recordEvent({ kind: "link.paid", uid, linkId, txnId: txn.id });
    return { ok: true, transaction: txn };
  }

  // External gateway: settle directly to the merchant wallet (passthrough).
  await gateways.executePayment(method, request.data.paymentId, request.data.otp);
  const txn = await credit({
    toUid: link.merchantId,
    amount: link.amount,
    type: "payment",
    method,
    description: link.description || `Payment for link ${linkId}`,
    extra: { linkId, merchantId: link.merchantId, payerUid: uid },
  });
  await db.collection("paymentLinks").doc(linkId).update({ status: "paid", paidBy: uid, paidAt: now() });
  await recordEvent({ kind: "link.paid", uid, linkId, txnId: txn.id });
  return { ok: true, transaction: txn };
});

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

exports.autopay_createInvoice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { customerEmail = "", amount, description = "", dueDays = 7 } = request.data || {};
  const amt = requireAmount(amount, { min: 1 });

  const ref = db.collection("invoices").doc();
  const invoice = {
    id: ref.id,
    merchantId: uid,
    customerEmail: String(customerEmail).slice(0, 160),
    amount: amt,
    currency: "BDT",
    description: String(description).slice(0, 300),
    status: "open",
    createdAt: now(),
    dueAt: Timestamp.fromDate(new Date(Date.now() + Number(dueDays) * 864e5)),
  };
  await ref.set(invoice);
  return { ok: true, invoice };
});

exports.autopay_payInvoice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { invoiceId, method = "wallet" } = request.data || {};
  const snap = await db.collection("invoices").doc(invoiceId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
  const invoice = snap.data();
  if (invoice.status !== "open") throw new HttpsError("failed-precondition", "Invoice already settled.");

  if (method === "wallet") {
    const txn = await transfer({
      fromUid: uid,
      toUid: invoice.merchantId,
      amount: invoice.amount,
      type: "invoice",
      method,
      description: invoice.description || `Invoice ${invoiceId}`,
      extra: { invoiceId, merchantId: invoice.merchantId },
    });
    await db.collection("invoices").doc(invoiceId).update({ status: "paid", paidBy: uid, paidAt: now() });
    return { ok: true, transaction: txn };
  }

  await gateways.executePayment(method, request.data.paymentId, request.data.otp);
  const txn = await credit({
    toUid: invoice.merchantId,
    amount: invoice.amount,
    type: "invoice",
    method,
    description: invoice.description || `Invoice ${invoiceId}`,
    extra: { invoiceId, merchantId: invoice.merchantId, payerUid: uid },
  });
  await db.collection("invoices").doc(invoiceId).update({ status: "paid", paidBy: uid, paidAt: now() });
  return { ok: true, transaction: txn };
});

/* ------------------------------------------------------------------ */
/* Auto-pay: plans & subscriptions                                     */
/* ------------------------------------------------------------------ */

exports.autopay_createPlan = onCall(async (request) => {
  const uid = requireAuth(request);
  const { name = "", amount, interval = "monthly", description = "" } = request.data || {};
  const amt = requireAmount(amount, { min: 1 });
  const valid = ["daily", "weekly", "monthly", "yearly"];
  if (!valid.includes(interval)) throw new HttpsError("invalid-argument", "Invalid interval.");

  const ref = db.collection("plans").doc();
  const plan = {
    id: ref.id,
    merchantId: uid,
    name: String(name).slice(0, 120),
    amount: amt,
    currency: "BDT",
    interval,
    description: String(description).slice(0, 300),
    active: true,
    createdAt: now(),
  };
  await ref.set(plan);
  return { ok: true, plan };
});

function nextChargeDate(interval, from = new Date()) {
  const d = new Date(from.getTime());
  switch (interval) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d;
}

exports.autopay_createSubscription = onCall(async (request) => {
  const uid = requireAuth(request);
  const { planId, method = "wallet" } = request.data || {};
  const planSnap = await db.collection("plans").doc(planId).get();
  if (!planSnap.exists) throw new HttpsError("not-found", "Plan not found.");
  const plan = planSnap.data();

  const ref = db.collection("subscriptions").doc();
  const sub = {
    id: ref.id,
    planId,
    merchantId: plan.merchantId,
    customerId: uid,
    planName: plan.name,
    amount: plan.amount,
    interval: plan.interval,
    method,
    status: "active",
    createdAt: now(),
    nextChargeAt: Timestamp.fromDate(nextChargeDate(plan.interval)),
    charges: [],
  };
  await ref.set(sub);
  return { ok: true, subscription: sub };
});

exports.autopay_cancelSubscription = onCall(async (request) => {
  const uid = requireAuth(request);
  const { subId } = request.data || {};
  const ref = db.collection("subscriptions").doc(subId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Subscription not found.");
  if (snap.data().customerId !== uid && snap.data().merchantId !== uid) {
    throw new HttpsError("permission-denied", "Not your subscription.");
  }
  await ref.update({ status: "cancelled", cancelledAt: now() });
  return { ok: true };
});

/**
 * Scheduled auto-pay processor. Charges every active subscription whose
 * nextChargeAt has passed, then rolls nextChargeAt forward.
 */
exports.autopay_processDueSubscriptions = onSchedule("every 1 hours", async () => {
  const due = await db
    .collection("subscriptions")
    .where("status", "==", "active")
    .where("nextChargeAt", "<=", now())
    .get();

  const results = [];
  for (const doc of due.docs) {
    const sub = { id: doc.id, ...doc.data() };
    try {
      let txn;
      if (sub.method === "wallet") {
        const wallet = await getWallet(sub.customerId);
        if (wallet.balance < sub.amount) {
          results.push({ subId: sub.id, status: "insufficient_funds" });
          // Retry in 1 hour.
          await doc.ref.update({ nextChargeAt: Timestamp.fromDate(new Date(Date.now() + 3600e3)) });
          continue;
        }
        txn = await transfer({
          fromUid: sub.customerId,
          toUid: sub.merchantId,
          amount: sub.amount,
          type: "subscription",
          method: sub.method,
          description: `Auto-pay: ${sub.planName}`,
          extra: { subscriptionId: sub.id, merchantId: sub.merchantId },
        });
      } else {
        // External gateway auto-debit (tokenized); settle to merchant.
        await gateways.executePayment(sub.method, sub.id, null);
        txn = await credit({
          toUid: sub.merchantId,
          amount: sub.amount,
          type: "subscription",
          method: sub.method,
          description: `Auto-pay: ${sub.planName}`,
          extra: { subscriptionId: sub.id, merchantId: sub.merchantId, payerUid: sub.customerId },
        });
      }

      await doc.ref.update({
        nextChargeAt: Timestamp.fromDate(nextChargeDate(sub.interval)),
        lastChargedAt: now(),
        charges: FieldValue.arrayUnion({
          amount: sub.amount,
          chargedAt: new Date().toISOString(),
          txnId: txn.id,
        }),
      });
      results.push({ subId: sub.id, status: "charged", txnId: txn.id });
    } catch (e) {
      results.push({ subId: sub.id, status: "failed", error: e.message });
    }
  }
  return { ok: true, processed: results };
});

/* ------------------------------------------------------------------ */
/* Payouts                                                             */
/* ------------------------------------------------------------------ */

exports.autopay_requestPayout = onCall(async (request) => {
  const uid = requireAuth(request);
  const { method = "bank", amount, account = "" } = request.data || {};
  const amt = requireAmount(amount, { min: 100 });

  return db.runTransaction(async (t) => {
    const ref = db.collection("wallets").doc(uid);
    const snap = await t.get(ref);
    const balance = snap.exists ? snap.data().balance || 0 : 0;
    if (balance < amt) {
      throw new HttpsError("failed-precondition", "Insufficient balance for payout.");
    }

    const payoutRef = db.collection("payouts").doc();
    const payout = {
      id: payoutRef.id,
      merchantId: uid,
      amount: amt,
      fee: ZERO_FEE,
      method,
      account: String(account).slice(0, 120),
      status: "processing",
      createdAt: now(),
    };
    t.set(ref, { balance: round2(balance - amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(payoutRef, payout);
    return { ok: true, payout };
  });
});

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

exports.autopay_listLinks = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection("paymentLinks")
    .where("merchantId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return { ok: true, links: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

exports.autopay_listInvoices = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection("invoices")
    .where("merchantId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return { ok: true, invoices: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

exports.autopay_listPlans = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection("plans")
    .where("merchantId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return { ok: true, plans: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

exports.autopay_listSubscriptions = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection("subscriptions")
    .where("customerId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return { ok: true, subscriptions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

exports.autopay_listMerchantSubscriptions = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection("subscriptions")
    .where("merchantId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return { ok: true, subscriptions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

exports.autopay_listPayouts = onCall(async (request) => {
  const uid = requireAuth(request);
  const snap = await db
    .collection("payouts")
    .where("merchantId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  return { ok: true, payouts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

exports.autopay_listTransactions = onCall(async (request) => {
  const uid = requireAuth(request);
  const { limit = 50 } = request.data || {};
  const out = await db
    .collection("transactions")
    .where("fromUid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(Math.min(Number(limit) || 50, 200))
    .get();
  const incoming = await db
    .collection("transactions")
    .where("toUid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(Math.min(Number(limit) || 50, 200))
    .get();

  const merge = new Map();
  for (const d of [...out.docs, ...incoming.docs]) {
    merge.set(d.id, { id: d.id, ...d.data() });
  }
  const list = [...merge.values()]
    .filter((x) => x.fromUid === uid || x.toUid === uid)
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, Math.min(Number(limit) || 50, 200));

  return { ok: true, transactions: list };
});

exports.autopay_listCustomers = onCall(async (request) => {
  const uid = requireAuth(request);
  const paid = await db
    .collection("transactions")
    .where("toUid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const byCustomer = new Map();
  paid.docs.forEach((d) => {
    const t = d.data();
    const key = t.fromUid || "external";
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { customerId: key, count: 0, total: 0, last: null });
    }
    const row = byCustomer.get(key);
    row.count += 1;
    row.total += t.amount || 0;
    if (!row.last) row.last = t.description || "";
  });

  return { ok: true, customers: [...byCustomer.values()].map((c) => ({ ...c, total: round2(c.total) })) };
});
