-- ERP 멤버 승인 + 지식 기본 비공개
ALTER TABLE "ErpEmployee" ADD COLUMN IF NOT EXISTS "memberStatus" TEXT NOT NULL DEFAULT 'pending';

UPDATE "ErpEmployee" e
SET "memberStatus" = 'approved'
FROM "User" u
WHERE e."userId" = u.id AND lower(u.email) = 'matthew@broj.company';

UPDATE "ErpEmployee" SET "memberStatus" = 'approved' WHERE "userId" IS NOT NULL AND "memberStatus" = 'pending';

ALTER TABLE "KbArticle" ALTER COLUMN "visibility" SET DEFAULT 'private';
