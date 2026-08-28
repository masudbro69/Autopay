# Autopay ⚡ — বাংলাদেশের ০% ফি পেমেন্ট ও অটো-পে সিস্টেম

> A professional, **0% transaction-fee** payment + auto-pay (recurring subscription) system for Bangladesh — built with **Firebase** (Functions + Firestore + Hosting).

**বাংলা সারসংক্ষেপ:** Autopay একটি পূর্ণাঙ্গ অনলাইন পেমেন্ট সিস্টেম — bKash, Nagad, Rocket, Upay, কার্ড ও ব্যাংক ট্রান্সফারের মাধ্যমে পেমেন্ট গ্রহণ, হোস্টেড চেকআউট লিংক, ইনভয়েস, ওয়ালেট, এবং দৈনিক/সাপ্তাহিক/মাসিক/বার্ষিক **অটো-পে** সাবস্ক্রিপশন। সম্পূর্ণ **০% ফি** — প্রতিটি টাকা সরাসরি (passthrough) পৌঁছে যায়, Autopay কোনো কমিশন নেয় না।

---

## ✨ Features

- 🏦 **Merchant + Customer** — দুটো রোল এক সিস্টেমে (merchant dashboard + customer wallet)
- 🅰️ **0% transaction fee** — passthrough wallet, কোনো মার্কআপ নেই
- 🔁 **Auto-pay subscriptions** — daily / weekly / monthly / yearly recurring charges (scheduled processor)
- 🔗 **Hosted checkout links** — লিংক তৈরি করে শেয়ার করুন, গ্রাহক সেকেন্ডে পে করবে
- 🧾 **Invoices** — ইমেইল-ভিত্তিক ইনভয়েস তৈরি ও ট্র্যাকিং
- 💰 **Wallet** — টপ-আপ, ব্যালেন্স, পেওআউট (bank/MFS)
- 📊 **Dashboard** — real-time stats, 14-day revenue chart, transaction history
- 🌐 **Bilingual UI** — বাংলা / English toggle
- 🛡️ **Secure** — Firestore security rules, atomic ledger transfers, audited transactions
- 🧪 **Instant demo mode** — কোনো সেটআপ ছাড়াই ব্রাউজারে চলবে (simulated money)

## 🚀 Quick start (Demo — no setup)

```bash
# Serve the web app locally
cd hosting
python3 -m http.server 8080
# open http://localhost:8080
```

**Demo accounts** (one-click login on the auth screen):

| Role | Email | Password |
|------|-------|----------|
| Merchant (Rahim Store) | `demo-merchant@autopay.bd` | `autopay` |
| Customer (Karim) | `demo-customer@autopay.bd` | `autopay` |

The demo runs a **full in-browser sandbox** (`hosting/js/demo.js`) that mirrors the Firebase backend — transfers, top-ups, payment links, subscriptions, payouts, and OTP flows all work with simulated Taka. Data persists in `localStorage`.

## 🏗️ Tech stack

- **Backend:** Firebase Cloud Functions (Node 20) — callable API + scheduled subscription processor
- **Database:** Cloud Firestore (rules in `firestore.rules`)
- **Frontend:** Vanilla JS SPA (no build step), bilingual, hash-router
- **Hosting:** Firebase Hosting (`hosting/`)
- **Payments:** 0% passthrough adapter layer for bKash / Nagad / Rocket / Upay / card (`functions/lib/gateways.js`)

## 📁 Structure

```
Autopay/
├── firebase.json              # Firebase config (emulators + hosting)
├── .firebaserc                # Project alias (autopay-bd)
├── firestore.rules            # Security rules
├── firestore.indexes.json     # Composite indexes
├── functions/
│   ├── index.js               # Callable functions + auto-pay scheduler
│   └── lib/gateways.js        # bKash/Nagad/Rocket/Upay/card adapters (sandbox + live stubs)
└── hosting/
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── i18n.js            # বাংলা / English strings
        ├── demo.js            # In-browser sandbox backend + seed data
        ├── backend.js         # Auto-selects demo vs live Firebase
        └── app.js             # Router + all views (dashboard, wallet, links, …)
```

## 🔌 Go live with Firebase

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com) (or use the `autopay-bd` alias in `.firebaserc`).
2. **Install & login:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use <your-project-id>
   ```
3. **Deploy rules, functions, and hosting:**
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only functions
   firebase deploy --only hosting
   ```
4. **Connect the frontend** — put your web app config in `hosting/js/backend.js`:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "...", authDomain: "autopay-bd.firebaseapp.com",
     projectId: "autopay-bd", storageBucket: "autopay-bd.appspot.com",
     messagingSenderId: "...", appId: "...",
   };
   ```
   Enable **Email/Password** sign-in under Authentication → Sign-in method.

The app auto-detects `window.FIREBASE_CONFIG` and switches from the demo sandbox to the real Firebase backend (Auth + Firestore + callable Functions).

## 💳 Real payment gateways (live mode)

`functions/lib/gateways.js` defines one adapter contract for every provider. Sandbox mode (`AUTOPAY_MODE=sandbox`, default) is instant and OTP-verified for demo. For production, set `AUTOPAY_MODE=live` and supply credentials via Functions secrets:

```bash
firebase functions:secrets:set BKASH_APP_KEY
firebase functions:secrets:set BKASH_APP_SECRET
firebase functions:secrets:set BKASH_USERNAME
firebase functions:secrets:set BKASH_PASSWORD
```

Then implement each provider's `create`/`execute` HTTP call in the clearly marked `TODO(provider)` blocks (bKash tokenized checkout, Nagad DFS, SSLCommerz/ShurjoPay for Rocket/Upay/card). The ledger, links, invoices, subscriptions, and payouts already work end-to-end — only the external HTTP handshake needs your merchant credentials.

## ⏰ Auto-pay scheduler

`autopay_processDueSubscriptions` runs **every hour**, charges every active subscription whose `nextChargeAt` has passed, then rolls the next charge forward. Wallet-method charges require sufficient customer balance; insufficient-funds retries in 1 hour.

## 🔐 Security

- Firestore rules lock wallets/transactions/invoices/subscriptions to their owners
- Only backend Functions can mutate balances (no client-side balance writes)
- Transfers are atomic (`runTransaction`) with a 0-fee audit record per movement

## ⚠️ Disclaimer

This is a **production-grade skeleton with a sandbox payment layer**. Real funds are never moved unless you wire live PSP credentials and deploy to Firebase. Test thoroughly with provider sandboxes and PCI/regulatory review before handling real money.

---

© Autopay — ০% ফি, চিরকাল।
