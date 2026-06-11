import { geminiJson } from "./gemini.js";

export interface Utterance {
  speaker: string;
  time: string;
  text: string;
}

export interface TalkRatio {
  comment: string;
  speakers: { label: string; pct: number }[];
}

export interface TranscriptResult {
  utterances: Utterance[];
  plain: string;
  talk_ratio?: TalkRatio;
}

const STT_SCHEMA = `오디오를 화자 분리하여 한국어로 전사하고 JSON만 출력한다.
스키마:
{
  "utterances": [{"speaker":"참석자 1","time":"00:01","text":"발화 내용"}],
  "talk_ratio": {
    "comment": "대화 균형에 대한 한 줄 평가(한국어)",
    "speakers": [{"label":"참석자 1","pct":69.1}]
  }
}
규칙:
- speaker는 반드시 "참석자 1", "참석자 2" 형식 (최대 4명)
- time은 mm:ss (추정 가능)
- 발화 단위로 나눈다. 설명·코드펜스 금지
- talk_ratio.pct 합은 100에 가깝게`;

function normalizeUtterances(raw: Partial<Utterance>[] | undefined): Utterance[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((u, i) => ({
      speaker: (u.speaker || `참석자 ${(i % 2) + 1}`).trim(),
      time: (u.time || "00:00").trim(),
      text: (u.text || "").trim(),
    }))
    .filter((u) => u.text);
}

export function plainToTranscript(text: string): TranscriptResult {
  const t = text.trim();
  return {
    utterances: t ? [{ speaker: "참석자 1", time: "00:00", text: t }] : [],
    plain: t,
  };
}

export function transcriptToText(t: TranscriptResult): string {
  if (t.plain?.trim()) return t.plain.trim();
  return t.utterances.map((u) => `[${u.time}] ${u.speaker}: ${u.text}`).join("\n");
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<TranscriptResult> {
  const raw = await geminiJson<{
    utterances?: Partial<Utterance>[];
    talk_ratio?: TalkRatio;
  }>(
    [
      { text: STT_SCHEMA },
      { inline_data: { mime_type: mimeType, data: audioBase64 } },
    ],
    "음성 전사(STT)·화자 분리 전문가"
  );

  const utterances = normalizeUtterances(raw.utterances);
  const plain = utterances.map((u) => `[${u.time}] ${u.speaker}: ${u.text}`).join("\n");
  return {
    utterances,
    plain,
    talk_ratio: raw.talk_ratio,
  };
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
