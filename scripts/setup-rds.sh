#!/usr/bin/env bash
# RDS 초기 설정: DB 생성 + Prisma 마이그레이션 적용
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "backend/.env 가 없습니다. cp backend/.env.example backend/.env 후 DATABASE_URL을 채우세요."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ "${DATABASE_URL:-}" == *"CHANGE_ME"* ]]; then
  echo "backend/.env 의 DATABASE_URL 비밀번호를 RDS 마스터 비밀번호로 바꿔주세요."
  exit 1
fi

echo "→ RDS 연결 테스트..."
if ! command -v psql &>/dev/null; then
  echo "psql 없음 — prisma migrate deploy 만 실행합니다."
else
  # storyahub DB 없으면 postgres DB로 접속해 생성
  BASE_URL="${DATABASE_URL/storyahub/postgres}"
  if ! psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
    echo "→ storyahub DB 생성 시도..."
    psql "$BASE_URL" -c "CREATE DATABASE storyahub;" 2>/dev/null || true
  fi
fi

echo "→ Prisma 마이그레이션 적용..."
cd "$ROOT/backend"
npx prisma migrate deploy
echo "완료."
