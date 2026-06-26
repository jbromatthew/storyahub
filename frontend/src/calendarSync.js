import { api } from "./api/client.js";
import { eventToUi } from "./mappers.js";
import { fetchDeviceEvents, exportDeviceEvents, isDeviceCalendarAvailable } from "./api/nativeBridge.js";

export { isDeviceCalendarAvailable };

export function calendarSyncRange() {
  const from = new Date();
  from.setDate(from.getDate() - 90);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + 365);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function eventForDeviceExport(e) {
  return {
    id: e.id,
    title: e.title || "일정",
    startsAt: e.startsAt,
    endsAt: e.endsAt || null,
    place: e.place || null,
    notes: e.notes || null,
    eventKitId: e._raw?.eventKitId || e.eventKitId || null,
  };
}

/** Google + Apple 캘린더 양방향 동기화 */
export async function syncAllCalendars() {
  const range = calendarSyncRange();
  const result = {
    google: null,
    apple: null,
    events: null,
  };

  try {
    const status = await api.getCalendarSyncStatus();
    if (status?.google?.connected) {
      result.google = await api.syncGoogleCalendar();
    }
  } catch (e) {
    result.google = { error: e?.message || "Google 동기화 실패" };
  }

  if (isDeviceCalendarAvailable()) {
    try {
      const deviceEvents = await fetchDeviceEvents(range.from, range.to);
      const importResult = await api.importCalendarEvents(deviceEvents);
      const serverEvents = importResult?.events || (await api.listEvents(range.from, range.to));
      const exportPayload = serverEvents.map((e) => eventForDeviceExport(eventToUi(e)));
      const exportResult = await exportDeviceEvents(exportPayload);
      if (exportResult.mappings?.length) {
        await api.patchEventKitIds(exportResult.mappings);
      }
      result.apple = {
        importAdded: importResult?.added || 0,
        importUpdated: importResult?.updated || 0,
        importSkipped: importResult?.skipped || 0,
        exportAdded: exportResult?.added || 0,
        exportUpdated: exportResult?.updated || 0,
        exportSkipped: exportResult?.skipped || 0,
      };
      result.events = serverEvents;
    } catch (e) {
      result.apple = { error: e?.message || "Apple 동기화 실패" };
    }
  }

  return result;
}

export function formatSyncToast(result) {
  const parts = [];
  if (result?.google && !result.google.error) {
    parts.push(`Google ${(result.google.pulled || 0) + (result.google.updated || 0) + (result.google.pushed || 0)}건`);
  }
  if (result?.apple && !result.apple.error) {
    const a = result.apple;
    parts.push(`Apple +${a.importAdded || 0} · ↻${a.importUpdated || 0} · ↑${(a.exportAdded || 0) + (a.exportUpdated || 0)}`);
  }
  if (!parts.length) return "동기화할 캘린더가 없어요";
  return parts.join(" · ");
}
