/**
 * 일일보고 → 노션 단방향 동기화.
 * ERP에서 보고 저장 시 노션 데이터베이스(캘린더 뷰 가능)에 날짜별 페이지를 생성/갱신한다.
 * 환경변수: NOTION_TOKEN, NOTION_DAILY_DB_ID (없으면 조용히 비활성)
 */
import { prisma } from "../db.js";

const NOTION = "https://api.notion.com/v1";

function headers(): Record<string, string> | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

type ChecklistItem = { text: string; done?: boolean; reason?: string; kind?: string; start?: string; end?: string };

function parseItems(raw: string): ChecklistItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) {
      return v
        .map((it: Record<string, unknown>) => ({
          text: String(it?.text ?? "").trim(),
          done: !!it?.done,
          reason: typeof it?.reason === "string" ? it.reason : "",
          kind: it?.kind === "header" ? "header" : it?.kind === "sub" ? "sub" : undefined,
          start: typeof it?.start === "string" ? it.start : undefined,
          end: typeof it?.end === "string" ? it.end : undefined,
        }))
        .filter((it) => it.text);
    }
  } catch { /* 자유 텍스트 */ }
  return String(raw).split("\n").map((s) => s.trim()).filter(Boolean).map((t) => ({ text: t }));
}

function rt(text: string) {
  return [{ type: "text", text: { content: text.slice(0, 1900) } }];
}

/** 소분류 — 노션엔 heading이 3단계뿐이라 굵은 문단으로 표현 */
function subBlock(text: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: `▸ ${text}`.slice(0, 1900) }, annotations: { bold: true } }],
    },
  };
}

function itemLabel(it: ChecklistItem): string {
  const range = it.start || it.end ? ` (📅 ${(it.start || "").slice(5)}~${(it.end || "").slice(5)})` : "";
  return `${it.text}${range}`;
}

function buildBlocks(did: string, missed: string, plan: string): unknown[] {
  const blocks: unknown[] = [];
  const push = (b: unknown) => { if (blocks.length < 95) blocks.push(b); };

  const didItems = parseItems(did);
  push({ object: "block", type: "heading_2", heading_2: { rich_text: rt("✅ 오늘 한 일") } });
  for (const it of didItems) {
    if (it.kind === "header") push({ object: "block", type: "heading_3", heading_3: { rich_text: rt(`▾ ${it.text}`) } });
    else if (it.kind === "sub") push(subBlock(it.text));
    else push({ object: "block", type: "to_do", to_do: { rich_text: rt(itemLabel(it)), checked: !!it.done } });
  }

  const missedItems = parseItems(missed).filter((m) => m.text);
  if (missedItems.length) {
    push({ object: "block", type: "heading_2", heading_2: { rich_text: rt("⚠️ 못한 일") } });
    for (const m of missedItems) {
      push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(`${m.text}${m.reason ? ` — 사유: ${m.reason}` : ""}`) } });
    }
  }

  const planItems = parseItems(plan);
  if (planItems.length) {
    push({ object: "block", type: "heading_2", heading_2: { rich_text: rt("📌 내일 할 일") } });
    for (const p of planItems) {
      if (p.kind === "header") push({ object: "block", type: "heading_3", heading_3: { rich_text: rt(`▾ ${p.text}`) } });
      else if (p.kind === "sub") push(subBlock(p.text));
      else push({ object: "block", type: "to_do", to_do: { rich_text: rt(itemLabel(p)), checked: false } });
    }
  }
  return blocks;
}

