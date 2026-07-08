import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { env } from "../env.js";
import {
  ensureErpEmployee,
  ensureLeaveBalance,
  erpEmployeePublic,
  createEmployeeUser,
  generateTempPassword,
  isErpAdmin,
  leaveDaysForType,
  leaveBalanceSummary,
  leaveTypeLabel,
  leaveTypeColor,
  expandLeaveDates,
  dateKeyLocal,
  nextDocNo,
  notifyUser,
} from "../services/erp.js";
import {
  applyLeaveOnApproval,
  chainLabel,
  createApprovalSteps,
  findActiveStepForUser,
  planApprovalSteps,
  userCanApproveStep,
} from "../services/approvalWorkflow.js";

export const erpRouter = Router();
erpRouter.use(auth, requireAccess);

const userSelect = { id: true, email: true, name: true };

async function getEmployee(userId: string) {
  return ensureErpEmployee(
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))!
  );
}

async function requireAdmin(req: AuthedRequest, res: Response): Promise<boolean> {
  const emp = await prisma.erpEmployee.findUnique({ where: { userId: req.userId! } });
  if (!emp || !isErpAdmin(emp.roles)) {
    res.status(403).json({ error: "관리자 권한이 필요합니다" });
    return false;
  }
  return true;
}

function mapEmployee(e: {
  id: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  employeeNo: string | null;
  jobTitle: string | null;
  jobRank: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  department?: { id: string; name: string } | null;
  user?: { id: string; email: string; name: string | null } | null;
}) {
  return erpEmployeePublic(e);
}

/** 홈 대시보드 위젯 데이터 */
erpRouter.get("/dashboard", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  await getEmployee(userId);
  const year = new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 2);

  const [pendingApprovals, leaveBalance, todayEvents, unreadNotifs, recentApprovals, okrObjectives, recentEvents] =
    await Promise.all([
      prisma.erpApprovalStep.count({
        where: { approverId: userId, status: "waiting", document: { status: "in_progress" } },
      }),
      prisma.erpLeaveBalance.findUnique({ where: { userId_year: { userId, year } } }),
      prisma.event.findMany({
        where: { userId, startsAt: { gte: today, lt: tomorrow } },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      prisma.erpNotification.count({ where: { userId, read: false } }),
      prisma.erpApprovalStep.findMany({
        where: { approverId: userId, status: "waiting", document: { status: "in_progress" } },
        include: { document: { include: { author: { select: userSelect }, form: true } } },
        orderBy: { document: { submittedAt: "desc" } },
        take: 3,
      }),
      prisma.erpOkrObjective.findMany({
        where: { ownerId: userId },
        include: { keyResults: { include: { todos: true } } },
        take: 3,
      }),
      prisma.erpCompanyEvent.findMany({
        where: { status: "active", startsAt: { gte: today } },
        orderBy: { startsAt: "asc" },
        take: 3,
      }),
    ]);

  const leaveSummary = leaveBalance
    ? leaveBalanceSummary(leaveBalance)
    : leaveBalanceSummary({ regularTotal: 15, regularUsed: 0, rewardTotal: 0, rewardUsed: 0, carriedOver: 0 });

  res.json({
    pendingApprovals,
    unreadNotifs,
    leave: {
      regularLeft: leaveSummary.regularLeft,
      rewardLeft: leaveSummary.rewardLeft,
      totalLeft: leaveSummary.remaining,
      accrued: leaveSummary.accrued,
      used: leaveSummary.used,
    },
    todayEvents,
    recentApprovals: recentApprovals.map((s) => ({
      id: s.document.id,
      title: s.document.title,
      formName: s.document.form.name,
      author: s.document.author.name || s.document.author.email,
      submittedAt: s.document.submittedAt,
    })),
    okrObjectives,
    recentEvents,
  });
});

