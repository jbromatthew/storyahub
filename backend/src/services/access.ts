import type { User } from "@prisma/client";
import { env } from "../env.js";
import {
  GRACE_DAYS,
  PLAN_LIMITS,
  TRIAL_DAYS,
  TRIAL_RECORDING_SEC,
  TRIAL_STORAGE_BYTES,
  type PlanId,
  planRecordingSec,
  planStorageBytes,
} from "./plans.js";

export type AccessReason =
  | "trial"
  | "paid"
  | "lifetime"
  | "trial_expired"
  | "subscription_expired"
  | "purged";

export interface AccessStatus {
  hasAccess: boolean;
  reason: AccessReason;
  trialDaysLeft: number | null;
  isTrial: boolean;
  plan: PlanId | null;
  planUntil: Date | null;
  lifetimeAccess: boolean;
  accessUntil: Date | null;
  purgeAt: Date | null;
  allowFileUpload: boolean;
  recordingLimitSec: number;
  recordingUsedSec: number;
  storageLimitBytes: number;
}

const MS_DAY = 86400000;

function trialDays(user: User): number {
  return env.trialDays > 0 ? env.trialDays : TRIAL_DAYS;
}

function trialEndsAt(user: User): Date | null {
  if (!user.trialStartedAt) return null;
  return new Date(user.trialStartedAt.getTime() + trialDays(user) * MS_DAY);
}

function hasActivePlan(user: User, now = new Date()): boolean {
  if (user.lifetimeAccess) return true;
  if (!user.plan || !user.planUntil) return false;
  return user.planUntil > now;
}

function purgeAt(user: User, now = new Date()): Date | null {
  if (hasActivePlan(user, now)) return null;
  const ended = user.accessEndedAt ?? trialEndsAt(user);
  if (!ended) return null;
  if (ended > now) return null;
  const grace = env.graceDays > 0 ? env.graceDays : GRACE_DAYS;
  return new Date(ended.getTime() + grace * MS_DAY);
}

export function getAccessStatus(user: User, now = new Date()): AccessStatus {
  if (env.erpMode) {
    return {
      hasAccess: true,
      reason: "lifetime",
      trialDaysLeft: null,
      isTrial: false,
      plan: "pro",
      planUntil: null,
      lifetimeAccess: true,
      accessUntil: null,
      purgeAt: null,
      allowFileUpload: true,
      recordingLimitSec: planRecordingSec("pro"),
      recordingUsedSec: user.usedRecordingSec,
      storageLimitBytes: planStorageBytes("pro"),
    };
  }

  const ends = trialEndsAt(user);
  const inTrial = !!ends && ends > now && !hasActivePlan(user, now);
  const trialLeft = ends && ends > now ? Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / MS_DAY)) : 0;

  if (user.lifetimeAccess) {
    const plan = (user.plan as PlanId) || "pro";
    return {
      hasAccess: true,
      reason: "lifetime",
      trialDaysLeft: null,
      isTrial: false,
      plan,
      planUntil: null,
      lifetimeAccess: true,
      accessUntil: null,
      purgeAt: null,
      allowFileUpload: true,
      recordingLimitSec: planRecordingSec(plan),
      recordingUsedSec: user.usedRecordingSec,
      storageLimitBytes: planStorageBytes(plan),
    };
  }

  if (hasActivePlan(user, now)) {
    const plan = user.plan as PlanId;
    return {
      hasAccess: true,
      reason: "paid",
      trialDaysLeft: null,
      isTrial: false,
      plan,
      planUntil: user.planUntil,
      lifetimeAccess: false,
      accessUntil: user.planUntil,
      purgeAt: null,
      allowFileUpload: true,
      recordingLimitSec: planRecordingSec(plan),
      recordingUsedSec: user.usedRecordingSec,
      storageLimitBytes: planStorageBytes(plan),
    };
  }

  if (inTrial) {
    return {
      hasAccess: true,
      reason: "trial",
      trialDaysLeft: trialLeft,
      isTrial: true,
      plan: null,
      planUntil: null,
      lifetimeAccess: false,
      accessUntil: ends,
      purgeAt: ends ? new Date(ends.getTime() + GRACE_DAYS * MS_DAY) : null,
      allowFileUpload: false,
      recordingLimitSec: TRIAL_RECORDING_SEC,
      recordingUsedSec: user.usedRecordingSec,
      storageLimitBytes: TRIAL_STORAGE_BYTES,
    };
  }

  const ended = user.accessEndedAt ?? ends;
  const reason: AccessReason = user.plan && user.planUntil ? "subscription_expired" : "trial_expired";

  return {
    hasAccess: false,
    reason,
    trialDaysLeft: 0,
    isTrial: false,
    plan: user.plan as PlanId | null,
    planUntil: user.planUntil,
    lifetimeAccess: false,
    accessUntil: ended,
    purgeAt: purgeAt(user, now),
    allowFileUpload: false,
    recordingLimitSec: 0,
    recordingUsedSec: user.usedRecordingSec,
    storageLimitBytes: 0,
  };
}

export function extendPlanUntil(current: Date | null | undefined, days: number): Date {
  const base = current && current > new Date() ? current : new Date();
  return new Date(base.getTime() + days * MS_DAY);
}

/** 체험/구독 만료 시 accessEndedAt 기록 */
export async function markAccessEndedIfNeeded(user: User): Promise<Date | null> {
  const status = getAccessStatus(user);
  if (status.hasAccess) return null;
  if (user.accessEndedAt) return user.accessEndedAt;
  const ended = status.accessUntil ?? new Date();
  return ended;
}

export function inGracePeriod(user: User, now = new Date()): boolean {
  const status = getAccessStatus(user, now);
  if (status.hasAccess) return false;
  return !!status.purgeAt && status.purgeAt > now;
}

export function recordingQuotaError(status: AccessStatus): string | null {
  if (!status.hasAccess) return "이용 기간이 만료되었습니다. 요금제를 선택해 주세요.";
  if (status.recordingUsedSec >= status.recordingLimitSec) {
    return status.isTrial
      ? "체험 녹음 한도(1시간)를 모두 사용했습니다."
      : "이번 달 녹음·변환 한도를 모두 사용했습니다.";
  }
  return null;
}

export function fileUploadBlocked(status: AccessStatus): string | null {
  if (!status.hasAccess) return "이용 기간이 만료되었습니다.";
  if (!status.allowFileUpload) return "체험 기간에는 파일 업로드가 불가합니다. 녹음만 이용할 수 있어요.";
  return null;
}

export { PLAN_LIMITS, TRIAL_RECORDING_SEC, TRIAL_STORAGE_BYTES };
