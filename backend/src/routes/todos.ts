import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";

export const todosRouter = Router();
todosRouter.use(auth);

todosRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(await prisma.todo.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } }));
});

todosRouter.post("/", async (req: AuthedRequest, res) => {
  const { title, priority, due, detail, contactId } = req.body ?? {};
  const t = await prisma.todo.create({
    data: { userId: req.userId!, title, priority: priority ?? "mid", due: due ? new Date(due) : null, detail, contactId },
  });
  res.status(201).json(t);
});

// 상태 변경 시 처리 히스토리에 타임라인 한 줄 append
todosRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const cur = await prisma.todo.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!cur) return res.status(404).json({ error: "not found" });

  const { status, priority, detail, result, attachment } = req.body ?? {};
  const history = Array.isArray(cur.history) ? (cur.history as any[]) : [];
  if (status && status !== cur.status) {
    history.unshift({ when: new Date().toISOString(), who: "나", what: `${status} (으)로 변경` });
  }
  const attachments = Array.isArray(cur.attachments) ? (cur.attachments as any[]) : [];
  if (attachment) attachments.push(attachment);

  const t = await prisma.todo.update({
    where: { id: cur.id },
    data: {
      status: status ?? cur.status,
      priority: priority ?? cur.priority,
      detail: detail ?? cur.detail,
      result: result ?? cur.result,
      history,
      attachments,
    },
  });
  res.json(t);
});
