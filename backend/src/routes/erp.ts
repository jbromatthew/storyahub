import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt as cryptoRandomInt } from "crypto";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { fetchSheetGrid, listSheetTitles } from "../services/googleSheets.js";
import { getBrojDashboard } from "../services/brojDashboard.js";
import { listRevenueMonths, getRevenueTrend, getRevenueDetail } from "../services/salesRevenue.js";
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
import { presignGet } from "../services/r2.js";
import { getVendorPortal, sanitizeVendorItems, computeOrderAmounts, appendHistory, sanitizeDelivery } from "../services/vendorOrders.js";

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

/* ===================== 스마트상점 기술보급사업 ===================== */

// 회차 목록 (신청 건수 포함)
/* ===================== 인센티브 (소유자 전용) =====================
 * 규칙 (세일즈팀 인센티브 운영 방안 v5)
 *  - 재원 = 분기 합산 NBM 매출(이카운트 HW + 렌탈) × 0.5%
 *  - 지급 조건: 분기 3개월 평균 매출 ≥ 월 목표(1.5억). 미달이면 전액 미지급
 *  - 배분: 오웬(영업지원) 15% 고정 + 영업 3명 각 25%, 종합 1위에게 +10%
 *  - 종합 점수 = 결제수 비율×0.4 + 매출 비율×0.4 + 팀장평가 비율×0.2 (영업 3명만)
 *  - 재원은 NBM 기준, 개인 기여도는 결제주문내역(신규센터) 기준 — 두 합계는 다를 수 있다
 */
const INCENTIVE_SALES = ["Jo", "Jeff", "Sofia"] as const;   // 영업 (1위 경쟁 대상)
const INCENTIVE_SUPPORT = "Owen";                            // 영업지원 (고정 비율)
const INCENTIVE_DEFAULTS = {
  monthlyTarget: 165_000_000,  // 매출 조건 — 분기 평균 1억 6,500만원 이상
  countTarget: 90,             // 개수 조건 — 분기 평균 90개 이상
  poolRate: 0.5,               // 재원 = 3개월 누적 매출 × %
  supportShare: 15,            // 영업지원 고정 %
  baseShare: 25,               // 영업 기본 %
  topBonus: 10,                // 1위 추가 %
  wCount: 40, wRevenue: 40, wLeader: 20,  // 최종 점수 가중치 %
};
type IncentiveSettings = typeof INCENTIVE_DEFAULTS;

function incentiveSettingsOf(saved: unknown): IncentiveSettings {
  const s = (saved ?? {}) as Record<string, unknown>;
  const out = { ...INCENTIVE_DEFAULTS };
  for (const k of Object.keys(INCENTIVE_DEFAULTS) as Array<keyof IncentiveSettings>) {
    const v = Number(s[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

// 분기별 결제주문내역 담당자별 마감 카운트 (+ NBM HW매출은 이카운트 연동 예정)
erpRouter.get("/incentive", async (req: AuthedRequest, res) => {
  // 보기는 세일즈팀·CEO·COO, 값 수정은 COO만 (canEdit로 알린다)
  const access = await consultAccess(req.userId!, "incentive");
  if (!access.visible) return res.status(403).json({ error: "세일즈팀 및 승인권자 전용 메뉴입니다" });
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const year = Number(req.query.year) || now.getUTCFullYear();
  const quarter = Math.min(4, Math.max(1, Number(req.query.quarter) || Math.floor(now.getUTCMonth() / 3) + 1));
  const monthNums = [1, 2, 3].map((i) => (quarter - 1) * 3 + i);
  const monthKeys = monthNums.map((m) => `${year}.${String(m).padStart(2, "0")}`);

  const rows = await prisma.erpSalesOrder.findMany({
    where: { OR: monthKeys.map((m) => ({ sheetName: { startsWith: m } })) },
    select: { data: true, sheetName: true },
  });

  // 신규센터 결제만 카운트 (인센티브 대상)
  type Agg = { name: string; monthCounts: number[]; total: number };
  const byAssignee = new Map<string, Agg>();
  // 개인 기여 매출은 결제주문내역의 신규센터 결제 합계로 본다 (NBM 총액과는 기준이 다르다)
  const revenueByAssignee = new Map<string, number>();
  const orderMoney = (v: unknown) => Math.round(Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0);
  let totalCount = 0;
  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if (String(data["구분"] ?? "").trim() !== "신규센터") continue;
    const name = String(data["결제 담당자"] ?? data["담당자"] ?? "").trim() || "미지정";
    const mi = monthKeys.findIndex((m) => row.sheetName.trim().startsWith(m));
    if (mi === -1) continue;
    const agg = byAssignee.get(name) ?? { name, monthCounts: [0, 0, 0], total: 0 };
    agg.monthCounts[mi] += 1;
    agg.total += 1;
    byAssignee.set(name, agg);
    revenueByAssignee.set(name, (revenueByAssignee.get(name) ?? 0) + orderMoney(data["합계"] ?? data["총매출"]));
    totalCount += 1;
  }

  const saved = await prisma.erpIncentiveQuarter.findUnique({ where: { year_quarter: { year, quarter } } });
  const assignees = [...byAssignee.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ko"));

  /* ---- 인센티브 산정 ---- */
  const cfg = incentiveSettingsOf(saved?.settings);
  // 각 지표는 '3명 중 최댓값 = 100점' 비례 환산 (계획서 IV-3)
  const to100 = (v: number, max: number) => (max > 0 ? (v / max) * 100 : 0);
  // Number(null)은 0이라, 빈칸으로 저장한 값이 0으로 되살아나면 안 된다
  const money = (a: unknown): Array<number | null> =>
    [0, 1, 2].map((i) => {
      const raw = Array.isArray(a) ? (a as unknown[])[i] : undefined;
      if (raw === null || raw === undefined || raw === "") return null;
      const v = Number(raw);
      return Number.isFinite(v) ? v : null;
    });
  const hwSales = money(saved?.hwSales);
  const rentalSales = money(saved?.rentalSales);
  const nbmMonthly = [0, 1, 2].map((i) => (hwSales[i] ?? 0) + (rentalSales[i] ?? 0));
  const nbmTotal = nbmMonthly.reduce((a, b) => a + b, 0);
  const nbmAvg = nbmTotal / 3;
  // 지급 조건 두 가지 — 둘 다 충족해야 지급 (계획서 II-1)
  const countAvg = totalCount / 3;
  const revenueOk = nbmAvg >= cfg.monthlyTarget;
  const countOk = countAvg >= cfg.countTarget;
  const eligible = revenueOk && countOk;
  const pool = Math.round(nbmTotal * (cfg.poolRate / 100));

  /* 팀장 평가 3개 정량 지표 — 상담자료·사례는 COO 승인분만, 채널톡 활용도는 수기 입력 */
  const qStart = new Date(`${year}-${String(monthNums[0]).padStart(2, "0")}-01T00:00:00+09:00`);
  const qEnd = new Date(Date.UTC(year, monthNums[2], 1) - 9 * 3600 * 1000);
  const [docRows, caseRows] = await Promise.all([
    prisma.erpConsultDoc.findMany({
      where: { cooApproved: true, cooAt: { gte: qStart, lt: qEnd } },
      select: { authorName: true },
    }),
    prisma.kbArticle.findMany({
      where: { section: "sales_case", cooApproved: true, cooAt: { gte: qStart, lt: qEnd } },
      select: { user: { select: { name: true, email: true } } },
    }),
  ]);
  const tally = (rows: Array<{ authorName: string }>) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.authorName, (m.get(r.authorName) ?? 0) + 1);
    return m;
  };
  const docCount = tally(docRows);
  const caseCount = tally(caseRows.map((r) => ({ authorName: r.user?.name || r.user?.email || "" })));
  const usageRaw = (saved?.channelUsage ?? {}) as Record<string, unknown>;

  const salesRows = INCENTIVE_SALES.map((name) => {
    const u = Number(usageRaw[name]);
    return {
      name,
      count: byAssignee.get(name)?.total ?? 0,
      revenue: revenueByAssignee.get(name) ?? 0,
      docs: docCount.get(name) ?? 0,
      cases: caseCount.get(name) ?? 0,
      usage: Number.isFinite(u) && u >= 0 ? u : 0,
    };
  });
  const maxOf = (k: "count" | "revenue" | "docs" | "cases" | "usage") =>
    Math.max(...salesRows.map((r) => r[k]), 0);
  const mx = { count: maxOf("count"), revenue: maxOf("revenue"), docs: maxOf("docs"), cases: maxOf("cases"), usage: maxOf("usage") };

  const scored = salesRows.map((r) => {
    const docScore = to100(r.docs, mx.docs);
    const usageScore = to100(r.usage, mx.usage);
    const caseScore = to100(r.cases, mx.cases);
    const leaderScore = (docScore + usageScore + caseScore) / 3;   // 3개 지표 동일 가중
    const countScore = to100(r.count, mx.count);
    const revenueScore = to100(r.revenue, mx.revenue);
    return {
      ...r, docScore, usageScore, caseScore, leaderScore, countScore, revenueScore,
      score: leaderScore * (cfg.wLeader / 100) + countScore * (cfg.wCount / 100) + revenueScore * (cfg.wRevenue / 100),
    };
  });
  // 동점이면 결제 수가 많은 사람이 1위
  const ranked = [...scored].sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name));
  const anyData = salesRows.some((r) => r.count || r.revenue || r.docs || r.cases || r.usage);
  const topName = anyData ? ranked[0]?.name ?? null : null;
  const tied = ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].count === ranked[1].count;

  const shareOf = (name: string) => cfg.baseShare + (name === topName ? cfg.topBonus : 0);
  const distribution = [
    {
      name: INCENTIVE_SUPPORT, role: "영업지원", share: cfg.supportShare, top: false,
      // 금액은 조건과 무관하게 계산해 두고(예상 지급액), 실제 지급 여부는 eligible로 판단한다
      amount: Math.round(pool * (cfg.supportShare / 100)),
    },
    ...ranked.map((r) => ({
      name: r.name, role: "영업", share: shareOf(r.name), top: r.name === topName,
      amount: Math.round(pool * (shareOf(r.name) / 100)),
    })),
  ];
  res.json({
    year,
    quarter,
    months: monthNums.map((m) => `${m}월`),
    assignees,
    totalCount,
    // NBM은 두 갈래 수기 입력 — 이카운트 HW매출 + 렌탈 매출 (이카운트 손익 조회 API 미제공)
    hwSales,
    rentalSales,
    canEdit: access.role === "coo",
    channelUsage: Object.fromEntries(salesRows.map((r) => [r.name, r.usage || null])),
    settings: cfg,
    nbm: { monthly: nbmMonthly, total: nbmTotal, avg: nbmAvg },
    payout: { eligible, revenueOk, countOk, target: cfg.monthlyTarget, countTarget: cfg.countTarget, countAvg, pool },
    scored: ranked.map((r, i) => ({ ...r, rank: i + 1 })),
    topName,
    tied,
    distribution,
  });
});

