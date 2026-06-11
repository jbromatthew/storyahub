import { Router, type Response } from "express";
import { randomUUID } from "node:crypto";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { presignPut, presignGet, putObjectBytes, getObjectBytes } from "../services/r2.js";
import { mimeFromKey } from "../services/stt.js";
import { env } from "../env.js";

export const uploadsRouter = Router();
uploadsRouter.use(auth);

function safeFilename(raw: string): string {
  const name = decodeURIComponent(raw || "upload").split(/[/\\]/).pop() || "upload";
  return name.replace(/[^\w.\-가-힣]/g, "_").slice(0, 120) || "upload";
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
    const contentType = String(req.headers["content-type"] ?? "application/octet-stream");
    const key = `u/${req.userId}/${randomUUID()}/${filename}`;
    await putObjectBytes(key, buf, contentType);
    res.json({ key });
  } catch (e) {
    console.error("direct upload", e);
    res.status(500).json({ error: (e as Error).message || "업로드 실패" });
  }
}

// 업로드용 presigned URL 발급 → 클라이언트가 R2로 직접 PUT (서버는 바이트를 거치지 않음).
uploadsRouter.post("/presign", async (req: AuthedRequest, res) => {
  const { filename, contentType } = req.body ?? {};
  if (!filename) return res.status(400).json({ error: "filename 필요" });
  const key = `u/${req.userId}/${randomUUID()}/${filename}`;
  const url = await presignPut(key, contentType ?? "application/octet-stream");
  res.json({ key, url });
});

// 브라우저 <audio> 재생용 — R2 presigned URL은 CORS 때문에 로컬에서 막히는 경우가 많아 서버 경유
uploadsRouter.get("/stream", async (req: AuthedRequest, res) => {
  try {
    const key = String(req.query.key ?? "");
    if (!key.startsWith(`u/${req.userId}/`)) return res.status(403).json({ error: "forbidden" });
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
  if (!key.startsWith(`u/${req.userId}/`)) return res.status(403).json({ error: "forbidden" });
  res.json({ url: await presignGet(key) });
});
