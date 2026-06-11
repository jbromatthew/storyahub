import { env } from "../env.js";

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1500, 3000, 6000];

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

async function geminiGenerateOnce(
  model: string,
  parts: GeminiPart[],
  systemText: string | undefined,
  jsonMode: boolean
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.gemini.apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.1,
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

async function geminiGenerate(parts: GeminiPart[], systemText?: string, jsonMode = false): Promise<string> {
  if (!env.gemini.apiKey) throw new Error("GEMINI_API_KEY 미설정");

  let lastErr: Error | null = null;

  for (const model of modelsToTry()) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const text = await geminiGenerateOnce(model, parts, systemText, jsonMode);
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

export async function geminiJson<T>(parts: GeminiPart[], systemText?: string): Promise<T> {
  const text = await geminiGenerate(parts, systemText, true);
  return JSON.parse(text) as T;
}

export async function geminiText(parts: GeminiPart[], systemText?: string): Promise<string> {
  return (await geminiGenerate(parts, systemText, false)).trim();
}
