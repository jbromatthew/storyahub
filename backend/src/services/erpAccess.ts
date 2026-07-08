import type { User } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";

export type ErpAccessStatus = "approved" | "pending" | "rejected" | "none";

export type ErpAccessInfo = {
  status: ErpAccessStatus;
  isOwner: boolean;
  canManageMembers: boolean;
  employeeId?: string;
};

export function isErpOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === env.erpOwnerEmail;
}

export async function ensureOwnerEmployee(user: User) {
  const existing = await prisma.erpEmployee.findUnique({ where: { userId: user.id } });
  if (existing) {
    if (existing.memberStatus !== "approved") {
      return prisma.erpEmployee.update({
        where: { id: existing.id },
        data: { memberStatus: "approved", roles: existing.roles.length ? existing.roles : ["시스템관리자"] },
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
        roles: byEmail.roles.length ? byEmail.roles : ["시스템관리자"],
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
      roles: ["시스템관리자"],
      memberStatus: "approved",
    },
  });
}

export async function resolveErpAccess(userId: string, email: string): Promise<ErpAccessInfo> {
  if (isErpOwner(email)) {
    await ensureOwnerEmployee({ id: userId, email, name: null } as User);
    return { status: "approved", isOwner: true, canManageMembers: true };
  }

  const emp = await prisma.erpEmployee.findUnique({ where: { userId } });
  if (emp) {
    const status = (emp.memberStatus || "pending") as ErpAccessStatus;
    return {
      status: status === "approved" ? "approved" : status,
      isOwner: false,
      canManageMembers: false,
      employeeId: emp.id,
    };
  }

  const invited = await prisma.erpEmployee.findFirst({
    where: { email: email.toLowerCase(), userId: null },
  });
  if (invited) {
    return { status: "pending", isOwner: false, canManageMembers: false, employeeId: invited.id };
  }

  return { status: "none", isOwner: false, canManageMembers: false };
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