async function notionFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const h = headers();
  if (!h) throw new Error("NOTION_TOKEN 미설정");
  const res = await fetch(`${NOTION}${path}`, { ...init, headers: { ...h, ...(init?.headers as Record<string, string> | undefined) } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Notion ${res.status}: ${String(body?.message ?? "").slice(0, 200)}`);
  return body;
}

/* 노션의 select는 목록에 없는 이름을 거부한다.
   새 직원이 일일보고를 쓰면 그때마다 사람이 노션에 손으로 넣어줘야 했다.
   없으면 만들어 두고 쓴다. */
const knownOptions = new Map<string, Set<string>>();

type SelectOption = { id?: string; name: string; color?: string };

async function readOptions(dbId: string, prop: string): Promise<SelectOption[]> {
  const db = await notionFetch(`/databases/${dbId}`, { method: "GET" });
  const props = (db.properties ?? {}) as Record<string, { select?: { options?: SelectOption[] } }>;
  return props[prop]?.select?.options ?? [];
}

async function ensureSelectOption(dbId: string, prop: string, name: string): Promise<void> {
  const want = name.trim();
  if (!want) return;
  const cacheKey = `${dbId}:${prop}`;
  if (knownOptions.get(cacheKey)?.has(want)) return;

  const options = await readOptions(dbId, prop);
  const names = new Set(options.map((o) => o.name));
  knownOptions.set(cacheKey, names);
  if (names.has(want)) return;

  // 기존 선택지는 id로 그대로 넘긴다 — 이름만 보내면 색이 바뀌거나 사라질 수 있다
  await notionFetch(`/databases/${dbId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        [prop]: {
          select: {
            options: [
              ...options.map((o) => (o.id ? { id: o.id } : { name: o.name, color: o.color })),
              { name: want },
            ],
          },
        },
      },
    }),
  });
  names.add(want);
  console.log(`[notion] "${prop}" 선택지에 "${want}"를 추가했습니다`);
}

