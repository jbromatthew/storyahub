import { prisma } from "../db.js";
import { leaveDaysForType, notifyUser, deductLeaveBalance, leaveTypeLabel, leaveTypeColor, expandLeaveDates } from "./erp.js";

export type ApprovalRoleKey = "팀장" | "COO" | "CEO" | "경영지원" | "COO_OR_CEO";

export interface PlannedStep {
  stepOrder: number;
  approverRole: ApprovalRoleKey | string;
  approverId?: string | null;
  label: string;
}

const GENERAL_CHAINS: Record<string, ApprovalRoleKey[]> = {
  team_leader: ["팀장"],
  to_coo: ["팀장", "COO"],
  to_ceo: ["팀장", "COO", "CEO"],
};

export function chainForForm(formCode: string, approvalChain?: string): ApprovalRoleKey[] {
  if (formCode === "leave") return ["팀장"];
  if (formCode === "expense") return ["경영지원"];
  if (formCode === "purchase") return ["경영지원", "COO_OR_CEO"];
  if (formCode === "refund") return ["경영지원", "COO"];
  if (formCode === "general") {
    return GENERAL_CHAINS[approvalChain || "team_leader"] || ["팀장"];
  }
  return ["팀장"];
}

export function chainLabel(formCode: string, approvalChain?: string): string {
  const roles = chainForForm(formCode, approvalChain);
  return roles.join(" → ");
}

async function authorEmployee(userId: string) {
  return prisma.erpEmployee.findUnique({
    where: { userId },
    include: { department: true },
  });
}

