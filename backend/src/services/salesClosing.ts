import { prisma } from "../db.js";
import { env } from "../env.js";
import { updateSheetRowCells } from "./googleSheets.js";
import { syncSalesSheet } from "./salesSync.js";

/**
 * 클로징 관리 — 문의시트 기반, 직전 3개월 상담온도 긍정 이상(임박·긍정적)인데
 * 아직 결제 안 된(실 결제 FALSE, 결제일 없음) 리드를 담당자(응대자)별로 모아준다.
 */

const POSITIVE_TEMPS = ["임박", "긍정적"] as const;
const INQUIRY_TYPE = "신규문의";

const URGENCY_ORDER = ["7일 이내", "30일 이내", "60일 이내", "90일 이내", "불투명/어려움", ""];

export type ClosingLead = {
  id: string;
  month: string;
  date: string;
  center: string;
  industry: string;
  region: string;
  plan: string;
  temp: string;
  urgency: string;
  canPayThisMonth: boolean;
  waitDate: string;
  note: string;
  reason: string;
};

export type ClosingAssignee = {
  name: string;
  total: number;
  counts: Record<string, number>;
  leads: ClosingLead[];
};

export type ClosingData = {
  months: string[];
  temps: string[];
  assignees: ClosingAssignee[];
  totalLeads: number;
  spreadsheetUrl: string;
  syncedThrough: string | null;
};

