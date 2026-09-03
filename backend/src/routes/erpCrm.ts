/**
 * 고객관리 — CRM 마스터 API로 센터 목록을 조회한다.
 *
 * 목록(/master/groups)과 건수(/master/groups/count)를 함께 부른다. 인증은
 * OPEN API 센터관리에서 받아둔 마스터 JWT + SessionToken을 그대로 쓴다.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
import { env } from "../env.js";
import { crmGroups, crmGroupCount, type CrmGroupQuery } from "../services/openApiGateway.js";
import { syncCenters } from "../services/centerJourney.js";

export const erpCrmRouter = Router();
erpCrmRouter.use(auth, requireAccess);
if (env.erpMode) erpCrmRouter.use(requireErpMember);

const FIRST = ["ALL", "ACTIVE", "EXPIRATION", "ISSUE"];
const SECOND = [
  "NONE", "REGULAR", "NON_REGULAR", "PAYMENT_FAILED",
  "PAYMENT_STOPPED", "REGULAR_PAYMENT_CANCELED", "SOON_EXPIRED",
];

function errStatus(e: unknown): number {
  const s = (e as { status?: number })?.status;
  return typeof s === "number" && s >= 400 && s < 600 ? s : 500;
}
function errMsg(e: unknown): string {
  return (e as Error)?.message || "조회하지 못했습니다";
}

/** CRM이 쓰는 실제 요금제 파일명 — 화면 표기는 프론트가 들고 있다 */
const TICKETS = [
  "broj_starter", "broj_lite", "broj_basic", "broj_basic_30",
  "broj_essential", "broj_essential_30", "broj_standard", "broj_standard_30",
  "broj_pass", "broj_pass_30", "broj_pos", "broj_pos_30",
  "broj_pass_pos", "broj_pass_pos_30", "broj_sale_p_30",
  "broj_paul", "broj_paul_30", "broj_support", "broj_support_30",
];

const listParam = (v: unknown) =>
  ([] as string[])
    .concat((v as string | string[]) ?? [])
    .flatMap((x) => String(x).split(","))
    .map((x) => x.trim())
    .filter(Boolean);

function parseQuery(req: AuthedRequest): CrmGroupQuery {
  const raw = req.query;
  const second = listParam(raw.second).map((v) => v.toUpperCase()).filter((v) => SECOND.includes(v));
  const tickets = listParam(raw.ticket).filter((v) => TICKETS.includes(v));
  const first = String(raw.first ?? "ALL").toUpperCase();

  // 두 값이 다 들어와야 주요기록 필터가 걸린다 (CRM 규칙)
  const days = Number(raw.newsfeedDays);
  const under = Number(raw.newsfeedUnder);
  const newsfeed = Number.isFinite(days) && Number.isFinite(under) && String(raw.newsfeedDays ?? "") !== ""
    && String(raw.newsfeedUnder ?? "") !== ""
    ? { newsfeedDays: days, newsfeedUnderCount: under }
    : {};

  return {
    keyword: String(raw.keyword ?? "").trim(),
    groupFirstFilter: FIRST.includes(first) ? first : "ALL",
    secondFilters: second,
    ticketFileNames: tickets,
    adminFilterType: String(raw.admin ?? "ALL").toUpperCase() === "CONNECTED" ? "CONNECTED" : "ALL",
    installerTeamName: String(raw.installer ?? "").trim(),
    sort: String(raw.sort ?? "") === "CLOSED_DTTM_ASC" ? "CLOSED_DTTM_ASC" : "CLOSED_DTTM_DESC",
    page: Math.max(Number(raw.page) || 0, 0),
    size: Math.min(Math.max(Number(raw.size) || 50, 1), 200),
    ...newsfeed,
  };
}

