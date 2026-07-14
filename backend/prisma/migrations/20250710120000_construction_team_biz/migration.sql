-- Extend construction teams (협력업체) with business-registration info + employees
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "bizRegNo" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "ceoName" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "ceoTitle" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "ceoPhone" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "address" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "bizType" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "bizItem" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "taxEmail" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "bankAccount" TEXT;
ALTER TABLE "ErpConstructionTeam" ADD COLUMN "employees" TEXT NOT NULL DEFAULT '[]';