/** 알림 */
erpRouter.get("/notifications", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const module = String(req.query.module || "").trim();
  const items = await prisma.erpNotification.findMany({
    where: { userId, ...(module ? { module } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(items);
});

erpRouter.patch("/notifications/read-all", async (req: AuthedRequest, res) => {
  await prisma.erpNotification.updateMany({
    where: { userId: req.userId!, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

erpRouter.patch("/notifications/:id/read", async (req: AuthedRequest, res) => {
  const n = await prisma.erpNotification.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { read: true },
  });
  if (!n.count) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/** 내 프로필 / 구성원 */
erpRouter.get("/me/profile", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { ...userSelect, createdAt: true },
  });
  const emp = await prisma.erpEmployee.findUnique({
    where: { userId },
    include: { department: true },
  });
  const year = new Date().getFullYear();
  const leave = await prisma.erpLeaveBalance.findUnique({ where: { userId_year: { userId, year } } });
  res.json({ user, employee: emp ? erpEmployeePublic(emp) : null, leave });
});

erpRouter.patch("/me/profile", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  await getEmployee(userId);
  const { phone, jobTitle } = req.body ?? {};
  const emp = await prisma.erpEmployee.update({
    where: { userId },
    data: {
      ...(phone !== undefined ? { phone: String(phone) } : {}),
      ...(jobTitle !== undefined ? { jobTitle: String(jobTitle) } : {}),
    },
    include: { department: true },
  });
  res.json(erpEmployeePublic(emp));
});

erpRouter.get("/employees", async (req: AuthedRequest, res) => {
  const status = String(req.query.status || "").trim();
  const emps = await prisma.erpEmployee.findMany({
    where: status ? { status } : {},
    include: { user: { select: userSelect }, department: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  res.json(emps.map(mapEmployee));
});

/** 직원 등록 (계정 발부 선택) */
erpRouter.post("/employees", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const {
    name, email, employeeNo, departmentId, jobTitle, jobRank, phone, roles, status,
    issueAccount, password,
  } = req.body ?? {};

  if (!name?.trim()) return res.status(400).json({ error: "이름을 입력하세요" });
  if (!email?.trim()) return res.status(400).json({ error: "이메일을 입력하세요" });

  const normalizedEmail = String(email).trim().toLowerCase();
  const dupEmail = await prisma.erpEmployee.findFirst({
    where: { email: normalizedEmail, status: { not: "resigned" } },
  });
  if (dupEmail) return res.status(409).json({ error: "이미 등록된 직원 이메일입니다" });

  if (employeeNo) {
    const dupNo = await prisma.erpEmployee.findFirst({ where: { employeeNo: String(employeeNo) } });
    if (dupNo) return res.status(409).json({ error: "이미 사용 중인 사번입니다" });
  }

  let userId: string | null = null;
  let tempPassword: string | null = null;

  if (issueAccount) {
    const pw = password?.trim() || generateTempPassword();
    if (pw.length < 6) return res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다" });
    tempPassword = pw;
    const user = await createEmployeeUser({ email: normalizedEmail, name: String(name), password: pw });
    userId = user.id;
    await ensureLeaveBalance(user.id);
  } else if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) {
    return res.status(409).json({ error: "이미 가입된 이메일입니다. 계정 발부를 선택하세요" });
  }

  const emp = await prisma.erpEmployee.create({
    data: {
      userId,
      name: String(name).trim(),
      email: normalizedEmail,
      employeeNo: employeeNo ? String(employeeNo) : null,
      departmentId: departmentId || null,
      jobTitle: jobTitle || null,
      jobRank: jobRank || "사원",
      phone: phone || null,
      roles: Array.isArray(roles) ? roles : [],
      status: status || "active",
    },
    include: { user: { select: userSelect }, department: true },
  });

  res.status(201).json({
    employee: mapEmployee(emp),
    ...(tempPassword ? { tempPassword, message: "임시 비밀번호를 직원에게 전달하세요" } : {}),
  });
});

/** 일괄 등록: [{ name, email, employeeNo?, jobRank?, departmentId? }] */
erpRouter.post("/employees/bulk", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = req.body?.employees;
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: "등록할 직원 목록을 입력하세요" });
  }

  const created: ReturnType<typeof mapEmployee>[] = [];
  const errors: { index: number; email: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row?.name?.trim() || !row?.email?.trim()) throw new Error("이름·이메일 필수");
      const normalizedEmail = String(row.email).trim().toLowerCase();
      const dup = await prisma.erpEmployee.findFirst({
        where: { email: normalizedEmail, status: { not: "resigned" } },
      });
      if (dup) throw new Error("이미 등록된 이메일");

      const emp = await prisma.erpEmployee.create({
        data: {
          name: String(row.name).trim(),
          email: normalizedEmail,
          employeeNo: row.employeeNo ? String(row.employeeNo) : null,
          departmentId: row.departmentId || null,
          jobRank: row.jobRank || "사원",
          jobTitle: row.jobTitle || null,
          status: "active",
        },
        include: { user: { select: userSelect }, department: true },
      });
      created.push(mapEmployee(emp));
    } catch (e) {
      errors.push({ index: i, email: row?.email || "", error: (e as Error).message });
    }
  }

  res.json({ created, errors, total: rows.length });
});

