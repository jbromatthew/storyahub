import { prisma } from "../db.js";
import { env } from "../env.js";
import { isApprovedErpMember } from "./erpAccess.js";

export type ShareRole = "viewer" | "editor" | "owner";
export type ResourceType = "meeting" | "kb";

const ROLE_RANK: Record<ShareRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function roleAtLeast(role: ShareRole, min: ShareRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function getMeetingAccess(userId: string, meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      contact: { select: { id: true, person: true, company: true } },
      event: { select: { id: true, title: true, startsAt: true, place: true } },
      todos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!meeting) return null;
  if (meeting.userId === userId) {
    return { meeting, role: "owner" as ShareRole, ownerId: userId };
  }
  const share = await prisma.resourceShare.findUnique({
    where: {
      resourceType_resourceId_granteeId: {
        resourceType: "meeting",
        resourceId: meetingId,
        granteeId: userId,
      },
    },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });
  if (!share) return null;
  return {
    meeting,
    role: share.role as ShareRole,
    ownerId: meeting.userId,
    sharedBy: share.owner,
  };
}

export async function getKbAccess(userId: string, articleId: string) {
  const article = await prisma.kbArticle.findUnique({ where: { id: articleId } });
  if (!article) return null;
  if (article.userId === userId) {
    return { article, role: "owner" as ShareRole, ownerId: userId };
  }
  if (env.erpMode && article.visibility === "company") {
    const author = await prisma.user.findUnique({ where: { id: article.userId } });
    const viewer = await prisma.user.findUnique({ where: { id: userId } });
    if (
      author &&
      viewer &&
      (await isApprovedErpMember(userId, viewer.email)) &&
      (await isApprovedErpMember(article.userId, author.email))
    ) {
      return {
        article,
        role: "viewer" as ShareRole,
        ownerId: article.userId,
        sharedBy: { id: author.id, email: author.email, name: author.name },
      };
    }
  }
  const share = await prisma.resourceShare.findUnique({
    where: {
      resourceType_resourceId_granteeId: {
        resourceType: "kb",
        resourceId: articleId,
        granteeId: userId,
      },
    },
    include: { owner: { select: { id: true, email: true, name: true } } },
  });
  if (!share) return null;
  return {
    article,
    role: share.role as ShareRole,
    ownerId: article.userId,
    sharedBy: share.owner,
  };
}

export async function ensureFriendContact(
  userId: string,
  friend: { id: string; email: string; name: string | null },
) {
  const existing = await prisma.contact.findFirst({
    where: { userId, linkedUserId: friend.id },
  });
  if (existing) return existing;
  return prisma.contact.create({
    data: {
      userId,
      person: friend.name?.trim() || friend.email.split("@")[0] || "친구",
      email: friend.email,
      linkedUserId: friend.id,
      group: "Storyahub",
    },
  });
}