/** CRM 응답 한 건을 화면에서 쓰기 좋은 납작한 모양으로 바꾼다 */
function flatten(item: Record<string, unknown>) {
  const g = (item.group ?? {}) as Record<string, unknown>;
  const t = (item.ticket ?? {}) as Record<string, unknown>;
  const info = (item.information ?? {}) as Record<string, unknown>;
  const pi = (item.primary_information ?? {}) as Record<string, unknown>;
  const biz = String(g.business_number ?? "").trim();

  const kiosks = Object.entries(info)
    .filter(([k, v]) => k.startsWith("use_kiosk_") && v === true)
    .map(([k]) =>
      ({
        use_kiosk_7_krizer: "7인치",
        use_kiosk_10_stand_krizer: "10인치 스탠드",
        use_kiosk_10_passlight_krizer: "10인치 패스라이트",
        use_kiosk_15_krizer: "15인치",
        use_kiosk_21_krizer: "21인치",
        use_kiosk_apos_centerm: "aPOS",
      })[k] || k.replace(/^use_kiosk_/, ""),
    );

  return {
    groupKey: Number(g.key) || null,
    name: String(g.name ?? ""),
    primaryName: String(g.primary_name ?? ""),
    phone: String(g.main_phone_number ?? ""),
    // 미입력분이 문자열 "undefined"로 오는 경우가 있어 걸러낸다
    bizNo: biz && biz !== "undefined" ? biz : "",
    types: Array.isArray(g.group_types) ? (g.group_types as string[]) : [],
    paymentStatus: String(g.payment_status ?? ""),
    messagePoint: Number(g.remain_message_service_point) || 0,
    createdAt: g.created_at ?? null,
    lastAccessedAt: g.last_accessed_at ?? null,
    ticketName: t.name ? String(t.name) : "",
    ticketExpiredAt: t.expired_at ?? null,
    ticketRegular: t.is_regularly === true,
    ownerName: String(pi.member_name ?? ""),
    ownerId: String(pi.member_id ?? ""),
    ownerPhone: String(pi.member_phone ?? ""),
    installerTeam: String(info.installer_team_name ?? ""),
    previousNames: String(info.previous_names ?? ""),
    kiosks,
    kioskKeys: Object.entries(info).filter(([k, v]) => k.startsWith("use_kiosk_") && v === true).map(([k]) => k),
  };
}

type Row = ReturnType<typeof flatten>;

// ─── 정밀 필터 ──────────────────────────────────────────────────────────────
//
// CRM의 세부 필터는 조합이 기대대로 동작하지 않는다 (비정기+만료임박이
// 비정기 단독과 같은 건수로 나온다). 그래서 응답에 실려 오는 실제 값으로
// 우리가 직접 거른다. 걸린 게 있으면 목록을 훑어 모은 뒤 걸러서 페이지를 낸다.

const KIOSKS = [
  "use_kiosk_7_krizer", "use_kiosk_10_stand_krizer", "use_kiosk_10_passlight_krizer",
  "use_kiosk_15_krizer", "use_kiosk_21_krizer", "use_kiosk_apos_centerm",
];
const PAY_STATUS = ["NORMAL", "STOPPED", "FAILED", "CANCELED"];

type Post = {
  regular?: string;        // Y=정기만 N=비정기만
  pay?: string[];          // 결제 상태
  types?: string[];        // 업종
  kiosk?: string[];        // 키오스크 기종
  hasKiosk?: string;       // Y/N
  hasBiz?: string;         // Y/N
  hasTicket?: string;      // Y/N — 이용권 보유 여부
  expMin?: number | null;  // 만료 D-day 하한 (음수 = 이미 지남)
  expMax?: number | null;  // 만료 D-day 상한
  pointMax?: number | null;
  createdFrom?: string;
  createdTo?: string;
  idleDays?: number | null; // 최근 접속이 N일 이상 없음
};

const num = (v: unknown) => (String(v ?? "") === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const yn = (v: unknown) => (v === "Y" || v === "N" ? String(v) : "");

function parsePost(req: AuthedRequest): Post {
  const r = req.query;
  return {
    regular: yn(r.regular),
    pay: listParam(r.pay).map((v) => v.toUpperCase()).filter((v) => PAY_STATUS.includes(v)),
    types: listParam(r.types).map((v) => v.toUpperCase()),
    kiosk: listParam(r.kiosk).filter((v) => KIOSKS.includes(v)),
    hasKiosk: yn(r.hasKiosk),
    hasBiz: yn(r.hasBiz),
    hasTicket: yn(r.hasTicket),
    expMin: num(r.expMin),
    expMax: num(r.expMax),
    pointMax: num(r.pointMax),
    createdFrom: String(r.createdFrom ?? "").slice(0, 10),
    createdTo: String(r.createdTo ?? "").slice(0, 10),
    idleDays: num(r.idleDays),
  };
}

function hasPost(p: Post): boolean {
  return Boolean(
    p.regular || p.pay?.length || p.types?.length || p.kiosk?.length ||
    p.hasKiosk || p.hasBiz || p.hasTicket ||
    p.expMin !== null || p.expMax !== null || p.pointMax !== null ||
    p.createdFrom || p.createdTo || p.idleDays !== null,
  );
}

const DAY = 86_400_000;
/** 만료까지 남은 일수. 음수면 이미 지난 것. 이용권이 없으면 null */
function ddays(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - Date.now()) / DAY);
}

