import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function PhotoGallery({ urls, initialIndex = 0, onClose }) {
  const [idx, setIdx] = useState(initialIndex);
  const touchRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    setIdx(initialIndex);
  }, [initialIndex, urls]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!urls?.length) return null;

  const go = (dir) => {
    setIdx((i) => Math.max(0, Math.min(urls.length - 1, i + dir)));
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, active: true };
  };

  const onTouchEnd = (e) => {
    if (!touchRef.current.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = Math.abs(t.clientY - touchRef.current.y);
    touchRef.current.active = false;
    if (dy > 60) return;
    if (dx < -50) go(1);
    else if (dx > 50) go(-1);
  };

  return createPortal(
    <div className="photo-gallery" role="dialog" aria-modal="true">
      <div className="photo-gallery-top">
        <button type="button" className="photo-gallery-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <span className="photo-gallery-count">
          {idx + 1} / {urls.length}
        </span>
      </div>
      <div
        className="photo-gallery-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <button
          type="button"
          className="photo-gallery-nav prev"
          disabled={idx <= 0}
          onClick={() => go(-1)}
          aria-label="이전"
        >
          ‹
        </button>
        <img src={urls[idx]} alt="" className="photo-gallery-img" draggable={false} />
        <button
          type="button"
          className="photo-gallery-nav next"
          disabled={idx >= urls.length - 1}
          onClick={() => go(1)}
          aria-label="다음"
        >
          ›
        </button>
      </div>
      {urls.length > 1 && (
        <div className="photo-gallery-dots">
          {urls.map((_, i) => (
            <span key={i} className={"photo-gallery-dot" + (i === idx ? " on" : "")} />
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
