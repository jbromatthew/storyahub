import { env } from "../env.js";
import { geminiJson } from "./gemini.js";
import {
  isLongMeeting,
  MAX_SUMMARIZE_INPUT_CHARS,
  SUMMARIZE_CHUNK_CHARS,
} from "./meetingLimits.js";
import { plainToTranscript, type TranscriptResult, transcriptToText } from "./stt.js";

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

const LONG_SYSTEM_PROMPT = `${SYSTEM_PROMPT}
긴 미팅(30분+)이면 timeline 3~5개, key_points 3~5개, actions 최대 8개로 압축한다.`;

const PARTIAL_PROMPT = `긴 미팅의 일부 구간 전사를 요약한다. JSON만 출력.
스키마:
{
  "one_line": "이 구간 한 줄 요약",
  "key_points": ["핵심 2~4개"],
  "actions": [{"task":"할 일","owner":"담당|null","due":null,"priority":"high|mid|low"}],
  "datetime_mentions": [{"text":"날짜/기한","context":"맥락"}]
}`;

const MERGE_PROMPT = `여러 구간 요약(partial)을 하나의 미팅 요약 JSON으로 합친다. JSON만 출력.
최종 스키마는 one_line, timeline(3~6), keywords(최대5), datetime_mentions, key_points(3~6),
actions(중복 제거, 최대 10), next_meeting, attendees, confidence, needs_review.
partials에 없는 사실을 만들지 말 것.`;

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

type PartialSummary = {
  one_line?: string;
  key_points?: string[];
  actions?: SummaryResult["actions"];
  datetime_mentions?: DateTimeMention[];
};

export type SummarizeOptions = {
  durationSec?: number;
};

function stubSummary(): SummaryResult {
  return {
    one_line: "(stub) 단가 인상안 협의",
    timeline: [{ time: "00:00", title: "미팅 개요", bullets: ["3분기 단가 5% 인상 논의", "7월 추가 발주 검토"] }],
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

function sampleLongText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.35);
  const tail = Math.floor(max * 0.35);
  const midBudget = max - head - tail - 120;
  const midStart = Math.floor(text.length * 0.33);
  const midEnd = Math.floor(text.length * 0.67);
  const midSlice = text.slice(midStart, midEnd);
  const mid = midSlice.length > midBudget ? midSlice.slice(0, midBudget) : midSlice;
  return `${text.slice(0, head)}\n\n…(초반 발췌)…\n\n${mid}\n\n…(후반 발췌)…\n\n${text.slice(-tail)}`;
}

function splitIntoChunks(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > i + size * 0.4) end = nl + 1;
    }
    chunks.push(text.slice(i, end).trim());
    i = end;
  }
  return chunks.filter(Boolean);
}

function normalizeSummary(
  result: Partial<SummaryResult>,
  transcript: TranscriptResult
): SummaryResult {
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
    ...(transcript.utterances?.length
      ? { utterances: transcript.utterances, talk_ratio: transcript.talk_ratio }
      : {}),
  };
}

async function summarizeOnce(
  text: string,
  template: string,
  longMeeting: boolean,
  transcript: TranscriptResult
): Promise<SummaryResult> {
  const prompt = longMeeting ? LONG_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const result = await geminiJson<SummaryResult>(
    [{ text: `[템플릿:${template}]\n전사:\n${text}` }],
    prompt,
    { maxOutputTokens: 8192 }
  );
  return normalizeSummary(result, transcript);
}

async function summarizeInChunks(
  text: string,
  template: string,
  transcript: TranscriptResult
): Promise<SummaryResult> {
  const chunks = splitIntoChunks(text, SUMMARIZE_CHUNK_CHARS);
  const partials: PartialSummary[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const partial = await geminiJson<PartialSummary>(
      [{ text: `[템플릿:${template}] 구간 ${i + 1}/${chunks.length}\n${chunks[i]}` }],
      PARTIAL_PROMPT,
      { maxOutputTokens: 4096 }
    );
    partials.push(partial);
  }

  if (partials.length === 1) {
    const merged = await geminiJson<SummaryResult>(
      [{ text: JSON.stringify({ template, partial: partials[0] }) }],
      MERGE_PROMPT,
      { maxOutputTokens: 8192 }
    );
    return normalizeSummary(merged, transcript);
  }

  const merged = await geminiJson<SummaryResult>(
    [{ text: JSON.stringify({ template, partials }) }],
    MERGE_PROMPT,
    { maxOutputTokens: 8192 }
  );
  return normalizeSummary(merged, transcript);
}

export async function summarize(
  transcript: TranscriptResult | string,
  template = "영업",
  opts: SummarizeOptions = {}
): Promise<SummaryResult> {
  if (!env.gemini.apiKey) return stubSummary();

  const t = typeof transcript === "string" ? plainToTranscript(transcript) : transcript;
  const durationSec = opts.durationSec ?? 0;
  const longMeeting = isLongMeeting(durationSec, 0) || transcriptToText(t).length > 20_000;

  let text = transcriptToText(t);
  if (text.length > MAX_SUMMARIZE_INPUT_CHARS) {
    text = sampleLongText(text, MAX_SUMMARIZE_INPUT_CHARS);
  }

  if (longMeeting && text.length > SUMMARIZE_CHUNK_CHARS * 1.2) {
    return summarizeInChunks(text, template, t);
  }

  return summarizeOnce(text, template, longMeeting, t);
}