function matches(r: Row, p: Post): boolean {
  if (p.regular === "Y" && !r.ticketRegular) return false;
  if (p.regular === "N" && r.ticketRegular) return false;
  if (p.pay?.length && !p.pay.includes(r.paymentStatus)) return false;
  if (p.types?.length && !r.types.some((t) => p.types!.includes(t))) return false;
  if (p.kiosk?.length && !r.kioskKeys.some((k) => p.kiosk!.includes(k))) return false;
  if (p.hasKiosk === "Y" && !r.kioskKeys.length) return false;
  if (p.hasKiosk === "N" && r.kioskKeys.length) return false;
  if (p.hasBiz === "Y" && !r.bizNo) return false;
  if (p.hasBiz === "N" && r.bizNo) return false;
  if (p.hasTicket === "Y" && !r.ticketName) return false;
  if (p.hasTicket === "N" && r.ticketName) return false;

  if (p.expMin !== null || p.expMax !== null) {
    const d = ddays(r.ticketExpiredAt);
    if (d === null) return false; // 만료일이 없으면 기간 조건에 걸릴 수 없다
    if (p.expMin !== null && d < p.expMin!) return false;
    if (p.expMax !== null && d > p.expMax!) return false;
  }
  if (p.pointMax !== null && r.messagePoint > p.pointMax!) return false;

  if (p.createdFrom || p.createdTo) {
    const c = r.createdAt ? String(r.createdAt).slice(0, 10) : "";
    if (!c) return false;
    if (p.createdFrom && c < p.createdFrom) return false;
    if (p.createdTo && c > p.createdTo) return false;
  }
  if (p.idleDays !== null) {
    const t = r.lastAccessedAt ? new Date(String(r.lastAccessedAt)).getTime() : 0;
    // 접속 기록이 없으면(1970 등) 가장 오래 안 온 것으로 본다
    const idle = !t || new Date(t).getFullYear() < 1990 ? 99999 : Math.floor((Date.now() - t) / DAY);
    if (idle < p.idleDays!) return false;
  }
  return true;
}

/** 훑어 모은 결과를 잠깐 들고 있는다 — 페이지를 넘길 때마다 다시 긁지 않게 */
const SCAN_CAP = 6000;
const SCAN_TTL = 90_000;
const scanCache = new Map<string, { at: number; rows: Row[]; apiTotal: number; truncated: boolean }>();

async function scanAll(q: CrmGroupQuery): Promise<{ rows: Row[]; apiTotal: number; truncated: boolean }> {
  const key = JSON.stringify([
    q.keyword, q.groupFirstFilter, q.secondFilters, q.ticketFileNames,
    q.adminFilterType, q.installerTeamName, q.newsfeedDays, q.newsfeedUnderCount,
  ]);
  const hit = scanCache.get(key);
  if (hit && Date.now() - hit.at < SCAN_TTL) return hit;

  const count = await crmGroupCount(q);
  const apiTotal = Number(count?.result) || 0;
  const want = Math.min(apiTotal, SCAN_CAP);
  const pages = Math.ceil(want / 200);
  const rows: Row[] = [];

  // 5개씩 묶어 병렬로 — CRM에 과하게 몰지 않으면서 충분히 빠르다
  for (let i = 0; i < pages; i += 5) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(5, pages - i) }, (_, j) =>
        crmGroups({ ...q, page: i + j, size: 200 }).catch(() => ({ result: [] })),
      ),
    );
    for (const b of batch) rows.push(...(b?.result ?? []).map((x) => flatten(x as Record<string, unknown>)));
    if (rows.length >= want) break;
  }

  const out = { rows, apiTotal, truncated: apiTotal > SCAN_CAP };
  scanCache.set(key, { at: Date.now(), ...out });
  if (scanCache.size > 12) scanCache.clear();
  return out;
}

