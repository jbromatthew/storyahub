-- 지식백과: 책·강연·지식 대분류 + 책 메타
ALTER TABLE "KbArticle" ADD COLUMN "section" TEXT NOT NULL DEFAULT 'knowledge';
ALTER TABLE "KbArticle" ADD COLUMN "bookMeta" JSONB;
