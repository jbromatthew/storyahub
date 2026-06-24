import { env } from "../env.js";

type GeminiPart = {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  file_data?: { mime_type: string; file_uri: string };
};

export type GeminiOptions = {
  maxOutputTokens?: number;
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1500, 3000, 6000];
const DEFAULT_JSON_TOKENS = 8192;
const DEFAULT_TEXT_TOKENS = 8192;

class GeminiApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(status: number, body: string) {
    super(friendlyGeminiError(status, body));
    this.name = "GeminiApiError";
    this.status = status;
    this.retryable = RETRYABLE.has(status);
  }
}

function friendlyGeminiError(status: number, body: string): string {
  let detail = "";
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message ?? "";
  } catch {
    /* ignore */
  }
  if (status === 503 || /high demand|UNAVAILABLE/i.test(detail)) {
    return "AI 서버가 일시적으로 바쁩니다. 1~2분 후 다시 시도해주세요.";
  }
  if (status === 429) {
    return "AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  }
  return detail ? `AI 처리 실패: ${detail}` : `AI 처리 실패 (${status})`;
}

function modelsToTry(): string[] {
  return [...new Set([env.gemini.model, ...env.gemini.fallbackModels])];
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Gemini JSON 응답 파싱 — 잘린 JSON·코드블록 등 복구 시도 */
export function parseJsonSafely<T>(text: string): T {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    throw new Error("긴 녹음 변환 중 AI 응답이 비어 있습니다. 잠시 후 다시 시도해주세요.");
  }

  const attempts: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(trimmed.slice(start, end + 1));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next */
    }
  }

  throw new Error("긴 녹음 변환 중 AI 응답이 잘렸습니다. 잠시 후 다시 시도해주세요.");
}

async function geminiGenerateOnce(
  model: string,
  parts: GeminiPart[],
  systemText: string | undefined,
  jsonMode: boolean,
  options?: GeminiOptions
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.gemini.apiKey}`;
  const maxOutputTokens =
    options?.maxOutputTokens ?? (jsonMode ? DEFAULT_JSON_TOKENS : DEFAULT_TEXT_TOKENS);

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GeminiApiError(res.status, await res.text());

  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? (jsonMode ? "{}" : "");
}

async function geminiGenerate(
  parts: GeminiPart[],
  systemText?: string,
  jsonMode = false,
  options?: GeminiOptions
): Promise<string> {
  if (!env.gemini.apiKey) throw new Error("GEMINI_API_KEY 미설정");

  let lastErr: Error | null = null;

  for (const model of modelsToTry()) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const text = await geminiGenerateOnce(model, parts, systemText, jsonMode, options);
        if (model !== env.gemini.model) {
          console.warn(`[gemini] primary unavailable — used fallback model: ${model}`);
        }
        return text;
      } catch (e) {
        lastErr = e as Error;
        const apiErr = e as GeminiApiError;
        if (apiErr.retryable && attempt < RETRY_DELAYS_MS.length) {
          console.warn(`[gemini] ${model} attempt ${attempt + 1} failed (${apiErr.status}), retrying…`);
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        console.warn(`[gemini] ${model} failed: ${apiErr.message}`);
        break;
      }
    }
  }

  throw lastErr ?? new Error("AI 처리 실패");
}

export async function geminiJson<T>(
  parts: GeminiPart[],
  systemText?: string,
  options?: GeminiOptions
): Promise<T> {
  const text = await geminiGenerate(parts, systemText, true, options);
  return parseJsonSafely<T>(text);
}

export async function geminiText(
  parts: GeminiPart[],
  systemText?: string,
  options?: GeminiOptions
): Promise<string> {
  return (await geminiGenerate(parts, systemText, false, options)).trim();
}

async function waitForGeminiFileActive(fileName: string, maxWaitMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${env.gemini.apiKey}`
    );
    if (!res.ok) throw new GeminiApiError(res.status, await res.text());
    const data: any = await res.json();
    const state = data?.state || data?.file?.state;
    if (state === "ACTIVE") return;
    if (state === "FAILED") throw new Error("AI 파일 처리에 실패했습니다. 다시 시도해주세요.");
    await sleep(1500);
  }
  throw new Error("AI 파일 준비 시간이 초과됐습니다. 잠시 후 다시 시도해주세요.");
}

/** 20MB inline 한도 초과 오디오 — Gemini Files API 업로드 후 file_uri 반환 */
export async function uploadGeminiFile(data: Buffer, mimeType: string, displayName: string): Promise<string> {
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.gemini.apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(data.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
    }
  );
  if (!initRes.ok) throw new GeminiApiError(initRes.status, await initRes.text());

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("AI 파일 업로드 URL을 받지 못했습니다");

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(data.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(data),
  });
  if (!upRes.ok) throw new GeminiApiError(upRes.status, await upRes.text());

  const info: any = await upRes.json();
  const file = info?.file;
  if (!file?.uri || !file?.name) throw new Error("AI 파일 업로드 응답이 올바르지 않습니다");
  await waitForGeminiFileActive(file.name);
  return file.uri as string;
}
