-- 이어서 작성하기
ALTER TABLE "ErpFoundersApply" ADD COLUMN "passHash" TEXT NOT NULL DEFAULT '';

CREATE TABLE "ErpFoundersDraft" (
  "id"        SERIAL PRIMARY KEY,
  "year"      INTEGER NOT NULL DEFAULT 2026,
  "phone"     TEXT NOT NULL,
  "passHash"  TEXT NOT NULL,
  "kind"      TEXT NOT NULL DEFAULT 'applicant',
  "step"      INTEGER NOT NULL DEFAULT 1,
  "payload"   JSONB NOT NULL DEFAULT '{}',
  "tries"     INTEGER NOT NULL DEFAULT 0,
  "lockedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ErpFoundersDraft_phone_key" ON "ErpFoundersDraft"("phone");
