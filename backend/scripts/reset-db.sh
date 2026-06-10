#!/usr/bin/env bash
# storyahub DB 완전 초기화 → Prisma 스키마 재적용
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ public 스키마 전체 삭제..."
npx prisma db execute --file scripts/wipe-db.sql --schema prisma/schema.prisma

echo "→ Storyahub 스키마 마이그레이션 적용..."
npx prisma migrate deploy

echo "완료. 테이블 목록:"
npx prisma db execute --stdin --schema prisma/schema.prisma <<'SQL'
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SQL
