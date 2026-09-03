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
  };
}

erpCrmRouter.get("/centers", async (req: AuthedRequest, res) => {
  const q = parseQuery(req);
  try {
    const [list, count] = await Promise.all([crmGroups(q), crmGroupCount(q)]);
    const rows = (list?.result ?? []).map((r) => flatten(r as Record<string, unknown>));
    res.json({
      centers: rows,
      total: Number(count?.result) || 0,
      page: q.page ?? 0,
      size: q.size ?? 50,
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
  const cap = Math.min(Math.max(Number(req.query.max) || 5000, 1), 20000);
  try {
    const count = await crmGroupCount(q);
    const total = Math.min(Number(count?.result) || 0, cap);
    const rows: ReturnType<typeof flatten>[] = [];
    for (let page = 0; rows.length < total; page++) {
      const list = await crmGroups({ ...q, page });
      const batch = (list?.result ?? []).map((r) => flatten(r as Record<string, unknown>));
      if (!batch.length) break;
      rows.push(...batch);
      if (page > 120) break; // 안전장치
    }

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
