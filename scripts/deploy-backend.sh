#!/usr/bin/env bash
# 백엔드 production 배포 → 로컬 빌드 + EC2 rsync(dist 포함) + prisma migrate + PM2 restart
#
# EC2는 GitLab/GitHub와 git으로 연결되어 있지 않아도 됩니다 (rsync 방식).
# GitHub로 코드만 옮긴 뒤에도 이 스크립트 그대로 사용 가능합니다.
#
# NOTE: tsc 빌드는 EC2에서 OOM이 나므로 로컬(mac)에서 빌드한 dist를 그대로 올린다.
#       원격에서는 빌드하지 않고 prisma generate/migrate + pm2 restart만 수행.
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
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

echo "→ 로컬 빌드 (tsc) — EC2 OOM 회피"
(cd "$ROOT/backend" && npm run build)

echo "→ EC2 연결 확인 ($EC2_USER@$EC2_HOST)"
ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" "echo ok" >/dev/null

echo "→ backend rsync (dist 포함, node_modules 제외)"
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude .env.local \
  -e "$RSYNC_SSH" \
  "$ROOT/backend/" \
  "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"

echo "→ migrate + PM2 restart (원격 빌드 없음)"
ssh "${SSH_OPTS[@]}" "${EC2_USER}@${EC2_HOST}" bash -s <<'REMOTE'
set -euo pipefail
cd ~/storyahub/backend
# NOTE: do not `source .env.production` into bash — JSON values get mangled.
# The Node app loads .env.production via dotenv on startup.
export NODE_ENV=production
npx prisma generate
# migrate는 프로덕션 RDS 대상 — .env(localhost)가 아니라 .env.production의
# DATABASE_URL만 주입해 실행한다 (JSON 값은 건드리지 않음).
DB_URL="$(grep -E '^DATABASE_URL=' .env.production | head -1 | cut -d= -f2- | sed 's/^["'"'"']//;s/["'"'"']$//')"
DATABASE_URL="$DB_URL" npx prisma migrate deploy
pm2 restart storyahub-api --update-env || pm2 restart storyahub-api
sleep 2
curl -sf http://localhost:4000/health
REMOTE

echo "✓ 백엔드 배포 완료 — https://api.storyahub.com"
