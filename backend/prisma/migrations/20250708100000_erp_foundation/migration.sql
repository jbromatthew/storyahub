-- AlterTable KbArticle
ALTER TABLE "KbArticle" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "KbArticle" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'company';

-- CreateTable ErpDepartment
CREATE TABLE "ErpDepartment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpJobRank
CREATE TABLE "ErpJobRank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpJobRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpEmployee
CREATE TABLE "ErpEmployee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeNo" TEXT,
    "departmentId" TEXT,
    "jobTitle" TEXT,
    "jobRank" TEXT,
    "phone" TEXT,
    "photoKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpApprovalForm
CREATE TABLE "ErpApprovalForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpApprovalForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpApprovalDocument
CREATE TABLE "ErpApprovalDocument" (
    "id" TEXT NOT NULL,
    "docNo" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL DEFAULT '{}',
    "attachments" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "security" TEXT NOT NULL DEFAULT 'normal',
    "ccUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpApprovalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpApprovalStep
CREATE TABLE "ErpApprovalStep" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL DEFAULT 'approve',
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "comment" TEXT,
    "actedAt" TIMESTAMP(3),
    CONSTRAINT "ErpApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpLeaveBalance
CREATE TABLE "ErpLeaveBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "regularTotal" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "regularUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carriedOver" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "ErpLeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpLeaveRequest
CREATE TABLE "ErpLeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvalDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpMeetingNote
CREATE TABLE "ErpMeetingNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "place" TEXT,
    "attendeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agenda" TEXT NOT NULL,
    "discussion" TEXT NOT NULL DEFAULT '',
    "decisions" TEXT,
    "actionItems" JSONB,
    "attachments" JSONB,
    "eventId" TEXT,
    "kbArticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpMeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpCompanyEvent
CREATE TABLE "ErpCompanyEvent" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "place" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'company',
    "scopeDeptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "attachments" JSONB,
    "requireRsvp" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpCompanyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpEventRsvp
CREATE TABLE "ErpEventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "ErpEventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpOkrObjective
CREATE TABLE "ErpOkrObjective" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teamDeptId" TEXT,
    "quarter" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpOkrObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpOkrKeyResult
CREATE TABLE "ErpOkrKeyResult" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '%',
    CONSTRAINT "ErpOkrKeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpOkrTodo
CREATE TABLE "ErpOkrTodo" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "due" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'todo',
    CONSTRAINT "ErpOkrTodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable ErpNotification
CREATE TABLE "ErpNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpNotification_pkey" PRIMARY KEY ("id")
);

-- Indexes & constraints
CREATE UNIQUE INDEX "ErpJobRank_name_key" ON "ErpJobRank"("name");
CREATE UNIQUE INDEX "ErpEmployee_userId_key" ON "ErpEmployee"("userId");
CREATE UNIQUE INDEX "ErpEmployee_employeeNo_key" ON "ErpEmployee"("employeeNo");
CREATE UNIQUE INDEX "ErpApprovalForm_code_key" ON "ErpApprovalForm"("code");
CREATE UNIQUE INDEX "ErpApprovalDocument_docNo_key" ON "ErpApprovalDocument"("docNo");
CREATE INDEX "ErpApprovalDocument_authorId_status_idx" ON "ErpApprovalDocument"("authorId", "status");
CREATE INDEX "ErpApprovalStep_approverId_status_idx" ON "ErpApprovalStep"("approverId", "status");
CREATE INDEX "ErpApprovalStep_documentId_stepOrder_idx" ON "ErpApprovalStep"("documentId", "stepOrder");
CREATE UNIQUE INDEX "ErpLeaveBalance_userId_year_key" ON "ErpLeaveBalance"("userId", "year");
CREATE INDEX "ErpLeaveRequest_userId_status_idx" ON "ErpLeaveRequest"("userId", "status");
CREATE UNIQUE INDEX "ErpEventRsvp_eventId_userId_key" ON "ErpEventRsvp"("eventId", "userId");
CREATE INDEX "ErpNotification_userId_read_createdAt_idx" ON "ErpNotification"("userId", "read", "createdAt");

ALTER TABLE "ErpDepartment" ADD CONSTRAINT "ErpDepartment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ErpDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ErpEmployee" ADD CONSTRAINT "ErpEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpEmployee" ADD CONSTRAINT "ErpEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "ErpDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ErpApprovalDocument" ADD CONSTRAINT "ErpApprovalDocument_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ErpApprovalForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ErpApprovalDocument" ADD CONSTRAINT "ErpApprovalDocument_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpApprovalStep" ADD CONSTRAINT "ErpApprovalStep_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ErpApprovalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpApprovalStep" ADD CONSTRAINT "ErpApprovalStep_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpLeaveBalance" ADD CONSTRAINT "ErpLeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpLeaveRequest" ADD CONSTRAINT "ErpLeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpMeetingNote" ADD CONSTRAINT "ErpMeetingNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpCompanyEvent" ADD CONSTRAINT "ErpCompanyEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpEventRsvp" ADD CONSTRAINT "ErpEventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ErpCompanyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpEventRsvp" ADD CONSTRAINT "ErpEventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpOkrObjective" ADD CONSTRAINT "ErpOkrObjective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpOkrKeyResult" ADD CONSTRAINT "ErpOkrKeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "ErpOkrObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpOkrTodo" ADD CONSTRAINT "ErpOkrTodo_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "ErpOkrKeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpOkrTodo" ADD CONSTRAINT "ErpOkrTodo_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ErpNotification" ADD CONSTRAINT "ErpNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default approval forms
INSERT INTO "ErpApprovalForm" ("id", "name", "code", "fields", "active", "sortOrder", "createdAt")
VALUES
  ('erpform_leave', '휴가신청', 'leave', '[]', true, 1, CURRENT_TIMESTAMP),
  ('erpform_expense', '지출결의', 'expense', '[]', true, 2, CURRENT_TIMESTAMP),
  ('erpform_purchase', '구매요청', 'purchase', '[]', true, 3, CURRENT_TIMESTAMP),
  ('erpform_general', '일반품의', 'general', '[]', true, 4, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Seed default job ranks
INSERT INTO "ErpJobRank" ("id", "name", "sortOrder", "createdAt")
VALUES
  ('rank_staff', '사원', 1, CURRENT_TIMESTAMP),
  ('rank_senior', '대리', 2, CURRENT_TIMESTAMP),
  ('rank_manager', '과장', 3, CURRENT_TIMESTAMP),
  ('rank_deputy', '차장', 4, CURRENT_TIMESTAMP),
  ('rank_director', '부장', 5, CURRENT_TIMESTAMP),
  ('rank_exec', '임원', 6, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
