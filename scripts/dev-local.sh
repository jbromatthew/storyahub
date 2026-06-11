#!/usr/bin/env bash
# 로컬 개발: 로컬 PostgreSQL (.env.development) + backend/frontend
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_ENV=development

echo "→ development (.env.development / localhost:5432)"
cd "$ROOT"
npm run dev
