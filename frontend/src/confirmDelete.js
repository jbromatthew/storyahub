/** 삭제 전 확인 — 모든 삭제 UI에서 공통 사용 */
export function confirmDelete(label) {
  return window.confirm(
    `정말 "${label}"을(를) 삭제할까요?\n\n삭제하면 되돌릴 수 없습니다.`
  );
}
