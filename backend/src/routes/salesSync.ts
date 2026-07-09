import { Router, type Response } from "express";
import { z } from "zod";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
import { env } from "../env.js";
import {
  getSalesSyncStatus,
  listAvailableMonthSheets,
  listSalesRows,
  syncSalesSheet,
  type SalesKind,
} from "../services/salesSync.js";
import {
  enqueueSalesSyncJob,
  getSalesJob,
  listActiveSalesJobs,
} from "../services/salesJobs.js";
import {
  computePaymentRate,
  getPaymentRateMeta,
} from "../services/salesPaymentRate.js";
import {
  getTrendData,
  listTrendTabs,
  type TrendTabId,
} from "../services/salesTrend.js";
import {
  getInquiryTrendData,
  listInquiryTrendTabs,
  type InquiryTrendTabId,
} from "../services/salesInquiryTrend.js";
import {
  getSalesDashboard,
  listDashboardMonths,
  saveDashboardGoalOverrides,
} from "../services/salesDashboard.js";
import { getSalesDaily } from "../services/salesDaily.js";

export const salesSyncRouter = Router();
salesSyncRouter.use(auth, requireAccess);
if (env.erpMode) salesSyncRouter.use(requireErpMember);

const syncBodySchema = z.object({
  kind: z.enum(["inquiry", "order"]),
  sheetName: z.string().min(1).optional(),
  mode: z.enum(["one", "all"]).default("one"),
  background: z.boolean().optional().default(true),
});

