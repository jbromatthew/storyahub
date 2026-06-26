import { toastError, TOAST_ERROR_STATUSES } from "../toast.js";

const BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "" : "http://localhost:4000");
const TOKEN_KEY = "storyahub_token";
const SESSION_TOKEN_KEY = "storyahub_token_session";
export const REMEMBER_KEY = "storyahub_remember";
export const EMAIL_KEY = "storyahub_email";

/** 메모리 토큰 — api.* 서브도메인 크로스 오리진 시 Bearer 폴백 */
let token = null;

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isAuthError(err) {
  return err instanceof ApiError && err.status === 401;
}

export function isAccessError(err) {
  return err instanceof ApiError && err.status === 402;
}

export function setToken(t) {
  token = t;
}

export function loadToken() {
  token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
  return token;
}

export function saveToken(t, { remember = true } = {}) {
  token = t;
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  if (remember) {
    localStorage.setItem(TOKEN_KEY, t);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } else {
    sessionStorage.setItem(SESSION_TOKEN_KEY, t);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getRememberLogin() {
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function getToken() {
  return token;
}

export function getApiBase() {
  return BASE;
}

export function clearToken() {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

async function req(path, { method = "GET", body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("서버에 연결할 수 없습니다", 0);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      msg = await res.text();
    }
    if (TOAST_ERROR_STATUSES.has(res.status)) toastError(msg);
    throw new ApiError(msg, res.status);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  register: (email, password, name, remember = true) =>
    req("/auth/register", { method: "POST", body: { email, password, name, remember } }),
  login: (email, password, remember = true) =>
    req("/auth/login", { method: "POST", body: { email, password, remember } }),
  logout: () => req("/auth/logout", { method: "POST" }),
  me: () => req("/auth/me"),
  getUsage: () => req("/auth/me/usage"),
  updateMe: (data) => req("/auth/me", { method: "PATCH", body: data }),
  updatePreferences: (preferences) =>
    req("/auth/me/preferences", { method: "PATCH", body: { preferences } }),
  changePassword: (currentPassword, newPassword) =>
    req("/auth/me/password", { method: "PATCH", body: { currentPassword, newPassword } }),
  completeOnboarding: () => req("/auth/me", { method: "PATCH", body: { onboardingDone: true } }),
  subscribe: (plan) => req("/auth/subscribe", { method: "POST", body: { plan } }),
  redeemCoupon: (code) => req("/auth/coupons/redeem", { method: "POST", body: { code } }),

  bootstrap: () => req("/bootstrap"),

  listContacts: () => req("/contacts"),
  geocodePendingContacts: () => req("/contacts/geocode-pending", { method: "POST" }),
  createContact: (data) => req("/contacts", { method: "POST", body: data }),
  importContacts: (contacts) => req("/contacts/import", { method: "POST", body: { contacts } }),
  updateContact: (id, data) => req(`/contacts/${id}`, { method: "PATCH", body: data }),
  getContact: (id) => req(`/contacts/${id}`),
  deleteContact: (id) => req(`/contacts/${id}`, { method: "DELETE" }),

  listPlaces: () => req("/places"),
  searchPlaces: ({ q, lat, lng, nearby, page } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lat != null) params.set("lat", String(lat));
    if (lng != null) params.set("lng", String(lng));
    if (nearby) params.set("nearby", "1");
    if (page) params.set("page", String(page));
    const qs = params.toString();
    return req(`/places/search${qs ? `?${qs}` : ""}`);
  },
  createPlace: (data) => req("/places", { method: "POST", body: data }),
  updatePlace: (id, data) => req(`/places/${id}`, { method: "PATCH", body: data }),
  deletePlace: (id) => req(`/places/${id}`, { method: "DELETE" }),

  listTodos: ({ q, status } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    return req(`/todos${qs ? `?${qs}` : ""}`);
  },
  getTodo: (id) => req(`/todos/${id}`),
  createTodo: (data) => req("/todos", { method: "POST", body: data }),
  updateTodo: (id, data) => req(`/todos/${id}`, { method: "PATCH", body: data }),
  deleteTodo: (id) => req(`/todos/${id}`, { method: "DELETE" }),

  listMeetings: () => req("/meetings"),
  getMeeting: (id) => req(`/meetings/${id}`),
  updateMeeting: (id, data) => req(`/meetings/${id}`, { method: "PATCH", body: data }),
  deleteMeeting: (id) => req(`/meetings/${id}`, { method: "DELETE" }),
  enqueueSummary: (mediaKey, meta) =>
    req("/meetings/summarize", { method: "POST", body: { mediaKey, meta } }),
  getJob: (jobId) => req(`/meetings/job/${jobId}`),
  retryMeeting: (id) => req(`/meetings/${id}/retry`, { method: "POST" }),
  addMeetingAttachment: (id, data) =>
    req(`/meetings/${id}/attachments`, { method: "POST", body: data }),
  updateMeetingAttachmentNote: (id, data) =>
    req(`/meetings/${id}/attachments`, { method: "PATCH", body: data }),
  updateMeetingTextMemo: (id, text) =>
    req(`/meetings/${id}/memo`, { method: "PATCH", body: { text } }),
  askMeeting: (id, question) =>
    req(`/meetings/${id}/ask`, { method: "POST", body: { question } }),

  listDeals: () => req("/deals"),
  saveDeal: (data) => req("/deals", { method: "POST", body: data }),
  deleteDeal: (id) => req(`/deals/${id}`, { method: "DELETE" }),

  listEvents: (from, to) => req(`/calendar?from=${from}&to=${to}`),
  createEvent: (data) => req("/calendar", { method: "POST", body: data }),
  updateEvent: (id, data) => req(`/calendar/${id}`, { method: "PATCH", body: data }),
  deleteEvent: (id) => req(`/calendar/${id}`, { method: "DELETE" }),
  shareEvent: (id) => req(`/calendar/${id}/share`, { method: "POST" }),

  getCalendarSyncStatus: () => req("/calendar/sync/status"),
  getGoogleCalendarConnectUrl: () => req("/calendar/sync/google/connect"),
  syncGoogleCalendar: () => req("/calendar/sync/google/sync", { method: "POST" }),
  disconnectGoogleCalendar: () => req("/calendar/sync/google", { method: "DELETE" }),
  listGoogleCalendars: () => req("/calendar/sync/google/calendars"),
  setGoogleCalendar: (calendarId, calendarName) =>
    req("/calendar/sync/google/calendar", { method: "PATCH", body: { calendarId, calendarName } }),
  importCalendarEvents: (events) => req("/calendar/sync/import", { method: "POST", body: { events } }),
  patchEventKitIds: (mappings) => req("/calendar/sync/eventkit-ids", { method: "PATCH", body: { mappings } }),

  listKb: () => req("/kb"),
  saveKb: (data) => req("/kb", { method: "POST", body: data }),
  searchBooks: (q, { page = 1, size = 10 } = {}) =>
    req(`/kb/books/search?q=${encodeURIComponent(q)}&page=${page}&size=${size}`),
  importBookCover: (url) => req("/kb/books/cover", { method: "POST", body: { url } }),

  ocrCard: (data) => req("/ocr/card", { method: "POST", body: data }),
  ocrDocument: (mediaKeys) => req("/ocr/document", { method: "POST", body: { mediaKeys } }),

  presignUpload: (filename, contentType) =>
    req("/uploads/presign", { method: "POST", body: { filename, contentType } }),
  getUploadUrl: (key) => req(`/uploads/get?key=${encodeURIComponent(key)}`),

  deleteKb: (id) => req(`/kb/${id}`, { method: "DELETE" }),

  listFriends: () => req("/friends"),
  listPendingFriends: () => req("/friends/pending"),
  requestFriend: (email) => req("/friends/request", { method: "POST", body: { email } }),
  acceptFriend: (id) => req(`/friends/${id}/accept`, { method: "POST" }),
  declineFriend: (id) => req(`/friends/${id}/decline`, { method: "POST" }),
  removeFriend: (id) => req(`/friends/${id}`, { method: "DELETE" }),

  listShares: (type, id) => req(`/shares/${type}/${id}`),
  addShare: (type, id, body) => req(`/shares/${type}/${id}`, { method: "POST", body }),
  updateShare: (shareId, body) => req(`/shares/${shareId}`, { method: "PATCH", body }),
  removeShare: (shareId) => req(`/shares/${shareId}`, { method: "DELETE" }),
};
