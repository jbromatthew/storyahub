import { geminiText } from "./gemini.js";

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const text = await geminiText(
    [
      { text: "다음 오디오를 한국어로 정확히 전사해줘. 말한 내용만 출력하고 설명은 하지 마." },
      { inline_data: { mime_type: mimeType, data: audioBase64 } },
    ],
    "음성 전사(STT) 전문가"
  );
  return text.trim();
}

export function mimeFromKey(key: string, fallback = "application/octet-stream"): string {
  const ext = key.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    webm: "audio/webm",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    pdf: "application/pdf",
  };
  return (ext && map[ext]) || fallback;
}
