#!/usr/bin/env bash
# 프론트 + 백엔드 한 번에 배포 (GitHub push 이후 맥에서 실행)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/deploy-frontend.sh"
"$ROOT/scripts/deploy-backend.sh"
