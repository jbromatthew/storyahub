import React, { useState, useEffect } from "react";

const SPEAKER_COLORS = ["#7C3AED", "#DB2777", "#2563EB", "#059669"];

function speakerColor(label) {
  const n = parseInt(String(label).replace(/\D/g, ""), 10) || 1;
  return SPEAKER_COLORS[(n - 1) % SPEAKER_COLORS.length];
}

function Collapse({ icon, title, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          padding: "14px 16px",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div className="row between" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
            {icon && <span style={{ flex: "0 0 auto" }}>{icon}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>
              {subtitle && (
                <div className="small" style={{ marginTop: 3, lineHeight: 1.45 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          <span style={{ color: "var(--muted)", fontSize: 12, flex: "0 0 auto" }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div style={{ padding: "0 16px 14px" }}>{children}</div>}
    </div>
  );
}

function TalkRatioBar({ talkRatio }) {
  if (!talkRatio?.speakers?.length) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>대화 비율</div>
      {talkRatio.comment && (
        <div className="small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
          {talkRatio.comment}
        </div>
      )}
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
        {talkRatio.speakers.map((sp, i) => (
          <div
            key={i}
            style={{
              width: `${Math.max(sp.pct || 0, 0)}%`,
              background: speakerColor(sp.label),
              minWidth: sp.pct > 0 ? 4 : 0,
            }}
          />
        ))}
      </div>
      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        {talkRatio.speakers.map((sp, i) => (
          <div key={i} className="row" style={{ gap: 6, fontSize: 12.5 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: speakerColor(sp.label),
                flex: "0 0 auto",
              }}
            />
            <span style={{ fontWeight: 600 }}>{sp.label}</span>
            <span className="small">{Number(sp.pct).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptView({ utterances, talkRatio }) {
  if (!utterances?.length) {
    return (
      <div className="card small" style={{ padding: 20, textAlign: "center", lineHeight: 1.55, color: "var(--muted)" }}>
        화자별 대화 기록이 없어요.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "8px 0" }}>
      <div className="row" style={{ padding: "8px 16px 12px", gap: 8 }}>
        <span className="tag green" style={{ fontSize: 11 }}>
          ✓ 향상된 음성인식
        </span>
      </div>
      {utterances.map((u, i) => (
        <div
          key={i}
          style={{
            padding: "12px 16px",
            borderTop: i > 0 ? "1px solid var(--line)" : "none",
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: speakerColor(u.speaker) + "22",
                color: speakerColor(u.speaker),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 800,
                flex: "0 0 auto",
              }}
            >
              {String(u.speaker).replace("참석자 ", "")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{u.speaker}</span>
                <span className="small" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {u.time}
                </span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55 }}>{u.text}</div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ padding: "0 16px 8px" }}>
        <TalkRatioBar talkRatio={talkRatio} />
      </div>
    </div>
  );
}

function InsightsView({ summary }) {
  const timeline = summary?.timeline || [];
  const keywords = summary?.keywords || [];
  const datetimeMentions = summary?.datetime_mentions || [];
  const actions = summary?.actions || [];

  return (
    <>
      {timeline.length > 0 && (
        <Collapse title="타임라인" subtitle="대화 흐름별 핵심 내용" defaultOpen>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {timeline.map((seg, i) => (
              <div key={i}>
                <div className="row" style={{ gap: 10, marginBottom: 6 }}>
                  <span
                    className="small"
                    style={{
                      fontWeight: 700,
                      color: "var(--accent-deep)",
                      fontVariantNumeric: "tabular-nums",
                      flex: "0 0 auto",
                    }}
                  >
                    {seg.time}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{seg.title}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 13.5 }}>
                  {(seg.bullets || []).map((b, j) => (
                    <li key={j} style={{ marginBottom: 4 }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Collapse>
      )}

      <Collapse
        icon={<span style={{ fontSize: 13, fontWeight: 800, color: "#CA8A04" }}>AB</span>}
        title="주요 키워드"
        subtitle="가장 많이 언급된 순서로 키워드를 선정합니다"
        defaultOpen
      >
        {keywords.length > 0 ? (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {keywords.map((kw, i) => (
              <span key={i} className="tag" style={{ padding: "7px 12px", fontSize: 13 }}>
                {kw}
              </span>
            ))}
          </div>
        ) : (
          <div className="small" style={{ color: "var(--muted)" }}>
            추출된 키워드가 없습니다
          </div>
        )}
      </Collapse>

      <Collapse title="날짜/시간이 들어간 대화" defaultOpen={datetimeMentions.length > 0}>
        {datetimeMentions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {datetimeMentions.map((d, i) => (
              <div key={i}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.text}</div>
                <div className="small" style={{ marginTop: 3, lineHeight: 1.45 }}>
                  {d.context}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small" style={{ color: "var(--muted)" }}>
            대화내용에서 날짜/시간을 찾지 못했습니다
          </div>
        )}
      </Collapse>

      <Collapse
        icon={<span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>}
        title="할 일 목록"
        subtitle="미팅 내용 중 후속 대응이 필요한 대화를 따로 추출했습니다"
        defaultOpen
      >
        {actions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.map((a, i) => (
              <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--green)", marginTop: 2 }}>✓</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{a.task}</div>
                  {(a.owner || a.due) && (
                    <div className="small" style={{ marginTop: 2 }}>
                      {[a.owner, a.due].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="small" style={{ color: "var(--muted)" }}>
            추출된 할 일이 없습니다
          </div>
        )}
      </Collapse>
    </>
  );
}

export default function MeetingInsights({ summary, oneLine }) {
  const utterances = summary?.utterances || [];
  const hasTranscript = utterances.length > 0;
  const [tab, setTab] = useState(hasTranscript ? "transcript" : "insights");

  useEffect(() => {
    if (hasTranscript) setTab("transcript");
  }, [hasTranscript]);

  return (
    <div>
      {oneLine && (
        <div className="card" style={{ padding: 16, background: "var(--accent-soft)", border: "1px solid #F3D8CB", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: "var(--accent-deep)" }}>
            한 줄 요약
          </div>
          <div style={{ marginTop: 7, fontSize: 15, fontWeight: 600, lineHeight: 1.55 }}>{oneLine}</div>
        </div>
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === "transcript" ? "on" : ""} onClick={() => setTab("transcript")} style={{ flex: 1 }}>
          대화 내용
        </button>
        <button className={tab === "insights" ? "on" : ""} onClick={() => setTab("insights")} style={{ flex: 1 }}>
          인사이트
        </button>
      </div>

      {tab === "transcript" ? (
        <TranscriptView utterances={utterances} talkRatio={summary?.talk_ratio} />
      ) : (
        <InsightsView summary={summary} />
      )}

      {tab === "insights" && hasTranscript && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: 4, padding: 12, fontSize: 13 }}
          onClick={() => setTab("transcript")}
        >
          화자별 대화 전문 보기 →
        </button>
      )}
    </div>
  );
}
