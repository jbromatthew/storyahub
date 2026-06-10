#!/usr/bin/env bash
# 로컬 개발: EC2 SSH 터널(RDS) + backend/frontend
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EC2_HOST="${EC2_HOST:-43.202.201.187}"
EC2_USER="${EC2_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
RDS_HOST="${RDS_HOST:-storyahub.czqkai6ywh46.ap-northeast-2.rds.amazonaws.com}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5433}"

if ! nc -z localhost "$LOCAL_DB_PORT" 2>/dev/null; then
  echo "→ SSH 터널 시작 (localhost:${LOCAL_DB_PORT} → ${RDS_HOST}:5432)"
  ssh -f -N -o ExitOnForwardFailure=yes \
    -i "$SSH_KEY" \
    -L "${LOCAL_DB_PORT}:${RDS_HOST}:5432" \
    "${EC2_USER}@${EC2_HOST}"
  sleep 0.5
fi

echo "→ dev 서버 시작"
cd "$ROOT"
npm run dev
