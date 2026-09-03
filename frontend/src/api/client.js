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

/** 센터조회 필터를 쿼리스트링으로 — 배열은 같은 키를 반복해서 붙인다 */
function crmParams(q = {}, withPaging = true) {
  const p = new URLSearchParams();
  if (q.keyword) p.set("keyword", q.keyword);
  if (q.first) p.set("first", q.first);
  if (q.admin && q.admin !== "ALL") p.set("admin", q.admin);
  if (q.installer) p.set("installer", q.installer);
  for (const s of q.second || []) p.append("second", s);
  for (const t of q.ticket || []) p.append("ticket", t);
  if (q.newsfeedDays != null && q.newsfeedUnder != null) {
    p.set("newsfeedDays", String(q.newsfeedDays));
    p.set("newsfeedUnder", String(q.newsfeedUnder));
  }
  // 정밀 필터 — 서버가 응답 값을 보고 직접 거른다
  if (q.regular) p.set("regular", q.regular);
  if (q.hasKiosk) p.set("hasKiosk", q.hasKiosk);
  if (q.hasBiz) p.set("hasBiz", q.hasBiz);
  if (q.hasTicket) p.set("hasTicket", q.hasTicket);
  for (const v of q.pay || []) p.append("pay", v);
  for (const v of q.types || []) p.append("types", v);
  for (const v of q.kiosk || []) p.append("kiosk", v);
  for (const k of ["expMin", "expMax", "pointMax", "idleDays"]) {
    if (q[k] !== null && q[k] !== undefined && q[k] !== "") p.set(k, String(q[k]));
  }
  if (q.createdFrom) p.set("createdFrom", q.createdFrom);
  if (q.createdTo) p.set("createdTo", q.createdTo);
  if (withPaging) {
    if (q.sort) p.set("sort", q.sort);
    p.set("page", String(q.page ?? 0));
    p.set("size", String(q.size ?? 50));
  }
  return p;
}

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
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
    let data = null;
    try {
      const j = await res.json();
      data = j;
      msg = j.error || msg;
    } catch {
      msg = await res.text();
    }
    if (TOAST_ERROR_STATUSES.has(res.status)) toastError(msg);
    throw new ApiError(msg, res.status, data);
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
  getDeal: (id) => req(`/deals/${id}`),
  saveDeal: (data) => req("/deals", { method: "POST", body: data }),
  deleteDeal: (id) => req(`/deals/${id}`, { method: "DELETE" }),

  listOrganizations: () => req("/organizations"),
  saveOrganization: (data) => req("/organizations", { method: "POST", body: data }),
  deleteOrganization: (id) => req(`/organizations/${id}`, { method: "DELETE" }),

  listProducts: () => req("/products"),
  saveProduct: (data) => req("/products", { method: "POST", body: data }),
  deleteProduct: (id) => req(`/products/${id}`, { method: "DELETE" }),

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

  // 사내 ERP
  erpDashboard: () => req("/erp/dashboard"),
  erpNotifications: (module) => req(`/erp/notifications${module ? `?module=${module}` : ""}`),
  erpReadAllNotifications: () => req("/erp/notifications/read-all", { method: "PATCH" }),
  erpReadNotification: (id) => req(`/erp/notifications/${id}/read`, { method: "PATCH" }),
  erpProfile: () => req("/erp/me/profile"),
  erpMembers: () => req("/erp/members"),
  // 스마트상점
  // OPEN API 센터관리
  erpOpenApiConfig: () => req("/erp/openapi/config"),
  erpOpenApiConfigSave: (body) => req("/erp/openapi/config", { method: "PUT", body }),
  erpOpenApiConfigTest: () => req("/erp/openapi/config/test", { method: "POST" }),
  erpOpenApiLogin: (body) => req("/erp/openapi/login", { method: "POST", body: body || {} }),
  // 고객관리 — CRM 센터조회
  erpCrmCenters: (q = {}) => req(`/erp/crm/centers?${crmParams(q, true)}`),
  erpCrmCounts: (q = {}) => req(`/erp/crm/centers/counts?${crmParams(q, false)}`),
  erpCrmCentersExportUrl: (q = {}) => `/erp/crm/centers/export?${crmParams(q, false)}`,
  erpCrmSegments: () => req("/erp/crm/segments"),
  erpCrmSegmentCreate: (body) => req("/erp/crm/segments", { method: "POST", body }),
  erpCrmSegmentUpdate: (id, body) => req(`/erp/crm/segments/${id}`, { method: "PATCH", body }),
  erpCrmSegmentDelete: (id) => req(`/erp/crm/segments/${id}`, { method: "DELETE" }),
  erpOpenApiCenters: ({ search } = {}) => req(`/erp/openapi/centers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  erpOpenApiCenterSave: (body) => req("/erp/openapi/centers", { method: "POST", body }),
  erpOpenApiCenterDelete: (id) => req(`/erp/openapi/centers/${id}`, { method: "DELETE" }),
  erpOpenApiCentersImport: (body) => req("/erp/openapi/centers/import-from-requests", { method: "POST", body: body || {} }),
  erpOpenApiKeys: ({ status } = {}) => req(`/erp/openapi/keys${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  erpOpenApiKeyIssue: (body) => req("/erp/openapi/keys", { method: "POST", body }),
  erpOpenApiKeyRotate: (keyId) => req(`/erp/openapi/keys/${encodeURIComponent(keyId)}/rotate`, { method: "POST" }),
  erpOpenApiKeySuspend: (keyId) => req(`/erp/openapi/keys/${encodeURIComponent(keyId)}/suspend`, { method: "PATCH" }),
  erpOpenApiKeyRevoke: (keyId) => req(`/erp/openapi/keys/${encodeURIComponent(keyId)}/revoke`, { method: "PATCH" }),
  erpOpenApiKeyTenants: (keyId, body) => req(`/erp/openapi/keys/${encodeURIComponent(keyId)}/tenants`, { method: "POST", body }),
  erpOpenApiKeyMemo: (keyId, body) => req(`/erp/openapi/keys/${encodeURIComponent(keyId)}`, { method: "PATCH", body }),
  erpOpenApiRequests: ({ status, search, page, size } = {}) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (search) p.set("search", search);
    p.set("page", String(page ?? 0));
    p.set("size", String(size ?? 20));
    return req(`/erp/openapi/requests?${p}`);
  },
  erpOpenApiRequestDetail: (no) => req(`/erp/openapi/requests/${encodeURIComponent(no)}`),
  erpOpenApiLogs: ({ days } = {}) => req(`/erp/openapi/logs?days=${days || 90}`),
  erpSmartStoreRounds: () => req("/erp/smartstore/rounds"),
  erpSmartStoreRoundCreate: (body) => req("/erp/smartstore/rounds", { method: "POST", body }),
  erpSmartStoreRoundUpdate: (id, body) => req(`/erp/smartstore/rounds/${id}`, { method: "PATCH", body }),
  erpSmartStoreRoundDelete: (id) => req(`/erp/smartstore/rounds/${id}`, { method: "DELETE" }),
  erpSalesCases: (q = {}) => {
    const p = new URLSearchParams();
    if (q.from) p.set("from", q.from);
    if (q.to) p.set("to", q.to);
    return req(`/erp/sales-cases?${p}`);
  },
  erpSalesCaseApprove: (id, value) => req(`/erp/sales-cases/${id}/approve`, { method: "POST", body: { value } }),
  erpIncentive: ({ year, quarter } = {}) => {
    const p = new URLSearchParams();
    if (year) p.set("year", year);
    if (quarter) p.set("quarter", quarter);
    return req(`/erp/incentive?${p}`);
  },
  erpIncentiveSave: (body) => req("/erp/incentive", { method: "PUT", body }),
  erpSmartStoreApplies: ({ roundId } = {}) => req(`/erp/smartstore/applies${roundId ? `?roundId=${roundId}` : ""}`),
  erpSmartStoreEditLogs: ({ days } = {}) => req(`/erp/smartstore/edit-logs?days=${days || 30}`),
  erpSmartStoreApplyUpdate: (id, body) => req(`/erp/smartstore/applies/${id}`, { method: "PATCH", body }),
  erpSmartStoreApplyDelete: (id) => req(`/erp/smartstore/applies/${id}`, { method: "DELETE" }),
  erpMenuAccess: () => req("/erp/menu-access"),
  erpMenuAccessConfig: () => req("/erp/menu-access/config"),
  erpMenuAccessSave: (rules) => req("/erp/menu-access/config", { method: "PUT", body: { rules } }),
  erpAccessLogs: ({ days } = {}) => req(`/erp/access-logs${days ? `?days=${days}` : ""}`),
  erpInviteMember: (data) => req("/erp/members/invite", { method: "POST", body: data }),
  erpApproveMember: (id) => req(`/erp/members/${id}/approve`, { method: "POST" }),
  erpRejectMember: (id) => req(`/erp/members/${id}/reject`, { method: "POST" }),
  erpUpdateProfile: (data) => req("/erp/me/profile", { method: "PATCH", body: data }),
  erpEmployees: (status) => req(`/erp/employees${status ? `?status=${status}` : ""}`),
  erpCreateEmployee: (data) => req("/erp/employees", { method: "POST", body: data }),
  erpBulkEmployees: (employees) => req("/erp/employees/bulk", { method: "POST", body: { employees } }),
  erpUpdateEmployee: (id, data) => req(`/erp/employees/${id}`, { method: "PATCH", body: data }),
  erpIssueAccount: (id, password) => req(`/erp/employees/${id}/issue-account`, { method: "POST", body: password ? { password } : {} }),
  erpResetPassword: (id, password) => req(`/erp/employees/${id}/reset-password`, { method: "POST", body: password ? { password } : {} }),
  erpDepartments: () => req("/erp/departments"),
  erpCreateDepartment: (data) => req("/erp/departments", { method: "POST", body: data }),
  erpUpdateDepartment: (id, data) => req(`/erp/departments/${id}`, { method: "PATCH", body: data }),
  erpDeleteDepartment: (id) => req(`/erp/departments/${id}`, { method: "DELETE" }),
  erpRanks: () => req("/erp/ranks"),
  erpApprovalForms: () => req("/erp/approval/forms"),
  erpPreviewApprovalChain: (formCode, approvalChain) => {
    const q = new URLSearchParams({ formCode });
    if (approvalChain) q.set("approvalChain", approvalChain);
    return req(`/erp/approval/preview-chain?${q}`);
  },
  erpApprovalDocs: (box) => req(`/erp/approval/documents?box=${box || "draft"}`),
  erpApprovalDoc: (id) => req(`/erp/approval/documents/${id}`),
  erpSaveApprovalDoc: (data) => req("/erp/approval/documents", { method: "POST", body: data }),
  erpApproveDoc: (id, comment) => req(`/erp/approval/documents/${id}/approve`, { method: "POST", body: { comment } }),
  erpRejectDoc: (id, comment) => req(`/erp/approval/documents/${id}/reject`, { method: "POST", body: { comment } }),
  erpLeaveBalance: (year) => req(`/erp/leave/balance${year ? `?year=${year}` : ""}`),
  erpLeaveStatus: (year) => req(`/erp/leave/status${year ? `?year=${year}` : ""}`),
  erpLeaveCalendar: (year, month) => req(`/erp/leave/calendar?year=${year}&month=${month}`),
  erpLeaveRewards: (year) => req(`/erp/leave/rewards${year ? `?year=${year}` : ""}`),
  erpGrantLeaveReward: (data) => req("/erp/leave/rewards", { method: "POST", body: data }),
  erpUpdateLeaveBalance: (userId, data) => req(`/erp/leave/balance/${userId}`, { method: "PATCH", body: data }),
  erpLeaveRequests: () => req("/erp/leave/requests"),
  erpSaveLeaveRequest: (data) => req("/erp/leave/requests", { method: "POST", body: data }),
  erpMeetingNotes: () => req("/erp/meetings"),
  erpMeetingNote: (id) => req(`/erp/meetings/${id}`),
  erpSaveMeetingNote: (data) => req("/erp/meetings", { method: "POST", body: data }),
  erpDeleteMeetingNote: (id) => req(`/erp/meetings/${id}`, { method: "DELETE" }),
  erpCompanyEvents: () => req("/erp/events"),
  erpCreateEvent: (data) => req("/erp/events", { method: "POST", body: data }),
  erpEventRsvp: (id, response) => req(`/erp/events/${id}/rsvp`, { method: "POST", body: { response } }),
  erpOkr: (quarter) => req(`/erp/okr${quarter ? `?quarter=${quarter}` : ""}`),
  erpSaveOkr: (data) => req("/erp/okr", { method: "POST", body: data }),
  erpUpdateKr: (id, data) => req(`/erp/okr/key-results/${id}`, { method: "PATCH", body: data }),
  erpSalesSyncStatus: () => req("/erp/sales/status"),
  erpSalesSyncSheets: (kind) => req(`/erp/sales/sheets?kind=${kind}`),
  erpSalesSync: (kind, sheetName, opts = {}) =>
    req("/erp/sales/sync", {
      method: "POST",
      body: {
        kind,
        sheetName,
        mode: opts.mode || "one",
        background: opts.background !== false,
      },
    }),
  erpSalesSyncAll: (kind) =>
    req("/erp/sales/sync", {
      method: "POST",
      body: { kind, mode: "all", background: true },
    }),
  erpSalesJob: (id) => req(`/erp/sales/jobs/${id}`),
  erpSalesRows: ({ kind, sheetName, q, page, pageSize } = {}) => {
    const p = new URLSearchParams();
    if (kind) p.set("kind", kind);
    if (sheetName) p.set("sheetName", sheetName);
    if (q) p.set("q", q);
    if (page) p.set("page", String(page));
    if (pageSize) p.set("pageSize", String(pageSize));
    return req(`/erp/sales/rows?${p}`);
  },
  erpPaymentRateMeta: () => req("/erp/sales/payment-rate/meta"),
  erpPaymentRate: (body) => req("/erp/sales/payment-rate", { method: "POST", body }),
  erpSalesTrend: ({ tab, industries } = {}) => {
    const p = new URLSearchParams();
    if (tab) p.set("tab", tab);
    for (const industry of industries || []) {
      if (industry) p.append("industry", industry);
    }
    return req(`/erp/sales/trend?${p}`);
  },
  erpSalesInquiryTrend: ({ tab, industries, all } = {}) => {
    const p = new URLSearchParams();
    if (tab) p.set("tab", tab);
    if (all) p.set("all", "1");
    for (const industry of industries || []) {
      if (industry) p.append("industry", industry);
    }
    return req(`/erp/sales/trend/inquiry?${p}`);
  },
  erpSalesClosing: ({ refresh } = {}) => req(`/erp/sales/closing${refresh ? "?refresh=1" : ""}`),
  erpSalesClosingLeadUpdate: (id, body) => req(`/erp/sales/closing/lead/${id}`, { method: "PUT", body }),
  erpSalesClosingLogs: ({ days } = {}) => req(`/erp/sales/closing/logs${days ? `?days=${days}` : ""}`),
  erpSalesDashboard: ({ month } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    return req(`/erp/sales/dashboard?${p}`);
  },
  erpSalesDashboardGoals: (body) => req("/erp/sales/dashboard/goals", { method: "PUT", body }),
  // 일일보고 (CEO/COO 전용)
  erpDailyReports: ({ month } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    return req(`/erp/daily-reports?${p}`);
  },
  erpDailyReportPrevPlan: (date) => req(`/erp/daily-reports/prev-plan?date=${encodeURIComponent(date)}`),
  erpDailyReportSave: (date, body) => req(`/erp/daily-reports/${date}`, { method: "PUT", body }),
  erpDailyReportDelete: (date) => req(`/erp/daily-reports/${date}`, { method: "DELETE" }),
  erpDailyComments: ({ month } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    return req(`/erp/daily-comments?${p}`);
  },
  erpDailyCommentAdd: (body) => req("/erp/daily-comments", { method: "POST", body }),
  erpDailyCommentResolve: (id, resolved) => req(`/erp/daily-comments/${id}/resolve`, { method: "POST", body: { resolved } }),
  erpDailyCommentImportant: (id, important) => req(`/erp/daily-comments/${id}/important`, { method: "POST", body: { important } }),
  erpDailyCommentDelete: (id) => req(`/erp/daily-comments/${id}`, { method: "DELETE" }),
  erpDailyCommentFileUrl: (key) => req(`/erp/daily-comments/file?key=${encodeURIComponent(key)}`),
  erpMarketingDashboard: ({ month } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    return req(`/erp/sales/marketing-dashboard?${p}`);
  },
  erpSalesDashboardRefresh: (month) => req("/erp/sales/dashboard/refresh", { method: "POST", body: { month } }),
  // IoT 견적 리드
  erpIotLeads: ({ status } = {}) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    return req(`/erp/iot-leads?${p}`);
  },
  erpIotLeadUpdate: (id, body) => req(`/erp/iot-leads/${id}`, { method: "PATCH", body }),
  erpIotLeadDelete: (id) => req(`/erp/iot-leads/${id}`, { method: "DELETE" }),
  // 크라이저 발주 (소유자 전용)
  erpVendorOrders: () => req("/erp/vendor-orders"),
  erpVendorOrdersAccess: () => req("/erp/vendor-orders/access"),
  erpVendorPortalUpdate: (body) => req("/erp/vendor-orders/portal", { method: "PUT", body }),
  erpVendorOrderCreate: (body) => req("/erp/vendor-orders", { method: "POST", body }),
  erpVendorOrderUpdate: (id, body) => req(`/erp/vendor-orders/${id}`, { method: "PATCH", body }),
  erpVendorOrderDelivery: (id, body) => req(`/erp/vendor-orders/${id}/delivery`, { method: "POST", body }),
  erpVendorOrderDelete: (id) => req(`/erp/vendor-orders/${id}`, { method: "DELETE" }),
  erpMarketingDashboardRefresh: (month) => req("/erp/sales/marketing-dashboard/refresh", { method: "POST", body: { month } }),
  erpMarketingDashboardGoals: (body) => req("/erp/sales/marketing-dashboard/goals", { method: "PUT", body }),
  // 공사(견적) 관리 — 소유자 전용
  erpConstructionItems: () => req("/erp/construction/items"),
  erpConstructionCreateItem: (data) => req("/erp/construction/items", { method: "POST", body: data }),
  erpConstructionUpdateItem: (id, data) => req(`/erp/construction/items/${id}`, { method: "PATCH", body: data }),
  erpConstructionDeleteItem: (id) => req(`/erp/construction/items/${id}`, { method: "DELETE" }),
  erpConstructionApartments: () => req("/erp/construction/apartments"),
  erpConstructionCreateApartment: (data) => req("/erp/construction/apartments", { method: "POST", body: data }),
  erpConstructionUpdateApartment: (id, data) => req(`/erp/construction/apartments/${id}`, { method: "PATCH", body: data }),
  erpConstructionDeleteApartment: (id) => req(`/erp/construction/apartments/${id}`, { method: "DELETE" }),
  erpConstructionTeams: () => req("/erp/construction/teams"),
  erpConstructionCreateTeam: (data) => req("/erp/construction/teams", { method: "POST", body: data }),
  erpConstructionUpdateTeam: (id, data) => req(`/erp/construction/teams/${id}`, { method: "PATCH", body: data }),
  erpConstructionDeleteTeam: (id) => req(`/erp/construction/teams/${id}`, { method: "DELETE" }),
  erpConstructionStocks: () => req("/erp/construction/stocks"),
  erpConstructionCreateStock: (data) => req("/erp/construction/stocks", { method: "POST", body: data }),
  erpConstructionDeleteStock: (id) => req(`/erp/construction/stocks/${id}`, { method: "DELETE" }),
  erpConstructionAddStockMove: (id, data) => req(`/erp/construction/stocks/${id}/moves`, { method: "POST", body: data }),
  erpConstructionDeleteStockMove: (id) => req(`/erp/construction/stock-moves/${id}`, { method: "DELETE" }),
  erpConstructionShareQuote: (id, days) => req(`/erp/construction/quotes/${id}/share`, { method: "POST", body: days ? { days } : {} }),
  erpConstructionDisableShare: (id) => req(`/erp/construction/quotes/${id}/share/disable`, { method: "POST" }),
  erpInstallSettleShare: (team, from, to) => req("/erp/install-settle-share", { method: "POST", body: { team, from, to } }),
  erpInstallSettlePayout: (team, payout) => req("/erp/install-settle-share/payout", { method: "PUT", body: { team, payout } }),
  erpConstructionSurveyShare: (id, days) => req(`/erp/construction/quotes/${id}/survey-share`, { method: "POST", body: days ? { days } : {} }),
  erpConstructionSurveyDisable: (id) => req(`/erp/construction/quotes/${id}/survey-share/disable`, { method: "POST" }),
  erpConstructionQuotes: () => req("/erp/construction/quotes"),
  erpConstructionCreateQuote: (data) => req("/erp/construction/quotes", { method: "POST", body: data }),
  erpConstructionUpdateQuote: (id, data) => req(`/erp/construction/quotes/${id}`, { method: "PATCH", body: data }),
  erpConstructionDeleteQuote: (id) => req(`/erp/construction/quotes/${id}`, { method: "DELETE" }),
  erpInstallScheduleMonths: () => req("/erp/install-schedule/months"),
  erpInstallSchedule: ({ month, from, to } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return req(`/erp/install-schedule?${p}`);
  },
  erpInstallScheduleCreate: (data) => req("/erp/install-schedule", { method: "POST", body: data }),
  erpInstallScheduleUpdate: (id, data) => req(`/erp/install-schedule/${id}`, { method: "PATCH", body: data }),
  erpInstallScheduleDelete: (id) => req(`/erp/install-schedule/${id}`, { method: "DELETE" }),
  erpConsultAccess: () => req("/erp/consult-docs/access"),
  erpConsultDocs: ({ from, to } = {}) => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return req(`/erp/consult-docs?${p}`);
  },
  erpConsultCreate: (data) => req("/erp/consult-docs", { method: "POST", body: data }),
  erpConsultApprove: (id, value) => req(`/erp/consult-docs/${id}/approve`, { method: "POST", body: { value } }),
  erpConsultDelete: (id) => req(`/erp/consult-docs/${id}`, { method: "DELETE" }),
  erpBrojDashboard: () => req("/erp/broj-dashboard"),
  erpSalesRevenue: ({ month } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    return req(`/erp/sales-revenue?${p}`);
  },
  erpInstallScheduleSheetTabs: () => req("/erp/install-schedule/sheet-tabs"),
  erpInstallScheduleImport: (sheetName) => req("/erp/install-schedule/import", { method: "POST", body: { sheetName } }),
  erpSalesTaxInvoices: ({ month } = {}) => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    return req(`/erp/sales/tax-invoices?${p}`);
  },
  erpSalesDaily: ({ date, period } = {}) => {
    const p = new URLSearchParams();
    if (date) p.set("date", date);
    if (period) p.set("period", period);
    return req(`/erp/sales/daily?${p}`);
  },
};
