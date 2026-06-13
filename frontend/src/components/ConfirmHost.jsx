import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeConfirm, resolveConfirm } from "../confirm.js";

export default function ConfirmHost() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => subscribeConfirm(setDialog), []);

  if (!dialog) return null;

  return createPortal(
    <div
      className="sheetbg confirm-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={() => resolveConfirm(false)}
    >
      <div className="sheet confirm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon" aria-hidden>
          {dialog.destructive ? "!" : "?"}
        </div>
        <h3 id="confirm-title" className="confirm-title">
          {dialog.title}
        </h3>
        {dialog.message ? <p className="confirm-msg">{dialog.message}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost confirm-cancel" onClick={() => resolveConfirm(false)}>
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            className={"btn confirm-ok" + (dialog.destructive ? " confirm-danger" : " btn-accent")}
            onClick={() => resolveConfirm(true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