// NBM(HW매출) 분기 수기 저장
erpRouter.put("/incentive", async (req: AuthedRequest, res) => {
  // NBM 매출·채널톡 활용 횟수는 COO만 수정한다
  const access = await consultAccess(req.userId!, "incentive");
  if (access.role !== "coo") return res.status(403).json({ error: "인센티브 값 수정은 COO만 할 수 있습니다" });
  const b = (req.body ?? {}) as Record<string, unknown>;
  const year = Number(b.year);
  const quarter = Number(b.quarter);
  if (!year || quarter < 1 || quarter > 4) return res.status(400).json({ error: "year/quarter 필요" });
  const money = (arr: unknown) => (Array.isArray(arr) ? arr : []).slice(0, 3)
    .map((v) => (v === null || v === "" ? null : Math.max(0, Math.round(Number(v) || 0))));
  // 보내온 항목만 갱신한다 — 한쪽만 저장해도 다른 쪽이 지워지지 않게
  const patch: Record<string, unknown> = {};
  if (b.hwSales !== undefined) patch.hwSales = money(b.hwSales);
  if (b.rentalSales !== undefined) patch.rentalSales = money(b.rentalSales);
  if (b.channelUsage !== undefined) {
    const src = (b.channelUsage ?? {}) as Record<string, unknown>;
    const out: Record<string, number | null> = {};
    for (const name of INCENTIVE_SALES) {
      const v = Number(src[name]);
      out[name] = Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
    }
    patch.channelUsage = out;
  }
  if (b.settings !== undefined) patch.settings = incentiveSettingsOf(b.settings);
  const saved = await prisma.erpIncentiveQuarter.upsert({
    where: { year_quarter: { year, quarter } },
    create: {
      year, quarter,
      hwSales: patch.hwSales ?? [], rentalSales: patch.rentalSales ?? [],
      channelUsage: (patch.channelUsage ?? {}) as object,
      settings: (patch.settings ?? {}) as object,
    },
    update: patch,
  });
  res.json({
    hwSales: saved.hwSales, rentalSales: saved.rentalSales,
    channelUsage: saved.channelUsage, settings: saved.settings,
  });
});

erpRouter.get("/smartstore/rounds", async (_req: AuthedRequest, res) => {
  const rounds = await prisma.erpSmartStoreRound.findMany({
    orderBy: [{ year: "desc" }, { round: "desc" }],
    include: { _count: { select: { applies: true } } },
  });
  res.json({ rounds: rounds.map((r) => ({ ...r, applyCount: r._count.applies })) });
});

erpRouter.post("/smartstore/rounds", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const year = Number(b.year);
  const round = Number(b.round);
  if (!year || !round) return res.status(400).json({ error: "연도와 차수를 입력하세요" });
  const title = String(b.title ?? "").trim() || `${year}년 ${round}차`;
  const guidePath = String(b.guidePath ?? "").trim() || `/smartstore/${year}-${round}.html`;
  try {
    const created = await prisma.erpSmartStoreRound.create({
      data: {
        year, round, title, guidePath,
        deadline: String(b.deadline ?? "").trim() || null,
        note: String(b.note ?? "").trim() || null,
        active: b.active === undefined ? true : !!b.active,
      },
    });
    res.json({ round: created });
  } catch {
    res.status(400).json({ error: "이미 있는 회차입니다" });
  }
});

erpRouter.patch("/smartstore/rounds/:id", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = String(b.title).trim();
  if (b.guidePath !== undefined) data.guidePath = String(b.guidePath).trim();
  if (b.deadline !== undefined) data.deadline = String(b.deadline).trim() || null;
  if (b.note !== undefined) data.note = String(b.note).trim() || null;
  if (b.active !== undefined) data.active = !!b.active;
  const updated = await prisma.erpSmartStoreRound.update({ where: { id: req.params.id }, data });
  res.json({ round: updated });
});

