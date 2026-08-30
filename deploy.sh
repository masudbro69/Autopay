#!/usr/bin/env bash
# ============================================================
# Autopay — one-command live deployment
# Deploys Firestore rules + indexes, Cloud Functions (v1), and
# Hosting to your Firebase project (auto-pay-66e8c).
#
# Run from a GitHub Codespace or any machine with Node installed:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requirements:
#   1. Firebase CLI (auto-installed below)
#   2. firebase login  (interactive — opens a browser / gives a URL)
#
# Backend compatibility:
#   - Cloud Functions are written against the v1 API, which runs on
#     the FREE Spark plan as well as Blaze. You do NOT need Blaze to
#     deploy or call these functions.
#   - The scheduled auto-pay processor is OPTIONAL and only registered
#     when AUTOPAY_ENABLE_SCHEDULER=1 (Cloud Scheduler requires Blaze).
#     Without it, the dashboard "Run due charges" button still works.
# ============================================================
set -euo pipefail

PROJECT="auto-pay-66e8c"
FB_SPEC="firebase-tools@15.28.2"

if command -v firebase >/dev/null 2>&1; then
  FB=(firebase)
else
  FB=(npx --yes "$FB_SPEC")
fi

echo "==> 1/7  Checking Firebase CLI"
"${FB[@]}" --version

echo "==> 2/7  Login"
"${FB[@]}" login

echo "==> 3/7  Selecting project: $PROJECT"
"${FB[@]}" use "$PROJECT"

echo "==> 4/7  Owner email (unlocks the Earnings / আয় dashboard)"
if [ -n "${AUTOPAY_OWNER_EMAIL:-}" ]; then
  OWNER="$AUTOPAY_OWNER_EMAIL"
else
  read -rp "Your owner email (default: officialmasudbro@gmail.com): " OWNER
  OWNER="${OWNER:-officialmasudbro@gmail.com}"
fi
# The backend already defaults to officialmasudbro@gmail.com and the owner
# UID G5rWSqjeq4MYmqJxupU3WIRLqIB3, so this step is optional. It persists the
# value via the v1 config API (read by functions.config().autopay.owner_email).
if [ -n "$OWNER" ]; then
  "${FB[@]}" functions:config:set autopay.owner_email="$OWNER" --project "$PROJECT" >/dev/null 2>&1 || \
    echo "   ⚠️  Could not persist owner email (works without it — backend default used)."
fi

echo "==> 5/7  Deploy Firestore rules + indexes"
"${FB[@]}" deploy --only firestore:rules,firestore:indexes --project "$PROJECT"

echo "==> 6/7  Deploy Cloud Functions (v1 — works on Spark or Blaze)"
"${FB[@]}" deploy --only functions --project "$PROJECT"

echo "==> 7/7  Deploy Hosting (the luxury UI)"
"${FB[@]}" deploy --only hosting --project "$PROJECT"

echo ""
echo "============================================================="
echo "✅  LIVE:  https://$PROJECT.web.app"
echo ""
echo "Post-deploy checklist:"
echo "  • Authentication → Sign-in method → Google ✅ (enable)"
echo "  • Authentication → Settings → Authorized domains → add:"
echo "      $PROJECT.web.app, $PROJECT.firebaseapp.com"
echo "  • (Optional) Blaze plan → then enable auto-charge scheduler:"
echo "      AUTOPAY_ENABLE_SCHEDULER=1 ./deploy.sh"
echo "============================================================="
