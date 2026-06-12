/** 앱 전역 토스트 — 한도·제약·오류 알림 */

const listeners = new Set();
let seq = 0;

export function subscribeToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {string} message
 * @param {{ type?: 'error'|'success'|'info', duration?: number }} [opts]
 */
export function toast(message, opts = {}) {
  if (!message) return;
  const item = {
    id: ++seq,
    message: String(message),
    type: opts.type || "info",
    duration: opts.duration ?? (opts.type === "error" ? 5200 : 3600),
  };
  listeners.forEach((fn) => fn(item));
  return item.id;
}

export function toastError(message) {
  return toast(message, { type: "error" });
}

export function toastSuccess(message) {
  return toast(message, { type: "success" });
}

/** API·업로드에서 자동 토스트하는 한도·제약 HTTP 상태 */
export const TOAST_ERROR_STATUSES = new Set([402, 403, 410, 413]);

/** API·업로드 등에서 이미 토스트한 한도/제약 오류는 중복 표시 방지 */
export function notifyError(err, fallback = "요청에 실패했습니다") {
  const status = err?.status ?? 0;
  if (TOAST_ERROR_STATUSES.has(status)) return;
  toastError(err?.message || fallback);
}

export function notifyUploadError(res, fallback = "파일 업로드 실패") {
  let msg = fallback;
  if (res.status === 413) msg = "파일이 너무 큽니다 (최대 150MB)";
  else if (res.status === 402) msg = "이용 한도에 도달했거나 이용 기간이 만료되었습니다";
  else if (res.status === 403) msg = "이 파일은 현재 플랜에서 업로드할 수 없습니다";
  toastError(msg);
  return msg;
}
