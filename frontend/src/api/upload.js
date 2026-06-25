import { getToken, getApiBase, api } from "./client.js";
import { toastError, TOAST_ERROR_STATUSES } from "../toast.js";

const urlCache = new Map();

/** 서버 경유 R2 업로드 (브라우저→R2 presigned PUT은 CORS 미설정 시 Failed to fetch) */
export async function uploadBlob(blob, filename, contentType) {
  const res = await fetch(`${getApiBase()}/uploads/direct`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      "Content-Type": contentType || "application/octet-stream",
      "X-Filename": encodeURIComponent(filename || `upload-${Date.now()}`),
    },
    body: blob,
  });

  if (!res.ok) {
    let msg = res.status === 413 ? "파일이 너무 큽니다 (최대 150MB)" : "파일 업로드 실패";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      msg = (await res.text()) || msg;
    }
    if (TOAST_ERROR_STATUSES.has(res.status)) toastError(msg);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const { key } = await res.json();
  return key;
}

function mimeFromFilename(name, { audio = false } = {}) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  const audioMap = {
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
    aac: "audio/aac",
    ogg: "audio/ogg",
    mp4: "audio/mp4",
    caf: "audio/x-caf",
  };
  const imageMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", gif: "image/gif" };
  if (audio) return audioMap[ext] || null;
  return imageMap[ext] || audioMap[ext] || null;
}

function ensureAudioFilename(name) {
  if (!name) return `recording-${Date.now()}.m4a`;
  if (!/\.(m4a|mp3|wav|webm|aac|ogg|mp4|caf)$/i.test(name)) return `${name.replace(/\.\w+$/, "")}.m4a`;
  return name;
}

export function normalizeAudioMime(file) {
  const name = ensureAudioFilename(file?.name);
  let type = file?.type || "";
  // iOS·macOS m4a가 video/mp4, application/octet-stream 으로 오는 경우
  if (!type.startsWith("audio/") || type === "video/mp4" || type === "application/octet-stream") {
    type = mimeFromFilename(name, { audio: true }) || "audio/mp4";
  }
  return { name, type };
}

export async function uploadFile(file, { audio = false } = {}) {
  if (audio) {
    const { name, type } = normalizeAudioMime(file);
    return uploadBlob(file, name, type);
  }
  const name = file.name || `upload-${Date.now()}.jpg`;
  const type = file.type || mimeFromFilename(name) || "application/octet-stream";
  return uploadBlob(file, name, type);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") return reject(new Error("파일 읽기 실패"));
      resolve(dataUrl.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

/** 인증된 스트림 → blob URL (오디오 재생 CORS 회피) */
export async function mediaUrl(mediaKey) {
  if (!mediaKey) return null;
  if (urlCache.has(mediaKey)) return urlCache.get(mediaKey);
  const res = await fetch(
    `${getApiBase()}/uploads/stream?key=${encodeURIComponent(mediaKey)}`,
    {
      credentials: "include",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }
  );
  if (!res.ok) {
    let msg = "미디어 로드 실패";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  urlCache.set(mediaKey, url);
  return url;
}

/** 첨부파일 열기 — WebView에서는 blob URL 대신 presigned URL 사용 */
export async function openMediaFile(mediaKey) {
  if (!mediaKey) throw new Error("파일이 없습니다");
  const { url } = await api.getUploadUrl(mediaKey);
  if (!url) throw new Error("파일 URL을 가져오지 못했습니다");
  if (isNativeShell()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export class PickCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "PickCancelled";
  }
}

export function isPickCancelled(err) {
  return err instanceof PickCancelled || err?.name === "PickCancelled";
}

/** @param {boolean} capture true면 모바일 카메라 우선 (데스크톱에서는 false 권장) */
export function pickImageFile(capture = false) {
  if (isNativeShell() && getNativePlatform() === "ios") {
    return pickNativeImageFile(capture ? "camera" : "library");
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.capture = "environment";
    const finish = (file) => {
      input.remove();
      if (file) resolve(file);
      else reject(new PickCancelled());
    };
    input.addEventListener("change", () => finish(input.files?.[0]));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** 여러 장 선택 (iOS·Android 갤러리 다중 선택) */
export function pickImageFiles(maxCount = 5) {
  if (isNativeShell() && getNativePlatform() === "ios") {
    return pickNativeImageFiles(maxCount);
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    const finish = (files) => {
      input.remove();
      if (files?.length) resolve(files.slice(0, maxCount));
      else reject(new PickCancelled());
    };
    input.addEventListener("change", () => finish(Array.from(input.files || [])));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export function pickAnyFile() {
  if (isNativeShell() && getNativePlatform() === "ios") {
    return pickNativeDocumentFile();
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,video/*,audio/*,image/*";
    const finish = (file) => {
      input.remove();
      if (file) resolve(file);
      else reject(new PickCancelled());
    };
    input.addEventListener("change", () => finish(input.files?.[0]));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export function pickAudioFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,audio/mp4,audio/x-m4a,.m4a,.mp3,.wav,.webm,.mp4,.aac,.ogg,.caf";
    const finish = (file) => {
      input.remove();
      if (file) resolve(file);
      else reject(new PickCancelled());
    };
    input.addEventListener("change", () => finish(input.files?.[0]));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** @param {File|Blob} file */
export function audioDurationSec(file, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    let settled = false;
    const done = (sec) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(sec);
    };
    const timer = setTimeout(() => done(estimateAudioSec(file)), timeoutMs);
    audio.onloadedmetadata = () => done(Math.max(0, Math.round(audio.duration)) || 0);
    audio.onerror = () => done(estimateAudioSec(file));
    audio.src = url;
  });
}

/** m4a 메타데이터 실패 시 대략 길이 추정 (~128kbps) */
function estimateAudioSec(file) {
  const bytes = file?.size || 0;
  if (!bytes) return 0;
  return Math.max(1, Math.round(bytes / (128 * 1024 / 8)));
}

import { createAudioRecorder, isNativeRecordingResult, isNativeShell, getNativePlatform, pickNativeImageFile, pickNativeImageFiles, pickNativeDocumentFile } from "./nativeBridge.js";

export { isNativeRecordingResult, isNativeShell } from "./nativeBridge.js";

/** @param {{ onInterrupted?: () => void }} [opts] */
export class AudioRecorder {
  constructor(opts = {}) {
    this._impl = createAudioRecorder(opts);
  }

  start() {
    return this._impl.start();
  }

  stop() {
    return this._impl.stop();
  }

  dispose() {
    return this._impl.dispose();
  }
}
