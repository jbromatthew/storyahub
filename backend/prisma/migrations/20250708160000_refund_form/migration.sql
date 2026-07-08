-- 환불 요청 전자결재 양식
INSERT INTO "ErpApprovalForm" ("id", "name", "code", "fields", "active", "sortOrder", "createdAt")
VALUES ('erpform_refund', '환불요청', 'refund', '[]', true, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
