import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";

export type ErpAccessStatus = "approved" | "pending" | "rejected" | "none";

export type ErpAccessInfo = {
  status: ErpAccessStatus;
  isOwner: boolean;
  isSuperAdmin: boolean;
  canManageMembers: boolean;
  employeeId?: string;
};

const SUPER_ADMIN_ROLES = ["시스템관리자"] as const;
const ADMIN_MEMBER_ROLES = ["시스템관리자", "인사"] as const;

export function canManageErpMembers(email: string | null | undefined, roles: string[] = []): boolean {
  if (isErpOwner(email)) return true;
  return roles.some((r) => (ADMIN_MEMBER_ROLES as readonly string[]).includes(r));
}

export function isErpOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === env.erpOwnerEmail;
}

export function isErpSuperAdmin(email: string | null | undefined, roles: string[] = []): boolean {
  return isErpOwner(email) || roles.includes("시스템관리자");
}

export async function ensureOwnerEmployee(user: User) {
  const superRoles = [...SUPER_ADMIN_ROLES];
  const existing = await prisma.erpEmployee.findUnique({ where: { userId: user.id } });
  if (existing) {
    const roles = [...new Set([...existing.roles, ...superRoles])];
    if (existing.memberStatus !== "approved" || roles.length !== existing.roles.length) {
      return prisma.erpEmployee.update({
        where: { id: existing.id },
        data: { memberStatus: "approved", roles, jobRank: existing.jobRank || "임원" },
      });
    }
    return existing;
  }
  const byEmail = await prisma.erpEmployee.findFirst({ where: { email: user.email.toLowerCase() } });
  if (byEmail) {
    return prisma.erpEmployee.update({
      where: { id: byEmail.id },
      data: {
        userId: user.id,
        name: byEmail.name || user.name,
        memberStatus: "approved",
        jobRank: byEmail.jobRank || "임원",
        roles: [...new Set([...byEmail.roles, ...superRoles])],
      },
    });
  }
  return prisma.erpEmployee.create({
    data: {
      userId: user.id,
      name: user.name,
      email: user.email.toLowerCase(),
      employeeNo: user.email.split("@")[0],
      jobRank: "임원",
      roles: [...superRoles],
      memberStatus: "approved",
    },
  });
}

export async function resolveErpAccess(userId: string, email: string): Promise<ErpAccessInfo> {
  if (isErpOwner(email)) {
    await ensureOwnerEmployee({ id: userId, email, name: null } as User);
    return { status: "approved", isOwner: true, isSuperAdmin: true, canManageMembers: true };
  }

  const emp = await prisma.erpEmployee.findUnique({ where: { userId } });
  if (emp) {
    const status = (emp.memberStatus || "pending") as ErpAccessStatus;
    return {
      status: status === "approved" ? "approved" : status,
      isOwner: false,
      isSuperAdmin: isErpSuperAdmin(email, emp.roles),
      canManageMembers: canManageErpMembers(email, emp.roles),
      employeeId: emp.id,
    };
  }

  const invited = await prisma.erpEmployee.findFirst({
    where: { email: email.toLowerCase(), userId: null },
  });
  if (invited) {
    return { status: "pending", isOwner: false, isSuperAdmin: false, canManageMembers: false, employeeId: invited.id };
  }

  return { status: "none", isOwner: false, isSuperAdmin: false, canManageMembers: false };
}

export async function isApprovedErpMember(userId: string, email: string): Promise<boolean> {
  const access = await resolveErpAccess(userId, email);
  return access.status === "approved";
}

export async function listApprovedMemberUserIds(): Promise<string[]> {
  const owner = await prisma.user.findUnique({ where: { email: env.erpOwnerEmail } });
  const rows = await prisma.erpEmployee.findMany({
    where: { memberStatus: "approved", userId: { not: null } },
    select: { userId: true },
  });
  const ids = rows.map((r) => r.userId!).filter(Boolean);
  if (owner && !ids.includes(owner.id)) ids.push(owner.id);
  return ids;
}
