/**
 * 센터 여정관리 — 키오스크 자산 · AS 티켓 · 세일즈/CXM 접점.
 *
 * 모두 group_key에 매달린다. 무슨 기록이든 남길 때마다 ErpCenterEvent에
 * 요약 한 줄을 같이 쌓아, 센터 카드가 타임라인 하나만 읽으면 되게 한다.
 * 담당자는 센터에 붙박이로 두지 않고 건별 작성자로 남긴다.
 */
import { Router, type Response } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { requireErpMember } from "../middleware/requireErpMember.js";
import { env } from "../env.js";

export const erpCenterOpsRouter = Router();
erpCenterOpsRouter.use(auth, requireAccess);
if (env.erpMode) erpCenterOpsRouter.use(requireErpMember);

const WARRANTY_YEARS = 1; // 설치일로부터 1년
const CHANNELS = ["kakao", "phone"];
const RESOLUTIONS = ["free", "paid", "swap", "rejected"];
const AS_STATUS = ["received", "assigned", "visiting", "closed"];
const ASSET_STATUS = ["ACTIVE", "REPAIR", "SWAPPED", "REMOVED"];
const TEAMS = ["sales", "cx"];

const RES_LABEL: Record<string, string> = {
  free: "무상 AS", paid: "유상 AS", swap: "리퍼 교체", rejected: "수리 거절",
};

function fail(res: Response, msg: string, code = 400) {
  res.status(code).json({ error: msg });
  return null;
}

async function actorOf(req: AuthedRequest) {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  const emp = user ? await prisma.erpEmployee.findUnique({ where: { userId: user.id } }) : null;
  const email = (user?.email ?? "").toLowerCase();
  return { email, name: emp?.name || user?.name || email };
}

const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
/** 시리얼은 영문·숫자 조합 — 대문자로 통일해 저장한다 */
const serialOf = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
const dateOf = (v: unknown): Date | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00+09:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const intOf = (v: unknown): number | null => {
  const s = String(v ?? "").replace(/[^\d-]/g, "");
  return s === "" ? null : Number(s);
};
const addYears = (d: Date, n: number) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
};

async function logEvent(e: {
  groupKey: number; type: string; title: string; body?: string;
  occurredAt?: Date; actor: { email: string; name: string }; team?: string;
  refTable?: string; refId?: string; amount?: number | null; meta?: Record<string, unknown>;
}) {
  await prisma.erpCenterEvent.create({
    data: {
      groupKey: e.groupKey,
      occurredAt: e.occurredAt ?? new Date(),
      type: e.type,
      title: e.title,
      body: e.body ?? "",
      actorEmail: e.actor.email,
      actorName: e.actor.name,
      team: e.team ?? "",
      refTable: e.refTable ?? "",
      refId: e.refId ?? "",
      amount: e.amount ?? null,
      meta: (e.meta ?? {}) as never,
    },
  });
}

// ─── 협력업체 (AS 방문 팀 · 설치팀 선택지) ──────────────────────────────────

erpCenterOpsRouter.get("/teams", async (_req: AuthedRequest, res) => {
  const rows = await prisma.erpConstructionTeam.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, contact: true, employees: true },
  });
  res.json({
    teams: rows.map((t) => {
      let people: string[] = [];
      try {
        const raw = JSON.parse(t.employees || "[]");
        people = (Array.isArray(raw) ? raw : [])
          .map((p) => (typeof p === "string" ? p : String((p as { name?: string })?.name ?? "")))
          .filter(Boolean);
      } catch {
        people = [];
      }
      return { id: t.id, name: t.name, contact: t.contact ?? "", people };
    }),
  });
});

// ─── 키오스크 자산 ──────────────────────────────────────────────────────────

erpCenterOpsRouter.get("/centers/:groupKey/assets", async (req: AuthedRequest, res) => {
  const groupKey = Number(req.params.groupKey);
  const assets = await prisma.erpCenterAsset.findMany({
    where: { groupKey },
    orderBy: [{ status: "asc" }, { installedAt: "desc" }],
  });
  res.json({ assets });
});

