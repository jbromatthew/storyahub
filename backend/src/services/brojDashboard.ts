import { fetchSheetGrid } from "./googleSheets.js";

// 2026 브로제이 계기판 시트 — 월별(목표/현황 2열) × 섹션 구조를 그대로 파싱
const BROJ_DASH_SHEET_ID = "1rOc6Dg4-v6XJECoP0tbU137Zw-QCRr-e-8-KKW4IByc";
const BROJ_DASH_TAB = "2026년 계기판";

// 파싱할 섹션 (시트 A열 라벨, 공백 무시 비교). 이 밖의 섹션(업종별 상세 등)이 나오면 중단.
const SECTIONS: Array<{ match: string; id: string; label: string; format: "number" | "percent" | "money" }> = [
  { match: "활성센터", id: "active", label: "활성센터", format: "number" },
  { match: "총문의", id: "inquiry", label: "총 문의", format: "number" },
  { match: "총결제", id: "payment", label: "총 결제", format: "number" },
  { match: "총이탈(수)", id: "churnCount", label: "총 이탈 (수)", format: "number" },
  { match: "총이탈(율)", id: "churnRate", label: "총 이탈 (율)", format: "percent" },
  { match: "총매출", id: "revenue", label: "총 매출", format: "money" },
  { match: "총마진", id: "margin", label: "총 마진", format: "money" },
];

export type BrojMonth = { key: string; label: string; notes: string[] };
export type BrojRow = { label: string; goals: Array<number | null>; actuals: Array<number | null> };
export type BrojSection = { id: string; label: string; format: "number" | "percent" | "money"; rows: BrojRow[] };
export type BrojDashboardData = {
  spreadsheetUrl: string;
  months: BrojMonth[]; // 첫 항목은 '2026년 종합'
  sections: BrojSection[];
};

function normLabel(s: string): string {
  return String(s ?? "").replace(/\s/g, "");
}

function parseCell(raw: string, percent: boolean): number | null {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s || s === "-" || s === "—" || /^#/.test(s)) return null; // #REF! 등 오류 셀
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return percent && Math.abs(n) <= 1 ? n : n; // 이미 %가 소수로 온 경우 그대로
}

export async function getBrojDashboard(): Promise<BrojDashboardData> {
  const grid = await fetchSheetGrid(BROJ_DASH_SHEET_ID, BROJ_DASH_TAB);

  // 월 블록: 1행(index 0)에서 E열(index 4)부터 2열(목표/현황) 단위
  const header = grid[0] ?? [];
  const months: Array<BrojMonth & { goalCol: number; actCol: number }> = [];
  for (let c = 4; c < header.length; c += 2) {
    const label = String(header[c] ?? "").trim();
    if (!label) {
      if (months.length) break;
      continue;
    }
    // 2~5행: 이벤트/서비스 출시/메인 컨텐츠/채널 컨텐츠 메모
    const notes: string[] = [];
    for (let r = 1; r <= 4; r++) {
      const parts = [grid[r]?.[c], grid[r]?.[c + 1]]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);
      if (parts.length) notes.push(parts.join(" · "));
    }
    months.push({ key: label.replace(/\.$/, ""), label, notes, goalCol: c, actCol: c + 1 });
  }

  // 섹션·행 파싱: 7행(index 6)부터 A열 라벨로 섹션 전환, B열이 행 라벨
  const sections: BrojSection[] = [];
  let current: BrojSection | null = null;
  for (let r = 6; r < grid.length; r++) {
    const aLabel = normLabel(grid[r]?.[0] ?? "");
    if (aLabel) {
      const def = SECTIONS.find((s) => normLabel(s.match) === aLabel);
      if (!def) break; // 화이트리스트 밖 섹션(업종별 상세 등) 시작 → 종료
      current = { id: def.id, label: def.label, format: def.format, rows: [] };
      sections.push(current);
    }
    if (!current) continue;
    const rowLabel = String(grid[r]?.[1] ?? "").trim();
    if (!rowLabel) continue;
    const percent = current.format === "percent";
    current.rows.push({
      label: rowLabel,
      goals: months.map((m) => parseCell(grid[r]?.[m.goalCol] ?? "", percent)),
      actuals: months.map((m) => parseCell(grid[r]?.[m.actCol] ?? "", percent)),
    });
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${BROJ_DASH_SHEET_ID}/edit`,
    months: months.map(({ key, label, notes }) => ({ key, label, notes })),
    sections,
  };
}