erpRouter.delete("/smartstore/rounds/:id", async (req: AuthedRequest, res) => {
  await prisma.erpSmartStoreRound.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// 접수 목록
erpRouter.get("/smartstore/applies", async (req: AuthedRequest, res) => {
  const roundId = typeof req.query.roundId === "string" && req.query.roundId ? req.query.roundId : null;
  const applies = await prisma.erpSmartStoreApply.findMany({
    where: roundId ? { roundId } : {},
    orderBy: { createdAt: "desc" },
    include: { round: { select: { year: true, round: true, title: true } } },
    take: 2000,
  });
  res.json({ applies });
});

erpRouter.patch("/smartstore/applies/:id", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (b.status !== undefined) {
    const s = String(b.status);
    if (!["new", "checked", "done"].includes(s)) return res.status(400).json({ error: "잘못된 상태" });
    data.status = s;
  }
  if (b.memo !== undefined) data.memo = String(b.memo).slice(0, 1000) || null;
  if (b.centerName !== undefined) data.centerName = String(b.centerName).trim().slice(0, 120);
  if (b.phone !== undefined) data.phone = String(b.phone).replace(/[^0-9]/g, "").slice(0, 13);
  if (b.storeId !== undefined) data.storeId = String(b.storeId).trim().slice(0, 60);
  if (b.stage !== undefined) {
    const v = String(b.stage).trim();
    if (!["start", "done"].includes(v)) return res.status(400).json({ error: "잘못된 단계" });
    data.stage = v;
  }
  if (b.source !== undefined) {
    // 유입경로는 집계의 축이라 세일즈/마케팅 두 값만 허용하고, 비우면 '경로 없음'으로 되돌린다
    const v = String(b.source).trim().toLowerCase();
    if (v && !["sales", "marketing"].includes(v)) return res.status(400).json({ error: "잘못된 유입경로" });
    data.source = v || null;
  }
  if (b.sourceDetail !== undefined) {
    // 공개 페이지의 ?by= 와 같은 규칙으로 정리한다. 비우면 '경로 없음'으로 되돌린다
    const v = String(b.sourceDetail).trim().replace(/[^0-9A-Za-z가-힣_\-. ]/g, "").slice(0, 40).trim();
    data.sourceDetail = v || null;
  }
  // 바뀐 항목만 이전/이후 값을 남긴다 — 무엇이 언제 누구에 의해 바뀌었는지 되짚을 수 있게
  const before = await prisma.erpSmartStoreApply.findUnique({
    where: { id: req.params.id },
    include: { round: { select: { year: true, round: true } } },
  });
  const updated = await prisma.erpSmartStoreApply.update({ where: { id: req.params.id }, data });

  if (before) {
    const editor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true, email: true } });
    const emp = await prisma.erpEmployee.findFirst({
      where: { OR: [{ userId: req.userId! }, { email: (editor?.email || "").toLowerCase() }] },
      select: { name: true },
    });
    const show = (f: string, v: unknown) => {
      if (v === null || v === undefined || v === "") return "(비움)";
      if (f === "stage") return v === "done" ? "신청완료" : "진행중";
      if (f === "source") return v === "sales" ? "세일즈" : v === "marketing" ? "마케팅" : String(v);
      if (f === "status") return v === "done" ? "완료" : v === "checked" ? "확인" : "신규";
      return String(v);
    };
    const rows = Object.keys(data)
      .filter((f) => show(f, (before as Record<string, unknown>)[f]) !== show(f, (data as Record<string, unknown>)[f]))
      .map((f) => ({
        applyId: before.id,
        roundLabel: before.round ? `${before.round.year}년 ${before.round.round}차` : "",
        center: before.centerName || "",
        editorEmail: (editor?.email || "").toLowerCase(),
        editorName: emp?.name || editor?.name || editor?.email || "",
        field: f,
        before: show(f, (before as Record<string, unknown>)[f]),
        after: show(f, (data as Record<string, unknown>)[f]),
      }));
    if (rows.length) await prisma.erpSmartStoreEditLog.createMany({ data: rows });
  }
  res.json({ apply: updated });
});

/** 스마트상점 수정 기록 */
erpRouter.get("/smartstore/edit-logs", async (req: AuthedRequest, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const logs = await prisma.erpSmartStoreEditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const byEditor: Record<string, number> = {};
  for (const l of logs) byEditor[l.editorName] = (byEditor[l.editorName] ?? 0) + 1;
  res.json({ logs, byEditor, days });
});

erpRouter.delete("/smartstore/applies/:id", async (req: AuthedRequest, res) => {
  await prisma.erpSmartStoreApply.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/* ===================== 메뉴 접근 제어 + 접속기록 ===================== */

// 내 메뉴 접근 규칙 — 규칙이 설정된 메뉴에 대해 현재 사용자의 허용 여부 (규칙 없는 메뉴는 기본 노출)
erpRouter.get("/menu-access", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
  const email = (user?.email || "").trim().toLowerCase();
  const rules = await prisma.erpMenuAccess.findMany();
  if (!rules.length) return res.json({ rules: {} });
  if (isErpOwner(email)) {
    return res.json({ rules: Object.fromEntries(rules.map((r) => [r.menuId, true])) });
  }
  const emp = await prisma.erpEmployee.findFirst({
    where: { OR: [{ userId: req.userId! }, { email }] },
    select: { departmentId: true },
  });
  const deptId = emp?.departmentId || "";
  const out: Record<string, boolean> = {};
  for (const r of rules) {
    out[r.menuId] =
      r.emails.map((e) => e.toLowerCase()).includes(email) || (!!deptId && r.deptIds.includes(deptId));
  }
  res.json({ rules: out });
});

// 메뉴 접근 규칙 설정 조회/저장 (소유자 전용)
erpRouter.get("/menu-access/config", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const rules = await prisma.erpMenuAccess.findMany({ orderBy: { menuId: "asc" } });
  res.json({ rules });
});

erpRouter.put("/menu-access/config", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const body = (req.body ?? {}) as { rules?: Array<Record<string, unknown>> };
  const rules = Array.isArray(body.rules) ? body.rules : [];
  for (const r of rules) {
    const menuId = String(r.menuId ?? "").trim();
    if (!menuId) continue;
    if (!r.restricted) {
      await prisma.erpMenuAccess.deleteMany({ where: { menuId } });
      continue;
    }
    const deptIds = Array.isArray(r.deptIds) ? r.deptIds.map(String).filter(Boolean) : [];
    const emails = Array.isArray(r.emails)
      ? r.emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];
    await prisma.erpMenuAccess.upsert({
      where: { menuId },
      create: { menuId, deptIds, emails },
      update: { deptIds, emails },
    });
  }
  const saved = await prisma.erpMenuAccess.findMany({ orderBy: { menuId: "asc" } });
  res.json({ rules: saved });
});

// 계정별 접속기록 (소유자 전용) — 최근 N일 일별 집계 (일/주/월 뷰는 프론트에서 계산)
erpRouter.get("/access-logs", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const days = Math.min(370, Math.max(7, Number(req.query.days) || 92));
  const since = new Date(Date.now() + 9 * 3600 * 1000 - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await prisma.erpAccessLog.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "desc" },
    select: { email: true, name: true, date: true, firstAt: true, lastAt: true, hits: true },
  });
  res.json({ rows, since });
});

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
  "requested", "survey", "quoting", "confirmed", "ongoing", "done", "billing", "settled",
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

