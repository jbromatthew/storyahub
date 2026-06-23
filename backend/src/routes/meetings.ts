import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess, type AccessRequest } from "../middleware/requireAccess.js";
import { getAccessStatus, recordingQuotaError } from "../services/access.js";
import { clampDurationSec } from "../services/meetingLimits.js";
import { incrementRecordingSec } from "../services/recordingUsage.js";
import { enqueue, getJob, publicJobView } from "../services/queue.js";
import { summarize } from "../services/summarize.js";
import { getObjectBytes, isUserMediaKey } from "../services/r2.js";
import { transcribeAudio, plainToTranscript, mimeFromKey, type TranscriptResult } from "../services/stt.js";
import { ocrDocumentText } from "../services/ocr.js";
import { assertUserMediaKey, assertUserMediaKeys } from "../services/mediaValidation.js";
import { answerMeetingQuestion } from "../services/meetingAsk.js";

export const meetingsRouter = Router();
meetingsRouter.use(auth, requireAccess);

function friendlyProcessingError(e: unknown): string {
  const msg = (e as Error).message || "변환 실패";
  if (/Unterminated string in JSON|Unexpected end of JSON|JSON\.parse|잘렸습니다|AI 응답이 비어/i.test(msg)) {
    return "긴 녹음 변환 중 AI 응답이 잘렸습니다. 잠시 후 다시 시도해주세요.";
  }
  return msg;
}

async function resolveTranscript(
  userId: string,
  mediaKey: string | null | undefined,
  meta: any
): Promise<TranscriptResult> {
  const durationSec = clampDurationSec(meta?.durationSec);

  if (meta?.transcript?.trim()) return plainToTranscript(meta.transcript.trim());

  if (mediaKey) {
    if (!isUserMediaKey(mediaKey, userId)) throw new Error("invalid mediaKey");
    const buf = await getObjectBytes(mediaKey);
    const mime = mimeFromKey(mediaKey, "audio/webm");
    if (mime.startsWith("audio/")) {
      return transcribeAudio(buf.toString("base64"), mime, {
        durationSec,
        fileBytes: buf.length,
      });
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

function sourceLabelFromMeta(meta: { source?: string } | null | undefined): string {
  const source = meta?.source;
  if (source === "upload") return "파일 업로드";
  if (source === "photo") return "사진 기록";
  return "녹음";
}

type ProcessMeta = {
  template?: string;
  durationSec?: number;
  companyName?: string | null;
  imageKeys?: string[];
  source?: string;
  contactId?: string | null;
  attendees?: string[];
  eventId?: string | null;
};

function buildProcessMeta(raw: unknown, meeting: {
  source: string;
  contactId: string | null;
  attendees: string[];
  eventId: string | null;
  mediaKey: string | null;
  contact?: { person: string | null; company: string | null } | null;
}): ProcessMeta {
  const pm = raw && typeof raw === "object" ? (raw as ProcessMeta) : {};
  const source = pm.source ?? meeting.source;
  const imageKeys =
    Array.isArray(pm.imageKeys) && pm.imageKeys.length
      ? pm.imageKeys.map(String)
      : source === "photo" && meeting.mediaKey
        ? [meeting.mediaKey]
        : [];
  return {
    template: pm.template ?? "영업",
    durationSec: pm.durationSec ?? 0,
    companyName: pm.companyName ?? meeting.contact?.company ?? meeting.contact?.person ?? null,
    imageKeys,
    source,
    contactId: pm.contactId ?? meeting.contactId,
    attendees: Array.isArray(pm.attendees) ? pm.attendees.map(String) : meeting.attendees,
    eventId: pm.eventId ?? meeting.eventId,
  };
}

async function runMeetingProcessing(
  userId: string,
  meetingId: string,
  mediaKey: string | null,
  meta: ProcessMeta
): Promise<{ summary: Awaited<ReturnType<typeof summarize>> }> {
  const isAudio = meta.source !== "photo" && (!meta.imageKeys?.length || mediaKey);
  const durationSec = isAudio ? clampDurationSec(meta.durationSec) : 0;
  const contactId = meta.contactId ?? null;

  const transcript = await resolveTranscript(userId, mediaKey, meta);
  const summary = await summarize(transcript, meta.template ?? "영업", { durationSec });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      oneLine: summary.one_line,
      summary: summary as any,
      processStatus: "done",
      processError: null,
    },
  });

  if (summary.actions?.length) {
    const subs = summary.actions.map((a, i) => ({
      id: `s${meetingId}-${i}`,
      text: a.task,
      done: false,
    }));
    const allDone = subs.every((s) => s.done);
    const anyDone = subs.some((s) => s.done);
    const todoStatus = allDone ? "done" : anyDone ? "doing" : "todo";
    const title =
      summary.one_line?.trim() ||
      (meta.companyName ? `${meta.companyName} · 미팅 후속` : "미팅 후속 할 일");
    await prisma.todo.create({
      data: {
        userId,
        title,
        priority: "mid",
        contactId: contactId ?? null,
        meetingId,
        subs,
        status: todoStatus,
        history: [{ when: new Date().toISOString(), who: "AI", what: "미팅에서 할 일 추출" }],
      },
    });
  }

  if (summary.next_meeting?.date) {
    const startsAt = new Date(`${summary.next_meeting.date}T${summary.next_meeting.time ?? "09:00"}:00`);
    await prisma.event.create({
      data: {
        userId,
        title: `${meta.companyName ?? "후속"} 미팅`,
        startsAt,
        place: summary.next_meeting.place ?? null,
        contactId: contactId ?? null,
        reminders: ["1시간 전"],
      },
    });
  }

  if (durationSec > 0) await incrementRecordingSec(userId, durationSec);

  return { summary };
}

