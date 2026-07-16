import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt as cryptoRandomInt } from "crypto";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { fetchSheetGrid, listSheetTitles } from "../services/googleSheets.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
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
import { isErpOwner } from "../services/erpAccess.js";

export const erpRouter = Router();
erpRouter.use(auth, requireAccess);
if (env.erpMode) erpRouter.use(requireErpMember);

async function requireErpAdmin(req: AuthedRequest, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(403).json({ error: "관리자만 이용할 수 있습니다" });
    return false;
  }
  const emp = await prisma.erpEmployee.findUnique({ where: { userId: user.id } });
  if (!isErpAdmin(emp?.roles ?? [], user.email)) {
    res.status(403).json({ error: "관리자만 이용할 수 있습니다" });
    return false;
  }
  return true;
}

const userSelect = { id: true, email: true, name: true };

async function getEmployee(userId: string) {
  return ensureErpEmployee(
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))!
  );
}

async function requireAdmin(req: AuthedRequest, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  const emp = await prisma.erpEmployee.findUnique({ where: { userId: req.userId! } });
  if (!user || !emp || !isErpAdmin(emp.roles, user.email)) {
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

/** 이메일이 일치하는 유저가 있는데 아직 연결 안 된 초대 레코드를 연결한다.
 *  (연결 누락 시 멤버 목록에 "미가입"으로 잘못 표시되는 버그를 자가 치유) */
async function reconcileMemberAccounts(): Promise<void> {
  const unlinked = await prisma.erpEmployee.findMany({
    where: { userId: null, email: { not: null } },
    select: { id: true, email: true },
  });
  if (!unlinked.length) return;
  const emails = [...new Set(unlinked.map((e) => (e.email || "").toLowerCase()).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  const taken = new Set(
    (await prisma.erpEmployee.findMany({ where: { userId: { not: null } }, select: { userId: true } }))
      .map((r) => r.userId!)
      .filter(Boolean)
  );
  for (const e of unlinked) {
    const uid = userByEmail.get((e.email || "").toLowerCase());
    if (uid && !taken.has(uid)) {
      await prisma.erpEmployee.update({ where: { id: e.id }, data: { userId: uid } }).catch(() => {});
      taken.add(uid);
    }
  }
}

/** 멤버 초대·승인 (관리자 전용) */
erpRouter.get("/members", async (req: AuthedRequest, res) => {
  if (!(await requireErpAdmin(req, res))) return;
  await reconcileMemberAccounts();
  const members = await prisma.erpEmployee.findMany({
    include: { user: { select: userSelect }, department: true },
    orderBy: [{ memberStatus: "asc" }, { createdAt: "desc" }],
  });
  res.json(members.map(mapEmployee));
});

erpRouter.post("/members/invite", async (req: AuthedRequest, res) => {
  if (!(await requireErpAdmin(req, res))) return;
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const name = String(req.body?.name ?? "").trim();
  if (!email || !email.includes("@")) return res.status(400).json({ error: "이메일을 입력하세요" });
  if (email === env.erpOwnerEmail) return res.status(400).json({ error: "소유자 계정은 초대할 수 없습니다" });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const existingEmp = await prisma.erpEmployee.findFirst({ where: { email } });
  if (existingEmp) return res.status(409).json({ error: "이미 초대되었거나 등록된 이메일입니다" });

  const emp = await prisma.erpEmployee.create({
    data: {
      email,
      name: name || email.split("@")[0],
      memberStatus: "pending",
      status: "active",
    },
    include: { user: { select: userSelect }, department: true },
  });

  if (existingUser) {
    await prisma.erpEmployee.update({
      where: { id: emp.id },
      data: { userId: existingUser.id, name: name || existingUser.name },
    });
  }

  const saved = await prisma.erpEmployee.findUniqueOrThrow({
    where: { id: emp.id },
    include: { user: { select: userSelect }, department: true },
  });
  res.status(201).json(mapEmployee(saved));
});

erpRouter.post("/members/:id/approve", async (req: AuthedRequest, res) => {
  if (!(await requireErpAdmin(req, res))) return;
  const emp = await prisma.erpEmployee.update({
    where: { id: req.params.id },
    data: { memberStatus: "approved" },
    include: { user: { select: userSelect }, department: true },
  });
  res.json(mapEmployee(emp));
});

erpRouter.post("/members/:id/reject", async (req: AuthedRequest, res) => {
  if (!(await requireErpAdmin(req, res))) return;
  const emp = await prisma.erpEmployee.update({
    where: { id: req.params.id },
    data: { memberStatus: "rejected" },
    include: { user: { select: userSelect }, department: true },
  });
  res.json(mapEmployee(emp));
});

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
      memberStatus: "pending",
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
          memberStatus: "pending",
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

erpRouter.patch("/departments/:id", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, sortOrder } = req.body ?? {};
  const dept = await prisma.erpDepartment.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
    },
  });
  res.json(dept);
});

