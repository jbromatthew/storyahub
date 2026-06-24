import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import {
  getKbAccess,
  getMeetingAccess,
  roleAtLeast,
  type ResourceType,
  type ShareRole,
} from "../services/shareAccess.js";

export const sharesRouter = Router();
sharesRouter.use(auth, requireAccess);

const ROLES = new Set<ShareRole>(["viewer", "editor"]);

async function resolveGrantee(ownerId: string, emailOrUserId: string) {
  const key = emailOrUserId.trim().toLowerCase();
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ id: emailOrUserId }, { email: key }],
    },
    select: { id: true, email: true, name: true },
  });
  if (!user || user.id === ownerId) return null;

  const friends = await prisma.userFriend.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: ownerId, addresseeId: user.id },
        { requesterId: user.id, addresseeId: ownerId },
      ],
    },
  });
  if (!friends) return { error: "친구만 공유할 수 있어요" as const, user: null };
  return { user, error: null };
}

async function assertOwnerResource(ownerId: string, resourceType: ResourceType, resourceId: string) {
  if (resourceType === "meeting") {
    return prisma.meeting.findFirst({ where: { id: resourceId, userId: ownerId } });
  }
  return prisma.kbArticle.findFirst({ where: { id: resourceId, userId: ownerId } });
}

sharesRouter.get("/:type/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const resourceType = req.params.type as ResourceType;
  const resourceId = req.params.id;
  if (resourceType !== "meeting" && resourceType !== "kb") {
    return res.status(400).json({ error: "invalid resource type" });
  }

  const owned = await assertOwnerResource(userId, resourceType, resourceId);
  if (!owned) return res.status(404).json({ error: "not found" });

  const shares = await prisma.resourceShare.findMany({
    where: { ownerId: userId, resourceType, resourceId },
    include: { grantee: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json(
    shares.map((s) => ({
      id: s.id,
      role: s.role,
      user: s.grantee,
      createdAt: s.createdAt,
    })),
  );
});

sharesRouter.post("/:type/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const resourceType = req.params.type as ResourceType;
  const resourceId = req.params.id;
  const email = String(req.body?.email ?? req.body?.userId ?? "").trim();
  const role = String(req.body?.role ?? "viewer") as ShareRole;

  if (resourceType !== "meeting" && resourceType !== "kb") {
    return res.status(400).json({ error: "invalid resource type" });
  }
  if (!ROLES.has(role)) return res.status(400).json({ error: "role must be viewer or editor" });
  if (!email) return res.status(400).json({ error: "email required" });

  const owned = await assertOwnerResource(userId, resourceType, resourceId);
  if (!owned) return res.status(404).json({ error: "not found" });

  const resolved = await resolveGrantee(userId, email);
  if (!resolved) return res.status(404).json({ error: "사용자를 찾을 수 없어요" });
  if (resolved.error) return res.status(403).json({ error: resolved.error });
  const grantee = resolved.user!;

  const share = await prisma.resourceShare.upsert({
    where: {
      resourceType_resourceId_granteeId: {
        resourceType,
        resourceId,
        granteeId: grantee.id,
      },
    },
    create: {
      ownerId: userId,
      granteeId: grantee.id,
      resourceType,
      resourceId,
      role,
    },
    update: { role },
    include: { grantee: { select: { id: true, email: true, name: true } } },
  });

  res.json({
    id: share.id,
    role: share.role,
    user: share.grantee,
    createdAt: share.createdAt,
  });
});

sharesRouter.patch("/:shareId", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const role = String(req.body?.role ?? "") as ShareRole;
  if (!ROLES.has(role)) return res.status(400).json({ error: "role must be viewer or editor" });

  const share = await prisma.resourceShare.findFirst({
    where: { id: req.params.shareId, ownerId: userId },
    include: { grantee: { select: { id: true, email: true, name: true } } },
  });
  if (!share) return res.status(404).json({ error: "not found" });

  const updated = await prisma.resourceShare.update({
    where: { id: share.id },
    data: { role },
    include: { grantee: { select: { id: true, email: true, name: true } } },
  });

  res.json({
    id: updated.id,
    role: updated.role,
    user: updated.grantee,
    createdAt: updated.createdAt,
  });
});

sharesRouter.delete("/:shareId", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const share = await prisma.resourceShare.findFirst({
    where: { id: req.params.shareId, ownerId: userId },
  });
  if (!share) return res.status(404).json({ error: "not found" });
  await prisma.resourceShare.delete({ where: { id: share.id } });
  res.status(204).send();
});
