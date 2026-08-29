/**
 * Autopay — Firebase Functions backend.
 *
 * Payment + auto-pay (recurring subscription) system for Bangladesh.
 *
 * Monetization (how the platform owner earns):
 *   Every payment / invoice / subscription charge collects a transparent
 *   platform fee (default 2%, min ৳5, max ৳500). The buyer pays the full
 *   amount, the merchant receives (amount − fee), and the fee settles to
 *   the platform owner's wallet. Override via Functions env:
 *     AUTOPAY_FEE_RATE  (0.02)
 *     AUTOPAY_FEE_MIN   (5)
 *     AUTOPAY_FEE_MAX   (500)
 *     AUTOPAY_OWNER_EMAIL (the email that unlocks the Earnings dashboard)
 *
 * Exposed callable functions:
 *   autopay_register / autopay_getProfile
 *   autopay_topUp / autopay_confirmTopUp
 *   autopay_getDashboard / autopay_getEarnings
 *   autopay_createLink / autopay_getLink / autopay_payLink / autopay_listLinks
 *   autopay_createInvoice / autopay_payInvoice / autopay_listInvoices
 *   autopay_createPlan / autopay_listPlans
 *   autopay_createSubscription / autopay_cancelSubscription
 *   autopay_listSubscriptions / autopay_listMerchantSubscriptions
 *   autopay_requestPayout / autopay_listPayouts
 *   autopay_listTransactions / autopay_listCustomers
 *
 * Scheduled:
 *   autopay_processDueSubscriptions — charges due auto-pay subscriptions.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const gateways = require("./lib/gateways");

initializeApp();
const db = getFirestore();

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const FEE_RATE = Number(process.env.AUTOPAY_FEE_RATE || 0.02);
const FEE_MIN = Number(process.env.AUTOPAY_FEE_MIN || 5);
const FEE_MAX = Number(process.env.AUTOPAY_FEE_MAX || 500);
const OWNER_EMAIL = (process.env.AUTOPAY_OWNER_EMAIL || "officialmasudbro@gmail.com").toLowerCase();
const OWNER_UID = process.env.AUTOPAY_OWNER_UID || "G5rWSqjeq4MYmqJxupU3WIRLqIB3";
const OWNER_PAYOUT = {
  bkash: process.env.AUTOPAY_PAYOUT_BKASH || "01897537597",
  nagad: process.env.AUTOPAY_PAYOUT_NAGAD || "01897537597",
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function calcFee(amount) {
  const amt = round2(amount);
  if (amt <= 0) return 0;
  return round2(Math.min(Math.max(amt * FEE_RATE, FEE_MIN), FEE_MAX));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function requireAuth(context) {
  if (!context.auth || !context.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return context.auth.uid;
}

function requireAmount(amount, { min = 1, max = 10000000 } = {}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < min || amt > max) {
    throw new HttpsError("invalid-argument", `Amount must be between ৳${min} and ৳${max}.`);
  }
  return round2(amt);
}

async function getUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getWallet(uid) {
  const snap = await db.collection("wallets").doc(uid).get();
  return snap.exists ? { balance: round2(snap.data().balance || 0), ...snap.data() } : { balance: 0 };
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

let _ownerUid = null;
let _ownerResolved = false;
async function resolveOwnerUid() {
  if (_ownerResolved) return _ownerUid;
  _ownerResolved = true;
  // The owner UID is configured directly (fast, no lookup).
  if (OWNER_UID) { _ownerUid = OWNER_UID; return _ownerUid; }
  // Fallback: resolve by email.
  const snap = await db.collection("users").where("email", "==", OWNER_EMAIL).limit(1).get();
  if (!snap.empty) _ownerUid = snap.docs[0].id;
  return _ownerUid;
}

/**
 * Wallet settlement with platform fee split.
 * Buyer pays `amount`; merchant receives `amount − fee`; owner receives `fee`.
 */
