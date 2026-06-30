"use client";

import { useState } from "react";

import type { ExtractedExpenseReceipt } from "@/lib/expenses/types";

import { useBulkSelection } from "./bulk-selection";
import { ConfirmDialog } from "./confirm-dialog";

type Props = {
  // "main" exposes confirm + delete (the home page knows about pending receipts);
  // "all" only exposes delete (the historical view doesn't bulk-confirm).
  mode: "all" | "main";
  // Wave 3 bulk: the home page owns the receipt drafts; the toolbar needs them
  // to PATCH each receipt's current extraction. Pass `{}` on the all page.
  receiptDrafts: Record<number, ExtractedExpenseReceipt>;
  reload: () => Promise<void> | void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

export function BulkToolbar({ mode, receiptDrafts, reload, onError, onMessage }: Props) {
  const { selectedIds, items, clear } = useBulkSelection();
  const [busy, setBusy] = useState(false);
  // Replace window.confirm with the styled ConfirmDialog.
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{
    message: string;
    run: () => Promise<void>;
  } | null>(null);

  // Filter to currently visible items so stale IDs (e.g. after a delete) don't
  // inflate the count. The selectedIds Set itself is reset on data reload
  // via clearKey in BulkSelectionProvider.
  const selected = items.filter((it) => selectedIds.has(it.id));
  const receiptCount = selected.filter((it) => it.kind === "receipt").length;
  const transactionCount = selected.filter((it) => it.kind === "transaction").length;

  if (selected.length === 0) {
    return null;
  }

  async function bulkDelete() {
    if (transactionCount === 0) return;
    setPendingBulkDelete({
      message: `确认删除 ${transactionCount} 笔交易？本地图片会一并删除。`,
      run: async () => {
        setBusy(true);
        try {
          const targets = selected.filter((it) => it.kind === "transaction");
          const results = await Promise.allSettled(
            targets.map((it) =>
              fetch(`/api/expenses/transactions/${it.id}`, { method: "DELETE" }).then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return it.id;
              })
            )
          );
          const ok = results.filter((r) => r.status === "fulfilled").length;
          const failedIds = results
            .map((r, i) => (r.status === "rejected" ? targets[i].id : null))
            .filter((x): x is number => x !== null);
          if (failedIds.length > 0) {
            onError(
              `批量删除完成：成功 ${ok} 笔，失败 ${failedIds.length} 笔（#${failedIds.join("、#")}）`
            );
          } else {
            onMessage(`已删除 ${ok} 笔交易`);
          }
          clear();
          await reload();
        } catch (err) {
          onError(err instanceof Error ? err.message : "批量删除失败");
        } finally {
          setBusy(false);
        }
      }
    });
  }

  async function bulkConfirm() {
    if (receiptCount === 0) return;
    setBusy(true);
    try {
      const targets = selected.filter((it) => it.kind === "receipt");
      const results = await Promise.allSettled(
        targets.map((it) => {
          const draft = receiptDrafts[it.id];
          if (!draft) return Promise.reject(new Error(`#${it.id} 缺少草稿`));
          return fetch(`/api/expenses/receipts/${it.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extracted: draft, user_note: draft.user_note ?? undefined })
          }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return it.id;
          });
        })
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failedIds = results
        .map((r, i) => (r.status === "rejected" ? targets[i].id : null))
        .filter((x): x is number => x !== null);
      if (failedIds.length > 0) {
        onError(
          `批量确认完成：成功 ${ok} 张，失败 ${failedIds.length} 张（#${failedIds.join("、#")}）`
        );
      } else {
        onMessage(`已确认入账 ${ok} 张票据`);
      }
      clear();
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "批量确认失败");
    } finally {
      setBusy(false);
    }
  }

  const summaryParts: string[] = [];
  if (transactionCount > 0) summaryParts.push(`${transactionCount} 笔交易`);
  if (receiptCount > 0) summaryParts.push(`${receiptCount} 张票据`);

  return (
    <div className="exp-bulk-toolbar" role="toolbar" aria-label="批量操作">
      <span className="exp-bulk-toolbar__count">
        已选 {selected.length} 项{summaryParts.length > 0 ? `（${summaryParts.join("、")}）` : ""}
      </span>
      <div className="exp-bulk-toolbar__actions">
        {mode === "main" && receiptCount > 0 ? (
          <button
            className="exp-btn exp-btn--primary exp-btn--sm"
            disabled={busy}
            onClick={() => void bulkConfirm()}
            type="button"
          >
            {busy ? "处理中..." : `确认入账 ${receiptCount} 张`}
          </button>
        ) : null}
        {transactionCount > 0 ? (
          <button
            className="exp-btn exp-btn--danger exp-btn--sm"
            disabled={busy}
            onClick={() => void bulkDelete()}
            type="button"
          >
            {busy ? "处理中..." : `删除 ${transactionCount} 笔`}
          </button>
        ) : null}
        <button
          className="exp-btn exp-btn--ghost exp-btn--sm"
          disabled={busy}
          onClick={clear}
          type="button"
        >
          清除选择
        </button>
      </div>
      <ConfirmDialog
        danger
        message={pendingBulkDelete?.message ?? ""}
        onCancel={() => setPendingBulkDelete(null)}
        onConfirm={() => {
          const next = pendingBulkDelete;
          setPendingBulkDelete(null);
          void next?.run();
        }}
        open={pendingBulkDelete !== null}
        title="批量删除交易"
      />
    </div>
  );
}
