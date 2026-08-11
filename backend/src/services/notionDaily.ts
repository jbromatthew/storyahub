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
          kind: it?.kind === "header" ? "header" : undefined,
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

async function clearChildren(pageId: string): Promise<void> {
  const body = await notionFetch(`/blocks/${pageId}/children?page_size=100`, { method: "GET" });
  const children = (body.results as Array<{ id: string }>) || [];
  for (const c of children) {
    await notionFetch(`/blocks/${c.id}`, { method: "DELETE" }).catch(() => {});
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

  const existing = await findExistingPage(dbId, report.date, author);
  if (existing) {
    await notionFetch(`/pages/${existing}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
    await clearChildren(existing);
    if (blocks.length) {
      await notionFetch(`/blocks/${existing}/children`, { method: "PATCH", body: JSON.stringify({ children: blocks }) });
    }
  } else {
    await notionFetch(`/pages`, {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: dbId }, properties: props, children: blocks }),
    });
  }
}

/** 일일보고 코멘트를 해당 날짜 노션 페이지의 댓글로 남긴다 (통합에 '코멘트 삽입' 권한 필요) */
export async function addDailyCommentToNotion(
  reportDate: string,
  reportAuthorName: string,
  text: string
): Promise<void> {
  const dbId = process.env.NOTION_DAILY_DB_ID;
  if (!headers() || !dbId) return;
  const pageId = await findExistingPage(dbId, reportDate, reportAuthorName || "미지정");
  if (!pageId) return; // 보고가 아직 노션에 없으면 생략
  await notionFetch(`/comments`, {
    method: "POST",
    body: JSON.stringify({ parent: { page_id: pageId }, rich_text: rt(text) }),
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

/** 최근 보고들의 노션 페이지 댓글을 읽어 ERP 코멘트로 가져온다. */
export async function pullNotionComments(): Promise<number> {
  const dbId = process.env.NOTION_DAILY_DB_ID;
  if (!headers() || !dbId) return 0;

  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const reports = await prisma.erpDailyReport.findMany({
    where: { date: { gte: since } },
    select: { id: true, date: true, authorName: true },
  });
  if (!reports.length) return 0;

  const bot = await getBotUserId().catch(() => "");
  let imported = 0;

  for (const r of reports) {
    try {
      const pageId = await findExistingPage(dbId, r.date, r.authorName || "미지정");
      if (!pageId) continue;
      const body = await notionFetch(`/comments?block_id=${pageId}&page_size=50`, { method: "GET" });
      const comments = (body.results as Array<Record<string, unknown>>) || [];
      for (const c of comments) {
        const cid = String(c.id ?? "");
        const createdBy = (c.created_by as { id?: string }) || {};
        if (!cid || createdBy.id === bot) continue; // 우리가 보낸 댓글은 제외
        const exists = await prisma.erpDailyComment.findFirst({ where: { notionCommentId: cid } });
        if (exists) continue;
        const text = ((c.rich_text as Array<{ plain_text?: string }>) || [])
          .map((t) => t.plain_text ?? "").join("").trim();
        if (!text) continue;
        const author = await notionUserName(createdBy.id ?? "");
        await prisma.erpDailyComment.create({
          data: {
            reportId: r.id,
            section: "did",
            itemId: "notion-page",
            itemText: "📥 노션 댓글",
            parentId: null,
            authorEmail: "notion",
            authorName: `${author} (노션)`,
            body: text,
            files: [],
            notionCommentId: cid,
          },
        });
        imported++;
      }
    } catch (e) {
      console.error("[notion-pull]", r.date, e instanceof Error ? e.message : e);
    }
  }
  if (imported) console.log(`[notion-pull] 노션 댓글 ${imported}건 가져옴`);
  return imported;
}