// 실사 요청 (아파트너 기술지원 요청 내용 기록)
function sanitizeSurveyRequest(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
  const out = {
    requestType: s(r.requestType, 80),       // 요청구분 (예: 공동현관(SRR))
    evLink: s(r.evLink, 80),                 // E/V연동여부
    hopeDate: /^\d{4}-\d{2}-\d{2}$/.test(s(r.hopeDate, 10)) ? s(r.hopeDate, 10) : "", // 실사희망일
    content: s(r.content, 1000),             // 공사내용
    note: s(r.note, 1000),                   // 기타 요청사항
    team: s(r.team, 80),                     // 담당 시공팀
  };
  return out.requestType || out.evLink || out.hopeDate || out.content || out.note || out.team ? out : null;
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

// 공사 확정(이후 단계 포함)이면 부품 투입 수량만큼 재고 out 이동을 자동 생성한다.
// 견적의 자동 이동을 전부 지우고 다시 만드는 방식이라 수량 수정·확정 취소에도 재고가 맞는다.
const STOCK_DEDUCT_STATUSES = new Set(["confirmed", "ongoing", "done", "billing", "settled"]);
// 차감 후 잔여가 마이너스인 품목 목록을 돌려준다 (확정은 막지 않고 경고만).
type StockWarning = { name: string; needed: number; balance: number };
async function syncQuoteStockMoves(quoteId: string): Promise<StockWarning[]> {
  const quote = await prisma.erpConstructionQuote.findUnique({
    where: { id: quoteId },
    include: { apartment: true },
  });
  if (!quote) return [];
  return prisma.$transaction(async (tx) => {
    await tx.erpConstructionStockMove.deleteMany({ where: { quoteId } });
    if (!STOCK_DEDUCT_STATUSES.has(quote.status)) return [];
    const materials = (Array.isArray(quote.materials) ? quote.materials : []) as Array<{
      stockId?: string | null; name?: string; qty?: number;
    }>;
    const stockIds = [...new Set(materials.map((m) => m?.stockId).filter((v): v is string => !!v))];
    if (!stockIds.length) return [];
    const stocks = await tx.erpConstructionStock.findMany({
      where: { id: { in: stockIds } },
      include: { moves: { select: { kind: true, qty: true } } },
    });
    const valid = new Set(stocks.map((s) => s.id));
    const date = quote.startDate || new Date().toISOString().slice(0, 10);
    const label = quote.apartment?.name || quote.title || "공사";
    const rows = materials
      .filter((m) => m?.stockId && valid.has(m.stockId) && Math.round(Number(m.qty) || 0) > 0)
      .map((m) => ({
        stockId: m.stockId as string,
        quoteId,
        date,
        kind: "out",
        qty: Math.round(Number(m.qty) || 0),
        memo: `공사 확정 자동 차감 — ${label}`,
      }));
    if (rows.length) await tx.erpConstructionStockMove.createMany({ data: rows });

    const warnings: StockWarning[] = [];
    for (const s of stocks) {
      const needed = rows.filter((r) => r.stockId === s.id).reduce((a, r) => a + r.qty, 0);
      if (!needed) continue;
      const balance =
        s.moves.reduce((a, m) => a + (m.kind === "out" ? -m.qty : m.qty), 0) - needed;
      if (balance < 0) warnings.push({ name: s.name, needed, balance });
    }
    return warnings;
  });
}

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
      surveyRequest: sanitizeSurveyRequest(req.body?.surveyRequest) ?? undefined,
      status: CONSTRUCTION_STATUSES.includes(status) ? status : "requested",
      taxInvoiceIssued: !!taxInvoiceIssued,
      taxInvoiceDate: cstDate(req.body?.taxInvoiceDate),
      taxInvoiceNo: String(req.body?.taxInvoiceNo ?? "").trim().slice(0, 40) || null,
      note: note?.trim() || null,
      startDate: cstDate(startDate),
      endDate: cstDate(endDate),
    },
    include: { apartment: true },
  });
  const stockWarnings = await syncQuoteStockMoves(quote.id);
  res.json({ ...quote, stockWarnings });
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
      ...(req.body?.surveyRequest !== undefined
        ? { surveyRequest: sanitizeSurveyRequest(req.body.surveyRequest) ?? undefined }
        : {}),
      ...(status !== undefined && CONSTRUCTION_STATUSES.includes(status) ? { status } : {}),
      ...(taxInvoiceIssued !== undefined ? { taxInvoiceIssued: !!taxInvoiceIssued } : {}),
      ...(req.body?.taxInvoiceDate !== undefined ? { taxInvoiceDate: cstDate(req.body.taxInvoiceDate) } : {}),
      ...(req.body?.taxInvoiceNo !== undefined ? { taxInvoiceNo: String(req.body.taxInvoiceNo ?? "").trim().slice(0, 40) || null } : {}),
      ...(note !== undefined ? { note: note?.trim() || null } : {}),
      ...(startDate !== undefined ? { startDate: cstDate(startDate) } : {}),
      ...(endDate !== undefined ? { endDate: cstDate(endDate) } : {}),
      ...(req.body?.siteCount !== undefined
        ? { siteCount: Math.max(0, Math.floor(Number(req.body.siteCount) || 0)) }
        : {}),
    },
    include: { apartment: true },
  });
  // 재고 자동 차감에 영향을 주는 값이 바뀐 경우만 재계산
  let stockWarnings: StockWarning[] = [];
  if (status !== undefined || materials !== undefined || startDate !== undefined ||
      apartmentId !== undefined || title !== undefined) {
    stockWarnings = await syncQuoteStockMoves(quote.id);
  }
  res.json({ ...quote, stockWarnings });
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

// 설치팀 실사 입력 링크 발급 (PIN 접속, 단가 비노출)
erpRouter.post("/construction/quotes/:id/survey-share", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const existing = await prisma.erpConstructionQuote.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "견적을 찾을 수 없습니다" });
  const token = existing.surveyToken || randomBytes(18).toString("base64url");
  const pin = existing.surveyPin || String(cryptoRandomInt(1000, 10000));
  const days = Number(req.body?.days) > 0 ? Math.min(365, Number(req.body.days)) : 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const q = await prisma.erpConstructionQuote.update({
    where: { id: req.params.id },
    data: { surveyToken: token, surveyPin: pin, surveyEnabled: true, surveyExpiresAt: expiresAt },
  });
  res.json({ token: q.surveyToken, pin: q.surveyPin, enabled: q.surveyEnabled, expiresAt: q.surveyExpiresAt });
});

erpRouter.post("/construction/quotes/:id/survey-share/disable", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpConstructionQuote.update({ where: { id: req.params.id }, data: { surveyEnabled: false } });
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
  const move = await prisma.erpConstructionStockMove.findUnique({ where: { id: req.params.id } });
  if (!move) return res.json({ ok: true });
  if (move.quoteId) {
    return res.status(400).json({ error: "공사 확정 자동 차감 기록입니다. 견적의 부품 투입에서 수정하세요." });
  }
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
  "adjustNote", "settleRequest", // 정산 조정 사유(수기) · 설치팀 금액 수정 요청 {amount, comment, by, at, status, ownerNote, decidedAt}
  "teamOk", "brojOk", // 정산 상호 확인 {at, by} | null — 설치팀 OK · 브로제이 OK (순서 무관)
  "canceled", // 취소 공사 {at, by} | null — 현장사정 취소, 정산 0원
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
  if (!(await requireVendorAccess(req, res))) return;
  const rows = await prisma.erpInstallSchedule.findMany({ select: { month: true }, distinct: ["month"] });
  const months = [...new Set(rows.map((r) => r.month))].sort((a, b) => b.localeCompare(a));
  res.json({ months });
});

erpRouter.get("/install-schedule", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const month = String(req.query.month ?? "").trim();
  const from = cstDate(req.query.from);
  const to = cstDate(req.query.to);
  let where: object = {};
  if (from || to) {
    // 기간 조회: 시공일 범위 + (시공일 미정 건은 월이 범위 안이면 포함)
    const dateCond = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const fm = from ? from.slice(0, 7).replace("-", ".") : null; // YYYY.MM
    const tm = to ? to.slice(0, 7).replace("-", ".") : null;
    where = {
      OR: [
        { installDate: dateCond },
        { installDate: null, month: { ...(fm ? { gte: fm } : {}), ...(tm ? { lte: tm } : {}) } },
      ],
    };
  } else if (month) {
    where = { month };
  }
  const rows = await prisma.erpInstallSchedule.findMany({
    where,
    orderBy: [{ installDate: "asc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
  });
  res.json({ rows: rows.map(flattenInstall) });
});

erpRouter.post("/install-schedule", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
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
  if (!(await requireVendorAccess(req, res))) return;
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
  if (!(await requireVendorAccess(req, res))) return;
  await prisma.erpInstallSchedule.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── 상담자료(매크로) 컨펌 — 세일즈팀 등록, CEO/COO 승인 ──
const CONSULT_CEO_EMAIL = "david@broj.company";
const CONSULT_COO_EMAIL = "matthew@broj.company";

/** 메뉴 접근 규칙(ErpMenuAccess)이 이 사람을 허용하는지. 규칙이 없으면 null. */
async function menuRuleAllows(menuId: string, email: string, deptId: string): Promise<boolean | null> {
  const rule = await prisma.erpMenuAccess.findUnique({ where: { menuId } });
  if (!rule) return null;
  return rule.emails.map((e) => e.toLowerCase()).includes(email)
    || (!!deptId && rule.deptIds.includes(deptId));
}

async function consultAccess(userId: string, menuId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  const email = (user?.email || "").trim().toLowerCase();
  // 승인은 COO 단독. CEO는 보기만 한다 (CEO 최종 승인 단계 폐지)
  const role: "coo" | null = email === CONSULT_COO_EMAIL ? "coo" : null;
  const isCeo = email === CONSULT_CEO_EMAIL;
  const emp = await prisma.erpEmployee.findFirst({
    where: { OR: [{ userId }, { email }] },
    include: { department: true },
  });
  const deptName = emp?.department?.name || "";
  const byDept = /세일즈|영업|sales/i.test(deptName);
  // 메뉴 권한에 규칙이 있으면 부서 판정과 함께 본다 — 팀·개인 단위로 열어줄 수 있다
  const ruled = menuId ? await menuRuleAllows(menuId, email, emp?.departmentId || "") : null;
  const canUpload = ruled === null ? byDept : (byDept || ruled);
  return {
    user,
    role,
    canUpload,
    visible: canUpload || role != null || isCeo,
    displayName: emp?.name || user?.name || email,
  };
}

erpRouter.get("/consult-docs/access", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "consult-docs");
  res.json({ visible: a.visible, canUpload: a.canUpload, role: a.role });
});