function monthKey(sheetName: string): string | null {
  const m = sheetName.trim().match(/^(\d{4})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function pick(data: Record<string, string>, key: string): string {
  return String(data[key] ?? "").trim();
}

function tempRank(temp: string): number {
  const i = POSITIVE_TEMPS.indexOf(temp as (typeof POSITIVE_TEMPS)[number]);
  return i === -1 ? POSITIVE_TEMPS.length : i;
}

function urgencyRank(urgency: string): number {
  const i = URGENCY_ORDER.indexOf(urgency);
  return i === -1 ? URGENCY_ORDER.length : i;
}

export async function getClosingData(opts: { refresh?: boolean } = {}): Promise<ClosingData> {
  const spreadsheetId = env.googleSheets.inquirySpreadsheetId;
  const load = () =>
    prisma.erpSalesInquiry.findMany({
      where: { spreadsheetId },
      select: { id: true, data: true, sheetName: true },
    });
  let rows = await load();

  // 시트 탭 기준 최신 3개월 (당월 포함)
  const tabByMonth = new Map<string, string>();
  for (const r of rows) {
    const mk = monthKey(r.sheetName);
    if (mk) tabByMonth.set(mk, r.sheetName.trim());
  }
  const allMonths = [...tabByMonth.keys()].sort();
  const months = allMonths.slice(-3);
  const monthSet = new Set(months);

  // 양방향: 시트에서 직접 수정한 상담온도·비고 등을 즉시 반영하도록 대상 탭을 먼저 동기화
  if (opts.refresh) {
    for (const m of months) {
      try {
        await syncSalesSheet("inquiry", tabByMonth.get(m)!);
      } catch (e) {
        console.error("[closing-refresh]", m, e instanceof Error ? e.message : e);
      }
    }
    rows = await load();
  }

  const byAssignee = new Map<string, ClosingLead[]>();
  for (const row of rows) {
    const month = monthKey(row.sheetName);
    if (!month || !monthSet.has(month)) continue;
    const data = row.data as Record<string, string>;
    if (pick(data, "구분") !== INQUIRY_TYPE) continue;
    const temp = pick(data, "상담온도");
    if (!POSITIVE_TEMPS.includes(temp as (typeof POSITIVE_TEMPS)[number])) continue;
    // 결제 완료 제외 — 실 결제 TRUE 또는 결제일 기재
    if (pick(data, "실 결제").toUpperCase() === "TRUE") continue;
    if (pick(data, "결제일")) continue;

    const assignee = pick(data, "응대자") || "미지정";
    const lead: ClosingLead = {
      id: row.id,
      month,
      date: pick(data, "날짜"),
      center: pick(data, "센터명") || "(센터명 없음)",
      industry: pick(data, "업종"),
      region: [pick(data, "지역"), pick(data, "시군구")].filter(Boolean).join(" "),
      plan: pick(data, "문의요금제"),
      temp,
      urgency: pick(data, "결제임박률"),
      canPayThisMonth: pick(data, "당월결제가능").toUpperCase() === "TRUE",
      waitDate: pick(data, "대기일"),
      // 수정 시 그대로 역기록되므로 표시용으로 자르지 않는다 (잘린 채 저장되는 사고 방지)
      note: pick(data, "문의 내용").slice(0, 2000),
      reason: pick(data, "*미도입 사유").slice(0, 2000),
    };
    const list = byAssignee.get(assignee) ?? [];
    list.push(lead);
    byAssignee.set(assignee, list);
  }

  const assignees: ClosingAssignee[] = [...byAssignee.entries()]
    .map(([name, leads]) => {
      leads.sort(
        (a, b) =>
          tempRank(a.temp) - tempRank(b.temp) ||
          urgencyRank(a.urgency) - urgencyRank(b.urgency) ||
          b.date.localeCompare(a.date)
      );
      const counts: Record<string, number> = {};
      for (const t of POSITIVE_TEMPS) counts[t] = leads.filter((l) => l.temp === t).length;
      return { name, total: leads.length, counts, leads };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ko"));

  const latest = await prisma.erpSalesInquiry.findFirst({
    where: { spreadsheetId },
    orderBy: { syncedAt: "desc" },
    select: { sheetName: true },
  });

  return {
    months,
    temps: [...POSITIVE_TEMPS],
    assignees,
    totalLeads: assignees.reduce((s, a) => s + a.total, 0),
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    syncedThrough: latest?.sheetName ?? null,
  };
}

/** ERP에서 수정 가능한 상담온도·결제임박률 선택지 (시트 값 그대로) */
export const EDITABLE_TEMPS = ["임박", "긍정적", "미지근", "부재", "어려움/이탈"];
export const EDITABLE_URGENCIES = ["7일 이내", "30일 이내", "60일 이내", "90일 이내", "불투명/어려움"];

/** 상담온도·결제임박률·문의 내용·미도입 사유 수정 → 구글시트 해당 셀에 역기록 + DB 반영 */
export async function updateClosingLead(
  id: string,
  patch: { temp?: string; note?: string; urgency?: string; reason?: string }
): Promise<{ temp: string; note: string; urgency: string; reason: string; stillClosing: boolean }> {
  const row = await prisma.erpSalesInquiry.findUnique({ where: { id } });
  if (!row) throw new Error("리드를 찾을 수 없습니다");
  const data = row.data as Record<string, string>;

  const updates: Record<string, string> = {};
  if (patch.temp !== undefined) {
    if (!EDITABLE_TEMPS.includes(patch.temp)) throw new Error("유효하지 않은 상담온도입니다");
    updates["상담온도"] = patch.temp;
  }
  if (patch.urgency !== undefined) {
    const u = patch.urgency.trim();
    if (u && !EDITABLE_URGENCIES.includes(u)) throw new Error("유효하지 않은 결제임박률입니다");
    updates["결제임박률"] = u;
  }
  if (patch.note !== undefined) updates["문의 내용"] = String(patch.note).slice(0, 2000);
  if (patch.reason !== undefined) updates["*미도입 사유"] = String(patch.reason).slice(0, 2000);
  if (!Object.keys(updates).length) throw new Error("수정할 내용이 없습니다");

  const res = await updateSheetRowCells(row.spreadsheetId, row.sheetName, row.sheetRow, updates, {
    column: "센터명",
    expected: String(data["센터명"] ?? "").trim(),
  });
  if (!res.ok) throw new Error(res.reason || "시트 수정에 실패했습니다");

  const newData = { ...data, ...updates };
  await prisma.erpSalesInquiry.update({ where: { id }, data: { data: newData } });

  const temp = String(newData["상담온도"] ?? "");
  return {
    temp,
    note: String(newData["문의 내용"] ?? ""),
    urgency: String(newData["결제임박률"] ?? ""),
    reason: String(newData["*미도입 사유"] ?? ""),
    stillClosing: (POSITIVE_TEMPS as readonly string[]).includes(temp),
  };
}
