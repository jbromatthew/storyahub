import { prisma } from "../db.js";

type ImportEvent = {
  eventKitId?: string | null;
  storyahubId?: string | null;
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  place?: string | null;
  notes?: string | null;
};

const STORYAHUB_NOTE_RE = /\[storyahub:([a-z0-9]+)\]/i;

export function parseStoryahubIdFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(STORYAHUB_NOTE_RE);
  return m?.[1] ?? null;
}

export function stripStoryahubMarker(notes?: string | null): string | null {
  if (!notes) return null;
  const cleaned = notes.replace(STORYAHUB_NOTE_RE, "").trim();
  return cleaned || null;
}

function eventFingerprint(title: string, startsAt: Date): string {
  return `${title.trim().toLowerCase()}|${startsAt.toISOString().slice(0, 16)}`;
}

export async function importCalendarEvents(userId: string, rawItems: ImportEvent[]) {
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 2000) : [];
  const existing = await prisma.event.findMany({
    where: { userId },
    select: { id: true, eventKitId: true, title: true, startsAt: true, notes: true, syncSource: true, updatedAt: true },
  });

  const byEventKitId = new Map(existing.filter((e) => e.eventKitId).map((e) => [e.eventKitId!, e]));
  const byStoryahubId = new Map(existing.map((e) => [e.id, e]));
  const byFingerprint = new Map(
    existing.map((e) => [eventFingerprint(e.title, e.startsAt), e]),
  );

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of items) {
    const title = String(raw?.title || "").trim() || "일정";
    const startsAt = raw.startsAt ? new Date(raw.startsAt) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      skipped++;
      continue;
    }
    const endsAt = raw.endsAt ? new Date(raw.endsAt) : null;
    const eventKitId = raw.eventKitId ? String(raw.eventKitId) : null;
    const storyahubIdFromNotes = parseStoryahubIdFromNotes(raw.notes);
    const storyahubId = raw.storyahubId || storyahubIdFromNotes;

    let cur =
      (eventKitId && byEventKitId.get(eventKitId)) ||
      (storyahubId && byStoryahubId.get(storyahubId)) ||
      byFingerprint.get(eventFingerprint(title, startsAt)) ||
      null;

    const place = raw.place != null ? String(raw.place).trim() || null : null;
    const notes = stripStoryahubMarker(raw.notes != null ? String(raw.notes) : null);

    if (cur) {
      if (cur.syncSource === "storyahub" && storyahubId && cur.id === storyahubId) {
        skipped++;
        continue;
      }
      const row = await prisma.event.update({
        where: { id: cur.id },
        data: {
          title,
          startsAt,
          endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
          place: place ?? undefined,
          notes: notes ?? undefined,
          eventKitId: eventKitId || cur.eventKitId,
          syncSource: "apple",
          externalUpdatedAt: new Date(),
        },
      });
      if (eventKitId) byEventKitId.set(eventKitId, row);
      updated++;
      continue;
    }

    const row = await prisma.event.create({
      data: {
        userId,
        title,
        startsAt,
        endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
        place,
        notes,
        eventKitId,
        syncSource: "apple",
        externalUpdatedAt: new Date(),
        category: "일정",
        reminders: ["1시간 전"],
      },
    });
    if (eventKitId) byEventKitId.set(eventKitId, row);
    byFingerprint.set(eventFingerprint(title, startsAt), row);
    added++;
  }

  const events = await prisma.event.findMany({
    where: { userId },
    orderBy: { startsAt: "asc" },
  });

  return { added, updated, skipped, events };
}

export async function patchEventKitIds(
  userId: string,
  mappings: Array<{ id: string; eventKitId: string }>,
) {
  let patched = 0;
  for (const m of mappings.slice(0, 500)) {
    if (!m?.id || !m?.eventKitId) continue;
    const cur = await prisma.event.findFirst({ where: { id: m.id, userId } });
    if (!cur) continue;
    await prisma.event.update({
      where: { id: cur.id },
      data: { eventKitId: m.eventKitId },
    });
    patched++;
  }
  return { patched };
}
