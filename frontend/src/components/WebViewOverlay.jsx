import React, { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const HISTORY_FLAG = "storyahub_webview";

/**
 * 앱 안 전체화면 웹뷰 — 상단 ← 또는 브라우저 뒤로가기로 닫기
 */
export default function WebViewOverlay({ url, title = "장소 보기", onClose }) {
  const pushed = useRef(false);
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!url) return;
    closing.current = false;
    window.history.pushState({ [HISTORY_FLAG]: true }, "");
    pushed.current = true;

    const onPop = () => {
      pushed.current = false;
      close();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed.current && !closing.current) {
        pushed.current = false;
        window.history.back();
      }
    };
  }, [url, close]);

  const goBack = () => {
    if (pushed.current) window.history.back();
    else close();
  };

  if (!url) return null;

  return createPortal(
    <div className="webview-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <header className="webview-bar">
        <button type="button" className="iconbtn webview-back" onClick={goBack} aria-label="뒤로">
          ←
        </button>
        <div className="webview-title">{title}</div>
        <a className="webview-ext" href={url} target="_blank" rel="noopener noreferrer" aria-label="브라우저에서 열기">
          ↗
        </a>
      </header>
      <iframe className="webview-frame" src={url} title={title} referrerPolicy="no-referrer-when-downgrade" />
    </div>,
    document.body
  );
}
