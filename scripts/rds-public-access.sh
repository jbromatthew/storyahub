#!/usr/bin/env bash
# RDS database-1 — 퍼블릭 액세스 + 로컬 IP에서 5432 허용
# 사전: aws configure 또는 AWS_PROFILE 설정 완료
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
DB_ID="${RDS_DB_ID:-database-1}"
MY_IP="${MY_IP:-$(curl -s --max-time 5 https://ifconfig.me/ip)}"

if [[ -z "$MY_IP" ]]; then
  echo "내 IP를 가져오지 못했습니다. MY_IP=x.x.x.x ./scripts/rds-public-access.sh 로 실행하세요."
  exit 1
fi

echo "→ 리전: $REGION | DB: $DB_ID | 허용 IP: $MY_IP/32"
echo ""

# 1) 퍼블릭 액세스 활성화
echo "→ RDS 퍼블릭 액세스 활성화..."
aws rds modify-db-instance \
  --region "$REGION" \
  --db-instance-identifier "$DB_ID" \
  --publicly-accessible \
  --apply-immediately \
  --no-cli-pager

echo "→ RDS 수정 요청 완료 (available 될 때까지 1~3분 대기)"
aws rds wait db-instance-available \
  --region "$REGION" \
  --db-instance-identifier "$DB_ID"

# 2) RDS에 붙은 보안 그룹 ID 조회
echo "→ 보안 그룹 조회..."
SG_ID=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

echo "   SG: $SG_ID"

# 3) 인바운드 5432 (내 IP) — 이미 있으면 스킵
RULE_EXISTS=$(aws ec2 describe-security-groups \
  --region "$REGION" \
  --group-ids "$SG_ID" \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\`].IpRanges[?CidrIp==\`${MY_IP}/32\`]" \
  --output text 2>/dev/null || true)

if [[ -n "$RULE_EXISTS" ]]; then
  echo "→ 5432 규칙($MY_IP/32) 이미 존재 — 스킵"
else
  echo "→ 보안 그룹 인바운드 추가: PostgreSQL 5432 ← $MY_IP/32"
  aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 5432 \
    --cidr "${MY_IP}/32" \
    --no-cli-pager
fi

# 4) 확인
ENDPOINT=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

PUBLIC=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].PubliclyAccessible' \
  --output text)

echo ""
echo "완료."
echo "  엔드포인트: $ENDPOINT"
echo "  퍼블릭 액세스: $PUBLIC"
echo "  DNS 확인: dig +short $ENDPOINT"
echo ""
echo "다음:"
echo "  cd backend && npm run db:migrate"
