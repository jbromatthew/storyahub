/** 미팅·업로드 공통 한도 (프론트·API·Nginx와 맞춤) */
export const MAX_MEETING_DURATION_SEC = 7200; // 2시간
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150MB

/** 이 길이 이상이면 compact STT + 구간 요약 파이프라인 */
export const LONG_MEETING_SEC = 1800; // 30분

/** full JSON STT는 짧은 파일에만 (출력 토큰·JSON 파싱 안정성) */
export const FULL_STT_MAX_BYTES = 20 * 1024 * 1024;

export const MAX_SUMMARIZE_INPUT_CHARS = 55_000;
export const SUMMARIZE_CHUNK_CHARS = 22_000;

export function clampDurationSec(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_MEETING_DURATION_SEC, Math.round(n));
}

export function isLongMeeting(durationSec: number, fileBytes = 0): boolean {
  return durationSec >= LONG_MEETING_SEC || fileBytes > FULL_STT_MAX_BYTES;
}
