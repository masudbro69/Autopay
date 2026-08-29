#!/usr/bin/env bash
# ============================================================
# Autopay — one-command live deployment
# Deploys Firestore rules + indexes, Cloud Functions, and Hosting
# to your Firebase project (auto-pay-66e8c).
#
# Run from a GitHub Codespace or any machine with Node installed:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Requirements:
#   1. Firebase CLI (auto-installed below)
#   2. firebase login  (interactive — opens a browser / gives a URL)
#   3. The project must be on the Blaze (pay-as-you-go) plan to run
#      Cloud Functions & the scheduled auto-pay processor.
# ============================================================
set -euo pipefail

PROJECT="auto-pay-66e8c"
FB_SPEC="firebase-tools@15.28.2"

if command -v firebase >/dev/null 2>&1; then
  FB=(firebase)
else
  FB=(npx --yes "$FB_SPEC")
fi

echo "==> 1/6  Checking Firebase CLI"
"${FB[@]}" --version

echo "==> 2/6  Login"
"${FB[@]}" login

echo "==> 3/6  Selecting project: $PROJECT"
"${FB[@]}" use "$PROJECT"

echo "==> 4/6  Owner email (unlocks the Earnings / আয় dashboard)"
if [ -n "${AUTOPAY_OWNER_EMAIL:-}" ]; then
  OWNER="$AUTOPAY_OWNER_EMAIL"
else
  read -rp "Your owner email (default: officialmasudbro@gmail.com): " OWNER
  OWNER="${OWNER:-officialmasudbro@gmail.com}"
fi
if [ -n "$OWNER" ]; then
  printf '%s' "$OWNER" | "${FB[@]}" functions:secrets:set AUTOPAY_OWNER_EMAIL || \
    echo "   ⚠️  Could not set AUTOPAY_OWNER_EMAIL (needs Blaze plan). Set it later."
fi

echo "==> 5/6  Deploy Firestore rules + indexes"
"${FB[@]}" deploy --only firestore:rules,firestore:indexes --project "$PROJECT"

echo "==> 6/6  Deploy Functions + Hosting"
"${FB[@]}" deploy --only functions,hosting --project "$PROJECT"

echo ""
echo "============================================================="
echo "✅  LIVE:  https://$PROJECT.web.app"
echo ""
echo "Post-deploy checklist:"
echo "  • Authentication → Sign-in method → Google ✅ (enable)"
echo "  • Authentication → Settings → Authorized domains → add:"
echo "      $PROJECT.web.app, $PROJECT.firebaseapp.com"
echo "  • Blaze plan required (Functions + scheduled auto-pay)"
echo "============================================================="