/**
 * 정밀 필터는 동기화해둔 ErpCenter로 돌린다.
 *
 * CRM 페이징이 불안정해서(만료일 동점이 많아 페이지마다 순서가 흔들린다)
 * 훑어 모으면 20%가 빠진다. 마스터는 여러 번 훑어 100%를 채워두므로
 * 여기서 거르면 누락이 없고 즉시 나온다.
 *
 * 상태 필터는 실측으로 맞췄다 — ACTIVE=만료일 미래(4,173 vs CRM 4,179),
 * EXPIRATION=과거이거나 없음(5,196 vs 5,190). ISSUE만 정의를 몰라
 * CRM에서 키 목록을 받아 교집합을 낸다.
 */
async function issueKeys(): Promise<number[]> {
  const keys = new Set<number>();
  for (const sort of ["CLOSED_DTTM_DESC", "CLOSED_DTTM_ASC", "CLOSED_DTTM_DESC"]) {
    for (let page = 0; page < 6; page++) {
      const r = await crmGroups({ groupFirstFilter: "ISSUE", page, size: 200, sort }).catch(() => null);
      const list = (r?.result ?? []) as { group?: { key?: number } }[];
      if (!list.length) break;
      for (const it of list) {
        const k = Number(it.group?.key);
        if (Number.isFinite(k) && k > 0) keys.add(k);
      }
    }
  }
  return [...keys];
}

