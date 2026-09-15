/**
 * 직전서비스 통계 — 우리로 넘어오기 전에 무엇을 쓰고 있었나.
 *
 * 문의 시트의 「직전서비스」 열을 그대로 센다. 손으로 적는 칸이라
 * 대소문자만 다른 같은 이름이 섞여 있어 하나로 묶는다.
 */
import { prisma } from "../db.js";
import { env } from "../env.js";

/** 서비스 이름이 아닌 값들 — 경쟁 제품만 보고 싶을 때 걷어낸다 */
const NOT_A_SERVICE: Record<string, string> = {
  "신규": "처음 도입",
  "대답X": "answer 없음",
  "업셀링(브로제이)": "기존 고객",
  "기타": "기타",
};

export type PrevServiceQuery = {
  months?: string[];
  /** true 면 처음 도입·대답 없음·기존 고객·기타를 뺀다 */
  serviceOnly?: boolean;
};

function normalizeMonth(v: string): string {
  const s = String(v ?? "").trim();
  return s.endsWith(".") ? s : `${s}.`;
}

function isPaid(data: Record<string, string>): boolean {
  return String(data["실 결제"] ?? "").trim().toUpperCase() === "TRUE";
}

export async function getPrevServiceMeta() {
  const rows = await prisma.erpSalesInquiry.findMany({
    where: { spreadsheetId: env.googleSheets.inquirySpreadsheetId },
    select: { sheetName: true },
    distinct: ["sheetName"],
  });
  const months = rows.map((r) => r.sheetName).sort((a, b) => b.localeCompare(a));
  return { months };
}

export async function computePrevService(query: PrevServiceQuery) {
  const want = new Set((query.months ?? []).map(normalizeMonth));
  const rows = await prisma.erpSalesInquiry.findMany({
    where: {
      spreadsheetId: env.googleSheets.inquirySpreadsheetId,
      ...(want.size ? { sheetName: { in: [...want] } } : {}),
    },
    select: { sheetName: true, data: true },
  });

  // 대소문자만 다른 같은 이름은 하나로 — 가장 많이 쓰인 철자를 대표로 쓴다
  const byKey = new Map<string, { spellings: Map<string, number>; inquiries: number; paid: number }>();
  let total = 0;
  let blank = 0;

  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if (data["구분"] !== "신규문의") continue;
    total += 1;
    const raw = String(data["직전서비스"] ?? "").trim();
    if (!raw) { blank += 1; continue; }
    const key = raw.toLowerCase();
    const cur = byKey.get(key) ?? { spellings: new Map(), inquiries: 0, paid: 0 };
    cur.spellings.set(raw, (cur.spellings.get(raw) ?? 0) + 1);
    cur.inquiries += 1;
    if (isPaid(data)) cur.paid += 1;
    byKey.set(key, cur);
  }

  const all = [...byKey.values()].map((v) => {
    const label = [...v.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return {
      label,
      kind: NOT_A_SERVICE[label] ? "other" : "service",
      note: NOT_A_SERVICE[label] ?? "",
      inquiries: v.inquiries,
      paid: v.paid,
      paidRate: v.inquiries ? Math.round((v.paid / v.inquiries) * 1000) / 10 : null,
    };
  });

  const items = (query.serviceOnly ? all.filter((x) => x.kind === "service") : all)
    .sort((a, b) => b.inquiries - a.inquiries || a.label.localeCompare(b.label, "ko"));

  const shown = items.reduce((a, x) => a + x.inquiries, 0);
  return {
    months: [...want].sort(),
    serviceOnly: !!query.serviceOnly,
    total,            // 신규문의 전체
    blank,            // 직전서비스가 비어 있는 건
    answered: total - blank,
    shown,            // 지금 막대에 잡힌 합
    items: items.map((x) => ({
      ...x,
      share: shown ? Math.round((x.inquiries / shown) * 1000) / 10 : 0,
    })),
  };
}
