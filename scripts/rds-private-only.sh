#!/usr/bin/env bash
# RDS 퍼블릭 액세스 끄기 (운영 시 EC2 전용으로 되돌릴 때)
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
DB_ID="${RDS_DB_ID:-database-1}"

aws rds modify-db-instance \
  --region "$REGION" \
  --db-instance-identifier "$DB_ID" \
  --no-publicly-accessible \
  --apply-immediately \
  --no-cli-pager

echo "퍼블릭 액세스 비활성화 요청 완료."