erpRouter.patch("/employees/:id", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const {
    name, email, employeeNo, departmentId, jobTitle, jobRank, phone, roles, status,
  } = req.body ?? {};

  const existing = await prisma.erpEmployee.findUnique({
    where: { id: req.params.id },
    include: { user: true },
  });
  if (!existing) return res.status(404).json({ error: "직원을 찾을 수 없습니다" });

  if (employeeNo && employeeNo !== existing.employeeNo) {
    const dup = await prisma.erpEmployee.findFirst({ where: { employeeNo: String(employeeNo) } });
    if (dup && dup.id !== existing.id) return res.status(409).json({ error: "이미 사용 중인 사번입니다" });
  }

  const emp = await prisma.erpEmployee.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(email !== undefined ? { email: String(email).toLowerCase() } : {}),
      ...(employeeNo !== undefined ? { employeeNo: employeeNo || null } : {}),
      ...(departmentId !== undefined ? { departmentId: departmentId || null } : {}),
      ...(jobTitle !== undefined ? { jobTitle: jobTitle || null } : {}),
      ...(jobRank !== undefined ? { jobRank: jobRank || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(roles !== undefined ? { roles: roles as string[] } : {}),
      ...(status !== undefined ? { status: String(status) } : {}),
    },
    include: { user: { select: userSelect }, department: true },
  });

  if (name !== undefined && emp.userId) {
    await prisma.user.update({ where: { id: emp.userId }, data: { name: String(name) } });
  }

  res.json(mapEmployee(emp));
});

/** 계정 발부 (미발부 직원) */
erpRouter.post("/employees/:id/issue-account", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { password } = req.body ?? {};

  const emp = await prisma.erpEmployee.findUnique({ where: { id: req.params.id } });
  if (!emp) return res.status(404).json({ error: "직원을 찾을 수 없습니다" });
  if (emp.userId) return res.status(400).json({ error: "이미 계정이 발부된 직원입니다" });
  if (!emp.email) return res.status(400).json({ error: "이메일이 없습니다" });
  if (emp.status === "resigned") return res.status(400).json({ error: "퇴사 처리된 직원입니다" });

  const tempPassword = password?.trim() || generateTempPassword();
  if (tempPassword.length < 6) return res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다" });

  const user = await createEmployeeUser({
    email: emp.email,
    name: emp.name || emp.email.split("@")[0],
    password: tempPassword,
  });
  await ensureLeaveBalance(user.id);

  const updated = await prisma.erpEmployee.update({
    where: { id: emp.id },
    data: { userId: user.id },
    include: { user: { select: userSelect }, department: true },
  });

  await notifyUser(user.id, {
    module: "admin",
    title: "사내 ERP 계정이 발급되었습니다",
    body: "관리자에게 임시 비밀번호를 확인하세요",
  });

  res.json({
    employee: mapEmployee(updated),
    tempPassword,
    message: "임시 비밀번호를 직원에게 전달하세요",
  });
});

/** 비밀번호 재설정 */
erpRouter.post("/employees/:id/reset-password", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { password } = req.body ?? {};

  const emp = await prisma.erpEmployee.findUnique({ where: { id: req.params.id } });
  if (!emp?.userId) return res.status(400).json({ error: "계정이 없는 직원입니다" });

  const tempPassword = password?.trim() || generateTempPassword();
  if (tempPassword.length < 6) return res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다" });

  const passwordHash = await bcrypt.hash(tempPassword, env.bcryptRounds);
  await prisma.user.update({ where: { id: emp.userId }, data: { passwordHash } });

  res.json({ tempPassword, message: "새 임시 비밀번호를 직원에게 전달하세요" });
});

/** 조직·직급 (관리자) */
erpRouter.get("/departments", async (_req, res) => {
  const depts = await prisma.erpDepartment.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(depts);
});

erpRouter.post("/departments", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, parentId, sortOrder } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "부서명을 입력하세요" });
  const dept = await prisma.erpDepartment.create({
    data: { name: String(name), parentId: parentId || null, sortOrder: sortOrder ?? 0 },
  });
  res.json(dept);
});

erpRouter.get("/ranks", async (_req, res) => {
  const ranks = await prisma.erpJobRank.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(ranks);
});

/** 전자결재 */
erpRouter.get("/approval/forms", async (_req, res) => {
  await prisma.erpApprovalForm.upsert({
    where: { code: "refund" },
    create: { id: "erpform_refund", name: "환불요청", code: "refund", fields: [], active: true, sortOrder: 5 },
    update: { active: true, name: "환불요청" },
  });
  const forms = await prisma.erpApprovalForm.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  res.json(forms);
});