salesSyncRouter.get("/status", async (_req: AuthedRequest, res: Response) => {
  try {
    const status = await getSalesSyncStatus();
    const activeJobs = listActiveSalesJobs();
    res.json({ ...status, activeJobs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.get("/sheets", async (req: AuthedRequest, res: Response) => {
  const kind = req.query.kind as SalesKind | undefined;
  if (kind !== "inquiry" && kind !== "order") {
    return res.status(400).json({ error: "kind는 inquiry 또는 order여야 합니다" });
  }
  try {
    const sheets = await listAvailableMonthSheets(kind);
    res.json({ kind, sheets });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.get("/rows", async (req: AuthedRequest, res: Response) => {
  const kind = req.query.kind as SalesKind | undefined;
  if (kind !== "inquiry" && kind !== "order") {
    return res.status(400).json({ error: "kind는 inquiry 또는 order여야 합니다" });
  }
  try {
    const data = await listSalesRows(kind, {
      sheetName: typeof req.query.sheetName === "string" ? req.query.sheetName : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 50,
    });
    res.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.get("/jobs", async (req: AuthedRequest, res: Response) => {
  const kind = req.query.kind as SalesKind | undefined;
  res.json({ jobs: listActiveSalesJobs(kind === "inquiry" || kind === "order" ? kind : undefined) });
});

salesSyncRouter.get("/jobs/:id", async (req: AuthedRequest, res: Response) => {
  const job = getSalesJob(req.params.id);
  if (!job) return res.status(404).json({ error: "작업을 찾을 수 없습니다" });
  res.json(job);
});

const paymentRateBodySchema = z.object({
  industry: z.string().optional(),
  industries: z.array(z.string()).optional(),
  channel: z.enum(["all", "organic", "non-organic"]).optional(),
  channels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  groups: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        months: z.array(z.string().min(1)).min(1),
      })
    )
    .min(1),
});

salesSyncRouter.get("/payment-rate/meta", async (_req: AuthedRequest, res: Response) => {
  try {
    res.json(await getPaymentRateMeta());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.post("/payment-rate", async (req: AuthedRequest, res: Response) => {
  const rawGroups = Array.isArray(req.body?.groups) ? req.body.groups : [];
  const groups = rawGroups.filter((g: { months?: unknown }) => Array.isArray(g.months) && g.months.length > 0);
  const parsed = paymentRateBodySchema.safeParse({ ...req.body, groups });
  if (!parsed.success) {
    return res.status(400).json({ error: "비교군에 월을 1개 이상 선택하세요" });
  }
  try {
    res.json(await computePaymentRate(parsed.data));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

const TREND_TAB_IDS = new Set(listTrendTabs().map((t) => t.id));

salesSyncRouter.get("/trend/tabs", async (_req: AuthedRequest, res: Response) => {
  res.json({ tabs: listTrendTabs() });
});

salesSyncRouter.get("/dashboard/months", async (_req: AuthedRequest, res: Response) => {
  try {
    const months = await listDashboardMonths();
    res.json({ months, spreadsheetId: env.googleSheets.dashboardSpreadsheetId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.get("/dashboard", async (req: AuthedRequest, res: Response) => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  try {
    res.json(await getSalesDashboard(month));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

const dashboardGoalsBodySchema = z.object({
  month: z.string().min(1),
  industryGoals: z.record(z.coerce.number()).optional(),
  industryPlanGoals: z.record(z.record(z.coerce.number())).optional(),
  industryChannelGoals: z.record(z.record(z.coerce.number())).optional(),
});

salesSyncRouter.put("/dashboard/goals", async (req: AuthedRequest, res: Response) => {
  const parsed = dashboardGoalsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "month과 목표 데이터가 필요합니다" });
  }
  try {
    await saveDashboardGoalOverrides(
      parsed.data.month,
      {
        industryGoals: parsed.data.industryGoals ?? {},
        industryPlanGoals: parsed.data.industryPlanGoals ?? {},
        industryChannelGoals: parsed.data.industryChannelGoals ?? {},
      },
      req.userId
    );
    res.json(await getSalesDashboard(parsed.data.month));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.get("/daily", async (req: AuthedRequest, res: Response) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const periodRaw = typeof req.query.period === "string" ? req.query.period : undefined;
  const period =
    periodRaw === "week" || periodRaw === "month" || periodRaw === "day" ? periodRaw : undefined;
  try {
    res.json(await getSalesDaily({ date, period }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

function parseTrendIndustryQuery(query: Record<string, unknown>): string[] {
  const raw = query.industry ?? query.industries;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

salesSyncRouter.get("/trend", async (req: AuthedRequest, res: Response) => {
  const tab = req.query.tab as TrendTabId | undefined;
  if (!tab || !TREND_TAB_IDS.has(tab)) {
    return res.status(400).json({ error: "tab이 필요합니다 (industry-plan, industry-channel, industry, plan)" });
  }
  const industries = parseTrendIndustryQuery(req.query as Record<string, unknown>);
  try {
    res.json(await getTrendData(tab, { industries }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

const INQUIRY_TREND_TAB_IDS = new Set(listInquiryTrendTabs().map((t) => t.id));

salesSyncRouter.get("/trend/inquiry", async (req: AuthedRequest, res: Response) => {
  const tab = req.query.tab as InquiryTrendTabId | undefined;
  if (!tab || !INQUIRY_TREND_TAB_IDS.has(tab)) {
    return res.status(400).json({
      error: "tab이 필요합니다 (industry-plan, industry-prev, industry-feature, industry-channel-plan)",
    });
  }
  const industries = parseTrendIndustryQuery(req.query as Record<string, unknown>);
  const all = req.query.all === "1" || req.query.all === "true";
  try {
    res.json(await getInquiryTrendData(tab, { industries, all }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

salesSyncRouter.post("/sync", async (req: AuthedRequest, res: Response) => {
  const parsed = syncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "kind와 mode/sheetName이 필요합니다" });
  }
  const { kind, mode, sheetName, background } = parsed.data;
  if (mode === "one" && !sheetName) {
    return res.status(400).json({ error: "월별 동기화에는 sheetName이 필요합니다" });
  }

  try {
    if (background) {
      const job = await enqueueSalesSyncJob({
        kind,
        mode,
        sheetName,
        createdById: req.userId,
      });
      return res.status(202).json({ background: true, job });
    }

    if (mode === "all") {
      const sheets = await listAvailableMonthSheets(kind);
      const results = [];
      const errors = [];
      for (const name of sheets) {
        try {
          results.push(await syncSalesSheet(kind, name, req.userId));
        } catch (e) {
          errors.push({
            sheetName: name,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return res.json({ background: false, mode: "all", results, errors });
    }

    const result = await syncSalesSheet(kind, sheetName!, req.userId);
    res.json({ background: false, ...result });
  } catch (e) {
    const err = e as Error & { status?: number; job?: unknown };
    const msg = err.message || String(e);
    if (err.status === 409) {
      return res.status(409).json({ error: msg, job: err.job });
    }
    res.status(500).json({ error: msg });
  }
});