/** 자산 등록 — 붙여넣기 일괄도 같은 경로로 받는다 (rows 배열) */
erpCenterOpsRouter.post("/centers/:groupKey/assets", async (req: AuthedRequest, res) => {
  const groupKey = Number(req.params.groupKey);
  if (!Number.isInteger(groupKey) || groupKey <= 0) return fail(res, "센터 키가 올바르지 않습니다");
  const actor = await actorOf(req);
  const b = req.body ?? {};

  const incoming: Record<string, unknown>[] = Array.isArray(b.rows) ? b.rows : [b];
  if (!incoming.length) return fail(res, "등록할 내용이 없습니다");
  if (incoming.length > 100) return fail(res, "한 번에 100대까지만 등록할 수 있습니다");

  const teamName = str(b.teamName, 100);
  const teamId = str(b.teamId, 60);
  const installer = str(b.installer, 60);
  const sharedInstalledAt = dateOf(b.installedAt);

  const made: unknown[] = [];
  const skipped: { serial: string; reason: string }[] = [];

  for (const raw of incoming) {
    const serial = serialOf(raw.serial);
    const kind = str(raw.kind ?? b.kind, 40);
    if (!serial) { skipped.push({ serial: "", reason: "시리얼 없음" }); continue; }
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(serial)) {
      skipped.push({ serial, reason: "시리얼 형식이 아닙니다 (영문·숫자)" });
      continue;
    }
    if (!kind) { skipped.push({ serial, reason: "기종 없음" }); continue; }

    const dup = await prisma.erpCenterAsset.findUnique({ where: { serial } });
    if (dup) {
      skipped.push({
        serial,
        reason: dup.groupKey === groupKey ? "이미 이 센터에 등록됨" : `다른 센터에 등록됨 (group_key ${dup.groupKey})`,
      });
      continue;
    }

    const installedAt = dateOf(raw.installedAt) ?? sharedInstalledAt;
    const row = await prisma.erpCenterAsset.create({
      data: {
        groupKey,
        kind,
        serial,
        installedAt,
        // 보증은 설치일로부터 1년
        warrantyUntil: installedAt ? addYears(installedAt, WARRANTY_YEARS) : null,
        teamId: str(raw.teamId ?? teamId, 60),
        teamName: str(raw.teamName ?? teamName, 100),
        installer: str(raw.installer ?? installer, 60),
        location: str(raw.location, 100),
        note: str(raw.note, 300),
        createdEmail: actor.email,
        createdName: actor.name,
      },
    });
    made.push(row);
    await logEvent({
      groupKey,
      type: "asset",
      title: `${kind} 설치 · ${serial}`,
      body: [row.teamName, row.installer].filter(Boolean).join(" · "),
      occurredAt: installedAt ?? new Date(),
      actor,
      team: "install",
      refTable: "ErpCenterAsset",
      refId: row.id,
    });
  }

  res.json({ assets: made, added: made.length, skipped });
});