erpRouter.get("/consult-docs", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "consult-docs");
  if (!a.visible) return res.status(403).json({ error: "세일즈팀 및 승인권자 전용 메뉴입니다" });
  const from = cstDate(req.query.from);
  const to = cstDate(req.query.to);
  const where: Record<string, unknown> = {};
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00+09:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59+09:00`) } : {}),
    };
  }
  const docs = await prisma.erpConsultDoc.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json({ docs, canUpload: a.canUpload, role: a.role });
});

erpRouter.post("/consult-docs", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "consult-docs");
  if (!a.canUpload) return res.status(403).json({ error: "상담자료 등록은 세일즈팀만 할 수 있습니다" });
  const title = String(req.body?.title ?? "").trim();
  const note = String(req.body?.note ?? "").trim();
  if (!title) return res.status(400).json({ error: "매크로명을 입력하세요" });
  const doc = await prisma.erpConsultDoc.create({
    data: {
      title,
      note: note || null,
      authorId: a.user!.id,
      authorName: a.displayName,
      authorEmail: (a.user!.email || "").toLowerCase(),
    },
  });
  res.json(doc);
});

erpRouter.post("/consult-docs/:id/approve", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "consult-docs");
  if (a.role !== "coo") return res.status(403).json({ error: "승인은 COO만 할 수 있습니다" });
  const value = !!req.body?.value;
  const doc = await prisma.erpConsultDoc.update({
    where: { id: req.params.id },
    data: { cooApproved: value, cooAt: value ? new Date() : null },
  });
  res.json(doc);
});

/* ---- 상담 성공사례 — 지식경영 글(section=sales_case)에 COO 승인만 얹는다 ---- */
erpRouter.get("/sales-cases", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "sales-cases");
  if (!a.visible) return res.status(403).json({ error: "세일즈팀 및 승인권자 전용 메뉴입니다" });
  const from = cstDate(req.query.from);
  const to = cstDate(req.query.to);
  const where: Record<string, unknown> = { section: "sales_case" };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00+09:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59+09:00`) } : {}),
    };
  }
  const rows = await prisma.kbArticle.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, createdAt: true, cooApproved: true, cooAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  const cases = rows.map((r) => ({
    id: r.id, title: r.title, createdAt: r.createdAt,
    cooApproved: r.cooApproved, cooAt: r.cooAt,
    authorName: r.user?.name || r.user?.email || "(미상)",
  }));
  res.json({ cases, canUpload: a.canUpload, role: a.role });
});

erpRouter.post("/sales-cases/:id/approve", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "sales-cases");
  if (a.role !== "coo") return res.status(403).json({ error: "승인은 COO만 할 수 있습니다" });
  const value = !!req.body?.value;
  const row = await prisma.kbArticle.update({
    where: { id: req.params.id },
    data: { cooApproved: value, cooAt: value ? new Date() : null },
  });
  res.json({ id: row.id, cooApproved: row.cooApproved });
});

erpRouter.delete("/consult-docs/:id", async (req: AuthedRequest, res) => {
  const a = await consultAccess(req.userId!, "consult-docs");
  // 삭제는 COO(matthew)만 가능
  if (a.role !== "coo") return res.status(403).json({ error: "삭제 권한이 없습니다 (COO 전용)" });
  const doc = await prisma.erpConsultDoc.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "자료를 찾을 수 없습니다" });
  await prisma.erpConsultDoc.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// 브로제이 계기판 (2026년 계기판 시트) — 매출·마진 포함이라 소유자 전용
erpRouter.get("/broj-dashboard", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  try {
    res.json(await getBrojDashboard());
  } catch (e) {
    console.error("broj-dashboard", e);
    res.status(502).json({ error: "계기판 시트를 읽지 못했습니다. 서비스 계정에 시트 열람 권한이 있는지 확인하세요." });
  }
});

// 매출 분석 (결제주문내역 시트 실시간) — 소유자 전용
erpRouter.get("/sales-revenue", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  try {
    const months = await listRevenueMonths();
    if (!months.length) return res.json({ months: [], trend: [], detail: null });
    const reqMonth = String(req.query.month ?? "").trim();
    const monthKeys = months.map((m) => m.replace(/\.$/, ""));
    const selected = monthKeys.includes(reqMonth) ? reqMonth : monthKeys[monthKeys.length - 1];
    const [trend, detail] = await Promise.all([
      getRevenueTrend(months),
      getRevenueDetail(selected),
    ]);
    res.json({ months: monthKeys, trend, detail });
  } catch (e) {
    console.error("sales-revenue", e);
    res.status(502).json({ error: "주문내역 시트를 읽지 못했습니다" });
  }
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

// 설치팀 월별 정산 공유 링크 발급 (팀별 토큰+PIN 재사용) — 발급 시 보고 있던 기간만 노출
erpRouter.post("/install-settle-share", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const team = String(b.team ?? "").trim();
  if (!team) return res.status(400).json({ error: "설치팀명이 필요합니다" });
  const fromDate = cstDate(b.from);
  const toDate = cstDate(b.to);
  if (!fromDate || !toDate) return res.status(400).json({ error: "공유할 기간(월)을 선택하세요" });
  let share = await prisma.erpInstallSettleShare.findFirst({ where: { team, active: true } });
  if (!share) {
    share = await prisma.erpInstallSettleShare.create({
      data: { team, token: randomBytes(18).toString("base64url"), pin: String(cryptoRandomInt(1000, 10000)), fromDate, toDate },
    });
  } else {
    // 같은 링크를 유지하되 노출 기간은 이번에 선택한 기간으로 갱신
    share = await prisma.erpInstallSettleShare.update({ where: { id: share.id }, data: { fromDate, toDate } });
  }
  res.json({ token: share.token, pin: share.pin, team: share.team, from: share.fromDate, to: share.toDate, payout: share.payout ?? null });
});

// 팀 지급 정산서 저장 (차감·지급처 분배 — 설치팀 페이지에도 표시)
erpRouter.put("/install-settle-share/payout", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const team = String(b.team ?? "").trim();
  if (!team) return res.status(400).json({ error: "설치팀명이 필요합니다" });
  const share = await prisma.erpInstallSettleShare.findFirst({ where: { team, active: true } });
  if (!share) return res.status(404).json({ error: "먼저 정산 공유 링크를 만드세요" });
  const raw = (b.payout ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => Math.round(Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);
  const list = (v: unknown, nameKey: string) =>
    (Array.isArray(v) ? v : [])
      .map((x: Record<string, unknown>) => ({ [nameKey]: String(x?.[nameKey] ?? "").trim().slice(0, 120), amount: num(x?.amount) }))
      .filter((x) => x[nameKey] || x.amount)
      .slice(0, 20);
  const payout = {
    deductions: list(raw.deductions, "label"),
    payees: list(raw.payees, "name"),
    note: String(raw.note ?? "").trim().slice(0, 500),
  };
  await prisma.erpInstallSettleShare.update({ where: { id: share.id }, data: { payout: payout as object } });
  res.json({ ok: true, payout });
});

