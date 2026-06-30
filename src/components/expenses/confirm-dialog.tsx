"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Replaces window.confirm() in /expenses. Centered modal styled with the same
// visual language as the rest of the expenses UI (uses globals.css rules for
// .exp-confirm / .exp-confirm__backdrop). Esc and backdrop click both fire
// onCancel. Confirm button is .exp-btn--danger when `danger` is true.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="exp-confirm" role="dialog" aria-modal="true" aria-labelledby="exp-confirm-title">
      <button
        aria-label="关闭确认"
        className="exp-confirm__backdrop"
        onClick={onCancel}
        type="button"
      />
      <div className="exp-confirm__panel">
        <h2 className="exp-confirm__title" id="exp-confirm-title">
          {title}
        </h2>
        <p className="exp-confirm__message">{message}</p>
        <div className="exp-confirm__actions">
          <button className="exp-btn exp-btn--secondary" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={danger ? "exp-btn exp-btn--danger" : "exp-btn exp-btn--primary"}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}