import { useEffect } from "react";

/** iOS 스타일: 화면 왼쪽 가장자리에서 오른쪽으로 스와이프 → 뒤로 */
export function useSwipeBack(enabled, onBack, { edge = 28, threshold = 72, maxVertical = 80 } = {}) {
  useEffect(() => {
    if (!enabled || !onBack) return;

    let startX = null;
    let startY = null;
    let tracking = false;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > edge) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };

    const onTouchMove = (e) => {
      if (!tracking || startX == null) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > maxVertical && dx < threshold) tracking = false;
    };

    const onTouchEnd = (e) => {
      if (!tracking || startX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx >= threshold && dy <= maxVertical) onBack();
      tracking = false;
      startX = null;
      startY = null;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, onBack, edge, threshold, maxVertical]);
}