erpCenterOpsRouter.patch("/assets/:id", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req);
  const row = await prisma.erpCenterAsset.findUnique({ where: { id: req.params.id } });
  if (!row) return fail(res, "자산을 찾을 수 없습니다", 404);
  const b = req.body ?? {};

  const data: Record<string, unknown> = {};
  if (b.kind !== undefined) data.kind = str(b.kind, 40);
  if (b.location !== undefined) data.location = str(b.location, 100);
  if (b.note !== undefined) data.note = str(b.note, 300);
  if (b.teamId !== undefined) data.teamId = str(b.teamId, 60);
  if (b.teamName !== undefined) data.teamName = str(b.teamName, 100);
  if (b.installer !== undefined) data.installer = str(b.installer, 60);
  if (b.installedAt !== undefined) {
    const d = dateOf(b.installedAt);
    data.installedAt = d;
    data.warrantyUntil = d ? addYears(d, WARRANTY_YEARS) : null;
  }
  if (b.status !== undefined) {
    const s = str(b.status, 20).toUpperCase();
    if (!ASSET_STATUS.includes(s)) return fail(res, "자산 상태가 올바르지 않습니다");
    data.status = s;
    if (s === "REMOVED" && !row.removedAt) data.removedAt = new Date();
    if (s !== "REMOVED") data.removedAt = null;
  }
  // 센터 이동 — 행을 새로 만들지 않고 옮긴다. 기계 한 대의 일생이 이어진다.
  if (b.moveToGroupKey !== undefined) {
    const to = Number(b.moveToGroupKey);
    if (!Number.isInteger(to) || to <= 0) return fail(res, "옮길 센터 키가 올바르지 않습니다");
    if (to !== row.groupKey) {
      data.groupKey = to;
      data.movedFromGroupKey = row.groupKey;
      const from = await prisma.erpCenter.findUnique({ where: { groupKey: row.groupKey } });
      const dest = await prisma.erpCenter.findUnique({ where: { groupKey: to } });
      await logEvent({
        groupKey: row.groupKey, type: "asset", title: `${row.kind} 반출 · ${row.serial}`,
        body: `${dest?.name || `group_key ${to}`}(으)로 이동`, actor, team: "install",
        refTable: "ErpCenterAsset", refId: row.id,
      });
      await logEvent({
        groupKey: to, type: "asset", title: `${row.kind} 반입 · ${row.serial}`,
        body: `${from?.name || `group_key ${row.groupKey}`}에서 이동`, actor, team: "install",
        refTable: "ErpCenterAsset", refId: row.id,
      });
    }
  }

  const saved = await prisma.erpCenterAsset.update({ where: { id: row.id }, data });
  res.json({ asset: saved });
});

erpCenterOpsRouter.delete("/assets/:id", async (req: AuthedRequest, res) => {
  const row = await prisma.erpCenterAsset.findUnique({ where: { id: req.params.id } });
  if (!row) return fail(res, "자산을 찾을 수 없습니다", 404);
  const used = await prisma.erpAsTicket.count({ where: { assetId: row.id } });
  if (used) return fail(res, `이 기계에 걸린 AS ${used}건이 있어 삭제할 수 없습니다. 상태를 '철거'로 바꿔주세요.`);
  await prisma.erpCenterAsset.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

// ─── AS 티켓 ────────────────────────────────────────────────────────────────

/** AS-260903-001 — 그날 몇 번째인지로 번호를 붙인다 */
async function nextTicketNo(): Promise<string> {
  const now = new Date(Date.now() + 9 * 3600_000);
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
  const todayCount = await prisma.erpAsTicket.count({ where: { ticketNo: { startsWith: `AS-${ymd}-` } } });
  return `AS-${ymd}-${String(todayCount + 1).padStart(3, "0")}`;
}

erpCenterOpsRouter.get("/as", async (req: AuthedRequest, res) => {
  const groupKey = Number(req.query.groupKey);
  const status = str(req.query.status, 20);
  const resolution = str(req.query.resolution, 20);
  const teamId = str(req.query.teamId, 60);
  const where: Record<string, unknown> = {};
  if (Number.isInteger(groupKey) && groupKey > 0) where.groupKey = groupKey;
  if (status === "open") where.status = { not: "closed" };
  else if (AS_STATUS.includes(status)) where.status = status;
  if (RESOLUTIONS.includes(resolution)) where.resolution = resolution;
  if (teamId) where.teamId = teamId;

  const tickets = await prisma.erpAsTicket.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: Math.min(Math.max(Number(req.query.limit) || 200, 1), 500),
  });
  res.json({ tickets });
});

