-- 팀장 평가 점수와 분기별 규칙 값을 저장한다.
ALTER TABLE "ErpIncentiveQuarter" ADD COLUMN IF NOT EXISTS "leaderScores" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ErpIncentiveQuarter" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