async function preciseFromLocal(q: CrmGroupQuery, post: Post, page: number, size: number) {
  const synced = await prisma.erpCenter.count();
  if (!synced) return null; // 아직 동기화 전 — 호출한 쪽이 예전 방식으로 물러선다

  const now = new Date();
  const AND: Record<string, unknown>[] = [];

  if (q.keyword) {
    const kw = q.keyword;
    AND.push({
      OR: [
        { name: { contains: kw, mode: "insensitive" } },
        { primaryName: { contains: kw, mode: "insensitive" } },
        { ownerName: { contains: kw, mode: "insensitive" } },
        { ownerPhone: { contains: kw.replace(/[^\d]/g, "") || kw } },
        { phone: { contains: kw.replace(/[^\d]/g, "") || kw } },
        { bizNo: { contains: kw.replace(/[^\d]/g, "") || kw } },
      ],
    });
  }
  if (q.groupFirstFilter === "ACTIVE") AND.push({ ticketExpiredAt: { gte: now } });
  if (q.groupFirstFilter === "EXPIRATION") {
    AND.push({ OR: [{ ticketExpiredAt: { lt: now } }, { ticketExpiredAt: null }] });
  }
  if (q.groupFirstFilter === "ISSUE") AND.push({ groupKey: { in: await issueKeys() } });
  if (q.ticketFileNames?.length) AND.push({ ticketName: { in: q.ticketFileNames } });
  if (q.installerTeamName) AND.push({ installTeam: { contains: q.installerTeamName, mode: "insensitive" } });

  // CRM 세부 필터는 조합이 안 먹어서, 같은 뜻을 로컬 컬럼으로 다시 건다
  const second = q.secondFilters ?? [];
  const secondOr: Record<string, unknown>[] = [];
  if (second.includes("REGULAR")) secondOr.push({ ticketRegular: true });
  if (second.includes("NON_REGULAR")) secondOr.push({ ticketRegular: false });
  if (second.includes("SOON_EXPIRED")) {
    secondOr.push({ ticketExpiredAt: { gte: now, lte: new Date(Date.now() + 28 * 86_400_000) } });
  }
  if (second.includes("PAYMENT_FAILED")) secondOr.push({ paymentStatus: "FAILED" });
  if (second.includes("PAYMENT_STOPPED")) secondOr.push({ paymentStatus: "STOPPED" });
  if (second.includes("REGULAR_PAYMENT_CANCELED")) secondOr.push({ paymentStatus: "CANCELED" });
  if (secondOr.length) AND.push({ OR: secondOr });

  // 정밀 필터 — DB에서 걸 수 있는 건 여기서 건다
  if (post.regular === "Y") AND.push({ ticketRegular: true });
  if (post.regular === "N") AND.push({ ticketRegular: false });
  if (post.pay?.length) AND.push({ paymentStatus: { in: post.pay } });
  if (post.hasBiz === "Y") AND.push({ bizNo: { not: "" } });
  if (post.hasBiz === "N") AND.push({ bizNo: "" });
  if (post.hasTicket === "Y") AND.push({ ticketName: { not: "" } });
  if (post.hasTicket === "N") AND.push({ ticketName: "" });
  if (post.pointMax !== null && post.pointMax !== undefined) AND.push({ messagePoint: { lte: post.pointMax } });
  if (post.expMin !== null && post.expMin !== undefined) {
    AND.push({ ticketExpiredAt: { gte: new Date(Date.now() + post.expMin * 86_400_000) } });
  }
  if (post.expMax !== null && post.expMax !== undefined) {
    AND.push({ ticketExpiredAt: { lte: new Date(Date.now() + (post.expMax + 1) * 86_400_000) } });
  }
  if (post.createdFrom) AND.push({ crmCreatedAt: { gte: new Date(post.createdFrom) } });
  if (post.createdTo) AND.push({ crmCreatedAt: { lte: new Date(post.createdTo + "T23:59:59") } });
  if (post.idleDays !== null && post.idleDays !== undefined) {
    const cut = new Date(Date.now() - post.idleDays * 86_400_000);
    AND.push({ OR: [{ lastAccessedAt: { lt: cut } }, { lastAccessedAt: null }] });
  }

  const where = AND.length ? { AND } : {};
  const order = q.sort === "CLOSED_DTTM_ASC" ? "asc" : "desc";
  let rows = await prisma.erpCenter.findMany({
    where: where as never,
    orderBy: [{ ticketExpiredAt: order }, { groupKey: "asc" }],
    take: 20000,
  });

  // JSON 컬럼(업종·키오스크)은 DB에서 거르기 번거로워 여기서 거른다
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  if (post.types?.length) rows = rows.filter((r) => arr(r.types).some((t) => post.types!.includes(t)));
  if (post.kiosk?.length) rows = rows.filter((r) => arr(r.kioskKeys).some((k) => post.kiosk!.includes(k)));
  if (post.hasKiosk === "Y") rows = rows.filter((r) => arr(r.kioskKeys).length > 0);
  if (post.hasKiosk === "N") rows = rows.filter((r) => arr(r.kioskKeys).length === 0);

  const KIOSK_LABEL: Record<string, string> = {
    use_kiosk_7_krizer: "7인치",
    use_kiosk_10_stand_krizer: "10인치 스탠드",
    use_kiosk_10_passlight_krizer: "10인치 패스라이트",
    use_kiosk_15_krizer: "15인치",
    use_kiosk_21_krizer: "21인치",
    use_kiosk_apos_centerm: "aPOS",
  };
  const centers = rows.slice(page * size, page * size + size).map((r) => ({
    groupKey: r.groupKey,
    name: r.name,
    primaryName: r.primaryName,
    phone: r.phone,
    bizNo: r.bizNo,
    types: arr(r.types),
    paymentStatus: r.paymentStatus,
    messagePoint: r.messagePoint,
    createdAt: r.crmCreatedAt,
    lastAccessedAt: r.lastAccessedAt,
    ticketName: r.ticketName,
    ticketExpiredAt: r.ticketExpiredAt,
    ticketRegular: r.ticketRegular,
    ownerName: r.ownerName,
    ownerId: r.ownerId,
    ownerPhone: r.ownerPhone,
    installerTeam: r.installTeam,
    previousNames: "",
    kiosks: arr(r.kioskKeys).map((k) => KIOSK_LABEL[k] || k),
    kioskKeys: arr(r.kioskKeys),
  }));

  const syncedAt = (await prisma.erpCenter.findFirst({
    orderBy: { crmSyncedAt: "desc" }, select: { crmSyncedAt: true },
  }))?.crmSyncedAt ?? null;

  return {
    centers, total: rows.length, page, size,
    precise: true, source: "local", scanned: synced, syncedAt,
  };
}