async function markMeetingFailed(meetingId: string, sourceLabel: string, e: unknown) {
  const msg = friendlyProcessingError(e);
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      processStatus: "error",
      processError: msg,
      oneLine: `${sourceLabel} 변환 실패`,
    },
  });
  return msg;
}

function serializeProcessMeta(meta: Record<string, unknown>, durationSec: number): ProcessMeta {
  return {
    template: (meta.template as string) ?? "영업",
    durationSec,
    companyName: (meta.companyName as string) ?? null,
    imageKeys: Array.isArray(meta.imageKeys) ? meta.imageKeys.map(String) : [],
    source: (meta.source as string) ?? "live",
    contactId: meta.contactId ? String(meta.contactId) : null,
    attendees: Array.isArray(meta.attendees) ? meta.attendees.map(String) : [],
    eventId: meta.eventId ? String(meta.eventId) : null,
  };
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

  try {
    if (mediaKey) assertUserMediaKey(mediaKey, userId);
    if (meta?.imageKeys) assertUserMediaKeys(meta.imageKeys, userId, 20);
  } catch {
    return res.status(400).json({ error: "미디어 키가 올바르지 않습니다" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "not found" });

  const status = getAccessStatus(user);
  const quotaErr = recordingQuotaError(status);
  if (quotaErr) return res.status(402).json({ error: quotaErr });

  const isAudio = meta?.source !== "photo" && (!meta?.imageKeys?.length || mediaKey);
  const durationSec = isAudio ? clampDurationSec(meta?.durationSec) : 0;
  if (isAudio && durationSec > 0 && status.recordingUsedSec + durationSec > status.recordingLimitSec) {
    return res.status(402).json({
      error: status.isTrial ? "체험 녹음 한도(1시간)를 초과합니다." : "이번 달 녹음·변환 한도를 초과합니다.",
    });
  }

  const sourceLabel = sourceLabelFromMeta(meta);

  let eventId: string | null = meta?.eventId ? String(meta.eventId) : null;
  if (eventId) {
    const ev = await prisma.event.findFirst({ where: { id: eventId, userId } });
    if (!ev) eventId = null;
  }

  const attendees = Array.isArray(meta?.attendees) ? meta.attendees.map(String) : [];
  const contactId = meta?.contactId ? String(meta.contactId) : attendees[0] ?? null;
  const processMeta = serializeProcessMeta({ ...meta, eventId, contactId, attendees }, durationSec);

  const meeting = await prisma.meeting.create({
    data: {
      userId,
      contactId,
      eventId,
      source: meta?.source ?? "live",
      mediaKey: mediaKey ?? meta?.imageKeys?.[0] ?? null,
      oneLine: `${sourceLabel} 변환 중…`,
      processStatus: "processing",
      processError: null,
      processMeta: processMeta as any,
      attendees,
    },
  });

  const jobId = enqueue(userId, async () => {
    try {
      const result = await runMeetingProcessing(userId, meeting.id, mediaKey ?? null, processMeta);
      return { meetingId: meeting.id, mediaKey: meeting.mediaKey, summary: result.summary };
    } catch (e) {
      await markMeetingFailed(meeting.id, sourceLabel, e);
      throw e;
    }
  });

  res.status(202).json({ jobId, meetingId: meeting.id });
});