erpRouter.get("/install-schedule/sheet-tabs", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
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
  if (!(await requireVendorAccess(req, res))) return;
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
    data.sourceTab = sheetName; // 재-가져오기 시 이 탭 데이터만 정확히 교체 (중복/타업체 clobber 방지)
    rows.push({ installDate, centerName, data });
  }

  // 설치팀(스스아이오티 등) 업체 관리에 자동 등록
  const teamNames = [...new Set(rows.map((r) => String((r.data as Record<string, unknown>).team ?? "").trim()).filter(Boolean))];
  for (const name of teamNames) {
    const exists = await prisma.erpConstructionTeam.findFirst({ where: { name } });
    if (!exists) await prisma.erpConstructionTeam.create({ data: { name } });
  }

  // 재-가져오기 시 해당 월 전체 교체 (안내 문구와 동일 동작 — 과거 sourceTab 없는 데이터도 중복되지 않게).
  // 단, 앱에서 입력한 정산 데이터(최종 정산·기본금·조정 사유·팀 수정요청)는 같은 건에 병합해 보존한다.
  const existing = await prisma.erpInstallSchedule.findMany({ where: { month } });
  const matchKey = (installDate: string | null, centerName: string | null, d: Record<string, unknown>) =>
    [installDate ?? "", (centerName ?? "").trim(), String(d.type ?? ""), String(d.kiosk1 ?? "")].join("|");
  const pool = new Map<string, Array<Record<string, unknown>>>();
  for (const ex of existing) {
    const d = (ex.data ?? {}) as Record<string, unknown>;
    const k = matchKey(ex.installDate, ex.centerName, d);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k)!.push(d);
  }
  for (const row of rows) {
    const k = matchKey(row.installDate, row.centerName, row.data as Record<string, unknown>);
    const olds = pool.get(k);
    if (!olds?.length) continue;
    const old = olds.shift()!;
    const d = row.data as Record<string, unknown>;
    if (d.finalSettle == null && old.finalSettle != null) d.finalSettle = old.finalSettle;
    if (d.baseFee == null && old.baseFee != null) d.baseFee = old.baseFee;
    if (!d.adjustNote && old.adjustNote) d.adjustNote = old.adjustNote;
    if (old.settleRequest) d.settleRequest = old.settleRequest;
  }
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

/* ===================== 일일보고 — CEO/COO 전용 ===================== */

const DAILY_EXEC_EMAILS = new Set([CONSULT_CEO_EMAIL, CONSULT_COO_EMAIL]);

async function dailyAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  const email = (user?.email || "").trim().toLowerCase();
  return { user, email, ok: DAILY_EXEC_EMAILS.has(email) };
}

// 월별 보고 목록 (두 사람 것 모두)
erpRouter.get("/daily-reports", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const month = typeof req.query.month === "string" ? req.query.month : "";
  const whereBase = /^\d{4}-\d{2}$/.test(month) ? { date: { startsWith: month } } : {};
  // 내 보고는 나만 — 소유자는 전체 열람, 그 외에는 본인 보고만 보인다
  const where = isErpOwner(a.email) ? whereBase : { ...whereBase, authorEmail: a.email };
  const reports = await prisma.erpDailyReport.findMany({
    where,
    orderBy: [{ date: "desc" }, { authorEmail: "asc" }],
  });
  res.json({ reports, myEmail: a.email });
});

// 직전 보고의 '내일 할 일' (선택 날짜 이전 내 최신 보고 — 다음날 '오늘 한 일' 프리필용)
// 기존 ERP 코멘트를 노션 댓글로 일괄 전송 (1회성 백필) — cutoff 이전 작성분만 (라이브 훅 발송분 중복 방지)
erpRouter.post("/daily-comments/notion-backfill", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const cutoffRaw = String((req.body as Record<string, unknown>)?.cutoff ?? "");
  const cutoff = cutoffRaw ? new Date(cutoffRaw) : null;
  if (!cutoff || isNaN(cutoff.getTime())) return res.status(400).json({ error: "cutoff (ISO 시각) 필요" });
  const comments = await prisma.erpDailyComment.findMany({
    where: { createdAt: { lt: cutoff }, notionCommentId: null, authorEmail: { not: "notion" } },
    orderBy: { createdAt: "asc" },
  });
  const reportIds = [...new Set(comments.map((c) => c.reportId))];
  const reports = await prisma.erpDailyReport.findMany({
    where: { id: { in: reportIds } },
    select: { id: true, date: true, authorName: true },
  });
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const m = await import("../services/notionDaily.js");
  let ok = 0;
  const errors: string[] = [];
  for (const c of comments) {
    const r = reportMap.get(c.reportId);
    if (!r) continue;
    const sectionLabel = c.section === "did" ? "오늘 한 일" : c.section === "missed" ? "못한 일" : "내일 할 일";
    const fileCount = Array.isArray(c.files) ? c.files.length : 0;
    const msg = `${c.authorName}: ${c.body || "📎 파일"}${fileCount ? ` (📎 파일 ${fileCount}개)` : ""}`;
    try {
      await m.addDailyCommentToNotion(r.date, r.authorName, {
        itemText: c.itemText,
        inlineText: msg,
        pageText: `[${sectionLabel}] ${c.itemText} — ${msg}`,
      });
      ok++;
    }
    catch (e) { errors.push(`${r.date}: ${e instanceof Error ? e.message : e}`); }
  }
  res.json({ total: comments.length, ok, errors: errors.slice(0, 5) });
});

// 기존 보고 전체를 노션으로 일괄 전송 (1회성 백필)
erpRouter.post("/daily-reports/notion-backfill", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const reports = await prisma.erpDailyReport.findMany({ orderBy: { date: "asc" } });
  const m = await import("../services/notionDaily.js");
  let ok = 0;
  const errors: string[] = [];
  for (const r of reports) {
    try { await m.syncDailyReportToNotion(r); ok++; }
    catch (e) { errors.push(`${r.date}: ${e instanceof Error ? e.message : e}`); }
  }
  res.json({ total: reports.length, ok, errors: errors.slice(0, 5) });
});

erpRouter.get("/daily-reports/prev-plan", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const date = typeof req.query.date === "string" ? req.query.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date 형식은 YYYY-MM-DD" });
  const prev = await prisma.erpDailyReport.findFirst({
    where: { authorEmail: a.email, date: { lt: date }, NOT: { plan: "" } },
    orderBy: { date: "desc" },
    select: { date: true, plan: true },
  });
  res.json({ prev });
});

// 본인 보고 저장 (업서트)
erpRouter.put("/daily-reports/:date", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date 형식은 YYYY-MM-DD" });
  const body = (req.body ?? {}) as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === "string" ? v.slice(0, 20000) : "");
  const data = { did: clean(body.did), missed: clean(body.missed), plan: clean(body.plan) };
  const report = await prisma.erpDailyReport.upsert({
    where: { date_authorEmail: { date, authorEmail: a.email } },
    create: {
      date,
      authorId: a.user!.id,
      authorName: a.user?.name || a.email,
      authorEmail: a.email,
      ...data,
    },
    update: data,
  });
  // 노션 단방향 동기화 (설정 시) — 저장 응답을 막지 않도록 백그라운드
  void import("../services/notionDaily.js")
    .then((m) => m.syncDailyReportToNotion({ date, authorName: report.authorName, ...data }))
    .catch((e) => console.error("[notion-daily]", e instanceof Error ? e.message : e));
  res.json({ report });
});

// 본인 보고 삭제
erpRouter.delete("/daily-reports/:date", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const date = req.params.date;
  const target = await prisma.erpDailyReport.findFirst({ where: { date, authorEmail: a.email }, select: { authorName: true } });
  await prisma.erpDailyReport.deleteMany({ where: { date, authorEmail: a.email } });
  if (target) {
    void import("../services/notionDaily.js")
      .then((m) => m.removeDailyReportFromNotion(date, target.authorName))
      .catch((e) => console.error("[notion-daily]", e instanceof Error ? e.message : e));
  }
  res.json({ ok: true });
});

/* ── 일일보고 항목별 코멘트 스레드 ── */

type DailyCommentFile = { key: string; name: string };

function sanitizeCommentFiles(raw: unknown): DailyCommentFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => ({
      key: typeof (f as Record<string, unknown>)?.key === "string" ? String((f as Record<string, unknown>).key) : "",
      name: typeof (f as Record<string, unknown>)?.name === "string" ? String((f as Record<string, unknown>).name).slice(0, 200) : "파일",
    }))
    .filter((f) => f.key)
    .slice(0, 10);
}

