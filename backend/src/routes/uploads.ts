import { Router, type Response } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess, type AccessRequest } from "../middleware/requireAccess.js";
import { fileUploadBlocked, getAccessStatus } from "../services/access.js";
import { getUserUsage } from "../services/usage.js";
import {
  presignPut,
  presignGet,
  putObjectBytes,
  getObjectBytes,
  buildUserMediaKey,
  isUserMediaKey,
} from "../services/r2.js";
import { mimeFromKey } from "../services/stt.js";
import { env } from "../env.js";

export const uploadsRouter = Router();
uploadsRouter.use(auth, requireAccess);

function safeFilename(raw: string): string {
  let decoded = raw || "upload";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* 이미 디코딩된 파일명 */
  }
  const name = decoded.split(/[/\\]/).pop() || "upload";
  return name.replace(/[^\w.\-가-힣]/g, "_").slice(0, 120) || "upload";
}

const AUDIO_EXTS = new Set(["m4a", "mp3", "wav", "webm", "aac", "ogg", "mp4", "caf"]);

function isAudioFilename(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTS.has(ext);
}

/** m4a는 브라우저/OS에 따라 video/mp4·octet-stream으로 올라오는 경우가 많음 */
function normalizeUploadContentType(contentType: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "m4a") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "webm") return "audio/webm";
  if (ext === "aac") return "audio/aac";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "caf") return "audio/x-caf";
  if (contentType.startsWith("audio/")) return contentType;
  if (isAudioFilename(filename)) return "audio/mp4";
  return contentType || "application/octet-stream";
}

async function assertUploadAllowed(userId: string, contentType: string, size: number, filename = "") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error("not found"), { status: 404 });

  const status = getAccessStatus(user);
  const blocked = fileUploadBlocked(status);
  const isRecordingAudio = contentType.startsWith("audio/") || isAudioFilename(filename);

  if (blocked && !isRecordingAudio) {
    throw Object.assign(new Error(blocked), { status: 403 });
  }
  if (!status.hasAccess) {
    throw Object.assign(new Error("이용 기간이 만료되었습니다."), { status: 402 });
  }

  const usage = await getUserUsage(userId);
  if (usage.storage.limitBytes > 0 && usage.storage.usedBytes + size > usage.storage.limitBytes) {
    throw Object.assign(new Error("저장 한도를 초과합니다. 플랜을 업그레이드하거나 파일을 정리해주세요."), {
      status: 402,
    });
  }
}

/** 브라우저 → R2 직접 PUT은 R2 CORS 미설정 시 Failed to fetch. 서버 경유 업로드. */
export async function directUploadHandler(req: AuthedRequest, res: Response) {
  try {
    if (!env.r2.endpoint || !env.r2.accessKeyId) {
      return res.status(503).json({ error: "R2가 설정되지 않았습니다" });
    }
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!buf.length) return res.status(400).json({ error: "파일 본문이 비어 있습니다" });

    const filename = safeFilename(String(req.headers["x-filename"] ?? "upload"));
    const contentType = normalizeUploadContentType(
      String(req.headers["content-type"] ?? "application/octet-stream"),
      filename
    );
    const maxBytes = 150 * 1024 * 1024;
    if (buf.length > maxBytes) {
      return res.status(413).json({ error: "파일이 너무 큽니다 (최대 150MB)" });
    }
    await assertUploadAllowed(req.userId!, contentType, buf.length, filename);

    const key = buildUserMediaKey(req.userId!, `${randomUUID()}/${filename}`);
    await putObjectBytes(key, buf, contentType);
    res.json({ key });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error("direct upload", e);
    res.status(err.status ?? 500).json({ error: err.message || "업로드 실패" });
  }
}

// 업로드용 presigned URL 발급 → 클라이언트가 R2로 직접 PUT (서버는 바이트를 거치지 않음).
uploadsRouter.post("/presign", async (req: AccessRequest, res) => {
  try {
    const { filename, contentType } = req.body ?? {};
    if (!filename) return res.status(400).json({ error: "filename 필요" });
    const ct = contentType ?? "application/octet-stream";
    await assertUploadAllowed(req.userId!, ct, 0);
    const key = buildUserMediaKey(req.userId!, `${randomUUID()}/${filename}`);
    const url = await presignPut(key, ct);
    res.json({ key, url });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// 브라우저 <audio> 재생용 — R2 presigned URL은 CORS 때문에 로컬에서 막히는 경우가 많아 서버 경유
uploadsRouter.get("/stream", async (req: AuthedRequest, res) => {
  try {
    const key = String(req.query.key ?? "");
    if (!isUserMediaKey(key, req.userId!)) return res.status(403).json({ error: "forbidden" });
    if (!env.r2.endpoint || !env.r2.accessKeyId) {
      return res.status(503).json({ error: "R2가 설정되지 않았습니다" });
    }
    const buf = await getObjectBytes(key);
    res.setHeader("Content-Type", mimeFromKey(key));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buf);
  } catch (e) {
    console.error("stream", e);
    res.status(404).json({ error: "파일을 찾을 수 없습니다" });
  }
});

// 다운로드/열람용 presigned URL
uploadsRouter.get("/get", async (req: AuthedRequest, res) => {
  const key = String(req.query.key ?? "");
  if (!isUserMediaKey(key, req.userId!)) return res.status(403).json({ error: "forbidden" });
  res.json({ url: await presignGet(key) });
});
