import React, { useState } from "react";
import { api } from "../api/client.js";
import { notifyError } from "../toast.js";

const SUGGESTIONS = [
  "이 미팅에서 합의된 내용은?",
  "내가 맡은 할 일은?",
  "다음에 확인할 것은?",
];

export default function MeetingAskPanel({ meetingId, disabled, hasContext }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text || !meetingId || asking) return;
    setQuestion(text);
    setAsking(true);
    setAnswer("");
    try {
      const { answer: a } = await api.askMeeting(meetingId, text);
      setAnswer(a || "");
    } catch (e) {
      notifyError(e, e.message || "질문에 실패했어요");
    } finally {
      setAsking(false);
    }
  };

  if (!hasContext) {
    return (
      <div className="card small" style={{ padding: 16, lineHeight: 1.55, color: "var(--muted)", marginBottom: 14 }}>
        요약·전사가 준비되면 녹음 내용을 바탕으로 AI에게 질문할 수 있어요.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>AI에게 물어보기</div>
      <div className="small" style={{ lineHeight: 1.5, color: "var(--muted)", marginBottom: 12 }}>
        이 미팅 녹음·요약을 바탕으로 답해요.
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            style={{ fontSize: 12, padding: "6px 10px" }}
            disabled={disabled || asking}
            onClick={() => ask(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ask())}
          placeholder="예: API 연동 일정은 언제까지였어?"
          disabled={disabled || asking}
          style={{
            flex: 1,
            padding: "11px 13px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        />
        <button
          type="button"
          className="btn btn-accent"
          style={{ padding: "11px 16px", fontSize: 13, whiteSpace: "nowrap" }}
          disabled={disabled || asking || !question.trim()}
          onClick={() => ask()}
        >
          {asking ? "…" : "질문"}
        </button>
      </div>

      {answer && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            background: "var(--accent-soft)",
            border: "1px solid #F3D8CB",
            lineHeight: 1.6,
            fontSize: 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {answer}
        </div>
      )}
    </div>
  );
}
