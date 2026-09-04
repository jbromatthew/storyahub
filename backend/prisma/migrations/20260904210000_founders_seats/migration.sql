-- 참관 좌석 — 선착순 50명 의자, 51~100명 스탠딩
ALTER TABLE "ErpFoundersApply"
  ADD COLUMN "seatNo" INTEGER,
  ADD COLUMN "seatType" TEXT NOT NULL DEFAULT '';
