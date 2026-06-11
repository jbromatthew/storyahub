import { env } from "../env.js";
import { geminiJson } from "./gemini.js";
import { type TranscriptResult, transcriptToText } from "./stt.js";

const SYSTEM_PROMPT = `당신은 한국어 영업/업무 미팅 기록을 정리하는 어시스턴트다.
화자·타임스탬프가 포함된 전사를 바탕으로 JSON만 출력한다. 설명·인사·코드펜스 금지.
원문에 없는 사실을 만들지 말 것. 불확실하면 confidence를 'low'로, 확인 필요한 항목은 needs_review에 넣는다.
금액·날짜·고유명사는 원문 표기를 보존한다.
출력 스키마:
{
  "one_line": "한 줄 요약(40자 내외)",
  "timeline": [
    {"time":"00:01","title":"구간 주제","bullets":["핵심 내용 1","핵심 내용 2"]}
  ],
  "keywords": ["가장 많이 언급된 키워드", "최대 5개"],
  "datetime_mentions": [{"text":"6월 중","context":"언급 맥락 한 줄"}],
  "key_points": ["핵심 논의 3~6개 — timeline 요약과 일치"],
  "actions": [{"task":"할 일","owner":"담당","due":"YYYY-MM-DD|null","priority":"high|mid|low"}],
  "next_meeting": {"date":"YYYY-MM-DD|null","time":"HH:mm|null","place":"|null"},
  "attendees": ["이름/직책"],
  "confidence": "high|mid|low",
  "needs_review": ["불확실해 사람이 확인할 항목"]
}
timeline은 3~8개 구간. datetime_mentions는 대화에서 날짜·시간·기한이 언급된 경우만. 없으면 빈 배열.`;

export interface TimelineSegment {
  time: string;
  title: string;
  bullets: string[];
}

export interface DateTimeMention {
  text: string;
  context: string;
}

export interface SummaryResult {
  one_line: string;
  timeline: TimelineSegment[];
  keywords: string[];
  datetime_mentions: DateTimeMention[];
  key_points: string[];
  actions: { task: string; owner: string | null; due: string | null; priority: "high" | "mid" | "low" }[];
  next_meeting: { date: string | null; time: string | null; place: string | null };
  attendees: string[];
  confidence: "high" | "mid" | "low";
  needs_review: string[];
  utterances?: import("./stt.js").Utterance[];
  talk_ratio?: import("./stt.js").TalkRatio;
}

function stubSummary(): SummaryResult {
  return {
    one_line: "(stub) 단가 인상안 협의",
    timeline: [
      { time: "00:00", title: "미팅 개요", bullets: ["3분기 단가 5% 인상 논의", "7월 추가 발주 검토"] },
    ],
    keywords: ["단가", "발주"],
    datetime_mentions: [],
    key_points: ["3분기 단가 5% 인상 논의", "7월 추가 발주 검토"],
    actions: [{ task: "견적서 재작성", owner: "나", due: null, priority: "high" }],
    next_meeting: { date: null, time: null, place: null },
    attendees: [],
    confidence: "low",
    needs_review: ["GEMINI_API_KEY 미설정 — 실제 요약 아님"],
  };
}

export async function summarize(transcript: TranscriptResult | string, template = "영업"): Promise<SummaryResult> {
  if (!env.gemini.apiKey) return stubSummary();

  const text = typeof transcript === "string" ? transcript : transcriptToText(transcript);
  const result = await geminiJson<SummaryResult>(
    [{ text: `[템플릿:${template}]\n전사:\n${text}` }],
    SYSTEM_PROMPT
  );

  return {
    one_line: result.one_line?.trim() ?? "",
    timeline: Array.isArray(result.timeline) ? result.timeline : [],
    keywords: Array.isArray(result.keywords) ? result.keywords : [],
    datetime_mentions: Array.isArray(result.datetime_mentions) ? result.datetime_mentions : [],
    key_points: Array.isArray(result.key_points) ? result.key_points : [],
    actions: Array.isArray(result.actions) ? result.actions : [],
    next_meeting: result.next_meeting ?? { date: null, time: null, place: null },
    attendees: Array.isArray(result.attendees) ? result.attendees : [],
    confidence: result.confidence ?? "mid",
    needs_review: Array.isArray(result.needs_review) ? result.needs_review : [],
    ...(typeof transcript !== "string" && transcript.utterances?.length
      ? { utterances: transcript.utterances, talk_ratio: transcript.talk_ratio }
      : {}),
  };
}
