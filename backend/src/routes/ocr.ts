import { Router } from "express";
import { auth, type AuthedRequest } from "../middleware/auth.js";
import { requireAccess } from "../middleware/requireAccess.js";
import { getObjectBytes, isUserMediaKey } from "../services/r2.js";
import { ocrBusinessCard, ocrDocumentText } from "../services/ocr.js";
import { mimeFromKey } from "../services/stt.js";

export const ocrRouter = Router();
ocrRouter.use(auth, requireAccess);

async function loadImageBase64(userId: string, mediaKey: string, mimeType?: string) {
  if (!isUserMediaKey(mediaKey, userId)) throw new Error("forbidden");
  const buf = await getObjectBytes(mediaKey);
  return { base64: buf.toString("base64"), mime: mimeType || mimeFromKey(mediaKey, "image/jpeg") };
}

// 명함 OCR — R2 mediaKey 또는 base64
ocrRouter.post("/card", async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const { mediaKey, imageBase64, mimeType } = req.body ?? {};
    let base64 = imageBase64 as string | undefined;
    let mime = mimeType || "image/jpeg";

    if (mediaKey) {
      const loaded = await loadImageBase64(userId, mediaKey, mimeType);
      base64 = loaded.base64;
      mime = loaded.mime;
    }
    if (!base64) return res.status(400).json({ error: "mediaKey 또는 imageBase64 필요" });

    const fields = await ocrBusinessCard(base64, mime);
    res.json({ ...fields, mediaKey: mediaKey ?? null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// 문서/사진 OCR — 전사 텍스트
ocrRouter.post("/document", async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    const { mediaKeys } = req.body ?? {};
    const keys: string[] = Array.isArray(mediaKeys) ? mediaKeys : [];
    if (!keys.length) return res.status(400).json({ error: "mediaKeys 필요" });

    const parts: string[] = [];
    for (const key of keys) {
      const { base64, mime } = await loadImageBase64(userId, key);
      parts.push(await ocrDocumentText(base64, mime));
    }
    res.json({ text: parts.filter(Boolean).join("\n\n") });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
