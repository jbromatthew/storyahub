-- BROJ FOUNDERS — IR 피칭대회 회차·참가신청

CREATE TABLE "ErpFoundersRound" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notice" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpFoundersRound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpFoundersRound_year_key" ON "ErpFoundersRound"("year");

CREATE TABLE "ErpFoundersApply" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "applyNo" TEXT NOT NULL,
    "tracks" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL DEFAULT '',
    "entryType" TEXT NOT NULL DEFAULT '',
    "soloTeam" TEXT NOT NULL DEFAULT '',
    "teamName" TEXT NOT NULL DEFAULT '',
    "teamSize" INTEGER NOT NULL DEFAULT 1,
    "bizForms" JSONB NOT NULL DEFAULT '[]',
    "repName" TEXT NOT NULL DEFAULT '',
    "repGender" TEXT NOT NULL DEFAULT '',
    "repBirth" TEXT NOT NULL DEFAULT '',
    "repOrg" TEXT NOT NULL DEFAULT '',
    "repEmail" TEXT NOT NULL DEFAULT '',
    "repPhone" TEXT NOT NULL DEFAULT '',
    "repAddress" TEXT NOT NULL DEFAULT '',
    "members" JSONB NOT NULL DEFAULT '[]',
    "privacyAgreed" BOOLEAN NOT NULL DEFAULT false,
    "privacyAt" TIMESTAMP(3),
    "pledgeAgreed" BOOLEAN NOT NULL DEFAULT false,
    "pledgeAt" TIMESTAMP(3),
    "signerName" TEXT NOT NULL DEFAULT '',
    "signerTeamName" TEXT NOT NULL DEFAULT '',
    "proofKey" TEXT NOT NULL DEFAULT '',
    "proofName" TEXT NOT NULL DEFAULT '',
    "irKey" TEXT NOT NULL DEFAULT '',
    "irName" TEXT NOT NULL DEFAULT '',
    "extraKey" TEXT NOT NULL DEFAULT '',
    "extraName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "memo" TEXT NOT NULL DEFAULT '',
    "submittedIp" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpFoundersApply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpFoundersApply_applyNo_key" ON "ErpFoundersApply"("applyNo");
CREATE INDEX "ErpFoundersApply_roundId_createdAt_idx" ON "ErpFoundersApply"("roundId", "createdAt");
CREATE INDEX "ErpFoundersApply_status_idx" ON "ErpFoundersApply"("status");
CREATE INDEX "ErpFoundersApply_repEmail_idx" ON "ErpFoundersApply"("repEmail");
CREATE INDEX "ErpFoundersApply_repPhone_idx" ON "ErpFoundersApply"("repPhone");
