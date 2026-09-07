-- RND 티켓 붙임 파일
ALTER TABLE "ErpRndTicket" ADD COLUMN "files" JSONB NOT NULL DEFAULT '[]';
