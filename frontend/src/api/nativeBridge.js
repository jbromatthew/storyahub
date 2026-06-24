import { getApiBase, getToken } from "./client.js";

export function isNativeShell() {
  return typeof window !== "undefined" && window.__STORYAHUB_NATIVE__ === true;
}

export function getNativePlatform() {
  return window.__STORYAHUB_PLATFORM__ || null;
}

function postNative(message) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function base64ToFile(base64, filename, mime) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename || `photo-${Date.now()}.jpg`, { type: mime || "image/jpeg" });
}

let pickImagePending = null;
let pickImagesPending = null;
let pickDocumentPending = null;
let pickImageListenerReady = false;

function ensurePickImageListener() {
  if (pickImageListenerReady) return;
  pickImageListenerReady = true;
  window.addEventListener("storyahub-native", (event) => {
    const msg = event.detail;
    if (pickImagePending && msg?.requestId && msg.requestId === pickImagePending.requestId) {
      const { resolve, reject } = pickImagePending;
      pickImagePending = null;
      if (msg.type === "IMAGE_PICKED") {
        resolve(base64ToFile(msg.base64, msg.filename, msg.mime));
      } else if (msg.type === "IMAGE_PICK_CANCELLED") {
        const err = new Error("cancelled");
        err.name = "PickCancelled";
        reject(err);
      } else if (msg.type === "IMAGE_PICK_ERROR") {
        reject(new Error(msg.message || "사진 선택 실패"));
      }
      return;
    }
    if (pickImagesPending && msg?.requestId && msg.requestId === pickImagesPending.requestId) {
      const { resolve, reject } = pickImagesPending;
      pickImagesPending = null;
      if (msg.type === "IMAGES_PICKED") {
        resolve((msg.images || []).map((img) => base64ToFile(img.base64, img.filename, img.mime)));
      } else if (msg.type === "IMAGE_PICK_CANCELLED") {
        const err = new Error("cancelled");
        err.name = "PickCancelled";
        reject(err);
      } else if (msg.type === "IMAGE_PICK_ERROR") {
        reject(new Error(msg.message || "사진 선택 실패"));
      }
      return;
    }
    if (pickDocumentPending && msg?.requestId && msg.requestId === pickDocumentPending.requestId) {
      const { resolve, reject } = pickDocumentPending;
      pickDocumentPending = null;
      if (msg.type === "DOCUMENT_PICKED") {
        resolve(base64ToFile(msg.base64, msg.filename, msg.mime));
      } else if (msg.type === "IMAGE_PICK_CANCELLED") {
        const err = new Error("cancelled");
        err.name = "PickCancelled";
        reject(err);
      } else if (msg.type === "IMAGE_PICK_ERROR") {
        reject(new Error(msg.message || "파일 선택 실패"));
      }
    }
  });
}

/** @param {"camera"|"library"} source */
export function pickNativeImageFile(source = "camera") {
  if (!isNativeShell()) {
    return Promise.reject(new Error("Native shell only"));
  }
  ensurePickImageListener();
  const requestId = `pick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pickImagePending = { requestId, resolve, reject };
    postNative({ type: "PICK_IMAGE", source, requestId });
    setTimeout(() => {
      if (!pickImagePending || pickImagePending.requestId !== requestId) return;
      pickImagePending.reject(new Error("사진 선택 시간 초과"));
      pickImagePending = null;
    }, 120000);
  });
}

/** iOS 앱 — 앨범 다중 선택 */
export function pickNativeImageFiles(maxCount = 10) {
  if (!isNativeShell()) {
    return Promise.reject(new Error("Native shell only"));
  }
  ensurePickImageListener();
  const requestId = `pickm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pickImagesPending = { requestId, resolve, reject };
    postNative({ type: "PICK_IMAGES", maxCount, requestId });
    setTimeout(() => {
      if (!pickImagesPending || pickImagesPending.requestId !== requestId) return;
      pickImagesPending.reject(new Error("사진 선택 시간 초과"));
      pickImagesPending = null;
    }, 120000);
  });
}

