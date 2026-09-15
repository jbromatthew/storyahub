/**
 * 직전서비스 통계 — 우리로 넘어오기 전에 무엇을 쓰고 있었나.
 *
 * 결제율 분석과 같은 방식으로 비교군을 여럿 놓고 견준다.
 * 문의 시트의 「직전서비스」 열을 그대로 센다. 손으로 적는 칸이라
 * 철자만 다른 같은 이름이 섞여 있어 하나로 묶는다.
 */
import { prisma } from "../db.js";
import { env } from "../env.js";

/** 서비스 이름이 아닌 값들 — 경쟁 제품만 보고 싶을 때 걷어낸다 */
const NOT_A_SERVICE: Record<string, string> = {
  "신규": "처음 도입",
  "대답X": "대답 없음",
  "업셀링(브로제이)": "기존 고객",
  "기타": "기타",
};

/** 직전서비스를 한 번 더 쪼개 볼 축 — 문의 시트의 다른 칸들 */
export const PREV_SPLIT_AXES = [
  { k: "업종", t: "업종" },
  { k: "문의요금제", t: "문의요금제" },
  { k: "실제 결제 상품", t: "결제 요금제" },
  { k: "지역", t: "지역" },
  { k: "접수경로", t: "접수경로" },
] as const;

export type PrevServiceGroup = { id: string; label: string; months: string[] };
export type PrevServiceQuery = {
  groups: PrevServiceGroup[];
  /** true 면 처음 도입·대답 없음·기존 고객·기타를 뺀다 */
  serviceOnly?: boolean;
  /** 주면 직전서비스 × 이 칸 교차표까지 만든다 */
  splitAxis?: string;
  /** 교차표를 문의로 셀지 실결제로 셀지 */
  basis?: "inquiry" | "paid";
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

type Bucket = { spellings: Map<string, number>; inquiries: number; paid: number };

export async function computePrevService(query: PrevServiceQuery) {
  const groups = (query.groups ?? []).filter((g) => g.months?.length);
  if (!groups.length) {
    return { groups: [], items: [], serviceOnly: !!query.serviceOnly };
  }

  // 비교군끼리 월이 겹칠 수 있다 — 한 번만 읽어 월별로 나눠 둔다
  const monthSet = new Set<string>();
  for (const g of groups) for (const m of g.months) monthSet.add(normalizeMonth(m));

  const rows = await prisma.erpSalesInquiry.findMany({
    where: {
      spreadsheetId: env.googleSheets.inquirySpreadsheetId,
      sheetName: { in: [...monthSet] },
    },
    select: { sheetName: true, data: true },
  });

  const byMonth = new Map<string, Record<string, string>[]>();
  for (const m of monthSet) byMonth.set(m, []);
  for (const row of rows) {
    const data = row.data as Record<string, string>;
    if (data["구분"] !== "신규문의") continue;
    byMonth.get(row.sheetName)?.push(data);
  }

  // 이름 대표 철자는 전체에서 한 번만 정한다 — 비교군마다 달라지면 줄이 갈린다
  const spellings = new Map<string, Map<string, number>>();
  const perGroup = groups.map(() => new Map<string, Bucket>());
  const summary = groups.map(() => ({ total: 0, blank: 0 }));

  groups.forEach((g, gi) => {
    for (const rawMonth of g.months) {
      for (const data of byMonth.get(normalizeMonth(rawMonth)) ?? []) {
        summary[gi].total += 1;
        const raw = String(data["직전서비스"] ?? "").trim();
        if (!raw) { summary[gi].blank += 1; continue; }
        const key = raw.toLowerCase();
        const sp = spellings.get(key) ?? new Map<string, number>();
        sp.set(raw, (sp.get(raw) ?? 0) + 1);
        spellings.set(key, sp);

        const b = perGroup[gi].get(key) ?? { spellings: new Map(), inquiries: 0, paid: 0 };
        b.inquiries += 1;
        if (isPaid(data)) b.paid += 1;
        perGroup[gi].set(key, b);
      }
    }
  });

  const labelOf = (key: string) => {
    const sp = spellings.get(key);
    if (!sp) return key;
    return [...sp.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const keys = [...spellings.keys()].filter((k) => {
    if (!query.serviceOnly) return true;
    return !NOT_A_SERVICE[labelOf(k)];
  });

  // 비중은 비교군마다 「그 비교군에서 잡힌 합」 기준이라야 크기가 달라도 견줄 수 있다.
  // 문의로 볼 때와 실결제로 볼 때 분모가 달라 둘 다 미리 세어 둔다.
  const shown = perGroup.map((m) =>
    keys.reduce((a, k) => a + (m.get(k)?.inquiries ?? 0), 0) || 0);
  const shownPaid = perGroup.map((m) =>
    keys.reduce((a, k) => a + (m.get(k)?.paid ?? 0), 0) || 0);

  const items = keys.map((key) => {
    const label = labelOf(key);
    const byGroup = perGroup.map((m, gi) => {
      const b = m.get(key);
      const n = b?.inquiries ?? 0;
      const paid = b?.paid ?? 0;
      return {
        inquiries: n,
        paid,
        paidRate: n ? Math.round((paid / n) * 1000) / 10 : null,
        share: shown[gi] ? Math.round((n / shown[gi]) * 1000) / 10 : 0,
        paidShare: shownPaid[gi] ? Math.round((paid / shownPaid[gi]) * 1000) / 10 : 0,
      };
    });
    return {
      label,
      kind: NOT_A_SERVICE[label] ? "other" : "service",
      note: NOT_A_SERVICE[label] ?? "",
      byGroup,
      total: byGroup.reduce((a, x) => a + x.inquiries, 0),
      totalPaid: byGroup.reduce((a, x) => a + x.paid, 0),
    };
  })
    // 비교군마다 순서가 흔들리면 눈으로 좇기 어렵다 — 전체 합으로 한 번만 세운다
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ko"))
    .filter((x) => x.total > 0);

  // 교차표 — 직전서비스 × 고른 칸. 비교군마다 한 장씩.
  const split = String(query.splitAxis ?? "").trim();
  const okSplit = PREV_SPLIT_AXES.some((a) => a.k === split);
  const paidBasis = query.basis === "paid";
  const matrix = !okSplit ? [] : groups.map((g, gi) => {
    const cell = new Map<string, Map<string, number>>();
    const colTotal = new Map<string, number>();
    let total = 0;
    for (const rawMonth of g.months) {
      for (const data of byMonth.get(normalizeMonth(rawMonth)) ?? []) {
        const rawSvc = String(data["직전서비스"] ?? "").trim();
        if (!rawSvc) continue;
        const key = rawSvc.toLowerCase();
        if (!keys.includes(key)) continue;
        if (paidBasis && !isPaid(data)) continue;
        const row = labelOf(key);
        const colK = String(data[split] ?? "").trim() || "(빈칸)";
        const line = cell.get(row) ?? new Map<string, number>();
        line.set(colK, (line.get(colK) ?? 0) + 1);
        cell.set(row, line);
        colTotal.set(colK, (colTotal.get(colK) ?? 0) + 1);
        total += 1;
      }
    }
    const cols = [...colTotal.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .map(([label, n]) => ({ label, total: n }));
    const rows2 = [...cell.entries()]
      .map(([label, line]) => ({
        label,
        total: [...line.values()].reduce((a, b) => a + b, 0),
        cells: cols.map((c) => line.get(c.label) ?? 0),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ko"));
    return { groupId: g.id, label: g.label, cols, rows: rows2, total };
  });

  return {
    serviceOnly: !!query.serviceOnly,
    splitAxis: okSplit ? split : "",
    matrix,
    groups: groups.map((g, gi) => ({
      id: g.id,
      label: g.label,
      months: g.months.map(normalizeMonth),
      total: summary[gi].total,
      blank: summary[gi].blank,
      answered: summary[gi].total - summary[gi].blank,
      shown: shown[gi],
      shownPaid: shownPaid[gi],
    })),
    items,
  };
}