erpCenterOpsRouter.post("/as", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req);
  const b = req.body ?? {};
  const groupKey = Number(b.groupKey);
  if (!Number.isInteger(groupKey) || groupKey <= 0) return fail(res, "센터를 선택하세요");

  const channel = str(b.channel, 20);
  if (!CHANNELS.includes(channel)) return fail(res, "접수 경로를 선택하세요 (채널톡·전화)");
  const symptom = str(b.symptom, 500);
  if (!symptom) return fail(res, "증상을 입력하세요");

  const receivedAt = dateOf(b.receivedAt) ?? new Date();
  const assetId = str(b.assetId, 40);
  const asset = assetId ? await prisma.erpCenterAsset.findUnique({ where: { id: assetId } }) : null;

  // 접수 시점 기준 보증 판정을 박아둔다 — 나중에 설치일이 바뀌어도 흔들리지 않는다
  const warrantyAtReceipt = asset?.warrantyUntil ? receivedAt <= asset.warrantyUntil : null;

  const ticket = await prisma.erpAsTicket.create({
    data: {
      ticketNo: await nextTicketNo(),
      groupKey,
      assetId: asset?.id ?? "",
      serial: asset?.serial ?? serialOf(b.serial),
      receivedAt,
      channel,
      symptom,
      cause: str(b.cause, 500),
      teamId: str(b.teamId, 60),
      teamName: str(b.teamName, 100),
      technician: str(b.technician, 60),
      status: str(b.teamId) ? "assigned" : "received",
      warrantyAtReceipt,
      reopenOf: str(b.reopenOf, 40),
      note: str(b.note, 1000),
      createdEmail: actor.email,
      createdName: actor.name,
    },
  });

  await logEvent({
    groupKey, type: "as", title: `AS 접수 · ${symptom.slice(0, 40)}`,
    body: [ticket.ticketNo, channel === "kakao" ? "채널톡" : "전화", ticket.serial].filter(Boolean).join(" · "),
    occurredAt: receivedAt, actor, team: "cx", refTable: "ErpAsTicket", refId: ticket.id,
  });
  res.json({ ticket });
});

