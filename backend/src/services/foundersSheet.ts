/**
 * FOUNDERS 접수 → 구글 시트.
 *
 * 담당자들이 시트로 보기 때문에 접수가 들어오면 그대로 얹는다.
 * 접수번호를 열쇠로 삼아, 같은 사람이 이어서 고쳐도 줄이 늘지 않고 그 줄이 갱신된다.
 * 시트가 막히거나 느려도 접수 자체는 막지 않는다 — 실패는 로그만 남긴다.
 */
import type { ErpFoundersApply } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { ensureSheetHeader, isGoogleSheetsConfigured, upsertSheetRow } from "./googleSheets.js";

const TAB_APPLICANT = "참가자";
const TAB_VISITOR = "참관객";

const APPLICANT_COLS = [
  "접수번호", "접수일시", "상태", "참가 자격", "세부 분야",
  "기업명", "사업자번호", "사업자 구분", "설립연월", "업종/업태", "주생산품목", "본사 주소", "홈페이지",
  "대표자", "생년월일", "성별", "이메일", "휴대전화", "직통전화",
  "실무 담당자", "담당자 연락처",
  "제품명", "한 줄 소개", "세일즈 타입",
  "고용(명)", "총매출(백만원)", "투자유치(백만원)",
  "증빙 서류", "IR 자료", "추가 자료", "서명",
  "심사자", "심사 메모",
];

const VISITOR_COLS = [
  "접수번호", "등록일시", "상태", "성함", "연락처", "소속", "직함", "이메일",
  "참가비", "입금자명", "입금 확인", "서명",
];

const KST = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 16) : "";

const STATUS_KO: Record<string, string> = {
  received: "접수", reviewing: "검토중", passed: "합격", rejected: "미선정",
  pending: "입금대기", paid: "입금확인", cancelled: "취소",
};

const phone = (v: string) => {
  const d = String(v ?? "").replace(/[^\d]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v ?? "";
};

const TRACKS: Record<string, string> = {
  business: "BUSINESS", tech: "TECH", content: "CONTENT",
  product: "PRODUCT", next: "NEXT", market: "MARKET PLACE",
};

function applicantRow(a: ErpFoundersApply): string[] {
  const f = (a.formData ?? {}) as Record<string, Record<string, unknown>>;
  const c = f.company ?? {};
  const m = f.manager ?? {};
  const o = f.overview ?? {};
  const pd = f.product ?? {};
  const S = (v: unknown) => String(v ?? "");
  const mgr = m.sameAsRep
    ? "대표자와 동일"
    : [S(m.name), S(m.dept), S(m.title)].filter(Boolean).join(" · ");
  const mgrTel = m.sameAsRep
    ? ""
    : [S(m.email), phone(S(m.phone))].filter(Boolean).join(" · ");

  return [
    a.applyNo,
    KST(a.createdAt),
    STATUS_KO[a.status] ?? a.status,
    a.entryType === "pre" ? "예비 창업자" : "창업기업",
    (Array.isArray(a.tracks) ? (a.tracks as string[]) : []).map((t) => TRACKS[t] ?? t).join(", "),
    S(c.name) || a.teamName,
    S(c.bizNo),
    c.bizKind === "corp" ? "법인" : c.bizKind === "personal" ? "개인" : "",
    S(c.foundedAt),
    S(c.industry),
    S(c.mainItem),
    S(c.addrMain) || a.repAddress,
    S(c.homepage),
    a.repName,
    a.repBirth,
    a.repGender === "M" ? "남" : a.repGender === "F" ? "여" : "",
    a.repEmail,
    phone(a.repPhone),
    S(f.repTel),
    mgr,
    mgrTel,
    S(pd.name),
    a.subject,
    Array.isArray(pd.salesTypes) ? (pd.salesTypes as string[]).join(", ") : "",
    S(o.employees),
    S(o.revenue),
    S(o.investTotal),
    a.proofKey ? a.proofName || "제출" : "",
    a.irKey ? a.irName || "제출" : "",
    a.extraKey ? a.extraName || "제출" : "",
    a.signKey ? "있음" : "",
    a.reviewedBy,
    a.reviewNote,
  ];
}

function visitorRow(a: ErpFoundersApply): string[] {
  return [
    a.applyNo,
    KST(a.createdAt),
    STATUS_KO[a.status] ?? a.status,
    a.repName,
    phone(a.repPhone),
    a.repOrg,
    a.repTitle,
    a.repEmail,
    a.feeAmount ? String(a.feeAmount) : "",
    a.payerName,
    a.paidAt ? KST(a.paidAt) : "",
    a.signKey ? "있음" : "",
  ];
}

function sheetId(): string {
  return env.foundersSheetId.trim();
}

export function foundersSheetReady(): boolean {
  return !!sheetId() && isGoogleSheetsConfigured();
}

/** 한 건을 시트에 얹는다. 실패해도 접수는 그대로 둔다. */
export async function pushFoundersRow(a: ErpFoundersApply): Promise<void> {
  if (!foundersSheetReady()) return;
  const visitor = a.kind === "visitor";
  const tab = visitor ? TAB_VISITOR : TAB_APPLICANT;
  const cols = visitor ? VISITOR_COLS : APPLICANT_COLS;
  await ensureSheetHeader(sheetId(), tab, cols);
  await upsertSheetRow(sheetId(), tab, a.applyNo, visitor ? visitorRow(a) : applicantRow(a));
}

/** 접수 흐름에서 부르는 자리 — 기다리지 않고, 실패는 로그만 남긴다 */
export function pushFoundersRowSoon(a: ErpFoundersApply): void {
  if (!foundersSheetReady()) return;
  void pushFoundersRow(a).catch((e) => {
    console.error(`[founders-sheet] ${a.applyNo} 실패:`, e instanceof Error ? e.message : e);
  });
}

/** 이미 쌓인 접수를 시트에 맞춰 다시 채운다 (연동 붙이기 전 건들, 수동 보정용) */
export async function syncAllFounders(): Promise<{ applicant: number; visitor: number; failed: number }> {
  if (!foundersSheetReady()) throw new Error("시트가 설정되지 않았습니다");
  await ensureSheetHeader(sheetId(), TAB_APPLICANT, APPLICANT_COLS);
  await ensureSheetHeader(sheetId(), TAB_VISITOR, VISITOR_COLS);

  const rows = await prisma.erpFoundersApply.findMany({ orderBy: { createdAt: "asc" } });
  let applicant = 0, visitor = 0, failed = 0;
  for (const a of rows) {
    try {
      await pushFoundersRow(a);
      if (a.kind === "visitor") visitor += 1; else applicant += 1;
    } catch (e) {
      failed += 1;
      console.error(`[founders-sheet] ${a.applyNo} 실패:`, e instanceof Error ? e.message : e);
    }
  }
  return { applicant, visitor, failed };
}