erpRouter.get("/approval/preview-chain", async (req: AuthedRequest, res) => {
  const formCode = String(req.query.formCode || "");
  const approvalChain = String(req.query.approvalChain || "");
  if (!formCode) return res.status(400).json({ error: "양식을 선택하세요" });
  try {
    const steps = await planApprovalSteps(req.userId!, formCode, approvalChain || undefined);
    res.json({ label: chainLabel(formCode, approvalChain || undefined), steps });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

erpRouter.get("/approval/documents", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const box = String(req.query.box || "draft");
  const emp = await prisma.erpEmployee.findUnique({ where: { userId } });
  const roles = emp?.roles ?? [];

  if (box === "approve") {
    const inProgress = await prisma.erpApprovalDocument.findMany({
      where: { status: "in_progress" },
      include: {
        form: true,
        author: { select: userSelect },
        steps: { include: { approver: { select: userSelect } }, orderBy: { stepOrder: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const docs = inProgress.filter((doc) => {
      const waiting = doc.steps.filter((s) => s.status === "waiting").sort((a, b) => a.stepOrder - b.stepOrder)[0];
      if (!waiting) return false;
      return userCanApproveStep(waiting, userId, roles);
    });
    return res.json(docs.slice(0, 50));
  }

  let where: Record<string, unknown> = {};
  if (box === "draft") where = { authorId: userId, status: "draft" };
  else if (box === "submitted") where = { authorId: userId, status: { in: ["submitted", "in_progress"] } };
  else if (box === "cc") where = { ccUserIds: { has: userId } };
  else if (box === "done") where = { OR: [{ authorId: userId }, { steps: { some: { approverId: userId } } }], status: "approved" };
  else if (box === "rejected") where = { authorId: userId, status: "rejected" };
  else where = { authorId: userId };

  const docs = await prisma.erpApprovalDocument.findMany({
    where,
    include: {
      form: true,
      author: { select: userSelect },
      steps: { include: { approver: { select: userSelect } }, orderBy: { stepOrder: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  res.json(docs);
});

erpRouter.get("/approval/documents/:id", async (req: AuthedRequest, res) => {
  const doc = await prisma.erpApprovalDocument.findUnique({
    where: { id: req.params.id },
    include: {
      form: true,
      author: { select: userSelect },
      steps: { include: { approver: { select: userSelect } }, orderBy: { stepOrder: "asc" } },
    },
  });
  if (!doc) return res.status(404).json({ error: "not found" });
  const activeStep = await findActiveStepForUser(doc.id, req.userId!);
  res.json({ ...doc, canApprove: !!activeStep });
});

erpRouter.post("/approval/documents", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, formId, title, body, attachments, security, approvalChain, ccUserIds, submit } = req.body ?? {};
  if (!formId && !id) return res.status(400).json({ error: "양식을 선택하세요" });

  if (id) {
    const existing = await prisma.erpApprovalDocument.findFirst({
      where: { id: String(id), authorId: userId },
      include: { form: true },
    });
    if (!existing) return res.status(404).json({ error: "not found" });
    if (!["draft", "rejected"].includes(existing.status)) {
      return res.status(400).json({ error: "수정할 수 없는 문서입니다" });
    }

    const mergedBody = body !== undefined ? { ...(existing.body as object), ...body } : existing.body;
    const updated = await prisma.erpApprovalDocument.update({
      where: { id: existing.id },
      data: {
        ...(title !== undefined ? { title: String(title) } : {}),
        ...(body !== undefined ? { body: mergedBody } : {}),
        ...(attachments !== undefined ? { attachments } : {}),
        ...(security !== undefined ? { security: String(security) } : {}),
        ...(ccUserIds !== undefined ? { ccUserIds: ccUserIds as string[] } : {}),
      },
      include: { form: true },
    });

    if (submit) {
      return submitDocument(res, userId, updated.id, updated.form.code, approvalChain, mergedBody as Record<string, unknown>);
    }
    return res.json(updated);
  }

  const form = await prisma.erpApprovalForm.findUnique({ where: { id: String(formId) } });
  if (!form) return res.status(404).json({ error: "양식을 찾을 수 없습니다" });

  const docNo = await nextDocNo();
  const docBody = { ...(body ?? {}), ...(approvalChain ? { approvalChain } : {}) };
  const doc = await prisma.erpApprovalDocument.create({
    data: {
      docNo,
      formId: form.id,
      authorId: userId,
      title: title || `${form.name} 기안`,
      body: docBody,
      attachments,
      security: security || "normal",
      ccUserIds: (ccUserIds as string[]) ?? [],
      status: "draft",
    },
    include: { form: true },
  });

  if (submit) return submitDocument(res, userId, doc.id, form.code, approvalChain, docBody as Record<string, unknown>);
  res.json(doc);
});

async function submitDocument(
  res: import("express").Response,
  userId: string,
  docId: string,
  formCode: string,
  approvalChain?: string,
  body?: Record<string, unknown>
) {
  const doc = await prisma.erpApprovalDocument.findFirst({
    where: { id: docId, authorId: userId },
    include: { form: true, author: { select: userSelect } },
  });
  if (!doc) return res.status(404).json({ error: "not found" });

  const chain = approvalChain || (body?.approvalChain as string) || (doc.body as Record<string, unknown>)?.approvalChain as string;
  let plans;
  try {
    plans = await createApprovalSteps(doc.id, userId, formCode || doc.form.code, chain);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const updated = await prisma.erpApprovalDocument.update({
    where: { id: doc.id },
    data: { status: "in_progress", submittedAt: new Date() },
    include: {
      steps: { include: { approver: { select: userSelect } }, orderBy: { stepOrder: "asc" } },
      form: true,
      author: { select: userSelect },
    },
  });

  const first = plans[0];
  const notifyTarget = first.approverId;
  if (notifyTarget) {
    const authorName = updated.author?.name || updated.author?.email || "기안자";
    await notifyUser(notifyTarget, {
      module: "approval",
      title: `결재 요청: ${updated.title}`,
      body: `${authorName}님 · ${first.label}`,
      link: `/approval/${updated.id}`,
    });
  } else if (first.approverRole === "경영지원") {
    const support = await prisma.erpEmployee.findMany({
      where: { status: "active", userId: { not: null }, roles: { has: "경영지원" } },
      take: 10,
    });
    for (const s of support) {
      if (s.userId) {
        await notifyUser(s.userId, {
          module: "approval",
          title: `결재 요청: ${updated.title}`,
          body: `경영지원 확인 요청`,
          link: `/approval/${updated.id}`,
        });
      }
    }
  }

  res.json({ ...updated, approvalPlan: plans });
}

erpRouter.post("/approval/documents/:id/approve", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { comment } = req.body ?? {};
  const step = await findActiveStepForUser(req.params.id, userId);
  if (!step) return res.status(403).json({ error: "결재할 차례가 아니거나 권한이 없습니다" });

  const doc = await prisma.erpApprovalDocument.findUnique({
    where: { id: req.params.id },
    include: { form: true, author: { select: userSelect } },
  });
  if (!doc || doc.status !== "in_progress") return res.status(400).json({ error: "진행 중인 문서가 아닙니다" });

  await prisma.erpApprovalStep.update({
    where: { id: step.id },
    data: { status: "approved", comment: comment || null, actedAt: new Date() },
  });

  const next = await prisma.erpApprovalStep.findFirst({
    where: { documentId: step.documentId, status: "waiting" },
    orderBy: { stepOrder: "asc" },
  });

  if (next) {
    if (next.approverId) {
      await notifyUser(next.approverId, {
        module: "approval",
        title: `결재 요청: ${doc.title}`,
        link: `/approval/${step.documentId}`,
      });
    } else if (next.approverRole === "경영지원") {
      const support = await prisma.erpEmployee.findMany({
        where: { status: "active", userId: { not: null }, roles: { has: "경영지원" } },
      });
      for (const s of support) {
        if (s.userId) await notifyUser(s.userId, { module: "approval", title: `결재 요청: ${doc.title}`, link: `/approval/${step.documentId}` });
      }
    }
    return res.json({ status: "in_progress" });
  }

  await prisma.erpApprovalDocument.update({
    where: { id: step.documentId },
    data: { status: "approved", completedAt: new Date() },
  });

  if (doc.form.code === "leave") {
    await applyLeaveOnApproval(step.documentId);
  }

  await notifyUser(doc.authorId, {
    module: "approval",
    title: `결재 완료: ${doc.title}`,
    link: `/approval/${step.documentId}`,
  });
  res.json({ status: "approved" });
});

erpRouter.post("/approval/documents/:id/reject", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { comment } = req.body ?? {};
  if (!comment) return res.status(400).json({ error: "반려 사유를 입력하세요" });

  const step = await findActiveStepForUser(req.params.id, userId);
  if (!step) return res.status(403).json({ error: "결재할 차례가 아니거나 권한이 없습니다" });

  const doc = await prisma.erpApprovalDocument.findUnique({
    where: { id: req.params.id },
    include: { form: true },
  });
  if (!doc) return res.status(404).json({ error: "not found" });

  await prisma.erpApprovalStep.update({
    where: { id: step.id },
    data: { status: "rejected", comment: String(comment), actedAt: new Date() },
  });
  await prisma.erpApprovalDocument.update({
    where: { id: step.documentId },
    data: { status: "rejected" },
  });

  if (doc.form.code === "leave") {
    await prisma.erpLeaveRequest.updateMany({
      where: { approvalDocId: doc.id },
      data: { status: "rejected" },
    });
  }

  await notifyUser(doc.authorId, {
    module: "approval",
    title: `결재 반려: ${doc.title}`,
    body: String(comment),
    link: `/approval/${step.documentId}`,
  });
  res.json({ status: "rejected" });
});

/** 휴가 */
erpRouter.get("/leave/balance", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const year = Number(req.query.year) || new Date().getFullYear();
  await getEmployee(userId);
  const bal = await prisma.erpLeaveBalance.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, regularTotal: 15 },
    update: {},
  });
  res.json({ ...bal, ...leaveBalanceSummary(bal) });
});

erpRouter.get("/leave/status", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const year = Number(req.query.year) || new Date().getFullYear();
  const employees = await prisma.erpEmployee.findMany({
    where: { status: "active", userId: { not: null } },
    include: { department: true, user: { select: userSelect } },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  const userIds = employees.map((e) => e.userId!).filter(Boolean);
  const balances = await prisma.erpLeaveBalance.findMany({ where: { year, userId: { in: userIds } } });
  const balMap = new Map(balances.map((b) => [b.userId, b]));

  const rows = employees
    .filter((e) => e.userId)
    .map((emp) => {
      const bal = balMap.get(emp.userId!) ?? {
        regularTotal: 15,
        regularUsed: 0,
        rewardTotal: 0,
        rewardUsed: 0,
        carriedOver: 0,
        remarks: null,
      };
      const summary = leaveBalanceSummary(bal);
      return {
        userId: emp.userId,
        name: emp.name || emp.user?.name || emp.user?.email,
        department: emp.department?.name || "미배치",
        departmentId: emp.department?.id || null,
        ...summary,
        remarks: bal.remarks,
      };
    });

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    const key = row.department;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  res.json({ year, rows, grouped });
});

erpRouter.get("/leave/calendar", async (req: AuthedRequest, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const items = await prisma.erpLeaveRequest.findMany({
    where: {
      status: "approved",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    include: { user: { select: userSelect } },
    orderBy: { startDate: "asc" },
  });

  const events: Array<{
    date: string;
    userId: string;
    userName: string;
    leaveType: string;
    label: string;
    color: string;
    days: number;
  }> = [];

  for (const item of items) {
    const name = item.user.name || item.user.email;
    const label = leaveTypeLabel(item.leaveType);
    const color = leaveTypeColor(item.leaveType);
    for (const d of expandLeaveDates(item.startDate, item.endDate)) {
      if (d < start || d > end) continue;
      const key = dateKeyLocal(d);
      events.push({
        date: key,
        userId: item.userId,
        userName: name,
        leaveType: item.leaveType,
        label,
        color,
        days: item.days,
      });
    }
  }

  res.json({ year, month, events });
});

erpRouter.get("/leave/rewards", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const year = Number(req.query.year) || new Date().getFullYear();
  const items = await prisma.erpLeaveRewardGrant.findMany({
    where: { year },
    include: { createdBy: { select: userSelect } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(items);
});

erpRouter.post("/leave/rewards", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const userId = req.userId!;
  const { title, grantType, days, userIds, year, remarks } = req.body ?? {};
  if (!title?.trim()) return res.status(400).json({ error: "제목을 입력하세요" });
  if (!days || Number(days) <= 0) return res.status(400).json({ error: "일수를 입력하세요" });
  if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ error: "대상자를 선택하세요" });

  const y = Number(year) || new Date().getFullYear();
  const grantDays = Number(days);

  const grant = await prisma.erpLeaveRewardGrant.create({
    data: {
      title: String(title).trim(),
      grantType: grantType || "paid",
      days: grantDays,
      year: y,
      userIds: userIds as string[],
      remarks: remarks || null,
      createdById: userId,
    },
    include: { createdBy: { select: userSelect } },
  });

  for (const uid of userIds as string[]) {
    await prisma.erpLeaveBalance.upsert({
      where: { userId_year: { userId: uid, year: y } },
      create: { userId: uid, year: y, rewardTotal: grantDays },
      update: { rewardTotal: { increment: grantDays } },
    });
  }

  res.json(grant);
});

erpRouter.patch("/leave/balance/:targetUserId", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { regularTotal, rewardTotal, carriedOver, remarks } = req.body ?? {};
  const year = Number(req.body?.year) || new Date().getFullYear();
  const targetUserId = req.params.targetUserId;

  const bal = await prisma.erpLeaveBalance.upsert({
    where: { userId_year: { userId: targetUserId, year } },
    create: {
      userId: targetUserId,
      year,
      regularTotal: regularTotal ?? 15,
      rewardTotal: rewardTotal ?? 0,
      carriedOver: carriedOver ?? 0,
      remarks: remarks ?? null,
    },
    update: {
      ...(regularTotal !== undefined ? { regularTotal: Number(regularTotal) } : {}),
      ...(rewardTotal !== undefined ? { rewardTotal: Number(rewardTotal) } : {}),
      ...(carriedOver !== undefined ? { carriedOver: Number(carriedOver) } : {}),
      ...(remarks !== undefined ? { remarks: remarks || null } : {}),
    },
  });
  res.json({ ...bal, ...leaveBalanceSummary(bal) });
});

erpRouter.get("/leave/requests", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const items = await prisma.erpLeaveRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

erpRouter.post("/leave/requests", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, leaveType, startDate, endDate, reason, submit } = req.body ?? {};
  if (!leaveType || !startDate || !endDate) {
    return res.status(400).json({ error: "휴가 종류와 기간을 입력하세요" });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = leaveDaysForType(String(leaveType), start, end);
  const year = start.getFullYear();
  const noDeduct = leaveType === "wfh" || leaveType === "other";

  const bal = await prisma.erpLeaveBalance.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, regularTotal: 15 },
    update: {},
  });
  const left = leaveBalanceSummary(bal).remaining;
  if (submit && !noDeduct && days > left) {
    return res.status(400).json({ error: `잔여 휴가가 부족합니다 (잔여 ${left}일)` });
  }

  let reqRow;
  if (id) {
    reqRow = await prisma.erpLeaveRequest.update({
      where: { id: String(id) },
      data: { leaveType, startDate: start, endDate: end, days, reason: reason || null, status: submit ? "pending" : "draft" },
    });
  } else {
    reqRow = await prisma.erpLeaveRequest.create({
      data: {
        userId,
        leaveType: String(leaveType),
        startDate: start,
        endDate: end,
        days,
        reason: reason || null,
        status: submit ? "pending" : "draft",
      },
    });
  }

  if (submit) {
    const form = await prisma.erpApprovalForm.findUnique({ where: { code: "leave" } });
    if (form) {
      const docNo = await nextDocNo();
      const doc = await prisma.erpApprovalDocument.create({
        data: {
          docNo,
          formId: form.id,
          authorId: userId,
          title: `휴가신청 (${leaveTypeLabel(String(leaveType))} ${days > 0 ? days + "일" : ""})`.trim(),
          body: { leaveType, startDate: start.toISOString(), endDate: end.toISOString(), days, reason, leaveRequestId: reqRow.id },
          status: "in_progress",
          submittedAt: new Date(),
        },
      });
      await createApprovalSteps(doc.id, userId, "leave");
      await prisma.erpLeaveRequest.update({
        where: { id: reqRow.id },
        data: { approvalDocId: doc.id, status: "pending" },
      });
      const tl = await planApprovalSteps(userId, "leave");
      if (tl[0]?.approverId) {
        await notifyUser(tl[0].approverId, {
          module: "approval",
          title: `휴가 결재: ${days}일`,
          body: reason || "휴가 신청",
          link: `/approval/${doc.id}`,
        });
      }
    }
  }

  res.json(reqRow);
});

/** 회의록 */
erpRouter.get("/meetings", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const items = await prisma.erpMeetingNote.findMany({
    where: { OR: [{ userId }, { attendeeIds: { has: userId } }] },
    orderBy: { startsAt: "desc" },
    take: 50,
  });
  res.json(items);
});

erpRouter.get("/meetings/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const note = await prisma.erpMeetingNote.findFirst({
    where: {
      id: req.params.id,
      OR: [{ userId }, { attendeeIds: { has: userId } }],
    },
  });
  if (!note) return res.status(404).json({ error: "회의록을 찾을 수 없습니다" });
  res.json(note);
});