erpCenterOpsRouter.patch("/as/:id", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req);
  const t = await prisma.erpAsTicket.findUnique({ where: { id: req.params.id } });
  if (!t) return fail(res, "AS 티켓을 찾을 수 없습니다", 404);
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};

  for (const [k, max] of [["symptom", 500], ["cause", 500], ["action", 1000], ["note", 1000],
    ["teamId", 60], ["teamName", 100], ["technician", 60], ["rejectReason", 300]] as const) {
    if (b[k] !== undefined) data[k] = str(b[k], max);
  }
  if (b.visitedAt !== undefined) data.visitedAt = dateOf(b.visitedAt);
  if (b.amount !== undefined) data.amount = intOf(b.amount);
  if (b.status !== undefined) {
    const s = str(b.status, 20);
    if (!AS_STATUS.includes(s)) return fail(res, "상태가 올바르지 않습니다");
    data.status = s;
  }
  // 팀을 배정하면 상태를 같이 올려준다 — 손이 덜 가게
  if (b.teamId !== undefined && str(b.teamId) && t.status === "received" && b.status === undefined) {
    data.status = "assigned";
  }

  // ─ 종결 ─
  if (b.resolution !== undefined) {
    const r = str(b.resolution, 20);
    if (r && !RESOLUTIONS.includes(r)) return fail(res, "종결 유형이 올바르지 않습니다");
    data.resolution = r;
    if (r) {
      data.status = "closed";
      data.closedAt = dateOf(b.closedAt) ?? new Date();
      if (r === "rejected" && !str(b.rejectReason ?? t.rejectReason)) {
        return fail(res, "수리 거절은 사유를 적어야 합니다");
      }

      // 리퍼 교체 — 티켓 하나가 자산 두 건을 갱신한다
      if (r === "swap") {
        const outSerial = serialOf(b.swapOutSerial) || t.serial;
        const inSerial = serialOf(b.swapInSerial);
        if (!outSerial || !inSerial) return fail(res, "리퍼 교체는 회수·투입 시리얼이 둘 다 필요합니다");
        if (outSerial === inSerial) return fail(res, "회수와 투입 시리얼이 같습니다");

        const outAsset = await prisma.erpCenterAsset.findUnique({ where: { serial: outSerial } });
        if (!outAsset) return fail(res, `회수 시리얼 ${outSerial}이(가) 자산에 없습니다`);
        const inDup = await prisma.erpCenterAsset.findUnique({ where: { serial: inSerial } });
        if (inDup && inDup.status !== "REMOVED") {
          return fail(res, `투입 시리얼 ${inSerial}은(는) 이미 등록돼 있습니다 (group_key ${inDup.groupKey})`);
        }

        const when = dateOf(b.closedAt) ?? new Date();
        await prisma.erpCenterAsset.update({
          where: { id: outAsset.id },
          data: { status: "SWAPPED", removedAt: when },
        });
        if (inDup) {
          await prisma.erpCenterAsset.update({
            where: { id: inDup.id },
            data: {
              groupKey: t.groupKey, movedFromGroupKey: inDup.groupKey, status: "ACTIVE",
              removedAt: null, installedAt: when, warrantyUntil: addYears(when, WARRANTY_YEARS),
              kind: outAsset.kind, teamId: str(b.teamId ?? t.teamId, 60),
              teamName: str(b.teamName ?? t.teamName, 100),
            },
          });
        } else {
          await prisma.erpCenterAsset.create({
            data: {
              groupKey: t.groupKey, kind: outAsset.kind, serial: inSerial,
              installedAt: when, warrantyUntil: addYears(when, WARRANTY_YEARS),
              teamId: str(b.teamId ?? t.teamId, 60), teamName: str(b.teamName ?? t.teamName, 100),
              installer: str(b.technician ?? t.technician, 60),
              location: outAsset.location, note: `리퍼 교체 (${outSerial} 회수)`,
              createdEmail: actor.email, createdName: actor.name,
            },
          });
        }
        data.swapOutSerial = outSerial;
        data.swapInSerial = inSerial;
        data.assetId = "";
        data.serial = inSerial;
      }
    }
  }

  const saved = await prisma.erpAsTicket.update({ where: { id: t.id }, data });

  if (saved.resolution && saved.resolution !== t.resolution) {
    const label = RES_LABEL[saved.resolution] ?? saved.resolution;
    const bits = [saved.ticketNo, saved.teamName, saved.technician].filter(Boolean);
    if (saved.resolution === "swap") bits.push(`${saved.swapOutSerial} → ${saved.swapInSerial}`);
    if (saved.resolution === "rejected" && saved.rejectReason) bits.push(saved.rejectReason);
    await logEvent({
      groupKey: saved.groupKey, type: "as", title: `AS 종결 · ${label}`,
      body: bits.join(" · "), occurredAt: saved.closedAt ?? new Date(), actor,
      team: saved.teamName ? "install" : "cx",
      refTable: "ErpAsTicket", refId: saved.id, amount: saved.amount,
    });
  }
  res.json({ ticket: saved });
});

erpCenterOpsRouter.delete("/as/:id", async (req: AuthedRequest, res) => {
  const t = await prisma.erpAsTicket.findUnique({ where: { id: req.params.id } });
  if (!t) return fail(res, "AS 티켓을 찾을 수 없습니다", 404);
  if (t.resolution) return fail(res, "종결된 티켓은 삭제할 수 없습니다");
  await prisma.erpAsTicket.delete({ where: { id: t.id } });
  await prisma.erpCenterEvent.deleteMany({ where: { refTable: "ErpAsTicket", refId: t.id } });
  res.json({ ok: true });
});

// ─── 세일즈 · CXM 접점 ──────────────────────────────────────────────────────

