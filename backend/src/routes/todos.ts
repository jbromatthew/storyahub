import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";

export const todosRouter = Router();
todosRouter.use(auth, requireAccess);

const STATUS_LABEL: Record<string, string> = { todo: "할 일", doing: "진행 중", done: "완료" };

type HistoryEntry = { when: string; who: string; what: string };
type SubItem = { id: string; text: string; done: boolean };

function pushHistory(history: HistoryEntry[], what: string, who = "나") {
  history.unshift({ when: new Date().toISOString(), who, what });
}

function normalizeSubs(raw: unknown): SubItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any, i) => ({
      id: String(s?.id ?? `s${i}`),
      text: String(s?.text ?? "").trim(),
      done: !!s?.done,
    }))
    .filter((s) => s.text);
}

function statusFromSubs(subs: SubItem[], fallback: string) {
  if (!subs.length) return fallback;
  if (subs.every((s) => s.done)) return "done";
  if (subs.some((s) => s.done)) return "doing";
  return "todo";
}

function matchesTodoSearch(
  t: {
    title: string;
    detail: string | null;
    result: string | null;
    history: unknown;
    attachments: unknown;
    subs: unknown;
  },
  ql: string
) {
  const parts = [t.title, t.detail, t.result];
  const history = Array.isArray(t.history) ? (t.history as HistoryEntry[]) : [];
  for (const h of history) parts.push(h.what, h.who);
  const attachments = Array.isArray(t.attachments) ? (t.attachments as { name?: string }[]) : [];
  for (const a of attachments) if (a.name) parts.push(a.name);
  const subs = normalizeSubs(t.subs);
  for (const s of subs) parts.push(s.text);
  return parts.filter(Boolean).join(" ").toLowerCase().includes(ql);
}

todosRouter.get("/", async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const where: { userId: string; status?: string } = { userId: req.userId! };
  if (status && ["todo", "doing", "done"].includes(status)) where.status = status;

  let items = await prisma.todo.findMany({ where, orderBy: { createdAt: "desc" } });
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter((t) => matchesTodoSearch(t, ql));
  }
  res.json(items);
});

todosRouter.get("/:id", async (req: AuthedRequest, res) => {
  const t = await prisma.todo.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!t) return res.status(404).json({ error: "not found" });
  res.json(t);
});

todosRouter.post("/", async (req: AuthedRequest, res) => {
  const { title, priority, due, detail, contactId, subs } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title required" });
  }
  const subItems = normalizeSubs(subs);
  const history: HistoryEntry[] = [{ when: new Date().toISOString(), who: "나", what: "할 일 등록" }];
  const t = await prisma.todo.create({
    data: {
      userId: req.userId!,
      title: title.trim(),
      priority: priority ?? "mid",
      due: due ? new Date(due) : null,
      detail,
      contactId,
      subs: subItems,
      status: statusFromSubs(subItems, "todo"),
      history,
    },
  });
  res.status(201).json(t);
});

todosRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const cur = await prisma.todo.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!cur) return res.status(404).json({ error: "not found" });

  const { status, priority, detail, result, attachment, subs } = req.body ?? {};
  const history = Array.isArray(cur.history) ? ([...(cur.history as HistoryEntry[])] as HistoryEntry[]) : [];

  let nextStatus = status ?? cur.status;
  let nextSubs = subs !== undefined ? normalizeSubs(subs) : normalizeSubs(cur.subs);

  if (subs !== undefined) {
    nextStatus = statusFromSubs(nextSubs, nextStatus);
    pushHistory(history, "하위 항목 변경");
  }

  if (status && status !== cur.status && subs === undefined) {
    const label = STATUS_LABEL[status] ?? status;
    pushHistory(history, `${label}(으)로 변경`);
    nextStatus = status;
  }
  if (priority !== undefined && priority !== cur.priority) {
    pushHistory(history, `중요도 변경 (${priority})`);
  }
  if (detail !== undefined && detail !== cur.detail) {
    pushHistory(history, detail?.trim() ? "상세 내용 수정" : "상세 내용 삭제");
  }
  if (result !== undefined && result !== cur.result) {
    pushHistory(history, result?.trim() ? "처리 결과 기록" : "처리 결과 삭제");
  }

  const attachments = Array.isArray(cur.attachments) ? [...(cur.attachments as object[])] : [];
  if (attachment && typeof attachment === "object") {
    attachments.push(attachment);
    const name = (attachment as { name?: string }).name ?? "파일";
    pushHistory(history, `첨부파일 추가: ${name}`);
  }

  const t = await prisma.todo.update({
    where: { id: cur.id },
    data: {
      status: nextStatus,
      priority: priority ?? cur.priority,
      detail: detail !== undefined ? detail : cur.detail,
      result: result !== undefined ? result : cur.result,
      subs: nextSubs,
      history,
      attachments,
    },
  });
  res.json(t);
});

todosRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const cur = await prisma.todo.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!cur) return res.status(404).json({ error: "not found" });
  await prisma.todo.delete({ where: { id: cur.id } });
  res.status(204).send();
});