erpRouter.delete("/departments/:id", async (req: AuthedRequest, res) => {
  if (!(await requireAdmin(req, res))) return;
  // 소속 멤버는 미배정으로 되돌리고 팀은 비활성화(soft delete)
  await prisma.erpEmployee.updateMany({ where: { departmentId: req.params.id }, data: { departmentId: null } });
  await prisma.erpDepartment.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
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

/* ===================== 공사(견적) 관리 — 소유자 전용 ===================== */

async function requireOwner(req: AuthedRequest, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
  if (isErpOwner(user?.email)) return true;
  res.status(403).json({ error: "소유자 전용 기능입니다" });
  return false;
}

const DEFAULT_CONSTRUCTION_ITEMS = [
  { name: "화상출입기 설치비", unitPrice: 300000 },
  { name: "엘리베이터 송신 모듈", unitPrice: 10000 },
  { name: "엘리베이터 연동설치비", unitPrice: 10000 },
];

// 품목 단가
erpRouter.get("/construction/items", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  let items = await prisma.erpConstructionItem.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!items.length) {
    await prisma.erpConstructionItem.createMany({
      data: DEFAULT_CONSTRUCTION_ITEMS.map((it, i) => ({ ...it, sortOrder: i })),
    });
    items = await prisma.erpConstructionItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }
  res.json(items);
});

erpRouter.post("/construction/items", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { name, unitPrice, sortOrder } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "품명을 입력하세요" });
  const item = await prisma.erpConstructionItem.create({
    data: { name: String(name).trim(), unitPrice: Math.max(0, Math.round(Number(unitPrice) || 0)), sortOrder: Number(sortOrder) || 0 },
  });
  res.json(item);
});

erpRouter.patch("/construction/items/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { name, unitPrice, sortOrder, active } = req.body ?? {};
  const item = await prisma.erpConstructionItem.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(unitPrice !== undefined ? { unitPrice: Math.max(0, Math.round(Number(unitPrice) || 0)) } : {}),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
    },
  });
  res.json(item);
});

erpRouter.delete("/construction/items/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionItem.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

// 아파트 단지
erpRouter.get("/construction/apartments", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const apts = await prisma.erpConstructionApartment.findMany({ orderBy: { createdAt: "desc" } });
  res.json(apts);
});

erpRouter.post("/construction/apartments", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { name, address, partner, note } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "아파트명을 입력하세요" });
  const apt = await prisma.erpConstructionApartment.create({
    data: { name: String(name).trim(), address: address?.trim() || null, partner: partner?.trim() || null, note: note?.trim() || null },
  });
  res.json(apt);
});

erpRouter.patch("/construction/apartments/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { name, address, partner, note } = req.body ?? {};
  const apt = await prisma.erpConstructionApartment.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(address !== undefined ? { address: address?.trim() || null } : {}),
      ...(partner !== undefined ? { partner: partner?.trim() || null } : {}),
      ...(note !== undefined ? { note: note?.trim() || null } : {}),
    },
  });
  res.json(apt);
});

