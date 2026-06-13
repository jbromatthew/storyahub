/** 앱 전역 확인 다이얼로그 — 삭제·중요 액션 공통 */

let pending = null;
const listeners = new Set();

export function subscribeConfirm(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {{
 *   title: string;
 *   message?: string;
 *   confirmLabel?: string;
 *   cancelLabel?: string;
 *   destructive?: boolean;
 * }} opts
 * @returns {Promise<boolean>}
 */
export function showConfirm(opts) {
  if (pending) pending(false);
  return new Promise((resolve) => {
    pending = resolve;
    const item = {
      title: opts.title,
      message: opts.message || "",
      confirmLabel: opts.confirmLabel || "확인",
      cancelLabel: opts.cancelLabel || "취소",
      destructive: !!opts.destructive,
    };
    listeners.forEach((fn) => fn(item));
  });
}

export function resolveConfirm(ok) {
  pending?.(!!ok);
  pending = null;
  listeners.forEach((fn) => fn(null));
}

/** @param {string} label */
export function confirmDelete(label) {
  return showConfirm({
    title: `"${label}"을(를) 삭제할까요?`,
    message: "삭제하면 되돌릴 수 없습니다.",
    confirmLabel: "삭제",
    cancelLabel: "취소",
    destructive: true,
  });
}

/** @param {string} title @param {string} [message] */
export function confirmAction(title, message) {
  return showConfirm({
    title,
    message: message || "",
    confirmLabel: "확인",
    cancelLabel: "취소",
  });
}