erpCenterOpsRouter.get("/contacts", async (req: AuthedRequest, res) => {
  const groupKey = Number(req.query.groupKey);
  const team = str(req.query.team, 10);
  const where: Record<string, unknown> = {};
  if (Number.isInteger(groupKey) && groupKey > 0) where.groupKey = groupKey;
  if (TEAMS.includes(team)) where.team = team;
  // 오늘 할 일 — 다음 액션일이 지난 것
  if (req.query.due === "1") where.nextActionAt = { lte: new Date() };

  const contacts = await prisma.erpCenterContact.findMany({
    where,
    orderBy: req.query.due === "1" ? { nextActionAt: "asc" } : { occurredAt: "desc" },
    take: Math.min(Math.max(Number(req.query.limit) || 200, 1), 500),
  });
  // 할 일 목록은 센터명을 같이 준다 — 목록만 보고 전화할 수 있게
  const keys = [...new Set(contacts.map((c) => c.groupKey))];
  const centers = keys.length
    ? await prisma.erpCenter.findMany({ where: { groupKey: { in: keys } }, select: { groupKey: true, name: true, ownerPhone: true } })
    : [];
  const nameOf = new Map(centers.map((c) => [c.groupKey, c]));
  res.json({
    contacts: contacts.map((c) => ({
      ...c,
      centerName: nameOf.get(c.groupKey)?.name ?? "",
      centerPhone: nameOf.get(c.groupKey)?.ownerPhone ?? "",
    })),
  });
});

erpCenterOpsRouter.post("/contacts", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req);
  const b = req.body ?? {};
  const groupKey = Number(b.groupKey);
  if (!Number.isInteger(groupKey) || groupKey <= 0) return fail(res, "센터를 선택하세요");
  const team = str(b.team, 10);
  if (!TEAMS.includes(team)) return fail(res, "팀을 선택하세요 (세일즈·CXM)");
  const summary = str(b.summary, 1000);
  if (!summary) return fail(res, "한 줄 요약을 입력하세요");

  const row = await prisma.erpCenterContact.create({
    data: {
      groupKey, team,
      kind: str(b.kind, 30) || "전화",
      occurredAt: dateOf(b.occurredAt) ?? new Date(),
      actorEmail: actor.email,
      actorName: actor.name,
      summary,
      outcome: str(b.outcome, 500),
      nextActionAt: dateOf(b.nextActionAt),
      nextAction: str(b.nextAction, 300),
      sentiment: str(b.sentiment, 10),
    },
  });

  await logEvent({
    groupKey, type: team, title: `${row.kind} · ${summary.slice(0, 40)}`,
    body: [row.outcome, row.nextAction && `다음: ${row.nextAction}`].filter(Boolean).join(" · "),
    occurredAt: row.occurredAt, actor, team,
    refTable: "ErpCenterContact", refId: row.id,
  });
  res.json({ contact: row });
});

erpCenterOpsRouter.patch("/contacts/:id", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req);
  const row = await prisma.erpCenterContact.findUnique({ where: { id: req.params.id } });
  if (!row) return fail(res, "기록을 찾을 수 없습니다", 404);
  if (row.actorEmail && row.actorEmail !== actor.email) {
    return fail(res, "작성자만 수정할 수 있습니다", 403);
  }
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.kind !== undefined) data.kind = str(b.kind, 30);
  if (b.summary !== undefined) data.summary = str(b.summary, 1000);
  if (b.outcome !== undefined) data.outcome = str(b.outcome, 500);
  if (b.nextAction !== undefined) data.nextAction = str(b.nextAction, 300);
  if (b.sentiment !== undefined) data.sentiment = str(b.sentiment, 10);
  if (b.occurredAt !== undefined) data.occurredAt = dateOf(b.occurredAt) ?? row.occurredAt;
  // 할 일을 끝냈으면 다음 액션일을 비운다
  if (b.nextActionAt !== undefined) data.nextActionAt = dateOf(b.nextActionAt);
  const saved = await prisma.erpCenterContact.update({ where: { id: row.id }, data });
  res.json({ contact: saved });
});

erpCenterOpsRouter.delete("/contacts/:id", async (req: AuthedRequest, res) => {
  const actor = await actorOf(req);
  const row = await prisma.erpCenterContact.findUnique({ where: { id: req.params.id } });
  if (!row) return fail(res, "기록을 찾을 수 없습니다", 404);
  if (row.actorEmail && row.actorEmail !== actor.email) {
    return fail(res, "작성자만 삭제할 수 있습니다", 403);
  }
  await prisma.erpCenterContact.delete({ where: { id: row.id } });
  await prisma.erpCenterEvent.deleteMany({ where: { refTable: "ErpCenterContact", refId: row.id } });
  res.json({ ok: true });
});
