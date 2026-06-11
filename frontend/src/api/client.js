const BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const TOKEN_KEY = "storyahub_token";
const SESSION_TOKEN_KEY = "storyahub_token_session";
export const REMEMBER_KEY = "storyahub_remember";
export const EMAIL_KEY = "storyahub_email";

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
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
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
    throw new ApiError(msg, res.status);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  register: (email, password, name, remember = true) =>
    req("/auth/register", { method: "POST", body: { email, password, name, remember } }),
  login: (email, password, remember = true) =>
    req("/auth/login", { method: "POST", body: { email, password, remember } }),
  me: () => req("/auth/me"),
  getUsage: () => req("/auth/me/usage"),
  updateMe: (data) => req("/auth/me", { method: "PATCH", body: data }),
  changePassword: (currentPassword, newPassword) =>
    req("/auth/me/password", { method: "PATCH", body: { currentPassword, newPassword } }),
  completeOnboarding: () => req("/auth/me", { method: "PATCH", body: { onboardingDone: true } }),

  bootstrap: () => req("/bootstrap"),

  listContacts: () => req("/contacts"),
  geocodePendingContacts: () => req("/contacts/geocode-pending", { method: "POST" }),
  createContact: (data) => req("/contacts", { method: "POST", body: data }),
  updateContact: (id, data) => req(`/contacts/${id}`, { method: "PATCH", body: data }),
  getContact: (id) => req(`/contacts/${id}`),
  deleteContact: (id) => req(`/contacts/${id}`, { method: "DELETE" }),

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
  deleteMeeting: (id) => req(`/meetings/${id}`, { method: "DELETE" }),
  enqueueSummary: (mediaKey, meta) =>
    req("/meetings/summarize", { method: "POST", body: { mediaKey, meta } }),
  getJob: (jobId) => req(`/meetings/job/${jobId}`),

  listDeals: () => req("/deals"),
  saveDeal: (data) => req("/deals", { method: "POST", body: data }),
  deleteDeal: (id) => req(`/deals/${id}`, { method: "DELETE" }),

  listEvents: (from, to) => req(`/calendar?from=${from}&to=${to}`),
  createEvent: (data) => req("/calendar", { method: "POST", body: data }),
  updateEvent: (id, data) => req(`/calendar/${id}`, { method: "PATCH", body: data }),
  deleteEvent: (id) => req(`/calendar/${id}`, { method: "DELETE" }),

  listKb: () => req("/kb"),
  saveKb: (data) => req("/kb", { method: "POST", body: data }),

  ocrCard: (data) => req("/ocr/card", { method: "POST", body: data }),
  ocrDocument: (mediaKeys) => req("/ocr/document", { method: "POST", body: { mediaKeys } }),

  presignUpload: (filename, contentType) =>
    req("/uploads/presign", { method: "POST", body: { filename, contentType } }),
  getUploadUrl: (key) => req(`/uploads/get?key=${encodeURIComponent(key)}`),

  deleteKb: (id) => req(`/kb/${id}`, { method: "DELETE" }),
};