erpRouter.post("/meetings", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, title, startsAt, endsAt, place, attendeeIds, agenda, discussion, decisions, actionItems } =
    req.body ?? {};
  if (!title || !startsAt || !agenda) {
    return res.status(400).json({ error: "제목, 일시, 안건은 필수입니다" });
  }
  const data = {
    title: String(title),
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    place: place || null,
    attendeeIds: (attendeeIds as string[]) ?? [],
    agenda: String(agenda),
    discussion: discussion || "",
    decisions: decisions || null,
    actionItems: actionItems ?? [],
  };
  if (id) {
    const existing = await prisma.erpMeetingNote.findFirst({
      where: { id: String(id), userId },
    });
    if (!existing) return res.status(404).json({ error: "회의록을 찾을 수 없거나 수정 권한이 없습니다" });
    const note = await prisma.erpMeetingNote.update({ where: { id: existing.id }, data });
    return res.json(note);
  }
  const note = await prisma.erpMeetingNote.create({ data: { ...data, userId } });
  res.json(note);
});

erpRouter.delete("/meetings/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const existing = await prisma.erpMeetingNote.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!existing) return res.status(404).json({ error: "회의록을 찾을 수 없거나 삭제 권한이 없습니다" });
  await prisma.erpMeetingNote.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

/** 행사 */
erpRouter.get("/events", async (_req, res) => {
  const items = await prisma.erpCompanyEvent.findMany({
    where: { status: "active" },
    include: { rsvps: true, createdBy: { select: userSelect } },
    orderBy: { startsAt: "asc" },
  });
  res.json(items);
});

erpRouter.post("/events", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { title, startsAt, endsAt, place, scope, description, requireRsvp } = req.body ?? {};
  if (!title || !startsAt) return res.status(400).json({ error: "제목과 일시는 필수입니다" });
  const ev = await prisma.erpCompanyEvent.create({
    data: {
      createdById: userId,
      title: String(title),
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      place: place || null,
      scope: scope || "company",
      description: description || null,
      requireRsvp: !!requireRsvp,
    },
  });
  res.json(ev);
});

