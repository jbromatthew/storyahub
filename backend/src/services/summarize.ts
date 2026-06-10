import { env } from "../env.js";

// 기획서 4장의 표준 프롬프트. 출력은 JSON 고정 → 액션→할일, 다음약속→일정 자동 분기.
const SYSTEM_PROMPT = `당신은 한국어 영업/업무 미팅 기록을 정리하는 어시스턴트다.
아래 전사(transcript)를 바탕으로 JSON만 출력한다. 설명·인사·코드펜스 금지.
원문에 없는 사실을 만들지 말 것. 불확실하면 confidence를 'low'로, 확인 필요한 항목은 needs_review에 넣는다.
금액·날짜·고유명사는 원문 표기를 보존한다. (딜 금액/단계는 추출하지 않는다 — 사용자가 직접 입력)
출력 스키마:
{
  "one_line": "한 줄 요약(40자 내외)",
  "key_points": ["핵심 논의 3~6개"],
  "actions": [{"task":"할 일","owner":"담당","due":"YYYY-MM-DD|null","priority":"high|mid|low"}],
  "next_meeting": {"date":"YYYY-MM-DD|null","time":"HH:mm|null","place":"|null"},
  "attendees": ["이름/직책"],
  "confidence": "high|mid|low",
  "needs_review": ["불확실해 사람이 확인할 항목"]
}`;

export interface SummaryResult {
  one_line: string;
  key_points: string[];
  actions: { task: string; owner: string | null; due: string | null; priority: "high" | "mid" | "low" }[];
  next_meeting: { date: string | null; time: string | null; place: string | null };
  attendees: string[];
  confidence: "high" | "mid" | "low";
  needs_review: string[];
}

// transcript(STT 결과 텍스트) → 구조화 요약.
// 실제 STT는 Gemini audio 또는 별도 STT로 처리하고, 여기서는 텍스트 요약을 담당.
export async function summarize(transcript: string, template = "영업"): Promise<SummaryResult> {
  if (!env.gemini.apiKey) {
    // 키 없을 때 개발용 스텁
    return {
      one_line: "(stub) 단가 인상안 협의",
      key_points: ["3분기 단가 5% 인상 논의", "7월 추가 발주 검토"],
      actions: [{ task: "견적서 재작성", owner: "나", due: null, priority: "high" }],
      next_meeting: { date: null, time: null, place: null },
      attendees: [],
      confidence: "low",
      needs_review: ["GEMINI_API_KEY 미설정 — 실제 요약 아님"],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent?key=${env.gemini.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `[템플릿:${template}]\n전사:\n${transcript}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(text) as SummaryResult;
}
