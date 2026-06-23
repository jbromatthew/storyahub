#!/usr/bin/env bash
# 백엔드 production 배포 → EC2 rsync + prisma migrate + build + PM2 restart
#
# EC2는 GitLab/GitHub와 git으로 연결되어 있지 않아도 됩니다 (rsync 방식).
# GitHub로 코드만 옮긴 뒤에도 이 스크립트 그대로 사용 가능합니다.
#
# 사용:
#   ./scripts/deploy-backend.sh
#   또는 scripts/deploy-backend.env 에 EC2_HOST 등 저장
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/scripts/deploy-backend.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

EC2_HOST="${EC2_HOST:-43.202.201.187}"
EC2_USER="${EC2_USER:-ubuntu}"
REMOTE_DIR="${REMOTE_DIR:-~/storyahub/backend}"
SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi
SSH="${SSH_OPTS[@]}"
RSYNC_SSH="ssh ${SSH[*]}"

echo "→ EC2 연결 확인 ($EC2_USER@$EC2_HOST)"
ssh "${SSH[@]}" "${EC2_USER}@${EC2_HOST}" "echo ok" >/dev/null

echo "→ backend rsync"
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude .env.local \
  --exclude dist \
  -e "$RSYNC_SSH" \
  "$ROOT/backend/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

echo "→ migrate + build + PM2 restart"
ssh "${SSH[@]}" "${EC2_USER}@${EC2_HOST}" bash -s <<'REMOTE'
set -euo pipefail
cd ~/storyahub/backend
export NODE_ENV=production
set -a
source .env.production
set +a
npx prisma generate
npm run build
npx prisma migrate deploy
pm2 restart storyahub-api
sleep 2
curl -sf http://localhost:4000/health
REMOTE

echo "✓ 백엔드 배포 완료 — https://api.storyahub.com"
