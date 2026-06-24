import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { ensureFriendContact } from "../services/shareAccess.js";

export const friendsRouter = Router();
friendsRouter.use(auth, requireAccess);

function friendUserSelect() {
  return { id: true, email: true, name: true };
}

friendsRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rows = await prisma.userFriend.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: friendUserSelect() },
      addressee: { select: friendUserSelect() },
    },
    orderBy: { acceptedAt: "desc" },
  });
  const friends = rows.map((r) => {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    return {
      id: r.id,
      user: other,
      contactId: r.contactId,
      since: r.acceptedAt,
    };
  });
  res.json(friends);
});

friendsRouter.get("/pending", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const incoming = await prisma.userFriend.findMany({
    where: { addresseeId: userId, status: "pending" },
    include: { requester: { select: friendUserSelect() } },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    incoming.map((r) => ({
      id: r.id,
      user: r.requester,
      createdAt: r.createdAt,
    })),
  );
});

friendsRouter.post("/request", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return res.status(400).json({ error: "이메일을 입력하세요" });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return res.status(404).json({ error: "not found" });
  if (me.email.toLowerCase() === email) {
    return res.status(400).json({ error: "본인 이메일은 추가할 수 없어요" });
  }

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) return res.status(404).json({ error: "가입된 Storyahub 계정을 찾을 수 없어요" });

  const existing = await prisma.userFriend.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: userId },
      ],
    },
  });
  if (existing?.status === "accepted") {
    return res.status(409).json({ error: "이미 친구예요" });
  }
  if (existing?.status === "pending") {
    if (existing.requesterId === userId) {
      return res.status(409).json({ error: "이미 친구 요청을 보냈어요" });
    }
    return res.status(409).json({ error: "상대방이 이미 친구 요청을 보냈어요. 받은 요청에서 수락하세요." });
  }

  const row = await prisma.userFriend.create({
    data: { requesterId: userId, addresseeId: target.id, status: "pending" },
    include: { addressee: { select: friendUserSelect() } },
  });
  res.json({ id: row.id, user: row.addressee, status: "pending" });
});

friendsRouter.post("/:id/accept", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const row = await prisma.userFriend.findFirst({
    where: { id: req.params.id, addresseeId: userId, status: "pending" },
    include: {
      requester: { select: friendUserSelect() },
      addressee: { select: friendUserSelect() },
    },
  });
  if (!row) return res.status(404).json({ error: "not found" });

  const requesterContact = await ensureFriendContact(row.requesterId, row.addressee);
  const addresseeContact = await ensureFriendContact(row.addresseeId, row.requester);

  const updated = await prisma.userFriend.update({
    where: { id: row.id },
    data: {
      status: "accepted",
      acceptedAt: new Date(),
      contactId: requesterContact.id,
    },
  });

  res.json({
    id: updated.id,
    user: row.requester,
    contactId: addresseeContact.id,
    since: updated.acceptedAt,
  });
});

friendsRouter.post("/:id/decline", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const row = await prisma.userFriend.findFirst({
    where: { id: req.params.id, addresseeId: userId, status: "pending" },
  });
  if (!row) return res.status(404).json({ error: "not found" });
  await prisma.userFriend.update({ where: { id: row.id }, data: { status: "declined" } });
  res.json({ ok: true });
});

friendsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const row = await prisma.userFriend.findFirst({
    where: {
      id: req.params.id,
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
  });
  if (!row) return res.status(404).json({ error: "not found" });
  await prisma.userFriend.delete({ where: { id: row.id } });
  res.status(204).send();
});
