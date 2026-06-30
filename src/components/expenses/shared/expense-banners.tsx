"use client";

import type { LoadError } from "../expenses-client";

import "../expenses.css";

type Props = {
  error: string;
  loadError: LoadError | null;
  message: string;
  onRetry?: () => void;
};

/**
 * Shared three-state banner row used by both /expenses and
 * /expenses/receipts. Renders nothing when there's nothing to show.
 */
export function ExpenseBanners({ error, loadError, message, onRetry }: Props) {
  return (
    <>
      {error ? <div className="exp-banner exp-banner--error">{error}</div> : null}
      {loadError ? (
        <div className="exp-banner exp-banner--error" role="alert">
          <span>
            {loadError.kind === "network"
              ? `网络问题: ${loadError.message}`
              : loadError.kind === "server"
                ? `服务器错误: ${loadError.message}`
                : `客户端错误: ${loadError.message}`}
          </span>
          {onRetry ? (
            <button
              className="exp-btn exp-btn--secondary exp-btn--sm"
              onClick={() => onRetry()}
              type="button"
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? <div className="exp-banner exp-banner--ok">{message}</div> : null}
    </>
  );
}