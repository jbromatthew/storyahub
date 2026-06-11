#!/usr/bin/env bash
# storyahub DB 완전 초기화 → Prisma 마이그레이션 재적용
# 기본: development (.env.development)
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_ENV="${NODE_ENV:-development}"
echo "→ 환경: ${NODE_ENV} (.env.${NODE_ENV})"

echo "→ public 스키마 전체 삭제..."
node scripts/prisma-with-env.mjs db execute --file scripts/wipe-db.sql

echo "→ Storyahub 스키마 마이그레이션 적용..."
node scripts/prisma-with-env.mjs migrate deploy

echo "완료. 테이블 목록:"
node scripts/prisma-with-env.mjs db execute --stdin <<'SQL'
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
SQL
