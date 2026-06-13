const KEY = "storyahub_pending_meetings";

export function getPendingMeetingIds() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function addPendingMeeting(meetingId) {
  if (!meetingId) return;
  const set = new Set(getPendingMeetingIds());
  set.add(meetingId);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function removePendingMeeting(meetingId) {
  const next = getPendingMeetingIds().filter((id) => id !== meetingId);
  if (next.length) localStorage.setItem(KEY, JSON.stringify(next));
  else localStorage.removeItem(KEY);
}
