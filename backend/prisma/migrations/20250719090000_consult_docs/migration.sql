-- 상담자료(매크로) 컨펌 — 세일즈팀 등록, CEO/COO 승인 체크
CREATE TABLE "ErpConsultDoc" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "cooApproved" BOOLEAN NOT NULL DEFAULT false,
  "cooAt" TIMESTAMP(3),
  "ceoApproved" BOOLEAN NOT NULL DEFAULT false,
  "ceoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpConsultDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpConsultDoc_createdAt_idx" ON "ErpConsultDoc"("createdAt");
CREATE INDEX "ErpConsultDoc_authorEmail_idx" ON "ErpConsultDoc"("authorEmail");
