export type PlanId = "lite" | "pro" | "ultra" | "custom";

export const TRIAL_DAYS = 3;
export const GRACE_DAYS = 7;
export const TRIAL_RECORDING_SEC = 3600; // 1시간
export const TRIAL_STORAGE_BYTES = 500 * 1024 * 1024; // 녹음만 — 약 500MB

export const PLAN_LIMITS: Record<PlanId, { recordingHours: number; storageGB: number }> = {
  lite: { recordingHours: 10, storageGB: 50 },
  pro: { recordingHours: 30, storageGB: 200 },
  ultra: { recordingHours: 100, storageGB: 1000 },
  custom: { recordingHours: 30, storageGB: 500 },
};

export function planStorageBytes(plan: PlanId): number {
  return PLAN_LIMITS[plan].storageGB * 1024 * 1024 * 1024;
}

export function planRecordingSec(plan: PlanId): number {
  return PLAN_LIMITS[plan].recordingHours * 3600;
}
