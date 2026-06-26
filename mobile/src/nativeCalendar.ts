import { NativeModules, Platform } from 'react-native';

type DeviceCalendarEvent = {
  eventKitId?: string | null;
  storyahubId?: string | null;
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  place?: string | null;
  notes?: string | null;
  calendarTitle?: string | null;
};

type ExportCalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  place?: string | null;
  notes?: string | null;
  eventKitId?: string | null;
};

type StoryahubCalendarModule = {
  fetchEvents: (range: { from: string; to: string }) => Promise<DeviceCalendarEvent[]>;
  exportEvents: (
    events: ExportCalendarEvent[],
  ) => Promise<{ added: number; updated: number; skipped: number; mappings: Array<{ id: string; eventKitId: string }> }>;
};

const iosCalendar = NativeModules.StoryahubCalendar as StoryahubCalendarModule | undefined;

export function isNativeCalendarAvailable(): boolean {
  return Platform.OS === 'ios' && !!iosCalendar?.fetchEvents;
}

export async function fetchNativeDeviceEvents(from: string, to: string): Promise<DeviceCalendarEvent[]> {
  if (!isNativeCalendarAvailable() || !iosCalendar?.fetchEvents) {
    throw new Error('Native calendar unavailable');
  }
  const rows = await iosCalendar.fetchEvents({ from, to });
  return Array.isArray(rows) ? rows : [];
}

export async function exportNativeDeviceEvents(events: ExportCalendarEvent[]) {
  if (!isNativeCalendarAvailable() || !iosCalendar?.exportEvents) {
    return { added: 0, updated: 0, skipped: events.length, mappings: [] as Array<{ id: string; eventKitId: string }> };
  }
  const result = await iosCalendar.exportEvents(events);
  return {
    added: Number(result?.added) || 0,
    updated: Number(result?.updated) || 0,
    skipped: Number(result?.skipped) || 0,
    mappings: Array.isArray(result?.mappings) ? result.mappings : [],
  };
}
