# Autopay ⚡ — বাংলাদেশের পেমেন্ট ও অটো-পে প্ল্যাটফর্ম

> A professional payment + auto-pay (recurring subscription) system for Bangladesh — built on **Firebase** (Authentication, Firestore, Cloud Functions, Hosting). Connected to the real project **`auto-pay-66e8c`**. No demo/seed data — the database starts clean and every record is real.

**বাংলা সারসংক্ষেপ:** bKash, Nagad, Rocket, Upay, কার্ড ও ব্যাংকে পেমেন্ট গ্রহণ, হোস্টেড চেকআউট লিংক, ইনভয়েস, ওয়ালেট, পেওআউট এবং দৈনিক/সাপ্তাহিক/মাসিক/বার্ষিক **অটো-পে** সাবস্ক্রিপশন। Google লগইন (ভুয়া অ্যাকাউন্ট প্রতিরোধে) + ইমেইল/পাসওয়ার্ড। প্রতি লেনদেনে স্বচ্ছ **২% ফ্ল্যাট ফি** — যা আপনার (প্ল্যাটফর্ম মালিকের) আয়।

---

## 💰 Monetization — how you earn

Every payment / invoice / subscription charge collects a transparent platform fee:

| Setting | Default | Env var |
|---------|---------|---------|
| Fee rate | **2%** | `AUTOPAY_FEE_RATE` |
| Minimum fee | **৳5** | `AUTOPAY_FEE_MIN` |
| Maximum fee | **৳500** | `AUTOPAY_FEE_MAX` |
| Owner email | `officialmasudbro@gmail.com` | `AUTOPAY_OWNER_EMAIL` |

- The **buyer pays the full amount**, the **merchant receives (amount − fee)**, and the **fee settles into the platform owner's wallet** — atomically, in one Firestore transaction.
- Sign in with the **owner email** to unlock the **Earnings (আয়)** dashboard — total fee revenue, fee count, platform balance, and a live fee ledger.
- Optional pricing tiers are shown on the landing page (Growth 1.5% / Scale 1% as paid plans) for future monetization.

## 🔐 Authentication

- **Google Sign-In** (Firebase Auth) — primary, prevents temp-mail/fake accounts.
- Email/password — available as a secondary method.
- Google sign-in requires the **Google provider enabled** in Firebase Console → Authentication → Sign-in method (already enabled for this project).

## 🚀 Deploy

Two ready-made CI workflows live in **`ci/`** (`ci/firebase.yml`, `ci/github-pages.yml`). They are stored outside `.github/workflows/` because an automated integration can't commit workflow files to your repo — just drop them in and they activate.

### Step 1 — enable CI (one time, 2 minutes)

```bash
# On your machine:
mkdir -p .github/workflows
cp ci/firebase.yml ci/github-pages.yml .github/workflows/
git add .github/workflows && git commit -m "Add CI/CD workflows" && git push

# Generate a Firebase CI token
npm i -g firebase-tools
firebase login:ci     # prints a token — copy it

# GitHub → repo → Settings → Secrets and variables → Actions → New secret
#   FIREBASE_TOKEN = <token>

# Also set your owner email so YOU see the Earnings dashboard:
#   firebase functions:secrets:set AUTOPAY_OWNER_EMAIL
#   (or in Firebase Console → Functions → Configuration)
```

After that, every push auto-deploys:

- **`ci/firebase.yml`** → deploys **Functions + Firestore rules + indexes + Hosting** to `auto-pay-66e8c` (**LIVE**).
- **`ci/github-pages.yml`** → deploys the static app to **GitHub Pages** (sandbox preview).

### Option B — Deploy locally (no CI)

```bash
npm i -g firebase-tools
firebase login
firebase use auto-pay-66e8c

# Owner email (required for the Earnings dashboard)
firebase functions:secrets:set AUTOPAY_OWNER_EMAIL

firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting
```

### Run locally (sandbox preview)

```bash
cd hosting
python3 -m http.server 8080     # → http://localhost:8080
```

### Authorized domains (Google sign-in)

Add every domain where the app is served to
**Firebase Console → Authentication → Settings → Authorized domains**:

- `auto-pay-66e8c.web.app` / `auto-pay-66e8c.firebaseapp.com`
- `masudbro69.github.io` (if you keep the GitHub Pages preview)
- any custom domain

## 🏗️ Architecture

```
hosting/js/config.js      → Firebase web config + fee/owner config (public)
hosting/js/backend.js     → LIVE (Firebase Auth/Firestore/Functions) ⇄ sandbox fallback
hosting/js/sandbox.js     → dev-only, starts EMPTY (no fake data), same fee math
hosting/js/app.js         → router + all views (dashboard, wallet, links, earnings, …)
functions/index.js        → callable API + fee engine + hourly auto-pay scheduler
functions/lib/gateways.js → bKash/Nagad/Rocket/Upay/card adapter layer
firestore.rules           → ownership-locked security rules
```

### Runtime mode

| Host | Mode | Backend |
|------|------|---------|
| `*.web.app` / `*.firebaseapp.com` (Firebase Hosting) | **live** | real Firebase |
| `*.github.io`, `localhost` (preview) | **sandbox** | in-browser (empty DB) |

Force a mode with `?mode=live` or `?mode=sandbox`.

> ⚠️ The GitHub Pages preview is a **sandbox** (simulated money, localStorage) because Cloud Functions can't run on static hosting. Deploy to Firebase Hosting for the real money backend.

## 📁 Key endpoints (callable)

`autopay_register` · `autopay_getProfile` · `autopay_getDashboard` · `autopay_getEarnings` ·
`autopay_topUp` / `autopay_confirmTopUp` · `autopay_createLink` / `autopay_payLink` / `autopay_getLink` / `autopay_listLinks` ·
`autopay_createInvoice` / `autopay_payInvoice` / `autopay_listInvoices` ·
`autopay_createPlan` / `autopay_listPlans` · `autopay_createSubscription` / `autopay_cancelSubscription` / `autopay_listSubscriptions` / `autopay_listMerchantSubscriptions` ·
`autopay_requestPayout` / `autopay_listPayouts` · `autopay_listTransactions` / `autopay_listCustomers` ·
`autopay_processDueSubscriptions` (manual) + scheduled `autopay_processDueSubscriptionsScheduled` (hourly).

## 🛡️ Security

- Firestore rules lock wallets/transactions/invoices/subscriptions to their owners.
- Only Cloud Functions can mutate balances (atomic transactions; client can't self-credit).
- Fee settlement is part of the same transaction as the payment — no double-spend, no orphaned fees.

## ⚠️ Production note

The gateway layer (`functions/lib/gateways.js`) ships with a **sandbox adapter** (deterministic, OTP-verified) and clearly marked live integration points. Before processing real money, add your bKash/Nagad/aggregator merchant credentials (Functions secrets) and complete the provider handshakes, and complete PCI/regulatory review.

---

© Autopay — ২% ফ্ল্যাট ফি, স্বচ্ছ ও নিরাপদ।