meetingsRouter.get("/job/:id", (req: AuthedRequest, res) => {
  const job = getJob(req.params.id, req.userId!);
  if (!job) return res.status(404).json({ error: "no job" });
  res.json(publicJobView(job));
});

meetingsRouter.post("/:id/retry", async (req: AccessRequest, res) => {
  const userId = req.userId!;
  const m = await prisma.meeting.findFirst({
    where: { id: req.params.id, userId },
    include: { contact: { select: { person: true, company: true } } },
  });
  if (!m) return res.status(404).json({ error: "not found" });
  if (m.processStatus === "processing") {
    return res.status(409).json({ error: "이미 변환 중이에요" });
  }
  if (m.processStatus !== "error") {
    return res.status(400).json({ error: "변환에 실패한 기록만 다시 시도할 수 있어요" });
  }

  const processMeta = buildProcessMeta(m.processMeta, m);
  const mediaKey = m.mediaKey;
  const hasMedia = !!mediaKey || (processMeta.imageKeys?.length ?? 0) > 0;
  if (!hasMedia) {
    return res.status(400).json({ error: "다시 변환할 녹음·사진 파일이 없어요" });
  }

  try {
    if (mediaKey) assertUserMediaKey(mediaKey, userId);
    if (processMeta.imageKeys?.length) assertUserMediaKeys(processMeta.imageKeys, userId, 20);
  } catch {
    return res.status(400).json({ error: "미디어 키가 올바르지 않습니다" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "not found" });

  const status = getAccessStatus(user);
  const quotaErr = recordingQuotaError(status);
  if (quotaErr) return res.status(402).json({ error: quotaErr });

  const isAudio = processMeta.source !== "photo" && (!processMeta.imageKeys?.length || mediaKey);
  const durationSec = isAudio ? clampDurationSec(processMeta.durationSec) : 0;
  if (isAudio && durationSec > 0 && status.recordingUsedSec + durationSec > status.recordingLimitSec) {
    return res.status(402).json({
      error: status.isTrial ? "체험 녹음 한도(1시간)를 초과합니다." : "이번 달 녹음·변환 한도를 초과합니다.",
    });
  }

  const sourceLabel = sourceLabelFromMeta(processMeta);

  await prisma.meeting.update({
    where: { id: m.id },
    data: {
      processStatus: "processing",
      processError: null,
      oneLine: `${sourceLabel} 변환 중…`,
      summary: Prisma.DbNull,
      processMeta: processMeta as any,
    },
  });

  const jobId = enqueue(userId, async () => {
    try {
      const result = await runMeetingProcessing(userId, m.id, mediaKey, processMeta);
      return { meetingId: m.id, mediaKey: m.mediaKey, summary: result.summary };
    } catch (e) {
      await markMeetingFailed(m.id, sourceLabel, e);
      throw e;
    }
  });

  res.status(202).json({ jobId, meetingId: m.id });
});

meetingsRouter.post("/:id/ask", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const m = await prisma.meeting.findFirst({ where: { id: req.params.id, userId } });
  if (!m) return res.status(404).json({ error: "not found" });
  if (m.processStatus === "processing") {
    return res.status(409).json({ error: "미팅 변환이 끝난 뒤 질문할 수 있어요" });
  }

  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "question required" });
  if (question.length > 500) return res.status(400).json({ error: "질문은 500자까지 가능합니다" });

  try {
    const summary = (m.summary && typeof m.summary === "object" ? m.summary : null) as Record<string, unknown> | null;
    const answer = await answerMeetingQuestion(question, m.oneLine, summary);
    res.json({ answer });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message || "질문 처리 실패" });
  }
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