async function findTeamLeader(authorId: string) {
  const author = await authorEmployee(authorId);
  if (author?.departmentId) {
    const inDept = await prisma.erpEmployee.findFirst({
      where: {
        departmentId: author.departmentId,
        status: "active",
        userId: { not: null },
        roles: { has: "팀장" },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (inDept?.userId) return inDept;
  }
  return prisma.erpEmployee.findFirst({
    where: { status: "active", userId: { not: null }, roles: { has: "팀장" } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

async function findByRole(role: string) {
  return prisma.erpEmployee.findFirst({
    where: { status: "active", userId: { not: null }, roles: { has: role } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

async function findCooOrCeo() {
  const coo = await findByRole("COO");
  if (coo?.userId) return coo;
  return findByRole("CEO");
}

async function resolveRoleStep(role: ApprovalRoleKey, authorId: string): Promise<PlannedStep | null> {
  if (role === "팀장") {
    const tl = await findTeamLeader(authorId);
    if (!tl?.userId) return null;
    return {
      stepOrder: 0,
      approverRole: "팀장",
      approverId: tl.userId,
      label: `팀장 (${tl.user?.name || tl.name || tl.user?.email})`,
    };
  }
  if (role === "경영지원") {
    const any = await findByRole("경영지원");
    const name = any?.user?.name || any?.name || "경영지원팀";
    return {
      stepOrder: 0,
      approverRole: "경영지원",
      approverId: any?.userId ?? null,
      label: `경영지원 (${any ? name : "담당자 지정 필요"})`,
    };
  }
  if (role === "COO") {
    const coo = await findByRole("COO");
    if (!coo?.userId) return null;
    return { stepOrder: 0, approverRole: "COO", approverId: coo.userId, label: `COO (${coo.user?.name || coo.name})` };
  }
  if (role === "CEO") {
    const ceo = await findByRole("CEO");
    if (!ceo?.userId) return null;
    return { stepOrder: 0, approverRole: "CEO", approverId: ceo.userId, label: `CEO (${ceo.user?.name || ceo.name})` };
  }
  if (role === "COO_OR_CEO") {
    const exec = await findCooOrCeo();
    if (!exec?.userId) return null;
    const which = exec.roles.includes("COO") ? "COO" : "CEO";
    return {
      stepOrder: 0,
      approverRole: "COO_OR_CEO",
      approverId: exec.userId,
      label: `${which} (${exec.user?.name || exec.name})`,
    };
  }
  return null;
}

export async function planApprovalSteps(
  authorId: string,
  formCode: string,
  approvalChain?: string
): Promise<PlannedStep[]> {
  const roles = chainForForm(formCode, approvalChain);
  const steps: PlannedStep[] = [];
  for (let i = 0; i < roles.length; i++) {
    const planned = await resolveRoleStep(roles[i], authorId);
    if (!planned) throw new Error(`결재자를 찾을 수 없습니다: ${roles[i]} (조직관리에서 역할을 지정하세요)`);
    steps.push({ ...planned, stepOrder: i + 1 });
  }
  return steps;
}

export async function createApprovalSteps(documentId: string, authorId: string, formCode: string, approvalChain?: string) {
  const plans = await planApprovalSteps(authorId, formCode, approvalChain);
  await prisma.erpApprovalStep.deleteMany({ where: { documentId } });
  await prisma.erpApprovalStep.createMany({
    data: plans.map((p) => ({
      documentId,
      stepOrder: p.stepOrder,
      stepType: "approve",
      approverId: p.approverId,
      approverRole: p.approverRole,
      status: "waiting",
    })),
  });
  return plans;
}

export function userCanApproveStep(
  step: { approverId: string | null; approverRole: string | null },
  userId: string,
  roles: string[]
) {
  if (step.approverId && step.approverId === userId) return true;
  if (!step.approverRole) return false;
  if (step.approverRole === "COO_OR_CEO") return roles.includes("COO") || roles.includes("CEO");
  return roles.includes(step.approverRole);
}

export async function findActiveStepForUser(documentId: string, userId: string) {
  const emp = await prisma.erpEmployee.findUnique({ where: { userId } });
  const roles = emp?.roles ?? [];
  const waiting = await prisma.erpApprovalStep.findMany({
    where: { documentId, status: "waiting" },
    orderBy: { stepOrder: "asc" },
  });
  const current = waiting[0];
  if (!current) return null;
  return userCanApproveStep(current, userId, roles) ? current : null;
}

export async function applyLeaveOnApproval(documentId: string) {
  const doc = await prisma.erpApprovalDocument.findUnique({
    where: { id: documentId },
    include: { form: true },
  });
  if (!doc || doc.form.code !== "leave") return;

  let lr = await prisma.erpLeaveRequest.findFirst({ where: { approvalDocId: documentId } });
  const body = doc.body as Record<string, unknown>;
  const userId = doc.authorId;
  const leaveType = String(body.leaveType || "annual");
  const startDate = body.startDate ? new Date(String(body.startDate)) : null;
  const endDate = body.endDate ? new Date(String(body.endDate)) : null;
  const days = body.days != null ? Number(body.days) : startDate && endDate ? leaveDaysForType(leaveType, startDate, endDate) : 1;

  if (!lr && startDate && endDate) {
    lr = await prisma.erpLeaveRequest.create({
      data: {
        userId,
        leaveType,
        startDate,
        endDate,
        days,
        reason: body.reason ? String(body.reason) : null,
        status: "approved",
        approvalDocId: documentId,
      },
    });
  } else if (lr) {
    await prisma.erpLeaveRequest.update({ where: { id: lr.id }, data: { status: "approved" } });
  }

  const year = (lr?.startDate || startDate || new Date()).getFullYear();
  const bal = await deductLeaveBalance(userId, year, days, leaveType);

  const label = leaveTypeLabel(leaveType);
  const color = leaveTypeColor(leaveType);
  const evStart = lr?.startDate || startDate;
  const evEnd = lr?.endDate || endDate;
  if (evStart) {
    for (const d of expandLeaveDates(evStart, evEnd || evStart)) {
      await prisma.event.create({
        data: {
          userId,
          title: `${label}`,
          startsAt: d,
          endsAt: d,
          category: "휴가",
          color,
          notes: lr?.reason || undefined,
        },
      });
    }
  }

  const summary = bal
    ? Math.max(0, bal.regularTotal + bal.carriedOver - bal.regularUsed + bal.rewardTotal - bal.rewardUsed)
    : 0;
  await notifyUser(userId, {
    module: "leave",
    title: "휴가가 승인되었습니다",
    body: days > 0 ? `${label} ${days}일 차감 · 잔여 ${summary}일` : `${label} 승인되었습니다`,
  });
}
