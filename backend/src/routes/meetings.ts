import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess, type AccessRequest } from "../middleware/requireAccess.js";
import { getAccessStatus, recordingQuotaError } from "../services/access.js";
import { incrementRecordingSec } from "../services/recordingUsage.js";
import { enqueue, getJob } from "../services/queue.js";
import { summarize } from "../services/summarize.js";
import { getObjectBytes, isUserMediaKey } from "../services/r2.js";
import { transcribeAudio, plainToTranscript, mimeFromKey, type TranscriptResult } from "../services/stt.js";
import { ocrDocumentText } from "../services/ocr.js";

export const meetingsRouter = Router();
meetingsRouter.use(auth, requireAccess);

async function resolveTranscript(
  userId: string,
  mediaKey: string | null | undefined,
  meta: any
): Promise<TranscriptResult> {
  if (meta?.transcript?.trim()) return plainToTranscript(meta.transcript.trim());

  if (mediaKey) {
    if (!isUserMediaKey(mediaKey, userId)) throw new Error("invalid mediaKey");
    const buf = await getObjectBytes(mediaKey);
    const mime = mimeFromKey(mediaKey, "audio/webm");
    if (mime.startsWith("audio/")) {
      return transcribeAudio(buf.toString("base64"), mime);
    }
    if (mime.startsWith("image/")) {
      const text = await ocrDocumentText(buf.toString("base64"), mime);
      return plainToTranscript(text);
    }
  }

  const imageKeys: string[] = Array.isArray(meta?.imageKeys) ? meta.imageKeys : [];
  if (imageKeys.length) {
    const parts: string[] = [];
    for (const key of imageKeys) {
      if (!isUserMediaKey(key, userId)) continue;
      const buf = await getObjectBytes(key);
      const mime = mimeFromKey(key, "image/jpeg");
      parts.push(await ocrDocumentText(buf.toString("base64"), mime));
    }
    const joined = parts.filter(Boolean).join("\n\n");
    if (joined) return plainToTranscript(joined);
  }

  throw new Error("전사할 음성/이미지가 없습니다");
}

meetingsRouter.get("/", async (req: AuthedRequest, res) => {
  const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
  const items = await prisma.meeting.findMany({
    where: { userId: req.userId, ...(eventId ? { eventId } : {}) },
    orderBy: { createdAt: "desc" },
    take: eventId ? 50 : 100,
    include: {
      contact: { select: { id: true, person: true, company: true } },
      event: { select: { id: true, title: true, startsAt: true } },
      todos: { select: { id: true, status: true } },
    },
  });
  res.json(items);
});

meetingsRouter.post("/summarize", async (req: AccessRequest, res) => {
  const userId = req.userId!;
  const { mediaKey, meta } = req.body ?? {};

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "not found" });

  const status = getAccessStatus(user);
  const quotaErr = recordingQuotaError(status);
  if (quotaErr) return res.status(402).json({ error: quotaErr });

  const isAudio = meta?.source !== "photo" && (!meta?.imageKeys?.length || mediaKey);
  const durationSec = isAudio ? Math.max(0, Math.min(7200, Number(meta?.durationSec) || 0)) : 0;
  if (isAudio && durationSec > 0 && status.recordingUsedSec + durationSec > status.recordingLimitSec) {
    return res.status(402).json({
      error: status.isTrial ? "체험 녹음 한도(1시간)를 초과합니다." : "이번 달 녹음·변환 한도를 초과합니다.",
    });
  }

  const sourceLabel =
    meta?.source === "upload" ? "파일 업로드" : meta?.source === "photo" ? "사진 기록" : "녹음";

  let eventId: string | null = meta?.eventId ? String(meta.eventId) : null;
  if (eventId) {
    const ev = await prisma.event.findFirst({ where: { id: eventId, userId } });
    if (!ev) eventId = null;
  }

  const meeting = await prisma.meeting.create({
    data: {
      userId,
      contactId: meta?.contactId ?? null,
      eventId,
      source: meta?.source ?? "live",
      mediaKey: mediaKey ?? meta?.imageKeys?.[0] ?? null,
      oneLine: `${sourceLabel} 변환 중…`,
      processStatus: "processing",
      attendees: Array.isArray(meta?.attendees) ? meta.attendees.map(String) : [],
    },
  });

  const jobId = enqueue(async () => {
    try {
      const transcript = await resolveTranscript(userId, mediaKey, meta);
      const summary = await summarize(transcript, meta?.template ?? "영업");

      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          oneLine: summary.one_line,
          summary: summary as any,
          processStatus: "done",
          processError: null,
        },
      });

      if (summary.actions?.length) {
        await prisma.todo.createMany({
          data: summary.actions.map((a) => ({
            userId,
            title: a.task,
            priority: a.priority ?? "mid",
            due: a.due ? new Date(a.due) : null,
            contactId: meta?.contactId ?? null,
            meetingId: meeting.id,
          })),
        });
      }

      if (summary.next_meeting?.date) {
        const startsAt = new Date(`${summary.next_meeting.date}T${summary.next_meeting.time ?? "09:00"}:00`);
        await prisma.event.create({
          data: {
            userId,
            title: `${meta?.companyName ?? "후속"} 미팅`,
            startsAt,
            place: summary.next_meeting.place ?? null,
            contactId: meta?.contactId ?? null,
            reminders: ["1시간 전"],
          },
        });
      }

      if (durationSec > 0) await incrementRecordingSec(userId, durationSec);

      return { meetingId: meeting.id, mediaKey: meeting.mediaKey, summary };
    } catch (e) {
      const msg = (e as Error).message || "변환 실패";
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          processStatus: "error",
          processError: msg,
          oneLine: `${sourceLabel} 변환 실패`,
        },
      });
      throw e;
    }
  });

  res.status(202).json({ jobId, meetingId: meeting.id });
});

meetingsRouter.get("/job/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "no job" });
  res.json(job);
});

meetingsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const m = await prisma.meeting.findFirst({
    where: { id: req.params.id, userId },
    include: {
      contact: { select: { id: true, person: true, company: true } },
      event: { select: { id: true, title: true, startsAt: true, place: true } },
      todos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!m) return res.status(404).json({ error: "not found" });

  let todos = m.todos;
  if (!todos.length && m.contactId) {
    const windowStart = new Date(m.createdAt.getTime() - 60_000);
    const windowEnd = new Date(m.createdAt.getTime() + 120_000);
    todos = await prisma.todo.findMany({
      where: {
        userId,
        contactId: m.contactId,
        meetingId: null,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  res.json({ ...m, todos });
});

meetingsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const m = await prisma.meeting.findFirst({ where: { id: req.params.id, userId } });
  if (!m) return res.status(404).json({ error: "not found" });

  const { category, tags } = req.body ?? {};
  const data: { category?: string | null; tags?: string[] } = {};

  if (category !== undefined) {
    const c = String(category).trim();
    data.category = c || null;
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be array" });
    data.tags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  }

  const updated = await prisma.meeting.update({
    where: { id: m.id },
    data,
    include: {
      contact: { select: { id: true, person: true, company: true } },
      todos: { select: { id: true, status: true } },
    },
  });
  res.json(updated);
});

meetingsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const m = await prisma.meeting.findFirst({ where: { id: req.params.id, userId } });
  if (!m) return res.status(404).json({ error: "not found" });
  await prisma.meeting.delete({ where: { id: m.id } });
  res.status(204).send();
});
