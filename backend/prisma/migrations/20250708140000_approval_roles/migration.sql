-- 결재 단계: 역할 기반 결재 (경영지원 아무나, COO/CEO 등)
ALTER TABLE "ErpApprovalStep" ALTER COLUMN "approverId" DROP NOT NULL;
ALTER TABLE "ErpApprovalStep" ADD COLUMN IF NOT EXISTS "approverRole" TEXT;

ALTER TABLE "ErpApprovalStep" DROP CONSTRAINT IF EXISTS "ErpApprovalStep_approverId_fkey";
ALTER TABLE "ErpApprovalStep" ADD CONSTRAINT "ErpApprovalStep_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