erpRouter.delete("/construction/apartments/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionApartment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// 견적/공사 건
const CONSTRUCTION_STATUSES = [
  "requested", "confirmed", "ongoing", "done", "billing", "settled",
  "before", "settle_requested", // 레거시 호환
];
const cstDate = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

function sanitizeLines(raw: unknown): Array<{ name: string; unitPrice: number; qty: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l: any) => ({
      name: String(l?.name ?? "").trim(),
      unitPrice: Math.max(0, Math.round(Number(l?.unitPrice) || 0)),
      qty: Math.max(0, Math.round(Number(l?.qty) || 0)),
    }))
    .filter((l) => l.name);
}

function sanitizePayouts(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({
      teamId: p?.teamId ? String(p.teamId) : null,
      teamName: String(p?.teamName ?? "").trim(),
      amount: Math.max(0, Math.round(Number(p?.amount) || 0)),
      paid: !!p?.paid,
      memo: String(p?.memo ?? "").trim() || null,
    }))
    .filter((p) => p.teamName || p.amount > 0);
}

function sanitizeMaterials(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: any) => ({
      stockId: m?.stockId ? String(m.stockId) : null,
      name: String(m?.name ?? "").trim(),
      qty: Math.max(0, Math.round(Number(m?.qty) || 0)),
      unitCost: Math.max(0, Math.round(Number(m?.unitCost) || 0)),
    }))
    .filter((m) => m.name || m.qty > 0);
}

function sanitizeSitePhotos(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({
      name: String(p?.name ?? "").trim(),
      beforeKey: p?.beforeKey ? String(p.beforeKey) : null,
      afterKey: p?.afterKey ? String(p.afterKey) : null,
      beforeBy: p?.beforeBy ? String(p.beforeBy).trim().slice(0, 40) : null,
      afterBy: p?.afterBy ? String(p.afterBy).trim().slice(0, 40) : null,
    }))
    .filter((p) => p.name || p.beforeKey || p.afterKey);
}

const COMPLAINT_STATUSES = ["접수", "처리중", "완료"];
function sanitizeComplaints(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => ({
      date: cstDate(c?.date),
      content: String(c?.content ?? "").trim(),
      status: COMPLAINT_STATUSES.includes(c?.status) ? c.status : "접수",
      resolution: String(c?.resolution ?? "").trim() || null,
    }))
    .filter((c) => c.content);
}

function sanitizeEmployees(raw: unknown): Array<{ name: string; title: string | null; phone: string | null; note: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: any) => ({
      name: String(e?.name ?? "").trim(),
      title: String(e?.title ?? "").trim() || null,
      phone: String(e?.phone ?? "").trim() || null,
      note: String(e?.note ?? "").trim() || null,
    }))
    .filter((e) => e.name);
}

const CST_TEAM_TEXT = ["contact", "note", "bizRegNo", "ceoName", "ceoTitle", "ceoPhone", "address", "bizType", "bizItem", "taxEmail", "bankAccount"] as const;

function teamOut(t: any) {
  let employees: unknown = [];
  try { employees = JSON.parse(t.employees || "[]"); } catch { employees = []; }
  return { ...t, employees: Array.isArray(employees) ? employees : [] };
}

// 협력업체(공사팀) 풀
erpRouter.get("/construction/teams", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const [teams, quotes] = await Promise.all([
    prisma.erpConstructionTeam.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.erpConstructionQuote.findMany({ select: { payouts: true, orderType: true } }),
  ]);
  // 각 팀이 참여한 공사 건수 (payouts의 teamId 기준) — 구분별로도 집계
  const jobCounts = new Map<string, { total: number; byType: Record<string, number> }>();
  for (const q of quotes) {
    const type = (q as any).orderType || "아파트너";
    const seen = new Set<string>();
    for (const p of (Array.isArray(q.payouts) ? q.payouts : []) as any[]) {
      const tid = p?.teamId ? String(p.teamId) : null;
      if (!tid || seen.has(tid)) continue;
      seen.add(tid);
      const cur = jobCounts.get(tid) || { total: 0, byType: {} };
      cur.total += 1;
      cur.byType[type] = (cur.byType[type] || 0) + 1;
      jobCounts.set(tid, cur);
    }
  }
  res.json(teams.map((t) => ({ ...teamOut(t), jobCount: jobCounts.get(t.id)?.total || 0, jobCountByType: jobCounts.get(t.id)?.byType || {} })));
});

