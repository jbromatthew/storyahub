import { prisma } from "../db.js";

export type DashboardGoalOverrides = {
  industryGoals: Record<string, number>;
  industryPlanGoals: Record<string, Record<string, number>>;
};

function emptyOverrides(): DashboardGoalOverrides {
  return { industryGoals: {}, industryPlanGoals: {} };
}

function numRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

function nestedNumRecord(raw: unknown): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [industry, plans] of Object.entries(raw as Record<string, unknown>)) {
    if (!plans || typeof plans !== "object") continue;
    const row: Record<string, number> = {};
    for (const [plan, v] of Object.entries(plans as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) row[plan] = Math.round(n);
    }
    if (Object.keys(row).length) out[industry] = row;
  }
  return out;
}

export async function loadDashboardGoalOverrides(
  month: string
): Promise<DashboardGoalOverrides> {
  const row = await prisma.erpSalesDashboardGoalSet.findUnique({ where: { month } });
  if (!row) return emptyOverrides();
  return {
    industryGoals: numRecord(row.industryGoals),
    industryPlanGoals: nestedNumRecord(row.industryPlanGoals),
  };
}

export async function saveDashboardGoalOverrides(
  month: string,
  data: DashboardGoalOverrides,
  updatedById?: string
): Promise<DashboardGoalOverrides> {
  const industryGoals = numRecord(data.industryGoals);
  const industryPlanGoals = nestedNumRecord(data.industryPlanGoals);
  await prisma.erpSalesDashboardGoalSet.upsert({
    where: { month },
    create: {
      month,
      industryGoals,
      industryPlanGoals,
      updatedById,
    },
    update: {
      industryGoals,
      industryPlanGoals,
      updatedById,
    },
  });
  return { industryGoals, industryPlanGoals };
}

export function sumIndustryPlanGoals(
  industryPlanGoals: Record<string, Record<string, number>>,
  industry: string
): number {
  const row = industryPlanGoals[industry];
  if (!row) return 0;
  return Object.values(row).reduce((s, n) => s + n, 0);
}

export function validateIndustryPlanGoals(data: DashboardGoalOverrides): string[] {
  const warnings: string[] = [];
  const industries = new Set([
    ...Object.keys(data.industryGoals),
    ...Object.keys(data.industryPlanGoals),
  ]);
  for (const industry of industries) {
    const industryGoal = data.industryGoals[industry] ?? 0;
    const planSum = sumIndustryPlanGoals(data.industryPlanGoals, industry);
    if (planSum > 0 && industryGoal > 0 && planSum !== industryGoal) {
      warnings.push(`${industry}: 요금제 합계(${planSum}) ≠ 업종 목표(${industryGoal})`);
    }
  }
  return warnings;
}
