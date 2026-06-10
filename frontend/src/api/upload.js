import { getToken, getApiBase, api } from "./client.js";

const urlCache = new Map();

/** 서버 경유 R2 업로드 (브라우저→R2 presigned PUT은 CORS 미설정 시 Failed to fetch) */
export async function uploadBlob(blob, filename, contentType) {
  const token = getToken();
  if (!token) throw new Error("로그인이 필요합니다");

  const res = await fetch(`${getApiBase()}/uploads/direct`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType || "application/octet-stream",
      "X-Filename": encodeURIComponent(filename || `upload-${Date.now()}`),
    },
    body: blob,
  });

  if (!res.ok) {
    let msg = "파일 업로드 실패";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      msg = (await res.text()) || msg;
    }
    throw new Error(msg);
  }

  const { key } = await res.json();
  return key;
}

export async function uploadFile(file) {
  const name = file.name || `upload-${Date.now()}.jpg`;
  const type = file.type || "application/octet-stream";
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

export async function mediaUrl(mediaKey) {
  if (!mediaKey) return null;
  if (urlCache.has(mediaKey)) return urlCache.get(mediaKey);
  const { url } = await api.getUploadUrl(mediaKey);
  urlCache.set(mediaKey, url);
  return url;
}

export function pickImageFile(capture = true) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.capture = "environment";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new Error("파일이 선택되지 않았습니다"));
    };
    input.click();
  });
}

export function pickAnyFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new Error("파일이 선택되지 않았습니다"));
    };
    input.click();
  });
}

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
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
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return reject(new Error("녹음이 시작되지 않았습니다"));
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mime });
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }
}
