/**
 * Autopay — Payment gateway adapters for Bangladesh.
 *
 * Each adapter exposes the same minimal contract:
 *   createPayment(gw, payload)  -> { paymentId, status, redirectUrl?, meta }
 *   executePayment(gw, paymentId, otp) -> { status, reference }
 *   queryPayment(gw, paymentId) -> { status, reference }
 *
 * Modes:
 *   "sandbox" (default) — deterministic, instant success; used by the demo
 *     frontend and the local emulator. No real money moves.
 *   "live" — real provider integration points. Each provider has a clearly
 *     marked TODO with its official sandbox/production endpoint. Add your
 *     merchant credentials via `firebase functions:config:set` or .env and
 *     replace the stubbed HTTP calls.
 *
 * All flows are 0% fee passthrough: Autopay never adds a markup.
 */

const crypto = require("crypto");

const GATEWAYS = {
  wallet: {
    id: "wallet",
    label: "Autopay Wallet",
    short: "Wallet",
    category: "wallet",
    color: "#0E9F6E",
    otp: false,
  },
  bkash: {
    id: "bkash",
    label: "bKash",
    short: "bKash",
    category: "mfs",
    color: "#E2136E",
    otp: true,
    sandboxUrl: "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout",
    liveUrl: "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout",
  },
  nagad: {
    id: "nagad",
    label: "Nagad",
    short: "Nagad",
    category: "mfs",
    color: "#F6921E",
    otp: true,
    sandboxUrl: "http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs/check-out/initialize",
    liveUrl: "https://api.mynagad.com/api/dfs/check-out/initialize",
  },
  rocket: {
    id: "rocket",
    label: "Rocket",
    short: "Rocket",
    category: "mfs",
    color: "#8C3494",
    otp: true,
    sandboxUrl: "https://sandbox.sslcommerz.com/rocket",
    liveUrl: "https://securepay.sslcommerz.com/rocket",
  },
  upay: {
    id: "upay",
    label: "Upay",
    short: "Upay",
    category: "mfs",
    color: "#E4002B",
    otp: true,
    sandboxUrl: "https://sandbox.upay.systems",
    liveUrl: "https://api.upay.systems",
  },
  card: {
    id: "card",
    label: "Visa / Mastercard",
    short: "Card",
    category: "card",
    color: "#1A56DB",
    otp: true,
    sandboxUrl: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
    liveUrl: "https://securepay.sslcommerz.com/gwprocess/v4/api.php",
  },
  bank: {
    id: "bank",
    label: "Bank Transfer",
    short: "Bank",
    category: "bank",
    color: "#334155",
    otp: false,
  },
};

const LIST = Object.values(GATEWAYS);

function getGateway(id) {
  const gw = GATEWAYS[id];
  if (!gw) {
    const err = new Error(`Unknown gateway: ${id}`);
    err.code = "unknown-gateway";
    throw err;
  }
  return gw;
}

function newPaymentId(prefix = "PY") {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function newReference() {
  return `TXN${Date.now()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function config() {
  return {
    mode: process.env.AUTOPAY_MODE || "sandbox", // "sandbox" | "live"
    // Provider credentials (set in production):
    //   bkash: { app_key, app_secret, username, password }
    //   nagad: { merchant_id, public_key, private_key }
    //   rocket/upay/card: merchant credentials for the chosen aggregator
    providers: {
      bkash: {
        app_key: process.env.BKASH_APP_KEY || "",
        app_secret: process.env.BKASH_APP_SECRET || "",
        username: process.env.BKASH_USERNAME || "",
        password: process.env.BKASH_PASSWORD || "",
      },
      nagad: {
        merchant_id: process.env.NAGAD_MERCHANT_ID || "",
        public_key: process.env.NAGAD_PUBLIC_KEY || "",
        private_key: process.env.NAGAD_PRIVATE_KEY || "",
      },
    },
  };
}

/**
 * Initiate a payment against a gateway.
 * sandbox: returns immediately with a pending payment that accepts any OTP.
 * live: performs the real initialize call (stub — fill per provider).
 */
async function createPayment(gatewayId, payload) {
  const gw = getGateway(gatewayId);
  const { mode } = config();
  const paymentId = newPaymentId(gw.id === "card" ? "CRD" : "PY");

  if (gw.id === "wallet") {
    return { paymentId, gateway: gw.id, status: "ready", mode, meta: { otp: false } };
  }

  if (mode === "sandbox") {
    return {
      paymentId,
      gateway: gw.id,
      status: "pending",
      mode,
      meta: { otp: gw.otp, sandbox: true, endpoint: gw.sandboxUrl },
    };
  }

  // ---- LIVE integration (replace stub with real provider call) ----
  // bKash example:
  //   POST {gw.liveUrl}/create  { amount, merchantInvoiceNumber, ... }
  //     -> { paymentID, bkashURL }
  // Nagad example:
  //   POST {gw.liveUrl}/initialize/... with signed payload -> { callBackUrl }
  // Rocket/Upay/Card commonly route through SSLCommerz / ShurjoPay / etc.
  const missing = Object.values(config().providers[gw.id] || {}).filter((v) => !v);
  if (missing.length) {
    const err = new Error(
      `Live ${gw.label} credentials not configured. Set them via functions env (e.g. BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD).`
    );
    err.code = "provider-not-configured";
    throw err;
  }

  // TODO(provider): perform the real create-payment HTTP call here.
  return {
    paymentId,
    gateway: gw.id,
    status: "pending",
    mode,
    meta: { otp: gw.otp, endpoint: gw.liveUrl },
  };
}

/**
 * Execute / verify a pending payment.
 * sandbox: any non-empty OTP succeeds (demo convenience).
 * live: call the provider's execute endpoint (stub).
 */
async function executePayment(gatewayId, paymentId, otp) {
  const gw = getGateway(gatewayId);
  const { mode } = config();

  if (gw.id === "wallet") {
    return { status: "success", reference: newReference(), mode };
  }

  if (mode === "sandbox") {
    if (!otp || String(otp).trim().length < 4) {
      const err = new Error("OTP/PIN is required to confirm the payment.");
      err.code = "otp-required";
      throw err;
    }
    return { status: "success", reference: newReference(), mode };
  }

  // TODO(provider): call execute/verify endpoint with the OTP here.
  return { status: "success", reference: newReference(), mode };
}

async function queryPayment(gatewayId, paymentId) {
  const gw = getGateway(gatewayId);
  const { mode } = config();
  return { paymentId, gateway: gw.id, status: "success", mode };
}

module.exports = {
  GATEWAYS,
  LIST,
  getGateway,
  createPayment,
  executePayment,
  queryPayment,
  newPaymentId,
  newReference,
  config,
};
