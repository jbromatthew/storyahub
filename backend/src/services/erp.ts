import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";

const ADMIN_ROLES = new Set(["시스템관리자", "인사"]);

export function isErpAdmin(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.has(r));
}

export function generateTempPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function createEmployeeUser(data: {
  email: string;
  name: string;
  password: string;
}) {
  const email = data.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("이미 사용 중인 이메일입니다");

  const passwordHash = await bcrypt.hash(data.password, env.bcryptRounds);
  return prisma.user.create({
    data: {
      email,
      name: data.name.trim(),
      passwordHash,
      provider: "email",
      onboardingDone: true,
      ...(env.erpMode ? { lifetimeAccess: true } : { trialStartedAt: new Date() }),
    },
  });
}

export async function ensureLeaveBalance(userId: string) {
  const year = new Date().getFullYear();
  return prisma.erpLeaveBalance.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, regularTotal: 15 },
    update: {},
  });
}

export async function ensureErpEmployee(user: User) {
  const byUser = await prisma.erpEmployee.findUnique({ where: { userId: user.id } });
  if (byUser) return byUser;

  const byEmail = user.email
    ? await prisma.erpEmployee.findFirst({ where: { email: user.email.toLowerCase(), userId: null } })
    : null;
  if (byEmail) {
    return prisma.erpEmployee.update({
      where: { id: byEmail.id },
      data: { userId: user.id, name: byEmail.name || user.name, email: user.email.toLowerCase() },
    });
  }

  const isFirst = (await prisma.erpEmployee.count()) === 0;
  const year = new Date().getFullYear();
  const [emp] = await prisma.$transaction([
    prisma.erpEmployee.create({
      data: {
        userId: user.id,
        name: user.name,
        email: user.email.toLowerCase(),
        employeeNo: user.email.split("@")[0],
        jobRank: isFirst ? "임원" : "사원",
        roles: isFirst ? ["시스템관리자"] : [],
      },
    }),
    prisma.erpLeaveBalance.upsert({
      where: { userId_year: { userId: user.id, year } },
      create: { userId: user.id, year, regularTotal: 15 },
      update: {},
    }),
  ]);
  return emp;
}

export function erpEmployeePublic(emp: {
  id: string;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  employeeNo: string | null;
  jobTitle: string | null;
  jobRank: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  department?: { id: string; name: string } | null;
  user?: { id: string; email: string; name: string | null } | null;
}) {
  const displayName = emp.name || emp.user?.name || emp.user?.email || emp.email || "이름 없음";
  const displayEmail = emp.email || emp.user?.email || null;
  return {
    id: emp.id,
    userId: emp.userId ?? null,
    hasAccount: !!emp.userId,
    name: displayName,
    email: displayEmail,
    employeeNo: emp.employeeNo,
    jobTitle: emp.jobTitle,
    jobRank: emp.jobRank,
    phone: emp.phone,
    status: emp.status,
    roles: emp.roles,
    department: emp.department ? { id: emp.department.id, name: emp.department.name } : null,
  };
}

export async function nextDocNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AP-${year}-`;
  const last = await prisma.erpApprovalDocument.findFirst({
    where: { docNo: { startsWith: prefix } },
    orderBy: { docNo: "desc" },
    select: { docNo: true },
  });
  const seq = last ? parseInt(last.docNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export function leaveDaysForType(type: string, start: Date, end: Date): number {
  if (type === "half_am" || type === "half_pm") return 0.5;
  if (type === "quarter_am" || type === "quarter_pm" || type === "quarter") return 0.25;
  if (type === "wfh" || type === "other") return 0;
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  return Math.max(1, days);
}

export function leaveTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    annual: "유급",
    half_am: "오전반차",
    half_pm: "오후반차",
    quarter_am: "오전반반차",
    quarter_pm: "오후반반차",
    quarter: "반반차",
    wfh: "재택근무",
    other: "기타",
    sick: "병가",
    special: "특별",
  };
  return labels[type] || type;
}

export function leaveTypeColor(type: string): string {
  const colors: Record<string, string> = {
    annual: "#F8BBD9",
    half_am: "#FFF176",
    half_pm: "#81D4FA",
    quarter_am: "#FFE082",
    quarter_pm: "#B3E5FC",
    quarter: "#FFE082",
    wfh: "#CE93D8",
    other: "#BCAAA4",
    sick: "#EF9A9A",
    special: "#A5D6A7",
  };
  return colors[type] || "#E0E0E0";
}

export function leaveBalanceSummary(bal: {
  regularTotal: number;
  regularUsed: number;
  rewardTotal: number;
  rewardUsed: number;
  carriedOver: number;
  remarks?: string | null;
}) {
  const accrued = bal.regularTotal + bal.carriedOver;
  const reward = bal.rewardTotal;
  const used = bal.regularUsed + bal.rewardUsed;
  const remaining = Math.max(0, accrued + reward - used);
  const regularLeft = Math.max(0, accrued - bal.regularUsed);
  const rewardLeft = Math.max(0, reward - bal.rewardUsed);
  return { accrued, reward, used, remaining, regularLeft, rewardLeft };
}

export async function deductLeaveBalance(userId: string, year: number, days: number, leaveType: string) {
  if (days <= 0 || leaveType === "wfh" || leaveType === "other") {
    return prisma.erpLeaveBalance.findUnique({ where: { userId_year: { userId, year } } });
  }
  const bal = await prisma.erpLeaveBalance.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, regularTotal: 15 },
    update: {},
  });
  const regularLeft = Math.max(0, bal.regularTotal + bal.carriedOver - bal.regularUsed);
  const regularDeduct = Math.min(days, regularLeft);
  const rewardDeduct = days - regularDeduct;
  return prisma.erpLeaveBalance.update({
    where: { id: bal.id },
    data: {
      regularUsed: { increment: regularDeduct },
      rewardUsed: { increment: rewardDeduct },
    },
  });
}

export function expandLeaveDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(start);
  cur.setHours(12, 0, 0, 0);
  const last = new Date(end);
  last.setHours(12, 0, 0, 0);
  while (cur <= last) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function notifyUser(
  userId: string,
  data: { module: string; title: string; body?: string; link?: string }
) {
  return prisma.erpNotification.create({
    data: { userId, ...data },
  });
}
