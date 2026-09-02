/**
 * OPEN API 센터관리 — 센터 대장 · API Key 발급/재발급/정지/폐기 · 연결 센터 · 발급 요청 조회.
 *
 * 게이트웨이에는 "발급된 키 전체 목록" API가 없어서 ERP가 발급 대장을 직접 들고 간다.
 * api_key 원문은 절대 저장하지 않는다 — 발급/재발급 응답에서 한 번만 화면에 보여준다.
 */
import { Router, type Response } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
import { env } from "../env.js";
import { isErpOwner } from "../services/erpAccess.js";
import {
  getOpenApiConfig,
  maskSecret,
  normalizeBaseUrl,
  issueKey,
  rotateKey,
  suspendKey,
  revokeKey,
  changeTenants,
  listKeyRequests,
  getKeyRequest,
  listGroups,
  masterLogin,
  toPasswordHash,
  pingGateway,
} from "../services/openApiGateway.js";

export const erpOpenApiRouter = Router();
erpOpenApiRouter.use(auth, requireAccess);
if (env.erpMode) erpOpenApiRouter.use(requireErpMember);

const MENU_ID = "openapi-center";

type Actor = { email: string; name: string; canManage: boolean };

/** 소유자·시스템관리자 기본 허용. ErpMenuAccess 규칙이 있으면 그 규칙이 우선한다. */
async function actorOf(req: AuthedRequest, res: Response): Promise<Actor | null> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(401).json({ error: "로그인이 필요합니다" });
    return null;
  }
  const email = user.email.toLowerCase();
  const emp = await prisma.erpEmployee.findUnique({ where: { userId: user.id } });
  const rule = await prisma.erpMenuAccess.findUnique({ where: { menuId: MENU_ID } });

  let allowed = isErpOwner(email) || (emp?.roles ?? []).includes("시스템관리자");
  if (rule) {
    allowed =
      rule.emails.map((e) => e.toLowerCase()).includes(email) ||
      (!!emp?.departmentId && rule.deptIds.includes(emp.departmentId));
  }
  if (!allowed) {
    res.status(403).json({ error: "OPEN API 센터관리 권한이 없습니다" });
    return null;
  }
  return { email, name: emp?.name || user.name || email, canManage: true };
}

function errStatus(e: unknown): number {
  const s = (e as { status?: number })?.status;
  return typeof s === "number" && s >= 400 && s < 600 ? s : 500;
}
function errMsg(e: unknown): string {
  return (e as Error)?.message || "처리하지 못했습니다";
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numArray = (v: unknown): number[] =>
  asArray(v)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
const strArray = (v: unknown): string[] =>
  asArray(v)
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);

async function writeLog(entry: {
  keyId: string;
  keyName?: string;
  centerName?: string;
  action: string;
  actor: Actor;
  before?: string;
  after?: string;
  detail?: string;
}) {
  await prisma.erpOpenApiKeyLog.create({
    data: {
      keyId: entry.keyId,
      keyName: entry.keyName ?? "",
      centerName: entry.centerName ?? "",
      action: entry.action,
      actorEmail: entry.actor.email,
      actorName: entry.actor.name,
      before: entry.before ?? "",
      after: entry.after ?? "",
      detail: entry.detail ?? "",
    },
  });
}

// ─── 설정 ─────────────────────────────────────────────────────────────────

erpOpenApiRouter.get("/config", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const cfg = await getOpenApiConfig();
  res.json({
    baseUrl: cfg.baseUrl,
    masterPrefix: cfg.masterPrefix,
    masterTokenMasked: maskSecret(cfg.masterToken),
    sessionTokenMasked: maskSecret(cfg.sessionToken),
    publicApiKeyMasked: maskSecret(cfg.publicApiKey),
    hasMasterToken: !!cfg.masterToken,
    hasSessionToken: !!cfg.sessionToken,
    hasPublicApiKey: !!cfg.publicApiKey,
    authBaseUrl: cfg.authBaseUrl,
    authPrefix: cfg.authPrefix,
    authType: cfg.authType,
    memberId: cfg.memberId,
    hasPassword: !!cfg.memberPassword,
    tokenAt: cfg.tokenAt,
    updatedBy: cfg.updatedBy,
    updatedAt: cfg.updatedAt,
  });
});

