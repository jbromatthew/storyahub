import { Router } from "express";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { enqueue, getJob } from "../services/queue.js";
import { summarize } from "../services/summarize.js";
import { getObjectBytes } from "../services/r2.js";
import { transcribeAudio, plainToTranscript, mimeFromKey, type TranscriptResult } from "../services/stt.js";
import { ocrDocumentText } from "../services/ocr.js";

export const meetingsRouter = Router();
meetingsRouter.use(auth);

async function resolveTranscript(
  userId: string,
  mediaKey: string | null | undefined,
  meta: any
): Promise<TranscriptResult> {
  if (meta?.transcript?.trim()) return plainToTranscript(meta.transcript.trim());

  if (mediaKey) {
    if (!mediaKey.startsWith(`u/${userId}/`)) throw new Error("invalid mediaKey");
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
      if (!key.startsWith(`u/${userId}/`)) continue;
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
  const items = await prisma.meeting.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      contact: { select: { id: true, person: true, company: true } },
      todos: { select: { id: true, status: true } },
    },
  });
  res.json(items);
});

meetingsRouter.post("/summarize", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { mediaKey, meta } = req.body ?? {};

  const jobId = enqueue(async () => {
    const transcript = await resolveTranscript(userId, mediaKey, meta);
    const summary = await summarize(transcript, meta?.template ?? "영업");

    const meeting = await prisma.meeting.create({
      data: {
        userId,
        contactId: meta?.contactId ?? null,
        source: meta?.source ?? "live",
        mediaKey: mediaKey ?? meta?.imageKeys?.[0] ?? null,
        oneLine: summary.one_line,
        summary: summary as any,
        attendees: meta?.attendees ?? [],
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

    return { meetingId: meeting.id, mediaKey: meeting.mediaKey, summary };
  });

  res.status(202).json({ jobId });
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

meetingsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const m = await prisma.meeting.findFirst({ where: { id: req.params.id, userId } });
  if (!m) return res.status(404).json({ error: "not found" });
  await prisma.meeting.delete({ where: { id: m.id } });
  res.status(204).send();
});
