-- ErpEmployee: 계정 없이 직원 등록 + 나중에 계정 발부
ALTER TABLE "ErpEmployee" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "ErpEmployee" ADD COLUMN IF NOT EXISTS "email" TEXT;

UPDATE "ErpEmployee" e
SET "name" = u."name", "email" = u."email"
FROM "User" u
WHERE e."userId" = u."id" AND (e."name" IS NULL OR e."email" IS NULL);

ALTER TABLE "ErpEmployee" DROP CONSTRAINT IF EXISTS "ErpEmployee_userId_fkey";
ALTER TABLE "ErpEmployee" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ErpEmployee" ADD CONSTRAINT "ErpEmployee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ErpEmployee_email_idx" ON "ErpEmployee"("email");
CREATE INDEX IF NOT EXISTS "ErpEmployee_status_idx" ON "ErpEmployee"("status");