erpCrmRouter.get("/centers", async (req: AuthedRequest, res) => {
  const q = parseQuery(req);
  const post = parsePost(req);
  const page = q.page ?? 0;
  const size = q.size ?? 50;
  try {
    if (hasPost(post)) {
      const out = await preciseFromLocal(q, post, page, size);
      if (out) return res.json(out);
      // 마스터가 아직 비었을 때만 예전 방식(CRM 훑기)으로 물러선다
      const { rows, apiTotal, truncated } = await scanAll(q);
      const kept = rows.filter((r) => matches(r, post));
      return res.json({
        centers: kept.slice(page * size, page * size + size),
        total: kept.length,
        page, size,
        precise: true, source: "crm",
        scanned: rows.length, apiTotal, truncated,
      });
    }
    const [list, count] = await Promise.all([crmGroups(q), crmGroupCount(q)]);
    res.json({
      centers: (list?.result ?? []).map((r) => flatten(r as Record<string, unknown>)),
      total: Number(count?.result) || 0,
      page,
      size,
    });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

/**
 * 필터 칩에 붙일 건수 — 검색어를 유지한 채 필터별로 세어 온다.
 * 세부 필터는 활성 센터 안에서만 의미가 있어 first=ACTIVE로 센다.
 * CRM 왕복이 10번이라 같은 검색어는 30초간 캐시한다.
 */
const countCache = new Map<string, { at: number; value: Record<string, number> }>();
const COUNT_TTL = 30_000;

erpCrmRouter.get("/centers/counts", async (req: AuthedRequest, res) => {
  const base = parseQuery(req);
  const key = [
    base.keyword ?? "", base.adminFilterType, base.installerTeamName ?? "",
    (base.ticketFileNames ?? []).join("+"), base.newsfeedDays ?? "", base.newsfeedUnderCount ?? "",
  ].join("|");
  const hit = countCache.get(key);
  if (hit && Date.now() - hit.at < COUNT_TTL) return res.json({ counts: hit.value, cached: true });

  const jobs: [string, CrmGroupQuery][] = [
    ...FIRST.map((f) => [`first:${f}`, { ...base, groupFirstFilter: f, secondFilters: [] }] as [string, CrmGroupQuery]),
    ...SECOND.filter((s) => s !== "NONE").map(
      (s) => [`second:${s}`, { ...base, groupFirstFilter: "ACTIVE", secondFilters: [s] }] as [string, CrmGroupQuery],
    ),
  ];
  try {
    const done = await Promise.all(
      jobs.map(async ([k, q]) => {
        try {
          const r = await crmGroupCount(q);
          return [k, Number(r?.result) || 0] as const;
        } catch {
          return [k, -1] as const; // 못 센 칸은 -1 — 화면에서 숫자를 감춘다
        }
      }),
    );
    const counts = Object.fromEntries(done);
    countCache.set(key, { at: Date.now(), value: counts });
    if (countCache.size > 50) countCache.clear();
    res.json({ counts });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

/** 현재 조건 전체를 CSV로 — 200건씩 끊어 모은다 */
erpCrmRouter.get("/centers/export", async (req: AuthedRequest, res) => {
  const q = { ...parseQuery(req), size: 200 };
  const post = parsePost(req);
  const cap = Math.min(Math.max(Number(req.query.max) || 5000, 1), 20000);
  try {
    const scan = await scanAll(q);
    const rows = hasPost(post) ? scan.rows.filter((r) => matches(r, post)) : scan.rows;
    const total = Math.min(rows.length, cap);

    const head = [
      "센터명", "지점명", "대표자", "대표자 연락처", "센터 연락처", "사업자번호",
      "업종", "결제상태", "이용권", "이용권 만료", "정기결제", "키오스크",
      "설치팀", "문자포인트", "등록일", "최근접속", "group_key",
    ];
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const day = (v: unknown) => (v ? String(v).slice(0, 10) : "");
    const lines = [head.join(",")];
    for (const r of rows.slice(0, total)) {
      lines.push([
        r.name, r.primaryName, r.ownerName, r.ownerPhone, r.phone, r.bizNo,
        r.types.join(" "), r.paymentStatus, r.ticketName, day(r.ticketExpiredAt),
        r.ticketRegular ? "정기" : "", r.kiosks.join(" "),
        r.installerTeam, r.messagePoint, day(r.createdAt), day(r.lastAccessedAt), r.groupKey,
      ].map(cell).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="crm-centers-${Date.now()}.csv"`);
    res.send("﻿" + lines.join("\n")); // 엑셀에서 한글이 깨지지 않게 BOM
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

// ─── 세그먼트 (저장한 검색 조건) ────────────────────────────────────────────

async function actor(req: AuthedRequest) {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  const emp = user ? await prisma.erpEmployee.findUnique({ where: { userId: user.id } }) : null;
  const email = (user?.email ?? "").toLowerCase();
  return { email, name: emp?.name || user?.name || email };
}

/** 저장 가능한 필드만 남긴다 — 화면에서 온 값을 그대로 믿지 않는다 */
function cleanFilters(v: unknown) {
  const f = (v ?? {}) as Record<string, unknown>;
  const first = String(f.first ?? "ALL").toUpperCase();
  const days = Number(f.newsfeedDays);
  const under = Number(f.newsfeedUnder);
  return {
    keyword: String(f.keyword ?? "").trim().slice(0, 100),
    first: FIRST.includes(first) ? first : "ALL",
    second: listParam(f.second).map((s) => s.toUpperCase()).filter((s) => SECOND.includes(s)).slice(0, 6),
    ticket: listParam(f.ticket).filter((s) => TICKETS.includes(s)),
    admin: String(f.admin ?? "ALL").toUpperCase() === "CONNECTED" ? "CONNECTED" : "ALL",
    installer: String(f.installer ?? "").trim().slice(0, 100),
    sort: String(f.sort ?? "") === "CLOSED_DTTM_ASC" ? "CLOSED_DTTM_ASC" : "CLOSED_DTTM_DESC",
    newsfeedDays: Number.isFinite(days) ? Math.min(Math.max(days, 0), 7) : null,
    newsfeedUnder: Number.isFinite(under) ? Math.max(under, 0) : null,
    // 정밀 필터 — 우리가 직접 거르는 조건들
    regular: f.regular === "Y" || f.regular === "N" ? f.regular : "",
    pay: listParam(f.pay).map((v) => v.toUpperCase()).filter((v) => PAY_STATUS.includes(v)),
    types: listParam(f.types).map((v) => v.toUpperCase()).slice(0, 20),
    kiosk: listParam(f.kiosk).filter((v) => KIOSKS.includes(v)),
    hasKiosk: f.hasKiosk === "Y" || f.hasKiosk === "N" ? f.hasKiosk : "",
    hasBiz: f.hasBiz === "Y" || f.hasBiz === "N" ? f.hasBiz : "",
    hasTicket: f.hasTicket === "Y" || f.hasTicket === "N" ? f.hasTicket : "",
    expMin: Number.isFinite(Number(f.expMin)) && String(f.expMin ?? "") !== "" ? Number(f.expMin) : null,
    expMax: Number.isFinite(Number(f.expMax)) && String(f.expMax ?? "") !== "" ? Number(f.expMax) : null,
    pointMax: Number.isFinite(Number(f.pointMax)) && String(f.pointMax ?? "") !== "" ? Number(f.pointMax) : null,
    createdFrom: String(f.createdFrom ?? "").slice(0, 10),
    createdTo: String(f.createdTo ?? "").slice(0, 10),
    idleDays: Number.isFinite(Number(f.idleDays)) && String(f.idleDays ?? "") !== "" ? Number(f.idleDays) : null,
  };
}

erpCrmRouter.get("/segments", async (req: AuthedRequest, res) => {
  const me = await actor(req);
  const rows = await prisma.erpCrmSegment.findMany({
    where: { OR: [{ ownerEmail: me.email }, { shared: true }] },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json({ segments: rows.map((s) => ({ ...s, mine: s.ownerEmail === me.email })) });
});

erpCrmRouter.post("/segments", async (req: AuthedRequest, res) => {
  const me = await actor(req);
  const name = String(req.body?.name ?? "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "세그먼트 이름을 입력하세요" });
  const count = await prisma.erpCrmSegment.count({ where: { ownerEmail: me.email } });
  if (count >= 40) return res.status(400).json({ error: "세그먼트는 40개까지 저장할 수 있습니다" });
  const row = await prisma.erpCrmSegment.create({
    data: {
      name,
      filters: cleanFilters(req.body?.filters),
      ownerEmail: me.email,
      ownerName: me.name,
      shared: req.body?.shared === true,
      sortOrder: count,
    },
  });
  res.json({ segment: { ...row, mine: true } });
});

erpCrmRouter.patch("/segments/:id", async (req: AuthedRequest, res) => {
  const me = await actor(req);
  const row = await prisma.erpCrmSegment.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "세그먼트를 찾을 수 없습니다" });
  if (row.ownerEmail !== me.email) return res.status(403).json({ error: "만든 사람만 수정할 수 있습니다" });

  const data: Record<string, unknown> = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 40);
  if (req.body?.filters !== undefined) data.filters = cleanFilters(req.body.filters);
  if (typeof req.body?.shared === "boolean") data.shared = req.body.shared;
  if (Number.isFinite(Number(req.body?.sortOrder))) data.sortOrder = Number(req.body.sortOrder);

  const saved = await prisma.erpCrmSegment.update({ where: { id: row.id }, data });
  res.json({ segment: { ...saved, mine: true } });
});

erpCrmRouter.delete("/segments/:id", async (req: AuthedRequest, res) => {
  const me = await actor(req);
  const row = await prisma.erpCrmSegment.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: "세그먼트를 찾을 수 없습니다" });
  if (row.ownerEmail !== me.email) return res.status(403).json({ error: "만든 사람만 삭제할 수 있습니다" });
  await prisma.erpCrmSegment.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

// ─── 센터 카드 (여정관리 1단계) ─────────────────────────────────────────────

/** 센터 하나의 현황 + 타임라인 + 문자포인트 추이 */
erpCrmRouter.get("/centers/:groupKey/card", async (req: AuthedRequest, res) => {
  const groupKey = Number(req.params.groupKey);
  if (!Number.isInteger(groupKey) || groupKey <= 0) {
    return res.status(400).json({ error: "센터 키가 올바르지 않습니다" });
  }
  try {
    const [center, events, snaps] = await Promise.all([
      prisma.erpCenter.findUnique({ where: { groupKey } }),
      prisma.erpCenterEvent.findMany({ where: { groupKey }, orderBy: { occurredAt: "desc" }, take: 200 }),
      prisma.erpCenterPointSnap.findMany({ where: { groupKey }, orderBy: { date: "desc" }, take: 90 }),
    ]);

    // 마스터에 아직 없으면 CRM에서 바로 한 건 끌어와 보여준다 (동기화 전이라도 열리게)
    let live = null;
    if (!center) {
      const r = await crmGroups({ groupFirstFilter: "ALL", keyword: String(groupKey), page: 0, size: 1 }).catch(() => null);
      const hit = (r?.result ?? []).map((x) => flatten(x as Record<string, unknown>)).find((x) => x.groupKey === groupKey);
      live = hit ?? null;
    }

    // 소진 예측 — 최근 30일 사용분으로 하루 평균을 낸다
    const uses = snaps.filter((s) => s.delta < 0).slice(0, 30);
    const dailyUse = uses.length ? Math.round(uses.reduce((a, s) => a + Math.abs(s.delta), 0) / uses.length) : 0;
    const point = center?.messagePoint ?? live?.messagePoint ?? 0;
    const runoutDays = dailyUse > 0 ? Math.floor(point / dailyUse) : null;

    res.json({
      center: center ?? null,
      live,
      events,
      points: snaps.slice().reverse(),
      point: { current: point, dailyUse, runoutDays },
      synced: !!center,
    });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

/** 수동 동기화 — 정기 실행(KST 05:10)을 기다리지 않고 지금 받는다 */
erpCrmRouter.post("/sync", async (req: AuthedRequest, res) => {
  try {
    const r = await syncCenters();
    res.json({
      ok: true,
      ...r,
      message: `센터 ${r.fetched.toLocaleString()}/${r.total.toLocaleString()}곳 (${(r.coverage * 100).toFixed(1)}%, ${r.passes}회 훑음) · 신규 ${r.added} · 스냅샷 ${r.snapped.toLocaleString()} · 충전 ${r.charges}`,
    });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

/** 동기화 상태 — 마지막으로 언제 받았는지 */
erpCrmRouter.get("/sync/status", async (_req: AuthedRequest, res) => {
  const [count, latest, snapDays] = await Promise.all([
    prisma.erpCenter.count(),
    prisma.erpCenter.findFirst({ orderBy: { crmSyncedAt: "desc" }, select: { crmSyncedAt: true } }),
    prisma.erpCenterPointSnap.groupBy({ by: ["date"], _count: { _all: true }, orderBy: { date: "desc" }, take: 1 }),
  ]);
  res.json({
    centers: count,
    syncedAt: latest?.crmSyncedAt ?? null,
    lastSnapDate: snapDays[0]?.date ?? null,
    lastSnapCount: snapDays[0]?._count._all ?? 0,
  });
});
