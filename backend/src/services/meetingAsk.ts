import { geminiText } from "./gemini.js";
import { transcriptToText, type TranscriptResult } from "./stt.js";

type SummaryLike = {
  one_line?: string;
  key_points?: string[];
  timeline?: { time?: string; title?: string; bullets?: string[] }[];
  actions?: { task?: string; owner?: string | null; due?: string | null }[];
  utterances?: { speaker?: string; time?: string; text?: string }[];
  talk_ratio?: unknown;
};

function buildMeetingContext(oneLine: string | null, summary: SummaryLike | null): string {
  const parts: string[] = [];
  if (oneLine?.trim()) parts.push(`한 줄 요약: ${oneLine.trim()}`);

  if (summary?.key_points?.length) {
    parts.push("핵심 포인트:\n" + summary.key_points.map((p) => `- ${p}`).join("\n"));
  }

  if (summary?.timeline?.length) {
    parts.push(
      "타임라인:\n" +
        summary.timeline
          .map((t) => `- ${t.time || ""} ${t.title || ""}${t.bullets?.length ? ": " + t.bullets.join("; ") : ""}`)
          .join("\n")
    );
  }

  if (summary?.actions?.length) {
    parts.push(
      "액션 아이템:\n" +
        summary.actions.map((a) => `- ${a.task || ""}${a.owner ? ` (${a.owner})` : ""}`).join("\n")
    );
  }

  if (summary?.utterances?.length) {
    const utterances = summary.utterances.map((u) => ({
      speaker: u.speaker || "참석자",
      time: u.time || "",
      text: u.text || "",
    }));
    const transcript: TranscriptResult = {
      utterances,
      plain: utterances.map((u) => u.text).filter(Boolean).join("\n"),
    };
    const text = transcriptToText(transcript);
    if (text) parts.push(`전사:\n${text.slice(0, 55_000)}`);
  }

  return parts.join("\n\n");
}

export async function answerMeetingQuestion(
  question: string,
  oneLine: string | null,
  summary: SummaryLike | null
): Promise<string> {
  const q = question.trim();
  if (!q) throw new Error("질문을 입력해 주세요");

  const context = buildMeetingContext(oneLine, summary);
  if (!context.trim()) {
    throw new Error("이 미팅에 질문할 수 있는 기록(요약·전사)이 아직 없어요");
  }

  const system = `당신은 미팅 기록 비서입니다. 아래 미팅 요약·전사만 근거로 사용자 질문에 답하세요.
규칙:
- 기록에 없는 내용은 추측하지 말고 "기록에 없어요"라고 말하세요.
- 한국어로 간결하고 명확하게 답하세요.
- 숫자·날짜·담당자는 기록 그대로 인용하세요.`;

  return geminiText([{ text: `[미팅 기록]\n${context}\n\n[질문]\n${q}` }], system, {
    maxOutputTokens: 2048,
  });
}