// 월별 코멘트 + 미해결 스레드(전체 기간)
erpRouter.get("/daily-comments", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const month = typeof req.query.month === "string" ? req.query.month : "";
  // 내 보고는 나만 — 소유자 외에는 본인 보고의 코멘트만
  const reportScope = isErpOwner(a.email) ? {} : { authorEmail: a.email };
  const monthReports = /^\d{4}-\d{2}$/.test(month)
    ? await prisma.erpDailyReport.findMany({ where: { date: { startsWith: month }, ...reportScope }, select: { id: true } })
    : [];
  const comments = monthReports.length
    ? await prisma.erpDailyComment.findMany({
        where: { reportId: { in: monthReports.map((r) => r.id) } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // ★ 중요 표시된 스레드만 스레드함에 노출 (일반 코멘트는 항목 히스토리)
  const visibleReportIds = isErpOwner(a.email)
    ? null
    : (await prisma.erpDailyReport.findMany({ where: reportScope, select: { id: true } })).map((r) => r.id);
  const openRoots = await prisma.erpDailyComment.findMany({
    where: { parentId: null, important: true, ...(visibleReportIds ? { reportId: { in: visibleReportIds } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const reportIds = [...new Set(openRoots.map((c) => c.reportId))];
  const reports = reportIds.length
    ? await prisma.erpDailyReport.findMany({
        where: { id: { in: reportIds } },
        select: { id: true, date: true, authorEmail: true, authorName: true },
      })
    : [];
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const replyCounts = await prisma.erpDailyComment.groupBy({
    by: ["parentId"],
    where: { parentId: { in: openRoots.map((c) => c.id) } },
    _count: { _all: true },
  }).catch(() => [] as Array<{ parentId: string | null; _count: { _all: number } }>);
  const countMap = new Map(replyCounts.map((c) => [c.parentId, c._count._all]));
  const openThreads = openRoots
    .map((c) => {
      const r = reportMap.get(c.reportId);
      if (!r) return null;
      return {
        id: c.id,
        reportId: c.reportId,
        date: r.date,
        reportAuthorEmail: r.authorEmail,
        reportAuthorName: r.authorName,
        section: c.section,
        itemId: c.itemId,
        itemText: c.itemText,
        authorEmail: c.authorEmail,
        authorName: c.authorName,
        body: c.body,
        replyCount: countMap.get(c.id) ?? 0,
        createdAt: c.createdAt,
      };
    })
    .filter(Boolean);

  res.json({ comments, openThreads, myEmail: a.email });
});

// 코멘트/답글 등록
erpRouter.post("/daily-comments", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reportId = typeof b.reportId === "string" ? b.reportId : "";
  const section = typeof b.section === "string" && ["did", "missed", "plan"].includes(b.section) ? b.section : "";
  const itemId = typeof b.itemId === "string" ? b.itemId.slice(0, 200) : "";
  const itemText = typeof b.itemText === "string" ? b.itemText.slice(0, 500) : "";
  const body = typeof b.body === "string" ? b.body.slice(0, 10000) : "";
  const parentId = typeof b.parentId === "string" && b.parentId ? b.parentId : null;
  const files = sanitizeCommentFiles(b.files);
  if (!reportId || !section || !itemId) return res.status(400).json({ error: "reportId/section/itemId 필요" });
  if (!body.trim() && !files.length) return res.status(400).json({ error: "내용 또는 파일이 필요합니다" });
  const report = await prisma.erpDailyReport.findUnique({ where: { id: reportId }, select: { id: true, date: true, authorName: true } });
  if (!report) return res.status(404).json({ error: "보고를 찾을 수 없습니다" });
  if (parentId) {
    const parent = await prisma.erpDailyComment.findUnique({ where: { id: parentId }, select: { id: true, reportId: true } });
    if (!parent || parent.reportId !== reportId) return res.status(400).json({ error: "잘못된 스레드" });
  }
  const comment = await prisma.erpDailyComment.create({
    data: {
      reportId,
      section,
      itemId,
      itemText,
      parentId,
      authorEmail: a.email,
      authorName: a.user?.name || a.email,
      body: body.trim(),
      files,
    },
  });
  // 노션 항목 블록 인라인 댓글로도 동기화 (설정 시, 매칭 실패 시 페이지 댓글)
  {
    const sectionLabel = section === "did" ? "오늘 한 일" : section === "missed" ? "못한 일" : "내일 할 일";
    const fileNote = files.length ? ` (📎 파일 ${files.length}개)` : "";
    const msg = `${comment.authorName}: ${comment.body || "📎 파일"}${fileNote}`;
    void import("../services/notionDaily.js")
      .then((m) => m.addDailyCommentToNotion(report.date, report.authorName, {
        itemText,
        inlineText: msg,
        pageText: `[${sectionLabel}] ${itemText} — ${msg}`,
      }))
      .catch((e) => console.error("[notion-daily]", e instanceof Error ? e.message : e));
  }
  res.json({ comment });
});

// ★ 중요 표시/해제 (루트) — 중요만 스레드함에 남음
erpRouter.post("/daily-comments/:id/important", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const important = !!(req.body as Record<string, unknown> | undefined)?.important;
  const root = await prisma.erpDailyComment.findUnique({ where: { id: req.params.id } });
  if (!root || root.parentId) return res.status(404).json({ error: "스레드를 찾을 수 없습니다" });
  const comment = await prisma.erpDailyComment.update({ where: { id: root.id }, data: { important } });
  res.json({ comment });
});

// 스레드 해결/해제 (루트) — 레거시, UI에서는 미사용
erpRouter.post("/daily-comments/:id/resolve", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const resolved = !!(req.body as Record<string, unknown> | undefined)?.resolved;
  const root = await prisma.erpDailyComment.findUnique({ where: { id: req.params.id } });
  if (!root || root.parentId) return res.status(404).json({ error: "스레드를 찾을 수 없습니다" });
  const comment = await prisma.erpDailyComment.update({ where: { id: root.id }, data: { resolved } });
  res.json({ comment });
});

// 코멘트 삭제 (본인 것만, 루트 삭제 시 답글도 삭제)
erpRouter.delete("/daily-comments/:id", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const c = await prisma.erpDailyComment.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: "코멘트를 찾을 수 없습니다" });
  if (c.authorEmail !== a.email) return res.status(403).json({ error: "본인 코멘트만 삭제할 수 있습니다" });
  await prisma.erpDailyComment.deleteMany({ where: { OR: [{ id: c.id }, { parentId: c.id }] } });
  res.json({ ok: true });
});

// 첨부파일 열람 URL — 코멘트에 붙은 키만, CEO/COO 서로 열람 가능
erpRouter.get("/daily-comments/file", async (req: AuthedRequest, res) => {
  const a = await dailyAccess(req.userId!);
  if (!a.ok) return res.status(403).json({ error: "CEO/COO 전용 메뉴입니다" });
  const key = String(req.query.key ?? "");
  if (!key) return res.status(400).json({ error: "key 필요" });
  const owner = await prisma.erpDailyComment.findFirst({
    where: { files: { array_contains: [{ key }] } as never },
    select: { id: true },
  }).catch(() => null);
  if (!owner) {
    // JSON 배열 부분일치가 안 되는 경우 대비: 문자열 포함으로 재확인
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ErpDailyComment" WHERE "files"::text LIKE ${"%" + key + "%"} LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: "파일을 찾을 수 없습니다" });
  }
  res.json({ url: await presignGet(key) });
});

/* ===================== IoT 견적 리드 관리 ===================== */

erpRouter.get("/iot-leads", async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const where = status && ["new", "contacted", "done"].includes(status) ? { status } : {};
  const leads = await prisma.erpIotLead.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  res.json({ leads });
});

erpRouter.patch("/iot-leads/:id", async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof b.status === "string" && ["new", "contacted", "done"].includes(b.status)) data.status = b.status;
  if (b.memo !== undefined) data.memo = typeof b.memo === "string" ? b.memo.slice(0, 2000) : null;
  const lead = await prisma.erpIotLead.update({ where: { id: req.params.id }, data });
  res.json({ lead });
});