erpOpenApiRouter.put("/config", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const b = req.body ?? {};
  const cur = await getOpenApiConfig();

  let baseUrl = cur.baseUrl;
  if (typeof b.baseUrl === "string") {
    const v = b.baseUrl.trim();
    if (v) {
      try {
        baseUrl = normalizeBaseUrl(v);
      } catch (e) {
        return res.status(errStatus(e)).json({ error: errMsg(e) });
      }
    } else {
      baseUrl = "";
    }
  }

  // 토큰류는 빈 문자열이면 "그대로 둔다" — 마스킹된 값을 되돌려 저장하는 사고 방지
  const keep = (next: unknown, prev: string) =>
    typeof next === "string" && next.trim() ? next.trim() : prev;

  const data = {
    baseUrl,
    masterPrefix: typeof b.masterPrefix === "string" ? b.masterPrefix.trim().replace(/\/+$/, "") : cur.masterPrefix,
    masterToken: keep(b.masterToken, cur.masterToken),
    sessionToken: b.clearSessionToken ? "" : keep(b.sessionToken, cur.sessionToken),
    publicApiKey: keep(b.publicApiKey, cur.publicApiKey),
    authBaseUrl: typeof b.authBaseUrl === "string" && b.authBaseUrl.trim() ? b.authBaseUrl.trim().replace(/\/+$/, "") : cur.authBaseUrl,
    authPrefix: typeof b.authPrefix === "string" ? b.authPrefix.trim().replace(/\/+$/, "") : cur.authPrefix,
    authType: typeof b.authType === "string" && b.authType.trim() ? b.authType.trim().toUpperCase() : cur.authType,
    memberId: typeof b.memberId === "string" ? b.memberId.trim() : cur.memberId,
    // 평문이 오면 여기서 바로 SHA-256으로 바꿔 저장한다 — DB에 평문은 남지 않는다
    memberPassword: typeof b.memberPassword === "string" && b.memberPassword.trim()
      ? toPasswordHash(b.memberPassword)
      : cur.memberPassword,
    updatedBy: actor.email,
  };
  await prisma.erpOpenApiConfig.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  res.json({ ok: true });
});