erpRouter.post("/events/:id/rsvp", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { response } = req.body ?? {};
  const rsvp = await prisma.erpEventRsvp.upsert({
    where: { eventId_userId: { eventId: req.params.id, userId } },
    create: { eventId: req.params.id, userId, response: response || "pending" },
    update: { response: response || "pending" },
  });
  res.json(rsvp);
});

/** OKR */
erpRouter.get("/okr", async (req: AuthedRequest, res) => {
  const quarter = String(req.query.quarter || currentQuarter());
  const items = await prisma.erpOkrObjective.findMany({
    where: { quarter },
    include: { keyResults: { include: { todos: true } }, owner: { select: userSelect } },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

erpRouter.post("/okr", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, title, quarter, teamDeptId, keyResults } = req.body ?? {};
  if (!title) return res.status(400).json({ error: "Objective 제목을 입력하세요" });
  const q = quarter || currentQuarter();

  if (id) {
    const obj = await prisma.erpOkrObjective.update({
      where: { id: String(id), ownerId: userId },
      data: { title: String(title), quarter: q, teamDeptId: teamDeptId || null },
    });
    return res.json(obj);
  }

  const obj = await prisma.erpOkrObjective.create({
    data: {
      ownerId: userId,
      title: String(title),
      quarter: q,
      teamDeptId: teamDeptId || null,
      keyResults: keyResults?.length
        ? {
            create: keyResults.map((kr: { title: string; target: number; unit?: string }) => ({
              title: kr.title,
              target: kr.target,
              unit: kr.unit || "%",
            })),
          }
        : undefined,
    },
    include: { keyResults: true },
  });
  res.json(obj);
});

erpRouter.patch("/okr/key-results/:id", async (req: AuthedRequest, res) => {
  const { current, title, target } = req.body ?? {};
  const kr = await prisma.erpOkrKeyResult.update({
    where: { id: req.params.id },
    data: {
      ...(current !== undefined ? { current: Number(current) } : {}),
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(target !== undefined ? { target: Number(target) } : {}),
    },
  });
  const pct = kr.target > 0 ? Math.min(100, (kr.current / kr.target) * 100) : 0;
  await prisma.erpOkrObjective.update({
    where: { id: kr.objectiveId },
    data: { progress: pct },
  });
  res.json(kr);
});

function currentQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
