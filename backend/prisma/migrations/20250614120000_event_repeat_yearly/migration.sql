-- 매년 같은 날짜에 반복되는 일정
ALTER TABLE "Event" ADD COLUMN "repeatYearly" BOOLEAN NOT NULL DEFAULT false;
