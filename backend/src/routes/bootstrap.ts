import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { expandYearlyInRange } from "../services/eventRecurrence.js";

export const bootstrapRouter = Router();
bootstrapRouter.use(auth, requireAccess);

// 로그인 후 한 번에 앱 데이터 로드
bootstrapRouter.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [user, contacts, todos, eventsTodayRaw, meetings, deals, places] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.todo.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.event.findMany({
      where: {
        userId,
        OR: [{ startsAt: { gte: dayStart, lt: dayEnd } }, { repeatYearly: true }],
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.meeting.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        contact: { select: { id: true, person: true, company: true } },
        event: { select: { id: true, title: true, startsAt: true } },
        todos: { select: { id: true, status: true } },
      },
    }),
    prisma.deal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.savedPlace.findMany({ where: { userId }, orderBy: [{ favorite: "desc" }, { createdAt: "desc" }] }),
  ]);

  if (!user) return res.status(404).json({ error: "not found" });

  const eventsToday = expandYearlyInRange(eventsTodayRaw, dayStart, dayEnd);

  const wonThisMonth = deals.filter(
    (d) => d.stage === "성사" && d.wonAt && d.wonAt >= monthStart && d.wonAt <= monthEnd
  );
  const supplySum = wonThisMonth.reduce((s, d) => s + d.supplyAmount, 0);
  const pipeline = deals
    .filter((d) => !["성사", "실패"].includes(d.stage))
    .reduce((s, d) => s + d.supplyAmount, 0);

  res.json({
    contacts,
    todos,
    eventsToday,
    meetings,
    places,
    revenue: {
      supplyAmount: supplySum,
      vat: Math.round(supplySum * 0.1),
      total: Math.round(supplySum * 1.1),
      pipeline,
      wonCount: wonThisMonth.length,
      pipelineCount: deals.filter((d) => !["성사", "실패"].includes(d.stage)).length,
    },
  });
});
