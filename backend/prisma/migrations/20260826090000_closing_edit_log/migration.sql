CREATE TABLE "ErpClosingEditLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "center" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "editorEmail" TEXT NOT NULL,
    "editorName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpClosingEditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpClosingEditLog_createdAt_idx" ON "ErpClosingEditLog"("createdAt");
CREATE INDEX "ErpClosingEditLog_editorEmail_idx" ON "ErpClosingEditLog"("editorEmail");
CREATE INDEX "ErpClosingEditLog_assignee_idx" ON "ErpClosingEditLog"("assignee");
CREATE INDEX "ErpClosingEditLog_leadId_idx" ON "ErpClosingEditLog"("leadId");
