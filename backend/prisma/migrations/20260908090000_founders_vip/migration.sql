-- 참관객 VIP 초대 — 참가비를 받지 않는다
ALTER TABLE "ErpFoundersApply" ADD COLUMN "vip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErpFoundersApply" ADD COLUMN "vipNote" TEXT NOT NULL DEFAULT '';