/** iOS 앱 — 문서·PDF·영상 등 파일 선택 */
export function pickNativeDocumentFile() {
  if (!isNativeShell()) {
    return Promise.reject(new Error("Native shell only"));
  }
  ensurePickImageListener();
  const requestId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    pickDocumentPending = { requestId, resolve, reject };
    postNative({ type: "PICK_DOCUMENT", requestId });
    setTimeout(() => {
      if (!pickDocumentPending || pickDocumentPending.requestId !== requestId) return;
      pickDocumentPending.reject(new Error("파일 선택 시간 초과"));
      pickDocumentPending = null;
    }, 120000);
  });
}

export class NativeRecordingResult {
  constructor(mediaKey, durationSec, mime = "audio/mp4") {
    this.mediaKey = mediaKey;
    this.durationSec = durationSec;
    this.mime = mime;
    this._isNativeRecording = true;
  }
}

export function isNativeRecordingResult(value) {
  return value?._isNativeRecording === true;
}

class NativeShellRecorder {
  constructor({ onInterrupted } = {}) {
    this.onInterrupted = onInterrupted;
    this._pendingStop = null;
    this._stopped = false;
    this._handleEvent = this._handleEvent.bind(this);
    window.addEventListener("storyahub-native", this._handleEvent);
  }

  _handleEvent(event) {
    const msg = event.detail;
    if (msg?.type === "RECORD_STOPPED" && this._pendingStop) {
      const { resolve } = this._pendingStop;
      this._pendingStop = null;
      this._stopped = true;
      resolve(
        new NativeRecordingResult(
          msg.mediaKey,
          msg.durationSec ?? 0,
          msg.mime || "audio/mp4",
        ),
      );
    } else if (msg?.type === "RECORD_ERROR" && this._pendingStop) {
      const { reject } = this._pendingStop;
      this._pendingStop = null;
      reject(new Error(msg.message || "녹음 실패"));
    } else if (msg?.type === "RECORD_INTERRUPTED") {
      this.onInterrupted?.();
    }
  }

  async start() {
    postNative({ type: "RECORD_START" });
  }

  stop() {
    return new Promise((resolve, reject) => {
      this._pendingStop = { resolve, reject };
      postNative({
        type: "RECORD_STOP",
        apiBase: getApiBase(),
        token: getToken() || undefined,
        filename: `recording-${Date.now()}.m4a`,
      });
      setTimeout(() => {
        if (!this._pendingStop) return;
        this._pendingStop.reject(new Error("녹음 업로드 시간 초과"));
        this._pendingStop = null;
      }, 180000);
    });
  }

  dispose() {
    window.removeEventListener("storyahub-native", this._handleEvent);
    if (!this._stopped) {
      postNative({ type: "RECORD_CANCEL" });
    }
    this._pendingStop = null;
  }
}

class WebMediaRecorder {
  constructor({ onInterrupted } = {}) {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.wakeLock = null;
    this.onInterrupted = onInterrupted;
    this._onVisibility = () => this._handleVisibility();
  }

  async _requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      this.wakeLock?.release?.();
      this.wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      /* 권한 거부·미지원 */
    }
  }

  _handleVisibility() {
    if (document.visibilityState === "visible" && this.mediaRecorder?.state === "recording") {
      void this._requestWakeLock();
    }
  }

  _bindInterruptHandlers() {
    const track = this.stream?.getAudioTracks?.()[0];
    if (track) {
      track.onended = () => {
        if (this.mediaRecorder?.state === "recording") this.onInterrupted?.();
      };
    }
    this.mediaRecorder.onerror = () => this.onInterrupted?.();
  }

  _cleanup() {
    document.removeEventListener("visibilitychange", this._onVisibility);
    this.wakeLock?.release?.();
    this.wakeLock = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(250);
    this.mime = mime;
    this._bindInterruptHandlers();
    document.addEventListener("visibilitychange", this._onVisibility);
    await this._requestWakeLock();
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return reject(new Error("녹음이 시작되지 않았습니다"));
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mime });
        this.stream?.getTracks().forEach((t) => t.stop());
        this._cleanup();
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  dispose() {
    this._cleanup();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.mediaRecorder?.state === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

/** @param {{ onInterrupted?: () => void }} [opts] */
export function createAudioRecorder(opts = {}) {
  if (isNativeShell()) {
    return new NativeShellRecorder(opts);
  }
  return new WebMediaRecorder(opts);
}
