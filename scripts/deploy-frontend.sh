#!/usr/bin/env bash
# 프론트 production 빌드 → S3 sync → CloudFront 캐시 무효화
#
# 사전 준비 (맥, 1회):
#   1. IAM 사용자 생성 (아래 정책) → Access key 발급
#   2. aws configure   (또는 ~/.aws/credentials 에 [default] 프로필)
#   3. export CLOUDFRONT_DISTRIBUTION_ID=E1234...  (CloudFront 콘솔 → 배포 ID)
#
# 사용:
#   CLOUDFRONT_DISTRIBUTION_ID=E1234... ./scripts/deploy-frontend.sh
#   또는 scripts/deploy-frontend.env 파일에 변수 저장 후 실행
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/scripts/deploy-frontend.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

S3_BUCKET="${S3_BUCKET:-storyahub-frontend}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
API_BASE="${VITE_API_BASE:-https://api.storyahub.com}"
DIST_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI 가 없습니다. brew install awscli"
  exit 1
fi

if [[ -z "$DIST_ID" ]]; then
  echo "CLOUDFRONT_DISTRIBUTION_ID 가 필요합니다."
  echo "  CloudFront 콘솔 → storyahub-frontend 배포 → ID (E로 시작)"
  echo "  export CLOUDFRONT_DISTRIBUTION_ID=E..."
  echo "  또는 $ENV_FILE 에 저장"
  exit 1
fi

echo "→ AWS 자격 확인"
aws sts get-caller-identity --output text >/dev/null

echo "→ production 빌드 (VITE_API_BASE=$API_BASE)"
cd "$ROOT/frontend"
printf 'VITE_API_BASE=%s\n' "$API_BASE" > .env.production
npm run build

echo "→ S3 sync s3://$S3_BUCKET/"
aws s3 sync dist/ "s3://$S3_BUCKET/" --delete --region "$AWS_REGION"

echo "→ CloudFront 무효화 ($DIST_ID)"
INV_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)"
echo "   invalidation: $INV_ID (1~3분 후 record.storyahub.com 반영)"

echo "✓ 완료 — https://record.storyahub.com"
