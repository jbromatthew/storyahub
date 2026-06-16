import { geminiJson, geminiText } from "./gemini.js";
import { FULL_STT_MAX_BYTES, LONG_MEETING_SEC } from "./meetingLimits.js";

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

export type TranscribeOptions = {
  durationSec?: number;
  fileBytes?: number;
};

const STT_JSON_SCHEMA = `오디오를 화자 분리하여 한국어로 전사하고 JSON만 출력한다.
스키마:
{
  "utterances": [{"speaker":"참석자 1","time":"00:01","text":"발화 내용"}],
  "talk_ratio": {
    "comment": "대화 균형에 대한 한 줄 평가(한국어)",
    "speakers": [{"label":"참석자 1","pct":69.1}]
  }
}
규칙:
- speaker는 "참석자 1", "참석자 2" 형식 (최대 4명)
- time은 mm:ss
- utterances는 최대 80개 (긴 미팅이면 3~5분 간격 핵심 발화 위주)
- 설명·코드펜스 금지`;

const STT_TEXT_PROMPT = `오디오 전체를 한국어로 전사한다. JSON 금지, 줄 단위 텍스트만 출력.
각 줄: [mm:ss] 참석자 N: 발화내용
긴 미팅(30분+)이면 3~5분 간격 핵심 발화 위주로 샘pling해도 된다. 최대 150줄.
화자는 "참석자 1", "참석자 2" 형식.`;

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

function parseTranscriptLines(text: string): Utterance[] {
  const utterances: Utterance[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^\[(\d{1,2}:\d{2})\]\s*(.+?):\s*(.+)$/);
    if (m) {
      utterances.push({ time: m[1], speaker: m[2].trim(), text: m[3].trim() });
    } else {
      utterances.push({ speaker: "참석자 1", time: "00:00", text: trimmed });
    }
  }
  return utterances;
}

function buildResult(utterances: Utterance[], talk_ratio?: TalkRatio): TranscriptResult {
  const plain = utterances.map((u) => `[${u.time}] ${u.speaker}: ${u.text}`).join("\n");
  return { utterances, plain, ...(talk_ratio ? { talk_ratio } : {}) };
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

function shouldUseCompactStt(opts?: TranscribeOptions): boolean {
  const durationSec = opts?.durationSec ?? 0;
  const fileBytes = opts?.fileBytes ?? 0;
  return durationSec >= LONG_MEETING_SEC || fileBytes > FULL_STT_MAX_BYTES;
}

async function transcribeAudioCompact(audioBase64: string, mimeType: string): Promise<TranscriptResult> {
  const text = await geminiText(
    [{ text: STT_TEXT_PROMPT }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
    "음성 전사(STT) 전문가",
    { maxOutputTokens: 8192 }
  );
  const utterances = parseTranscriptLines(text);
  if (!utterances.length && text.trim()) {
    return plainToTranscript(text.trim());
  }
  return buildResult(utterances);
}

async function transcribeAudioFull(audioBase64: string, mimeType: string): Promise<TranscriptResult> {
  const raw = await geminiJson<{
    utterances?: Partial<Utterance>[];
    talk_ratio?: TalkRatio;
  }>(
    [{ text: STT_JSON_SCHEMA }, { inline_data: { mime_type: mimeType, data: audioBase64 } }],
    "음성 전사(STT)·화자 분리 전문가",
    { maxOutputTokens: 8192 }
  );

  const utterances = normalizeUtterances(raw.utterances);
  return buildResult(utterances, raw.talk_ratio);
}

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  opts?: TranscribeOptions
): Promise<TranscriptResult> {
  if (shouldUseCompactStt(opts)) {
    return transcribeAudioCompact(audioBase64, mimeType);
  }
  return transcribeAudioFull(audioBase64, mimeType);
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
