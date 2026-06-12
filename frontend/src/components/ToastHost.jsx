import React, { useEffect, useState } from "react";
import { subscribeToast } from "../toast.js";

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    return subscribeToast((item) => {
      setItems((p) => [...p, item]);
      window.setTimeout(() => {
        setItems((p) => p.filter((x) => x.id !== item.id));
      }, item.duration);
    });
  }, []);

  if (!items.length) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === "error" ? "!" : t.type === "success" ? "✓" : "i"}
          </span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