erpRouter.post("/construction/teams", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const body = req.body ?? {};
  if (!body.name?.trim()) return res.status(400).json({ error: "업체명을 입력하세요" });
  const data: Record<string, unknown> = { name: String(body.name).trim() };
  for (const k of CST_TEAM_TEXT) if (body[k] !== undefined) data[k] = String(body[k] ?? "").trim() || null;
  if (body.employees !== undefined) data.employees = JSON.stringify(sanitizeEmployees(body.employees));
  const team = await prisma.erpConstructionTeam.create({ data: data as any });
  res.json(teamOut(team));
});

erpRouter.patch("/construction/teams/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const body = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  for (const k of CST_TEAM_TEXT) if (body[k] !== undefined) data[k] = String(body[k] ?? "").trim() || null;
  if (body.employees !== undefined) data.employees = JSON.stringify(sanitizeEmployees(body.employees));
  const team = await prisma.erpConstructionTeam.update({ where: { id: req.params.id }, data: data as any });
  res.json(teamOut(team));
});

erpRouter.delete("/construction/teams/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionTeam.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

erpRouter.get("/construction/quotes", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const quotes = await prisma.erpConstructionQuote.findMany({
    include: { apartment: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(quotes);
});

erpRouter.post("/construction/quotes", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { apartmentId, title, orderType, lines, status, taxInvoiceIssued, note, startDate, endDate, payouts, materials, complaints } = req.body ?? {};
  const quote = await prisma.erpConstructionQuote.create({
    data: {
      apartmentId: apartmentId || null,
      title: title?.trim() || null,
      orderType: orderType?.trim() || "아파트너",
      lines: sanitizeLines(lines),
      payouts: sanitizePayouts(payouts),
      materials: sanitizeMaterials(materials),
      complaints: sanitizeComplaints(complaints),
      sitePhotos: sanitizeSitePhotos(req.body?.sitePhotos),
      status: CONSTRUCTION_STATUSES.includes(status) ? status : "requested",
      taxInvoiceIssued: !!taxInvoiceIssued,
      note: note?.trim() || null,
      startDate: cstDate(startDate),
      endDate: cstDate(endDate),
    },
    include: { apartment: true },
  });
  res.json(quote);
});

erpRouter.patch("/construction/quotes/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { apartmentId, title, orderType, lines, status, taxInvoiceIssued, note, startDate, endDate, payouts, materials, complaints } = req.body ?? {};
  const quote = await prisma.erpConstructionQuote.update({
    where: { id: req.params.id },
    data: {
      ...(apartmentId !== undefined ? { apartmentId: apartmentId || null } : {}),
      ...(title !== undefined ? { title: title?.trim() || null } : {}),
      ...(orderType !== undefined ? { orderType: orderType?.trim() || "아파트너" } : {}),
      ...(lines !== undefined ? { lines: sanitizeLines(lines) } : {}),
      ...(payouts !== undefined ? { payouts: sanitizePayouts(payouts) } : {}),
      ...(materials !== undefined ? { materials: sanitizeMaterials(materials) } : {}),
      ...(complaints !== undefined ? { complaints: sanitizeComplaints(complaints) } : {}),
      ...(req.body?.sitePhotos !== undefined ? { sitePhotos: sanitizeSitePhotos(req.body.sitePhotos) } : {}),
      ...(status !== undefined && CONSTRUCTION_STATUSES.includes(status) ? { status } : {}),
      ...(taxInvoiceIssued !== undefined ? { taxInvoiceIssued: !!taxInvoiceIssued } : {}),
      ...(note !== undefined ? { note: note?.trim() || null } : {}),
      ...(startDate !== undefined ? { startDate: cstDate(startDate) } : {}),
      ...(endDate !== undefined ? { endDate: cstDate(endDate) } : {}),
    },
    include: { apartment: true },
  });
  res.json(quote);
});

erpRouter.delete("/construction/quotes/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionQuote.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// 현장 업로드 공유 링크 발급/갱신 (무계정 + PIN)
erpRouter.post("/construction/quotes/:id/share", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const existing = await prisma.erpConstructionQuote.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "견적을 찾을 수 없습니다" });
  const token = existing.shareToken || randomBytes(18).toString("base64url");
  const pin = existing.sharePin || String(cryptoRandomInt(1000, 10000));
  const days = Number(req.body?.days) > 0 ? Math.min(365, Number(req.body.days)) : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const q = await prisma.erpConstructionQuote.update({
    where: { id: req.params.id },
    data: { shareToken: token, sharePin: pin, shareEnabled: true, shareExpiresAt: expiresAt },
  });
  res.json({ token: q.shareToken, pin: q.sharePin, enabled: q.shareEnabled, expiresAt: q.shareExpiresAt });
});

