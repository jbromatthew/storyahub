-- 마스터 로그인 정보 (토큰 만료 시 자동 재발급용)
ALTER TABLE "ErpOpenApiConfig"
  ADD COLUMN "authBaseUrl"    TEXT NOT NULL DEFAULT 'https://brojserver.broj.co.kr',
  ADD COLUMN "authPrefix"     TEXT NOT NULL DEFAULT '/BroJServer/v1',
  ADD COLUMN "authType"       TEXT NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN "memberId"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "memberPassword" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tokenAt"        TIMESTAMP(3);
