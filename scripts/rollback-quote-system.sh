#!/usr/bin/env bash
# 견적 시스템 배포 이전(89ae0c5)으로 로컬 + 프로덕션 롤백
# 사용: ./scripts/rollback-quote-system.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROLLBACK_COMMIT="${ROLLBACK_COMMIT:-89ae0c5}"

echo "→ 로컬 코드를 $ROLLBACK_COMMIT 기준으로 되돌립니다"
cd "$ROOT"

git checkout "$ROLLBACK_COMMIT" -- \
  backend/prisma/schema.prisma \
  backend/src/index.ts \
  backend/src/routes/deals.ts \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/src/App.jsx \
  frontend/src/api/client.js

rm -rf backend/prisma/migrations/20250617100000_quote_system
rm -f backend/src/routes/organizations.ts backend/src/routes/products.ts
rm -f frontend/src/components/OrgProfilesSettings.jsx \
  frontend/src/components/ProductsSettings.jsx \
  frontend/src/components/QuoteEditor.jsx \
  frontend/src/components/QuotesView.jsx \
  frontend/src/quotePdf.js \
  frontend/src/quoteUtils.js

echo "→ frontend npm install (package.json 복원)"
cd "$ROOT/frontend" && npm install --silent

echo "→ 프로덕션 재배포 (이전 버전)"
cd "$ROOT" && ./scripts/deploy-all.sh

echo "✓ 롤백 완료 — 로컬·서버 모두 $ROLLBACK_COMMIT 상태입니다"
echo "  DB 마이그레이션(20250617100000_quote_system)은 RDS에 남아 있습니다."
echo "  테이블을 지우려면 EC2에서 prisma migrate resolve / 수동 DROP이 필요할 수 있습니다."