async function findExistingPage(dbId: string, date: string, author: string): Promise<string | null> {
  const body = await notionFetch(`/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        and: [
          { property: "날짜", date: { equals: date } },
          { property: "작성자", select: { equals: author } },
        ],
      },
      page_size: 1,
    }),
  });
  const results = (body.results as Array<{ id: string }>) || [];
  return results[0]?.id ?? null;
}

/** 블록의 순수 텍스트 — 기존 블록(plain_text)과 생성 예정 블록(text.content) 모두 처리 */
function blockPlain(b: Record<string, unknown>): string {
  const type = String(b.type ?? "");
  const data = (b[type] as { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> }) || {};
  return (data.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
}

/**
 * 기존 블록을 최대한 보존하며 원하는 목록으로 맞춘다.
 * 블록을 지우면 그 블록의 인라인 댓글도 사라지므로 전체 재생성 대신 diff 방식:
 * 같은 타입+텍스트 블록은 유지(체크 상태만 갱신), 새 항목은 제자리에 삽입, 없어진 것만 삭제.
 */
async function syncChildren(pageId: string, desired: unknown[]): Promise<void> {
  const body = await notionFetch(`/blocks/${pageId}/children?page_size=100`, { method: "GET" });
  const existing = (body.results as Array<Record<string, unknown>>) || [];
  const used = new Set<string>();
  let lastId: string | null = null;
  let pending: unknown[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const payload: Record<string, unknown> = { children: pending };
    if (lastId) payload.after = lastId;
    const res = await notionFetch(`/blocks/${pageId}/children`, { method: "PATCH", body: JSON.stringify(payload) });
    const results = (res.results as Array<{ id: string }>) || [];
    if (results.length) lastId = results[results.length - 1].id;
    pending = [];
  };
  for (const d of desired as Array<Record<string, unknown>>) {
    const dType = String(d.type ?? "");
    const dText = blockPlain(d);
    const match = existing.find((e) => !used.has(String(e.id)) && String(e.type) === dType && blockPlain(e) === dText);
    if (match) {
      await flush();
      used.add(String(match.id));
      if (dType === "to_do") {
        const eChecked = !!(match.to_do as { checked?: boolean } | undefined)?.checked;
        const dChecked = !!(d.to_do as { checked?: boolean } | undefined)?.checked;
        if (eChecked !== dChecked) {
          await notionFetch(`/blocks/${match.id}`, { method: "PATCH", body: JSON.stringify({ to_do: { checked: dChecked } }) }).catch(() => {});
        }
      }
      lastId = String(match.id);
    } else {
      pending.push(d);
    }
  }
  await flush();
  for (const e of existing) {
    if (!used.has(String(e.id))) await notionFetch(`/blocks/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
}

export async function syncDailyReportToNotion(report: {
  date: string; authorName: string; did: string; missed: string; plan: string;
}): Promise<void> {
  const dbId = process.env.NOTION_DAILY_DB_ID;
  if (!headers() || !dbId) return; // 미설정 시 조용히 생략

  const author = report.authorName || "미지정";
  const title = `${report.date} · ${author}`;
  const props = {
    "이름": { title: rt(title) },
    "날짜": { date: { start: report.date } },
    "작성자": { select: { name: author.slice(0, 90) } },
  };
  const blocks = buildBlocks(report.did, report.missed, report.plan);

  // 목록에 없는 이름이면 먼저 만들어 둔다. 실패해도 아래에서 한 번 더 잡는다.
  await ensureSelectOption(dbId, "작성자", author).catch((e) => {
    console.error("[notion] 작성자 선택지 추가 실패:", e instanceof Error ? e.message : e);
  });

  const existing = await findExistingPage(dbId, report.date, author);
  const write = async () => {
    if (existing) {
      await notionFetch(`/pages/${existing}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
      await syncChildren(existing, blocks);
    } else {
      await notionFetch(`/pages`, {
        method: "POST",
        body: JSON.stringify({ parent: { database_id: dbId }, properties: props, children: blocks }),
      });
    }
  };

  try {
    await write();
  } catch (e) {
    // 노션에서 선택지를 지웠거나 우리 기억이 낡았을 때 — 한 번만 다시 맞추고 재시도
    const msg = e instanceof Error ? e.message : String(e);
    if (!/select option/i.test(msg)) throw e;
    knownOptions.delete(`${dbId}:작성자`);
    await ensureSelectOption(dbId, "작성자", author);
    await write();
  }
}

/**
 * 일일보고 코멘트를 노션에 남긴다 (통합에 '코멘트 삽입' 권한 필요).
 * itemText와 일치하는 항목 블록을 찾으면 그 블록의 인라인 댓글로(노션 UI의 블록 댓글과 동일),
 * 못 찾으면 페이지 댓글로 폴백.
 */
export async function addDailyCommentToNotion(
  reportDate: string,
  reportAuthorName: string,
  opts: { itemText?: string; inlineText: string; pageText: string }
): Promise<void> {
  const dbId = process.env.NOTION_DAILY_DB_ID;
  if (!headers() || !dbId) return;
  const pageId = await findExistingPage(dbId, reportDate, reportAuthorName || "미지정");
  if (!pageId) return; // 보고가 아직 노션에 없으면 생략
  const itemText = (opts.itemText || "").trim();
  if (itemText) {
    try {
      const body = await notionFetch(`/blocks/${pageId}/children?page_size=100`, { method: "GET" });
      const blocks = (body.results as Array<Record<string, unknown>>) || [];
      const target = blocks.find((b) => {
        const type = String(b.type ?? "");
        if (type !== "to_do" && type !== "bulleted_list_item" && type !== "heading_3") return false;
        const plain = stripLabel(blockPlain(b).replace(/^▾\s*/, "").replace(/ — 사유: .*$/, ""));
        return plain === itemText;
      });
      if (target) {
        await notionFetch(`/comments`, {
          method: "POST",
          body: JSON.stringify({ parent: { block_id: String(target.id) }, rich_text: rt(opts.inlineText) }),
        });
        return;
      }
    } catch { /* 블록 매칭 실패 → 페이지 댓글 폴백 */ }
  }
  await notionFetch(`/comments`, {
    method: "POST",
    body: JSON.stringify({ parent: { page_id: pageId }, rich_text: rt(opts.pageText) }),
  });
}

export async function removeDailyReportFromNotion(date: string, authorName: string): Promise<void> {
  const dbId = process.env.NOTION_DAILY_DB_ID;
  if (!headers() || !dbId) return;
  const existing = await findExistingPage(dbId, date, authorName || "미지정");
  if (existing) await notionFetch(`/pages/${existing}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
}

/* ── 노션 댓글 역동기화 (노션에서 단 댓글 → ERP 코멘트) ── */

let botUserId: string | null = null;
const userNameCache = new Map<string, string>();

async function getBotUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const me = await notionFetch("/users/me", { method: "GET" });
  botUserId = String(me.id ?? "");
  return botUserId;
}

async function notionUserName(id: string): Promise<string> {
  if (userNameCache.has(id)) return userNameCache.get(id)!;
  try {
    const u = await notionFetch(`/users/${id}`, { method: "GET" });
    const name = String(u.name ?? "노션 사용자");
    userNameCache.set(id, name);
    return name;
  } catch {
    userNameCache.set(id, "노션 사용자");
    return "노션 사용자";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 노션 항목 라벨에서 기간 태그 제거 → ERP 항목 텍스트로 복원 */
function stripLabel(text: string): string {
  return text.replace(/\s*\(📅[^)]*\)\s*$/, "").trim();
}

type Anchor = { section: string; itemId: string; itemText: string };

/** 블록 텍스트를 보고의 체크리스트 항목과 매칭해 코멘트 앵커를 찾는다 */
function matchAnchor(blockText: string, did: string, plan: string): Anchor | null {
  const target = stripLabel(blockText);
  if (!target) return null;
  for (const [section, raw] of [["did", did], ["plan", plan]] as const) {
    for (const it of parseItems(raw)) {
      if (it.kind === "header" || it.kind === "sub") continue;
      if (it.text === target) {
        const id = (JSON.parse(raw || "[]") as Array<{ id?: string; text?: string }>).find((x) => String(x?.text ?? "").trim() === target)?.id;
        return { section, itemId: id || `t:${target}`, itemText: target };
      }
    }
  }
  return null;
}

async function importComment(
  reportId: string,
  c: Record<string, unknown>,
  bot: string,
  anchor: Anchor
): Promise<boolean> {
  const cid = String(c.id ?? "");
  const createdBy = (c.created_by as { id?: string }) || {};
  if (!cid || createdBy.id === bot) return false; // 우리가 보낸 댓글은 제외
  const exists = await prisma.erpDailyComment.findFirst({ where: { notionCommentId: cid } });
  if (exists) return false;
  const text = ((c.rich_text as Array<{ plain_text?: string }>) || []).map((t) => t.plain_text ?? "").join("").trim();
  if (!text) return false;
  const author = await notionUserName(createdBy.id ?? "");
  await prisma.erpDailyComment.create({
    data: {
      reportId,
      section: anchor.section,
      itemId: anchor.itemId,
      itemText: anchor.itemText,
      parentId: null,
      authorEmail: "notion",
      authorName: `${author} (노션)`,
      body: text,
      files: [],
      notionCommentId: cid,
    },
  });
  return true;
}

/** 최근 보고들의 노션 페이지·항목(블록) 댓글을 읽어 ERP 코멘트로 가져온다. */
export async function pullNotionComments(): Promise<number> {
  const dbId = process.env.NOTION_DAILY_DB_ID;
  if (!headers() || !dbId) return 0;

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const reports = await prisma.erpDailyReport.findMany({
    where: { date: { gte: since } },
    select: { id: true, date: true, authorName: true, did: true, plan: true },
  });
  if (!reports.length) return 0;

  const bot = await getBotUserId().catch(() => "");
  let imported = 0;

  for (const r of reports) {
    try {
      const pageId = await findExistingPage(dbId, r.date, r.authorName || "미지정");
      if (!pageId) continue;

      // 1) 페이지 전체 댓글
      const pageBody = await notionFetch(`/comments?block_id=${pageId}&page_size=50`, { method: "GET" });
      for (const c of (pageBody.results as Array<Record<string, unknown>>) || []) {
        if (await importComment(r.id, c, bot, { section: "did", itemId: "notion-page", itemText: "📥 노션 댓글" })) imported++;
      }

      // 2) 항목(블록) 인라인 댓글 — 블록 텍스트로 ERP 항목에 매칭
      const childrenBody = await notionFetch(`/blocks/${pageId}/children?page_size=100`, { method: "GET" });
      const blocks = (childrenBody.results as Array<Record<string, unknown>>) || [];
      for (const b of blocks) {
        const type = String(b.type ?? "");
        if (type !== "to_do" && type !== "bulleted_list_item") continue;
        const blockData = (b[type] as { rich_text?: Array<{ plain_text?: string }> }) || {};
        const blockText = (blockData.rich_text || []).map((t) => t.plain_text ?? "").join("");
        await sleep(120); // 노션 rate limit 배려
        const cb = await notionFetch(`/comments?block_id=${String(b.id)}&page_size=20`, { method: "GET" }).catch(() => ({ results: [] }));
        const comments = (cb.results as Array<Record<string, unknown>>) || [];
        if (!comments.length) continue;
        const anchor = matchAnchor(blockText, r.did, r.plan)
          ?? { section: "did", itemId: "notion-page", itemText: `📥 ${stripLabel(blockText).slice(0, 60) || "노션 댓글"}` };
        for (const c of comments) {
          if (await importComment(r.id, c, bot, anchor)) imported++;
        }
      }
    } catch (e) {
      console.error("[notion-pull]", r.date, e instanceof Error ? e.message : e);
    }
  }
  if (imported) console.log(`[notion-pull] 노션 댓글 ${imported}건 가져옴`);
  return imported;
}