erpRouter.post("/construction/quotes/:id/share/disable", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionQuote.update({ where: { id: req.params.id }, data: { shareEnabled: false } });
  res.json({ enabled: false });
});

/* ===================== 재고 관리 (아파트너 공사) — 소유자 전용 ===================== */

const cstStockDate = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
};

erpRouter.get("/construction/stocks", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const stocks = await prisma.erpConstructionStock.findMany({
    where: { active: true },
    include: { moves: { orderBy: { date: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  const out = stocks.map((s) => {
    let balance = 0, purchaseSupply = 0, purchaseVat = 0, inQty = 0;
    for (const m of s.moves) {
      balance += m.kind === "out" ? -m.qty : m.qty;
      if (m.kind === "in" && m.unitPrice) {
        const supply = m.unitPrice * m.qty;
        purchaseSupply += supply;
        purchaseVat += m.vatSeparate ? Math.round(supply * 0.1) : 0;
        inQty += m.qty;
      }
    }
    const avgCost = inQty > 0 ? Math.round(purchaseSupply / inQty) : 0;
    return { ...s, balance, inQty, avgCost, purchaseSupply, purchaseVat, purchaseTotal: purchaseSupply + purchaseVat };
  });
  res.json(out);
});

erpRouter.post("/construction/stocks", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { name, unit, note } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "품목명을 입력하세요" });
  const stock = await prisma.erpConstructionStock.create({
    data: { name: String(name).trim(), unit: unit?.trim() || "개", note: note?.trim() || null },
    include: { moves: true },
  });
  res.json(stock);
});

erpRouter.delete("/construction/stocks/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionStock.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

// 입출고 기록
erpRouter.post("/construction/stocks/:id/moves", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const { date, kind, qty, unitPrice, vatSeparate, memo } = req.body ?? {};
  const move = await prisma.erpConstructionStockMove.create({
    data: {
      stockId: req.params.id,
      date: cstStockDate(date),
      kind: kind === "out" ? "out" : "in",
      qty: Math.max(0, Math.round(Number(qty) || 0)),
      unitPrice: unitPrice != null && unitPrice !== "" ? Math.max(0, Math.round(Number(unitPrice))) : null,
      vatSeparate: vatSeparate === undefined ? true : !!vatSeparate,
      memo: memo?.trim() || null,
    },
  });
  res.json(move);
});

erpRouter.delete("/construction/stock-moves/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionStockMove.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── 브로제이 설치일정 (앱 네이티브, 시트 동기화 없음) ──
const INSTALL_DATA_KEYS = [
  "team", "type", "plan", "centerFree", "doorlock",
  "kiosk1", "qty1", "kiosk2", "qty2", "kiosk3", "qty3",
  "region", "address", "notes", "siteStatus", "visitTime", "phone", "bizRegNo",
  "paymentTid", "cultureTid", "photoDelivered", "serialNo", "baseFee",
  "addInstall", "addVisit", "finalSettle", "tidRegistered",
];

function pickInstallData(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of INSTALL_DATA_KEYS) {
    if (body[k] === undefined) continue;
    const v = body[k];
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

function defaultInstallMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function installMonth(v: unknown): string {
  return String(v ?? "").trim() || defaultInstallMonth();
}

function flattenInstall(row: {
  id: string; month: string; installDate: string | null; centerName: string | null;
  sortIndex: number; data: unknown; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: row.id,
    month: row.month,
    installDate: row.installDate,
    centerName: row.centerName,
    sortIndex: row.sortIndex,
    ...(row.data as Record<string, unknown>),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

erpRouter.get("/install-schedule/months", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const rows = await prisma.erpInstallSchedule.findMany({ select: { month: true }, distinct: ["month"] });
  const months = [...new Set(rows.map((r) => r.month))].sort((a, b) => b.localeCompare(a));
  res.json({ months });
});

erpRouter.get("/install-schedule", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const month = String(req.query.month ?? "").trim();
  const rows = await prisma.erpInstallSchedule.findMany({
    where: month ? { month } : {},
    orderBy: [{ installDate: "asc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
  });
  res.json({ rows: rows.map(flattenInstall) });
});

erpRouter.post("/install-schedule", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const row = await prisma.erpInstallSchedule.create({
    data: {
      month: installMonth(body.month),
      installDate: cstDate(body.installDate),
      centerName: String(body.centerName ?? "").trim() || null,
      data: pickInstallData(body) as object,
      sortIndex: Number(body.sortIndex) || 0,
    },
  });
  res.json(flattenInstall(row));
});

erpRouter.patch("/install-schedule/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const existing = await prisma.erpInstallSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "설치일정 행을 찾을 수 없습니다" });
  const mergedData = { ...(existing.data as Record<string, unknown>), ...pickInstallData(body) };
  const row = await prisma.erpInstallSchedule.update({
    where: { id: req.params.id },
    data: {
      ...(body.month !== undefined ? { month: installMonth(body.month) } : {}),
      ...(body.installDate !== undefined ? { installDate: cstDate(body.installDate) } : {}),
      ...(body.centerName !== undefined ? { centerName: String(body.centerName).trim() || null } : {}),
      ...(body.sortIndex !== undefined ? { sortIndex: Number(body.sortIndex) || 0 } : {}),
      data: mergedData as object,
    },
  });
  res.json(flattenInstall(row));
});

erpRouter.delete("/install-schedule/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpInstallSchedule.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// 설치일정 원본 시트 (BROJ 설치 일정) — 시트에서 1회 가져오기(import) 용
const INSTALL_SHEET_ID = "1wPBJTDtlNT8VCluPhIJioiC5hyNiLp2uPe507T9jDPo";

// 헤더 라벨 → 필드 키 (공백 제거 후 매칭). '수량'은 카운터로 kiosk와 순서대로 매칭, 나머지 제외.
const INSTALL_HEADER_MAP: Record<string, string> = {
  "설치팀": "team", "시공일": "installDate", "구분": "type", "센터유/무상": "centerFree",
  "요금제": "plan", "도어락": "doorlock",
  "키오스크1": "kiosk1", "키오스크2": "kiosk2", "키오스크3": "kiosk3",
  "센터명": "centerName", "지역": "region", "주소": "address", "특이사항": "notes",
  "현장상태": "siteStatus", "방문예정시각": "visitTime", "연락처": "phone",
  "사업자번호": "bizRegNo", "일반결제TID": "paymentTid", "문화비결제TID": "cultureTid",
  "사진전달": "photoDelivered", "시리얼번호": "serialNo", "시리얼": "serialNo",
  "기본금": "baseFee", "추가설치": "addInstall", "추가방문": "addVisit",
  "최종정산": "finalSettle", "TID등록여부": "tidRegistered",
};

function normInstallDate(raw: string): string | null {
  const m = String(raw ?? "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function installNum(raw: string): number | null {
  const s = String(raw ?? "").replace(/[,\s]/g, "");
  if (!s || /^#?N\/?A$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function installMonthFromTab(tab: string): string {
  const m = tab.match(/(\d{4})\.(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : tab.trim();
}

erpRouter.get("/install-schedule/sheet-tabs", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  try {
    const titles = await listSheetTitles(INSTALL_SHEET_ID);
    // 월별 설치 탭만 (YYYY.MM.으로 시작) 최신순
    const tabs = titles
      .filter((t) => /^\d{4}\.\d{2}\./.test(t.trim()))
      .sort((a, b) => b.localeCompare(a));
    res.json({ tabs, all: titles });
  } catch (e) {
    console.error("install-sheet-tabs", e);
    res.status(502).json({ error: "시트 목록을 불러오지 못했습니다. 서비스 계정에 시트 열람 권한이 있는지 확인하세요." });
  }
});

erpRouter.post("/install-schedule/import", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const sheetName = String(req.body?.sheetName ?? "").trim();
  if (!sheetName) return res.status(400).json({ error: "가져올 시트 탭 이름이 필요합니다" });

  let grid: string[][];
  try {
    grid = await fetchSheetGrid(INSTALL_SHEET_ID, sheetName);
  } catch (e) {
    console.error("install-import-fetch", e);
    return res.status(502).json({ error: "시트를 읽지 못했습니다. 서비스 계정에 이 시트 열람 권한이 있는지 확인하세요." });
  }

  // 헤더 행 찾기 (센터명 + 시공일 있는 행)
  const headerIdx = grid.findIndex((row) => {
    const set = new Set((row ?? []).map((c) => String(c ?? "").replace(/\s/g, "")));
    return set.has("센터명") && set.has("시공일");
  });
  if (headerIdx < 0) return res.status(422).json({ error: "헤더 행(센터명·시공일)을 찾지 못했습니다" });

  // 열 → 필드 매핑 (수량은 kiosk 순서대로 qty1/2/3)
  const headers = grid[headerIdx] ?? [];
  const colField: Record<number, string> = {};
  let qtyCount = 0;
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] ?? "").replace(/\s/g, "");
    if (!h) continue;
    if (h === "수량") { qtyCount += 1; if (qtyCount <= 3) colField[c] = `qty${qtyCount}`; continue; }
    const field = INSTALL_HEADER_MAP[h];
    if (field) colField[c] = field;
  }

  const month = installMonthFromTab(sheetName);
  const NUM_FIELDS = new Set(["qty1", "qty2", "qty3", "baseFee", "finalSettle"]);
  const rows: Array<{ installDate: string | null; centerName: string | null; data: Record<string, unknown> }> = [];

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const rec: Record<string, unknown> = {};
    for (const [cStr, field] of Object.entries(colField)) {
      const raw = String(row[Number(cStr)] ?? "").trim();
      if (raw === "") continue;
      if (field === "installDate") { rec.installDate = normInstallDate(raw); continue; }
      if (NUM_FIELDS.has(field)) { const n = installNum(raw); if (n != null) rec[field] = n; continue; }
      rec[field] = raw;
    }
    const centerName = (rec.centerName as string) || null;
    const installDate = (rec.installDate as string) || null;
    // 빈 행 스킵 (센터명·시공일·설치팀 모두 없으면)
    if (!centerName && !installDate && !rec.team) continue;
    const { installDate: _i, centerName: _c, ...data } = rec;
    rows.push({ installDate, centerName, data });
  }

  // 설치팀(스스아이오티 등) 업체 관리에 자동 등록
  const teamNames = [...new Set(rows.map((r) => String((r.data as Record<string, unknown>).team ?? "").trim()).filter(Boolean))];
  for (const name of teamNames) {
    const exists = await prisma.erpConstructionTeam.findFirst({ where: { name } });
    if (!exists) await prisma.erpConstructionTeam.create({ data: { name } });
  }

  // 해당 월 기존 데이터 교체 (재-가져오기 시 중복 방지)
  await prisma.$transaction([
    prisma.erpInstallSchedule.deleteMany({ where: { month } }),
    ...rows.map((row, i) =>
      prisma.erpInstallSchedule.create({
        data: { month, installDate: row.installDate, centerName: row.centerName, data: row.data as object, sortIndex: i },
      })
    ),
  ]);

  res.json({ ok: true, month, imported: rows.length, teams: teamNames });
});