/** 마스터 로그인 — 인증코드까지 한 번에. 코드가 응답에 없으면 needsCode로 알린다 */
erpOpenApiRouter.post("/login", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  try {
    const out = await masterLogin(String(req.body?.authCode ?? "").trim() || undefined);
    if (out.ok) {
      await writeLog({ keyId: "-", action: "login", actor, detail: "마스터 로그인 — 토큰 갱신" });
      return res.json({ ok: true, message: "로그인했습니다. 토큰을 갱신했어요." });
    }
    res.json(out);
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

/** 설정 점검 — 발급 요청 목록을 1건만 불러 연결·인증 상태를 확인한다 */
erpOpenApiRouter.post("/config/test", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  try {
    res.json({ ok: true, message: await pingGateway() });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

// ─── 센터 대장 ─────────────────────────────────────────────────────────────

erpOpenApiRouter.get("/centers", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const q = String(req.query.search ?? "").trim();
  const centers = await prisma.erpOpenApiCenter.findMany({
    where: q
      ? {
          OR: [
            { centerName: { contains: q, mode: "insensitive" } },
            { groupId: { contains: q, mode: "insensitive" } },
            { bizNo: { contains: q.replace(/[^\d]/g, "") } },
            ...(Number.isFinite(Number(q)) ? [{ groupKey: Number(q) }] : []),
          ],
        }
      : undefined,
    orderBy: [{ centerName: "asc" }],
    take: 500,
  });
  const keys = await prisma.erpOpenApiKey.findMany({ orderBy: { issuedAt: "desc" } });

  const rows = centers.map((c) => {
    const mine = keys.filter(
      (k) => k.groupKey === c.groupKey || numArray(k.groupKeys).includes(c.groupKey),
    );
    const active = mine.find((k) => k.status === "ACTIVE");
    return {
      ...c,
      keyCount: mine.length,
      activeKeyId: active?.keyId ?? null,
      keyStatus: active ? "ACTIVE" : mine.some((k) => k.status === "SUSPENDED") ? "SUSPENDED" : mine.length ? "REVOKED" : null,
      keys: mine.map((k) => ({ keyId: k.keyId, name: k.name, status: k.status, keyPrefix: k.keyPrefix })),
    };
  });
  res.json({ centers: rows, total: rows.length });
});

erpOpenApiRouter.post("/centers", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const b = req.body ?? {};
  const groupKey = Number(b.groupKey);
  const centerName = String(b.centerName ?? "").trim();
  if (!Number.isInteger(groupKey) || groupKey <= 0) return res.status(400).json({ error: "센터 내부키(group_key)를 숫자로 입력하세요" });
  if (!centerName) return res.status(400).json({ error: "센터명을 입력하세요" });

  const data = {
    groupKey,
    centerName,
    groupId: String(b.groupId ?? "").trim(),
    brandKey: Number.isFinite(Number(b.brandKey)) && b.brandKey !== "" && b.brandKey !== null ? Number(b.brandKey) : null,
    brandId: String(b.brandId ?? "").trim(),
    bizNo: String(b.bizNo ?? "").replace(/[^\d]/g, ""),
    memo: String(b.memo ?? "").trim(),
    source: String(b.source ?? "manual"),
  };
  const row = await prisma.erpOpenApiCenter.upsert({ where: { groupKey }, create: data, update: data });
  res.json({ center: row });
});

erpOpenApiRouter.delete("/centers/:id", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const center = await prisma.erpOpenApiCenter.findUnique({ where: { id: req.params.id } });
  if (!center) return res.status(404).json({ error: "센터를 찾을 수 없습니다" });
  const used = await prisma.erpOpenApiKey.count({ where: { groupKey: center.groupKey, status: { not: "REVOKED" } } });
  if (used) return res.status(400).json({ error: "이 센터에 살아있는 API Key가 있어 삭제할 수 없습니다" });
  await prisma.erpOpenApiCenter.delete({ where: { id: center.id } });
  res.json({ ok: true });
});

/** 발급 요청 내역의 target_centers에서 센터(group_key + 센터명)를 끌어와 대장에 채운다 */
erpOpenApiRouter.post("/centers/import-from-requests", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const size = Math.min(Math.max(Number(req.body?.size) || 50, 1), 200);
  try {
    const page = await listKeyRequests({ page: 0, size });
    let added = 0;
    let updated = 0;
    for (const item of page?.content ?? []) {
      let detail: Record<string, unknown>;
      try {
        detail = await getKeyRequest(item.key_request_no);
      } catch {
        continue; // 한 건 실패로 전체를 멈추지 않는다
      }
      const form = (detail?.key_request ?? {}) as Record<string, unknown>;
      for (const tc of asArray(form.target_centers) as { group_key?: number; center_name?: string }[]) {
        const groupKey = Number(tc?.group_key);
        const centerName = String(tc?.center_name ?? "").trim();
        if (!Number.isInteger(groupKey) || groupKey <= 0 || !centerName) continue;
        const exists = await prisma.erpOpenApiCenter.findUnique({ where: { groupKey } });
        if (exists) {
          if (exists.centerName !== centerName) {
            await prisma.erpOpenApiCenter.update({ where: { groupKey }, data: { centerName } });
            updated++;
          }
        } else {
          await prisma.erpOpenApiCenter.create({ data: { groupKey, centerName, source: "request" } });
          added++;
        }
      }
    }
    res.json({ ok: true, added, updated, scanned: page?.content?.length ?? 0 });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

/** 공개 센터조회 API — group_id·센터명만 나오고 발급에 필요한 group_key는 없다 */
erpOpenApiRouter.get("/groups", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  try {
    const groups = await listGroups({
      brand_id: String(req.query.brandId ?? "").trim() || undefined,
      group_id: String(req.query.groupId ?? "").trim() || undefined,
    });
    res.json({ groups: asArray(groups) });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

// ─── 발급 키 대장 ──────────────────────────────────────────────────────────

erpOpenApiRouter.get("/keys", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const status = String(req.query.status ?? "").trim().toUpperCase();
  const keys = await prisma.erpOpenApiKey.findMany({
    where: status && status !== "ALL" ? { status } : undefined,
    orderBy: { issuedAt: "desc" },
    take: 500,
  });
  res.json({ keys });
});

erpOpenApiRouter.post("/keys", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const b = req.body ?? {};
  const name = String(b.name ?? "").trim();
  const apiGrade = String(b.apiGrade ?? "CENTER").trim().toUpperCase();
  const groupKey = Number(b.groupKey);
  const brandKey = Number(b.brandKey);
  const scopes = strArray(b.scopes);
  const expiredAt = String(b.expiredAt ?? "").trim();

  if (!name) return res.status(400).json({ error: "키 용도(이름)를 입력하세요" });
  if (!["SUPER", "BRAND", "CENTER"].includes(apiGrade)) return res.status(400).json({ error: "권한 등급이 올바르지 않습니다" });
  if (apiGrade === "CENTER" && !Number.isInteger(groupKey)) return res.status(400).json({ error: "CENTER 키는 센터를 선택해야 합니다" });
  if (apiGrade === "BRAND" && !Number.isInteger(brandKey)) return res.status(400).json({ error: "BRAND 키는 브랜드 내부키가 필요합니다" });

  const center = Number.isInteger(groupKey) ? await prisma.erpOpenApiCenter.findUnique({ where: { groupKey } }) : null;

  try {
    const out = await issueKey({
      name,
      api_grade: apiGrade,
      ...(Number.isInteger(brandKey) ? { brand_key: brandKey } : center?.brandKey ? { brand_key: center.brandKey } : {}),
      ...(Number.isInteger(groupKey) ? { group_key: groupKey } : {}),
      ...(scopes.length ? { scopes } : {}),
      ...(expiredAt ? { expired_at: expiredAt } : {}),
    });
    const keyId = String(out?.key_id ?? "").trim();
    if (!keyId) return res.status(502).json({ error: "게이트웨이가 key_id를 돌려주지 않았습니다" });

    const saved = await prisma.erpOpenApiKey.upsert({
      where: { keyId },
      create: {
        keyId,
        keyPrefix: String(out?.key_prefix ?? ""),
        name,
        apiGrade,
        brandKey: Number.isInteger(brandKey) ? brandKey : (center?.brandKey ?? null),
        groupKey: Number.isInteger(groupKey) ? groupKey : null,
        brandId: String(out?.brand_id ?? ""),
        groupId: String(out?.group_id ?? center?.groupId ?? ""),
        centerName: center?.centerName ?? "",
        scopes,
        groupKeys: Number.isInteger(groupKey) ? [groupKey] : [],
        groupIds: out?.group_id ? [String(out.group_id)] : [],
        status: "ACTIVE",
        expiredAt: out?.expired_at ? new Date(out.expired_at) : expiredAt ? new Date(expiredAt) : null,
        issuedBy: actor.email,
        memo: String(b.memo ?? "").trim(),
      },
      update: { status: "ACTIVE", name, keyPrefix: String(out?.key_prefix ?? "") },
    });

    await writeLog({
      keyId,
      keyName: name,
      centerName: center?.centerName ?? "",
      action: "issue",
      actor,
      after: `${apiGrade} · ${center?.centerName || `group_key ${groupKey}`}`,
      detail: scopes.length ? `scope: ${scopes.join(", ")}` : "",
    });

    // api_key 원문은 이 응답에서만 나간다 — DB에 저장하지 않는다
    res.json({ key: saved, apiKey: out?.api_key ?? "", once: true });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

erpOpenApiRouter.post("/keys/:keyId/rotate", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const keyId = req.params.keyId;
  const row = await prisma.erpOpenApiKey.findUnique({ where: { keyId } });
  try {
    const out = await rotateKey(keyId);
    const newKeyId = String(out?.key_id ?? keyId).trim();
    const saved = row
      ? await prisma.erpOpenApiKey.update({
          where: { keyId },
          data: {
            keyId: newKeyId,
            keyPrefix: String(out?.key_prefix ?? row.keyPrefix),
            status: "ACTIVE",
            rotatedAt: new Date(),
            expiredAt: out?.expired_at ? new Date(out.expired_at) : row.expiredAt,
          },
        })
      : null;
    await writeLog({
      keyId: newKeyId,
      keyName: row?.name ?? "",
      centerName: row?.centerName ?? "",
      action: "rotate",
      actor,
      before: keyId,
      after: newKeyId,
      detail: "재발급 — 이전 키는 즉시 사용할 수 없습니다",
    });
    res.json({ key: saved, apiKey: out?.api_key ?? "", once: true });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

for (const [action, fn, label] of [
  ["suspend", suspendKey, "정지"],
  ["revoke", revokeKey, "폐기"],
] as const) {
  erpOpenApiRouter.patch(`/keys/:keyId/${action}`, async (req: AuthedRequest, res) => {
    const actor = await actorOf(req, res);
    if (!actor) return;
    const keyId = req.params.keyId;
    const row = await prisma.erpOpenApiKey.findUnique({ where: { keyId } });
    try {
      const out = await fn(keyId);
      const status = String(out?.status ?? (action === "suspend" ? "SUSPENDED" : "REVOKED")).toUpperCase();
      const saved = row ? await prisma.erpOpenApiKey.update({ where: { keyId }, data: { status } }) : null;
      await writeLog({
        keyId,
        keyName: row?.name ?? "",
        centerName: row?.centerName ?? "",
        action,
        actor,
        before: row?.status ?? "",
        after: status,
        detail: label,
      });
      res.json({ key: saved, status });
    } catch (e) {
      res.status(errStatus(e)).json({ error: errMsg(e) });
    }
  });
}

/** 연결 센터 변경 — mode: add(병합) | replace(전체 교체) | remove(일부 삭제) */
erpOpenApiRouter.post("/keys/:keyId/tenants", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const keyId = req.params.keyId;
  const mode = String(req.body?.mode ?? "").trim();
  const groupKeys = numArray(req.body?.groupKeys);
  if (!["add", "replace", "remove"].includes(mode)) return res.status(400).json({ error: "mode는 add·replace·remove 중 하나여야 합니다" });
  if (!groupKeys.length) return res.status(400).json({ error: "센터를 한 곳 이상 선택하세요" });

  const row = await prisma.erpOpenApiKey.findUnique({ where: { keyId } });
  try {
    const out = await changeTenants(keyId, mode as "add" | "replace" | "remove", groupKeys);
    const nextIds = strArray(out?.group_ids);
    const prevKeys = numArray(row?.groupKeys);
    const nextKeys =
      mode === "replace" ? groupKeys
      : mode === "add" ? [...new Set([...prevKeys, ...groupKeys])]
      : prevKeys.filter((k) => !groupKeys.includes(k));

    const saved = row
      ? await prisma.erpOpenApiKey.update({
          where: { keyId },
          data: { groupKeys: nextKeys, groupIds: nextIds.length ? nextIds : strArray(row.groupIds) },
        })
      : null;

    const named = async (keys: number[]) => {
      const rows = await prisma.erpOpenApiCenter.findMany({ where: { groupKey: { in: keys } } });
      const map = new Map(rows.map((r) => [r.groupKey, r.centerName]));
      return keys.map((k) => map.get(k) || `group_key ${k}`).join(", ");
    };
    await writeLog({
      keyId,
      keyName: row?.name ?? "",
      centerName: row?.centerName ?? "",
      action: `tenants_${mode}`,
      actor,
      before: await named(prevKeys),
      after: await named(nextKeys),
      detail: mode === "add" ? "센터 추가" : mode === "replace" ? "연결 센터 전체 교체" : "연결 센터 삭제",
    });
    res.json({ key: saved, sync: out });
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

erpOpenApiRouter.patch("/keys/:keyId", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const row = await prisma.erpOpenApiKey.findUnique({ where: { keyId: req.params.keyId } });
  if (!row) return res.status(404).json({ error: "키를 찾을 수 없습니다" });
  const memo = String(req.body?.memo ?? "").trim();
  const saved = await prisma.erpOpenApiKey.update({ where: { keyId: row.keyId }, data: { memo } });
  res.json({ key: saved });
});

// ─── 발급 요청 ─────────────────────────────────────────────────────────────

erpOpenApiRouter.get("/requests", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  try {
    const page = await listKeyRequests({
      status: String(req.query.status ?? "").trim() || undefined,
      search: String(req.query.search ?? "").trim() || undefined,
      page: Math.max(Number(req.query.page) || 0, 0),
      size: Math.min(Math.max(Number(req.query.size) || 20, 1), 200),
    });
    res.json(page);
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

erpOpenApiRouter.get("/requests/:no", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  try {
    res.json(await getKeyRequest(req.params.no));
  } catch (e) {
    res.status(errStatus(e)).json({ error: errMsg(e) });
  }
});

// ─── 작업 기록 ─────────────────────────────────────────────────────────────

erpOpenApiRouter.get("/logs", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req, res);
  if (!actor) return;
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
  const since = new Date(Date.now() - days * 86400_000);
  const logs = await prisma.erpOpenApiKeyLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ logs });
});