erpRouter.delete("/iot-leads/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpIotLead.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/* ===================== 크라이저 발주 관리 (브로제이 측) =====================
   접근: 소유자 + 경영지원팀 + 세일즈팀. 포털 설정·삭제는 소유자만. */

async function vendorOrderAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (isErpOwner(user?.email)) return true;
  const email = (user?.email || "").trim().toLowerCase();
  const emp = await prisma.erpEmployee.findFirst({
    where: { OR: [{ userId }, { email }] },
    include: { department: true },
  });
  const dept = emp?.department?.name || "";
  return /세일즈|영업|sales|경영지원|경영/i.test(dept);
}

async function requireVendorAccess(req: AuthedRequest, res: Response): Promise<boolean> {
  if (await vendorOrderAccess(req.userId!)) return true;
  res.status(403).json({ error: "경영지원팀·세일즈팀 전용 메뉴입니다" });
  return false;
}

erpRouter.get("/vendor-orders/access", async (req: AuthedRequest, res) => {
  res.json({ visible: await vendorOrderAccess(req.userId!) });
});

erpRouter.get("/vendor-orders", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const portal = await getVendorPortal();
  const orders = await prisma.erpVendorOrder.findMany({
    where: { vendorId: portal.id },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ portal: { id: portal.id, name: portal.name, pin: portal.pin, active: portal.active, products: portal.products }, orders });
});

erpRouter.put("/vendor-orders/portal", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const portal = await getVendorPortal();
  const data: Record<string, unknown> = {};
  if (typeof b.pin === "string" && /^\d{4,8}$/.test(b.pin.trim())) data.pin = b.pin.trim();
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim().slice(0, 50);
  if (b.active !== undefined) data.active = !!b.active;
  if (Array.isArray(b.products)) {
    data.products = b.products
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          name: String(o.name ?? "").trim().slice(0, 100),
          unitPrice: Math.max(0, Math.floor(Number(o.unitPrice) || 0)),
        };
      })
      .filter((p) => p.name)
      .slice(0, 100);
  }
  const updated = await prisma.erpVendorPortal.update({ where: { id: portal.id }, data: data as never });
  res.json({ portal: { id: updated.id, name: updated.name, pin: updated.pin, active: updated.active, products: updated.products } });
});

erpRouter.post("/vendor-orders", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const items = sanitizeVendorItems(b.items);
  if (!items.length) return res.status(400).json({ error: "제품과 수량을 입력하세요" });
  const orderDate = typeof b.orderDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.orderDate) ? b.orderDate : new Date().toISOString().slice(0, 10);
  const amounts = computeOrderAmounts(items, Number(b.prepayRate) || 30);
  const portal = await getVendorPortal();
  const order = await prisma.erpVendorOrder.create({
    data: {
      vendorId: portal.id,
      orderDate,
      items: items as never,
      ...amounts,
      note: typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null,
      history: appendHistory([], "broj", `브로제이가 발주를 요청했습니다 (${items.map((i) => `${i.name} ×${i.qty}`).join(", ")})`) as never,
    },
  });
  res.json({ order });
});

erpRouter.patch("/vendor-orders/:id", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const order = await prisma.erpVendorOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "발주를 찾을 수 없습니다" });
  let history = (Array.isArray(order.history) ? order.history : []) as never[];
  const data: Record<string, unknown> = {};
  const act = typeof b.action === "string" ? b.action : "";
  const now = new Date();
  // 입금일 직접 입력 (없으면 오늘)
  const paidDateStr = typeof b.paidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.paidDate) ? b.paidDate : null;
  const paidAt = paidDateStr ? new Date(`${paidDateStr}T09:00:00+09:00`) : now;
  const paidLabel = paidDateStr || now.toISOString().slice(0, 10);
  if (act === "prepay-paid") { data.prepayPaidAt = paidAt; history = appendHistory(history, "broj", `브로제이가 선금 입금을 완료했습니다 (입금일 ${paidLabel})`) as never[]; }
  else if (act === "prepay-unpaid") { data.prepayPaidAt = null; history = appendHistory(history, "broj", "선금 입금 완료를 취소했습니다") as never[]; }
  else if (act === "balance-paid") { data.balancePaidAt = paidAt; history = appendHistory(history, "broj", `브로제이가 잔금 입금을 완료했습니다 (입금일 ${paidLabel})`) as never[]; }
  else if (act === "balance-unpaid") { data.balancePaidAt = null; history = appendHistory(history, "broj", "잔금 입금 완료를 취소했습니다") as never[]; }
  else if (act === "done") { data.status = "done"; history = appendHistory(history, "broj", "발주를 완료 처리했습니다") as never[]; }
  else if (act === "cancel") { data.status = "cancelled"; history = appendHistory(history, "broj", "발주를 취소했습니다") as never[]; }
  else if (act === "reopen") { data.status = order.approvedAt ? "approved" : "requested"; history = appendHistory(history, "broj", "발주를 다시 열었습니다") as never[]; }
  else if (act === "prepay-verify") { data.prepayVerified = true; history = appendHistory(history, "broj", "경영지원이 선금 세금계산서를 확인(더블체크)했습니다") as never[]; }
  else if (act === "prepay-unverify") { data.prepayVerified = false; history = appendHistory(history, "broj", "선금 세금계산서 확인을 취소했습니다") as never[]; }
  else if (act === "balance-verify") { data.balanceVerified = true; history = appendHistory(history, "broj", "경영지원이 잔금 세금계산서를 확인(더블체크)했습니다") as never[]; }
  else if (act === "balance-unverify") { data.balanceVerified = false; history = appendHistory(history, "broj", "잔금 세금계산서 확인을 취소했습니다") as never[]; }
  else if (act === "force-approve" && order.status === "requested") {
    data.status = "approved";
    data.approvedAt = now;
    history = appendHistory(history, "broj", "브로제이가 기존 진행 건으로 승인 처리했습니다") as never[];
  }
  const taxRe = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof b.prepayTaxDate === "string" && (b.prepayTaxDate === "" || taxRe.test(b.prepayTaxDate))) {
    data.prepayTaxDate = b.prepayTaxDate || null;
    if (b.prepayTaxDate) history = appendHistory(history, "broj", `선금 세금계산서 발행일 기록: ${b.prepayTaxDate}`) as never[];
  }
  if (typeof b.balanceTaxDate === "string" && (b.balanceTaxDate === "" || taxRe.test(b.balanceTaxDate))) {
    data.balanceTaxDate = b.balanceTaxDate || null;
    if (b.balanceTaxDate) history = appendHistory(history, "broj", `잔금 세금계산서 발행일 기록: ${b.balanceTaxDate}`) as never[];
  }
  if (b.note !== undefined) data.note = typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null;
  if (Array.isArray(b.items) && order.status === "requested") {
    const items = sanitizeVendorItems(b.items);
    if (items.length) {
      Object.assign(data, { items: items as never }, computeOrderAmounts(items, order.prepayRate));
      history = appendHistory(history, "broj", "발주 내용을 수정했습니다") as never[];
    }
  }
  data.history = history;
  const updated = await prisma.erpVendorOrder.update({ where: { id: order.id }, data: data as never });
  res.json({ order: updated });
});

erpRouter.post("/vendor-orders/:id/delivery", async (req: AuthedRequest, res) => {
  if (!(await requireVendorAccess(req, res))) return;
  const entry = sanitizeDelivery(req.body, "broj");
  if (!entry) return res.status(400).json({ error: "날짜/제품/수량을 확인하세요" });
  const order = await prisma.erpVendorOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "발주를 찾을 수 없습니다" });
  const deliveries = [...(Array.isArray(order.deliveries) ? order.deliveries : []), entry].slice(-100);
  const updated = await prisma.erpVendorOrder.update({
    where: { id: order.id },
    data: {
      deliveries: deliveries as never,
      history: appendHistory(order.history, "broj", `입고 기록: ${entry.date} ${entry.name} ${entry.qty}대${entry.note ? ` (${entry.note})` : ""}`) as never,
    },
  });
  res.json({ order: updated });
});

erpRouter.delete("/vendor-orders/:id", async (req: AuthedRequest, res) => {
  if (!(await requireOwner(req, res))) return;
  await prisma.erpVendorOrder.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
