/**
 * 고객관리 — CRM 마스터 API로 센터 목록을 조회한다.
 *
 * 목록(/master/groups)과 건수(/master/groups/count)를 함께 부른다. 인증은
 * OPEN API 센터관리에서 받아둔 마스터 JWT + SessionToken을 그대로 쓴다.
 */
import { Router } from "express";
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

function parseQuery(req: AuthedRequest): CrmGroupQuery {
  const raw = req.query;
  const second = ([] as string[])
    .concat((raw.second as string | string[]) ?? [])
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim().toUpperCase())
    .filter((v) => SECOND.includes(v));
  const first = String(raw.first ?? "ALL").toUpperCase();
  return {
    keyword: String(raw.keyword ?? "").trim(),
    groupFirstFilter: FIRST.includes(first) ? first : "ALL",
    secondFilters: second,
    adminFilterType: String(raw.admin ?? "ALL").toUpperCase() === "CONNECTED" ? "CONNECTED" : "ALL",
    installerTeamName: String(raw.installer ?? "").trim(),
    sort: String(raw.sort ?? "") === "CLOSED_DTTM_ASC" ? "CLOSED_DTTM_ASC" : "CLOSED_DTTM_DESC",
    page: Math.max(Number(raw.page) || 0, 0),
    size: Math.min(Math.max(Number(raw.size) || 50, 1), 200),
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
