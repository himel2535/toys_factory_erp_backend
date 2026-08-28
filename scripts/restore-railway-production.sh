#!/usr/bin/env bash
# Restore Toys Factory ERP backend on Railway (interactive).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Railway production restore ==="
echo "Repo: $ROOT"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required."
  exit 1
fi

echo "Step 1: Login to Railway (browser will open)"
npx --yes @railway/cli login

echo ""
echo "Step 2: Link this repo to your Railway project/service"
echo "        (select existing toys_factory_erp_backend project, or create one from GitHub)"
npx --yes @railway/cli link

echo ""
echo "Step 3: Set required environment variables on Railway"
echo "        Required: MONGODB_URI, JWT_SECRET, CORS_ORIGIN"
echo "        CORS_ORIGIN must include:"
echo "          http://localhost:3000"
echo "          https://toys-factory-erp-one.vercel.app"
echo ""
read -r -p "Press Enter after env vars are set in Railway dashboard or via 'railway variables set'..."

echo ""
echo "Step 4: Deploy backend"
npm run build
npx --yes @railway/cli up --detach

echo ""
echo "Step 5: Show public domain"
npx --yes @railway/cli domain

echo ""
echo "Step 6: Verify health (update RAILWAY_URL if domain changed)"
RAILWAY_URL="$(npx --yes @railway/cli domain 2>/dev/null | tail -1 | tr -d ' ' || true)"
if [[ -n "$RAILWAY_URL" && "$RAILWAY_URL" != http* ]]; then
  RAILWAY_URL="https://${RAILWAY_URL}"
fi
export RAILWAY_URL="${RAILWAY_URL:-https://toysfactoryerpbackend-production.up.railway.app}"
node scripts/verify-production-api.mjs

echo ""
echo "If Railway URL changed, update Vercel env:"
echo "  NEXT_PUBLIC_API_URL=\${RAILWAY_URL}/api/v1"
echo "  NEXT_PUBLIC_SOCKET_URL=\${RAILWAY_URL}"
echo "Then redeploy the Vercel frontend (NEXT_PUBLIC_* is build-time)."
