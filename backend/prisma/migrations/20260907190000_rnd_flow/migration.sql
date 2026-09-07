-- RND팀이 일하는 법에 맞춰 티켓 구분을 다시 나눈다
--   defect  → qa      (QA티켓 · 결함)
--   request → improve (고객 요구사항 · 개선사항)
--   biz     → cxm     (사업부 티켓 · 이탈 방어)
--   improve → improve (그대로)
UPDATE "ErpRndTicket" SET "kind" = 'qa'      WHERE "kind" = 'defect';
UPDATE "ErpRndTicket" SET "kind" = 'improve' WHERE "kind" = 'request';
UPDATE "ErpRndTicket" SET "kind" = 'cxm'     WHERE "kind" = 'biz';

-- 노션 티켓 주소
ALTER TABLE "ErpRndTicket" ADD COLUMN "notionUrl" TEXT NOT NULL DEFAULT '';
