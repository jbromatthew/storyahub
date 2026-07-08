import React, { useState } from "react";
import { api, saveToken, setToken, EMAIL_KEY, getRememberLogin } from "../api/client.js";

export default function AuthScreen({ onSuccess, erpMode = false }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(getRememberLogin);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "register"
          ? await api.register(email.trim(), password, name.trim() || undefined, remember)
          : await api.login(email.trim(), password, remember);
      saveToken(result.token, { remember });
      setToken(result.token);
      if (remember) localStorage.setItem(EMAIL_KEY, email.trim());
      else localStorage.removeItem(EMAIL_KEY);
      onSuccess(result);
    } catch (err) {
      setError(err.message || "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade" style={{ padding: "30px 24px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginTop: 48 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
            <path d="M12 17.5V21" />
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, marginTop: 20 }}>{erpMode ? "ERP" : "Storyahub"}</div>
        <div style={{ fontWeight: 700, fontSize: 24, marginTop: 14, lineHeight: 1.3 }}>
          {erpMode ? "지식경영 · 회의록 · OKR" : "녹음하면, 알아서 정리되는 비서"}
        </div>
        <div className="small" style={{ marginTop: 10, lineHeight: 1.55 }}>
          {erpMode ? "사번 또는 이메일로 로그인하세요" : "미팅 · 통화 · 강의를 자동으로 요약하고 정리해요"}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="seg" style={{ marginBottom: 20 }}>
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
            로그인
          </button>
          <button type="button" className={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
            회원가입
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 (선택)"
              style={inputStyle}
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            required
            autoComplete="email"
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (6자 이상)"
            required
            minLength={6}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            style={inputStyle}
          />

          {mode === "login" && (
            <label className="row" style={{ gap: 8, marginBottom: 14, cursor: "pointer", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--accent-deep)" }}
              />
              <span style={{ fontSize: 13.5, color: "var(--ink)" }}>로그인 상태 유지</span>
            </label>
          )}

          {error && (
            <div style={{ color: "var(--accent-deep)", fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>{error}</div>
          )}

          <button
            type="submit"
            className="btn btn-accent"
            disabled={loading}
            style={{ width: "100%", padding: 15, fontSize: 15, marginTop: 4, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "처리 중…" : mode === "register" ? "가입하고 7일 무료 체험" : "로그인"}
          </button>
        </form>

        <div className="small" style={{ textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
          {mode === "register"
            ? "가입하면 이용약관 및 개인정보처리방침에 동의하게 됩니다."
            : "간편 로그인(카카오 등)은 곧 제공됩니다."}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 13,
  border: "1px solid var(--line)",
  fontFamily: "inherit",
  fontSize: 14.5,
  marginBottom: 10,
  background: "#fff",
  outline: "none",
};
