import React from "react";

export default function WelcomeScreen({ user, contactCount, onStartRec, onAddContact, onDone }) {
  const name = user?.name?.split(" ")[0] || "회원";

  return (
    <div className="fade" style={{ padding: "28px 24px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginTop: 36 }}>
        <div className="h-eyebrow">환영합니다</div>
        <div style={{ fontWeight: 800, fontSize: 26, marginTop: 8, lineHeight: 1.3 }}>
          {name}님,<br />
          Storyahub를 시작해요
        </div>
        <div className="small" style={{ marginTop: 12, lineHeight: 1.6 }}>
          녹음을 끄면 요약 · 할 일 · 다음 약속이 자동으로 정리돼요.
          <br />
          7일 무료 체험이 시작됐습니다.
        </div>
      </div>

      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
        <ActionCard
          step="1"
          title="첫 기록 시작하기"
          desc="미팅·통화·강의를 녹음하면 AI가 자동 정리"
          accent
          onClick={onStartRec}
        />
        <ActionCard
          step="2"
          title="인맥 추가하기"
          desc="명함 스캔 또는 직접 입력 · 기록이 쌓이는 그릇"
          onClick={onAddContact}
        />
        <ActionCard
          step="3"
          title="둘러보기"
          desc={contactCount > 0 ? `인맥 ${contactCount}명 · 바로 앱 사용` : "데이터 없이도 둘러볼 수 있어요"}
          onClick={onDone}
        />
      </div>

      <div style={{ marginTop: "auto", paddingTop: 32 }}>
        <button className="btn btn-accent" style={{ width: "100%", padding: 15, fontSize: 15 }} onClick={onDone}>
          앱 시작하기
        </button>
      </div>
    </div>
  );
}

function ActionCard({ step, title, desc, accent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        border: accent ? "2px solid var(--accent)" : undefined,
        background: accent ? "var(--accent-soft)" : undefined,
        width: "100%",
        fontFamily: "inherit",
      }}
    >
      <div className="row" style={{ gap: 13, alignItems: "flex-start" }}>
        <span className="stepnum">{step}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <div className="small" style={{ marginTop: 4, lineHeight: 1.45 }}>
            {desc}
          </div>
        </div>
      </div>
    </button>
  );
}