async function settlePayment({ fromUid, toUid, amount, type, method, description, extra = {} }) {
  const amt = round2(amount);
  if (amt <= 0) throw new HttpsError("invalid-argument", "Settlement amount must be positive.");
  const ownerUid = await resolveOwnerUid();
  const fee = ownerUid && ownerUid !== fromUid && ownerUid !== toUid ? calcFee(amt) : 0;
  const merchantNet = round2(amt - fee);

  return db.runTransaction(async (t) => {
    const fromRef = db.collection("wallets").doc(fromUid);
    const toRef = db.collection("wallets").doc(toUid);
    const [fromSnap, toSnap] = await Promise.all([t.get(fromRef), t.get(toRef)]);

    const fromBalance = fromSnap.exists ? fromSnap.data().balance || 0 : 0;
    if (fromBalance < amt) {
      throw new HttpsError("failed-precondition", "Insufficient wallet balance. Please top up first.");
    }
    const toBalance = toSnap.exists ? toSnap.data().balance || 0 : 0;

    const txnRef = db.collection("transactions").doc();
    const txn = {
      id: txnRef.id, type, fromUid, toUid, amount: amt, fee,
      currency: "BDT", method, status: "success", description, createdAt: now(), ...extra,
    };
    t.set(fromRef, { balance: round2(fromBalance - amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(toRef, { balance: round2(toBalance + merchantNet), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(txnRef, txn);

    if (fee > 0) {
      const ownerRef = db.collection("wallets").doc(ownerUid);
      const ownerSnap = await t.get(ownerRef);
      const ob = ownerSnap.exists ? ownerSnap.data().balance || 0 : 0;
      t.set(ownerRef, { balance: round2(ob + fee), currency: "BDT", updatedAt: now() }, { merge: true });
      const feeRef = db.collection("transactions").doc();
      t.set(feeRef, {
        id: feeRef.id, type: "fee", fromUid, toUid: ownerUid, amount: fee, fee: 0,
        currency: "BDT", method: "system", status: "success", description: "Platform fee",
        createdAt: now(), txnId: txnRef.id, ...extra,
      });
    }
    return txn;
  });
}

/**
 * External-gateway settlement (buyer pays outside the wallet). Merchant is
 * credited `amount − fee`; owner is credited `fee`.
 */
async function settleExternal({ toUid, payerUid = null, amount, type, method, description, extra = {} }) {
  const amt = round2(amount);
  const ownerUid = await resolveOwnerUid();
  const fee = ownerUid && ownerUid !== toUid ? calcFee(amt) : 0;
  const merchantNet = round2(amt - fee);

  return db.runTransaction(async (t) => {
    const toRef = db.collection("wallets").doc(toUid);
    const toSnap = await t.get(toRef);
    const toBalance = toSnap.exists ? toSnap.data().balance || 0 : 0;

    const txnRef = db.collection("transactions").doc();
    const txn = {
      id: txnRef.id, type, fromUid: payerUid || null, toUid, amount: amt, fee,
      currency: "BDT", method, status: "success", description, createdAt: now(), ...extra,
    };
    t.set(toRef, { balance: round2(toBalance + merchantNet), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(txnRef, txn);

    if (fee > 0) {
      const ownerRef = db.collection("wallets").doc(ownerUid);
      const ownerSnap = await t.get(ownerRef);
      const ob = ownerSnap.exists ? ownerSnap.data().balance || 0 : 0;
      t.set(ownerRef, { balance: round2(ob + fee), currency: "BDT", updatedAt: now() }, { merge: true });
      const feeRef = db.collection("transactions").doc();
      t.set(feeRef, {
        id: feeRef.id, type: "fee", fromUid: payerUid || null, toUid: ownerUid, amount: fee, fee: 0,
        currency: "BDT", method: "system", status: "success", description: "Platform fee",
        createdAt: now(), txnId: txnRef.id, ...extra,
      });
    }
    return txn;
  });
}

/** Credit a wallet directly (top-up settlement — no platform fee). */
async function credit({ toUid, amount, type, method, description, extra = {} }) {
  const amt = round2(amount);
  return db.runTransaction(async (t) => {
    const ref = db.collection("wallets").doc(toUid);
    const snap = await t.get(ref);
    const balance = snap.exists ? snap.data().balance || 0 : 0;

    const txnRef = db.collection("transactions").doc();
    const txn = {
      id: txnRef.id, type, toUid, fromUid: null, amount: amt, fee: 0,
      currency: "BDT", method, status: "success", description, createdAt: now(), ...extra,
    };
    t.set(ref, { balance: round2(balance + amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(txnRef, txn);
    return txn;
  });
}

async function recordEvent(payload) {
  await db.collection("events").add({ ...payload, createdAt: now() });
}

/* ------------------------------------------------------------------ */
/* Auth / profile                                                      */
/* ------------------------------------------------------------------ */

exports.autopay_register = onCall(async (request) => {
  const uid = requireAuth(request);
  const { name = "", phone = "", company = "", role = "customer" } = request.data || {};
  const email = (request.auth.token && request.auth.token.email) || "";
  const user = {
    name: String(name).slice(0, 120),
    phone: String(phone).slice(0, 20),
    company: String(company).slice(0, 120),
    role: role === "merchant" ? "merchant" : "customer",
    email,
    updatedAt: now(),
  };
  // The platform owner's profile also stores their payout destinations.
  if (uid === OWNER_UID || email.toLowerCase() === OWNER_EMAIL) {
    user.isAdmin = true;
    user.payoutAccounts = OWNER_PAYOUT;
  }
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

  const created = await gateways.createPayment(method, { amount: amt, payerUid: uid });
  await recordEvent({ kind: "topup.initiated", uid, method, amount: amt, paymentId: created.paymentId });

  return { ok: true, payment: created, amount: amt, fee: 0 };
});

exports.autopay_confirmTopUp = onCall(async (request) => {
  const uid = requireAuth(request);
  const { method = "bkash", paymentId, otp } = request.data || {};
  if (!paymentId) throw new HttpsError("invalid-argument", "Missing paymentId.");

  const result = await gateways.executePayment(method, paymentId, otp);

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
/* Dashboard & earnings                                                */
/* ------------------------------------------------------------------ */

exports.autopay_getDashboard = onCall(async (request) => {
  const uid = requireAuth(request);
  const user = (await getUser(uid)) || { role: "customer" };
  const wallet = await getWallet(uid);

  const paid = await db
    .collection("transactions")
    .where("fromUid", "==", uid)
    .get();
  const received = await db
    .collection("transactions")
    .where("toUid", "==", uid)
    .get();

  const totalPaid = paid.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const totalReceived = received.docs.reduce((s, d) => s + (d.data().amount || 0), 0);

  return {
    ok: true,
    user,
    wallet,
    stats: {
      balance: round2(wallet.balance || 0),
      totalReceived: round2(totalReceived),
      totalPaid: round2(totalPaid),
      feeCollected: 0,
    },
    recent: paid.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })),
  };
});

exports.autopay_getEarnings = onCall(async (request) => {
  const uid = requireAuth(request);
  const email = ((request.auth.token && request.auth.token.email) || "").toLowerCase();
  const isOwner = uid === OWNER_UID || email === OWNER_EMAIL;
  if (!isOwner) throw new HttpsError("permission-denied", "Platform owner only.");

  const wallet = await getWallet(uid);
  const allFees = await db.collection("transactions").where("type", "==", "fee").get();
  const recent = await db
    .collection("transactions")
    .where("type", "==", "fee")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const totalFees = round2(allFees.docs.reduce((s, d) => s + (d.data().amount || 0), 0));
  return {
    ok: true,
    isOwner: true,
    stats: { totalFees, feeCount: allFees.size, balance: round2(wallet.balance || 0) },
    fees: recent.docs.map((d) => ({ id: d.id, ...d.data() })),
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

  let txn;
  if (method === "wallet") {
    txn = await settlePayment({
      fromUid: uid, toUid: link.merchantId, amount: link.amount,
      type: "payment", method, description: link.description || `Payment for link ${linkId}`,
      extra: { linkId, merchantId: link.merchantId },
    });
  } else {
    await gateways.executePayment(method, request.data.paymentId, request.data.otp);
    txn = await settleExternal({
      toUid: link.merchantId, payerUid: uid, amount: link.amount,
      type: "payment", method, description: link.description || `Payment for link ${linkId}`,
      extra: { linkId, merchantId: link.merchantId },
    });
  }

  await db.collection("paymentLinks").doc(linkId).update({ status: "paid", paidBy: uid, paidAt: now(), fee: txn.fee || 0 });
  await recordEvent({ kind: "link.paid", uid, linkId, txnId: txn.id, fee: txn.fee || 0 });
  return { ok: true, transaction: txn };
});

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

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

exports.autopay_createInvoice = onCall(async (request) => {
  const uid = requireAuth(request);
  const { customerEmail = "", amount, description = "", dueDays = 7 } = request.data || {};
  const amt = requireAmount(amount, { min: 1 });

  const ref = db.collection("invoices").doc();
  const invoice = {
    id: ref.id, merchantId: uid,
    customerEmail: String(customerEmail).slice(0, 160),
    amount: amt, currency: "BDT",
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

  let txn;
  if (method === "wallet") {
    txn = await settlePayment({
      fromUid: uid, toUid: invoice.merchantId, amount: invoice.amount,
      type: "invoice", method, description: invoice.description || `Invoice ${invoiceId}`,
      extra: { invoiceId, merchantId: invoice.merchantId },
    });
  } else {
    await gateways.executePayment(method, request.data.paymentId, request.data.otp);
    txn = await settleExternal({
      toUid: invoice.merchantId, payerUid: uid, amount: invoice.amount,
      type: "invoice", method, description: invoice.description || `Invoice ${invoiceId}`,
      extra: { invoiceId, merchantId: invoice.merchantId },
    });
  }
  await db.collection("invoices").doc(invoiceId).update({ status: "paid", paidBy: uid, paidAt: now(), fee: txn.fee || 0 });
  return { ok: true, transaction: txn };
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
    id: ref.id, merchantId: uid,
    name: String(name).slice(0, 120),
    amount: amt, currency: "BDT", interval,
    description: String(description).slice(0, 300),
    active: true, createdAt: now(),
  };
  await ref.set(plan);
  return { ok: true, plan };
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
    id: ref.id, planId,
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

/**
 * Manual trigger (also used by the dashboard "Run due charges" button) and
 * the hourly scheduled processor.
 */
async function processDueSubscriptions() {
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
          await doc.ref.update({ nextChargeAt: Timestamp.fromDate(new Date(Date.now() + 3600e3)) });
          continue;
        }
        txn = await settlePayment({
          fromUid: sub.customerId, toUid: sub.merchantId, amount: sub.amount,
          type: "subscription", method: sub.method, description: `Auto-pay: ${sub.planName}`,
          extra: { subscriptionId: sub.id, merchantId: sub.merchantId },
        });
      } else {
        await gateways.executePayment(sub.method, sub.id, null);
        txn = await settleExternal({
          toUid: sub.merchantId, payerUid: sub.customerId, amount: sub.amount,
          type: "subscription", method: sub.method, description: `Auto-pay: ${sub.planName}`,
          extra: { subscriptionId: sub.id, merchantId: sub.merchantId },
        });
      }

      await doc.ref.update({
        nextChargeAt: Timestamp.fromDate(nextChargeDate(sub.interval)),
        lastChargedAt: now(),
        charges: FieldValue.arrayUnion({ amount: sub.amount, chargedAt: new Date().toISOString(), txnId: txn.id, fee: txn.fee || 0 }),
      });
      results.push({ subId: sub.id, status: "charged", txnId: txn.id });
    } catch (e) {
      results.push({ subId: sub.id, status: "failed", error: e.message });
    }
  }
  return results;
}

exports.autopay_processDueSubscriptions = onCall(async (request) => {
  requireAuth(request);
  return { ok: true, processed: await processDueSubscriptions() };
});

exports.autopay_processDueSubscriptionsScheduled = onSchedule("every 1 hours", async () => {
  return { ok: true, processed: await processDueSubscriptions() };
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
      id: payoutRef.id, merchantId: uid, amount: amt, fee: 0,
      method, account: String(account).slice(0, 120), status: "processing", createdAt: now(),
    };
    t.set(ref, { balance: round2(balance - amt), currency: "BDT", updatedAt: now() }, { merge: true });
    t.set(payoutRef, payout);
    return { ok: true, payout };
  });
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

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

exports.autopay_listTransactions = onCall(async (request) => {
  const uid = requireAuth(request);
  const { limit = 100 } = request.data || {};
  const cap = Math.min(Number(limit) || 100, 200);

  const [out, incoming] = await Promise.all([
    db.collection("transactions").where("fromUid", "==", uid).orderBy("createdAt", "desc").limit(cap).get(),
    db.collection("transactions").where("toUid", "==", uid).orderBy("createdAt", "desc").limit(cap).get(),
  ]);

  const merge = new Map();
  for (const d of [...out.docs, ...incoming.docs]) merge.set(d.id, { id: d.id, ...d.data() });
  const list = [...merge.values()]
    .filter((x) => x.fromUid === uid || x.toUid === uid)
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, cap);

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
    const tx = d.data();
    if (!tx.fromUid || tx.type === "fee") return;
    const key = tx.fromUid;
    if (!byCustomer.has(key)) byCustomer.set(key, { customerId: key, count: 0, total: 0, last: null });
    const row = byCustomer.get(key);
    row.count += 1;
    row.total += tx.amount || 0;
    if (!row.last) row.last = tx.description || "";
  });

  return { ok: true, customers: [...byCustomer.values()].map((c) => ({ ...c, total: round2(c.total) })) };
});
