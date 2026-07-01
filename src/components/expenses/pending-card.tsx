"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import { formatMoney } from "@/lib/expenses/money";
import { evaluateReceiptForPosting } from "@/lib/expenses/rules";
import type { ExpenseReceiptSummary, ExtractedExpenseReceipt } from "@/lib/expenses/types";
import { getBlockingFields } from "@/lib/expenses/validation";

import { ReceiptForm } from "./receipt-form";
import { categoryEmoji } from "./category-colors";
import { receiptImageUrl } from "./receipt-image-url";
import { shortChineseDate } from "./shared/task-helpers";
// Wave 3 bulk: optional context lets the home page bulk-confirm receipts.
import { useBulkSelectionOptional } from "./bulk-selection";

type Props = {
  receipt: ExpenseReceiptSummary;
  draft: ExtractedExpenseReceipt;
  onDraftChange: (next: ExtractedExpenseReceipt) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  // Wave 3 multi-image: append additional screenshots to this receipt and
  // re-run OCR with the combined set. Optional so other consumers
  // (all-transactions page) can keep the prior single-image edit modal.
  onAddMore?: (formData: FormData) => Promise<boolean> | void;
  // Optional loading flags driven by ExpensesClient's busyIds set.
  // Default false so callers that don't pass them (e.g. all-transactions
  // page) keep the prior behavior. When true, the action buttons show a
  // spinner + "处理中..." and become disabled.
  confirming?: boolean;
  deleting?: boolean;
  // Wave 3 multi-image: true while the add-more endpoint is in flight.
  // Disables the picker so the user can't double-submit.
  addingImages?: boolean;
  /** Render as a grid card instead of a list row. */
  layout?: "row" | "grid";
};

// Wave 3 multi-image: carousel. The active image changes via the prev/next
// buttons OR via horizontal swipe (CSS scroll-snap on the underlying
// scroller). We track the position with an IntersectionObserver so a swipe
// end updates the dot indicator without us having to do manual touch math.
//
// Mobile-friendly choices:
//   - Prev/Next buttons are ALWAYS visible, not hover-only. ≥ 40px hit area
//     so they're easy to tap.
//   - The scroller uses `scroll-snap-type: x mandatory` so the resting
//     position always aligns to an image boundary (no half-image stops).
//   - `touch-action: pan-y` lets the user scroll the page vertically while
//     swiping horizontally inside the carousel.
function ReceiptImageCarousel({
  receipt,
  addingImages,
  onAddMore
}: {
  receipt: ExpenseReceiptSummary;
  addingImages: boolean;
  onAddMore?: (formData: FormData) => Promise<boolean> | void;
}) {
  // Legacy single-image rows have `images: []` but still own a real image
  // via `receipt.image_path` / `receipt.image_mime_type` (the parent row's
  // first-image pointer). Wave 3.5 bug fix: previously this branch returned
  // null for those rows, which left the drawer with no preview at all.
  // Synthesise a one-element array from the parent fields so legacy rows
  // render the same as fresh ones.
  const images =
    receipt.images.length > 0
      ? receipt.images
      : receipt.image_path
        ? [
            {
              id: 0,
              image_path: receipt.image_path,
              image_mime_type: receipt.image_mime_type,
              position: 0
            }
          ]
        : [];
  // Single-image receipts short-circuit to the plain thumbnail for parity
  // with the pre-Wave 3 layout.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Track which image is in view via IntersectionObserver. Updates as the
  // user swipes between images. Threshold 0.6 keeps the active image
  // "stable" — the indicator doesn't flicker on partial overlaps.
  useEffect(() => {
    if (images.length <= 1) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const indexAttr = entry.target.getAttribute("data-carousel-index");
          const index = indexAttr ? Number(indexAttr) : NaN;
          if (Number.isFinite(index)) {
            setActiveIndex(index);
          }
        }
      },
      { root: scrollerRef.current, threshold: [0.6] }
    );
    for (const el of itemsRef.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [images.length]);

  function scrollTo(index: number) {
    const next = Math.max(0, Math.min(images.length - 1, index));
    const target = itemsRef.current[next];
    const scroller = scrollerRef.current;
    if (!target || !scroller) return;
    scroller.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    setActiveIndex(next);
  }

  async function handleFiles(files: FileList | File[]) {
    if (!onAddMore) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    const formData = new FormData();
    for (const file of list) formData.append("receipts", file);
    setPickerOpen(false);
    await onAddMore(formData);
  }

  if (images.length === 0) return null;

  if (images.length === 1) {
    const image = images[0];
    const src = receiptImageUrl(image.image_path);
    return (
      <div className="exp-receipt-carousel">
        {src ? (
          <Image
            alt={`票据 #${receipt.id} 缩略图`}
            className="exp-receipt-thumb"
            height={220}
            loading="lazy"
            src={src}
            unoptimized
            width={220}
          />
        ) : null}
        {onAddMore ? (
          <button
            aria-label="追加更多截图"
            className="exp-btn exp-btn--secondary exp-btn--sm exp-receipt-carousel__add"
            disabled={addingImages}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            {addingImages ? "上传中..." : "追加截图"}
          </button>
        ) : null}
        <input
          accept="image/jpeg,image/png,image/webp"
          hidden
          multiple
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
            event.target.value = "";
          }}
          ref={fileRef}
          type="file"
        />
      </div>
    );
  }

  return (
    <div className="exp-receipt-carousel">
      <div className="exp-receipt-carousel__viewport">
        <button
          aria-label="上一张"
          className="exp-receipt-carousel__nav exp-receipt-carousel__nav--prev"
          disabled={activeIndex === 0}
          onClick={() => scrollTo(activeIndex - 1)}
          type="button"
        >
          <svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
        <div className="exp-receipt-carousel__scroller" ref={scrollerRef}>
          {images.map((image, index) => {
            const src = receiptImageUrl(image.image_path);
            return (
              <div
                className="exp-receipt-carousel__item"
                data-carousel-index={index}
                key={image.id}
                ref={(el) => {
                  itemsRef.current[index] = el;
                }}
              >
                {src ? (
                  <Image
                    alt={`票据 #${receipt.id} 第 ${index + 1} 张（共 ${images.length} 张）`}
                    className="exp-receipt-thumb"
                    height={220}
                    loading="lazy"
                    src={src}
                    unoptimized
                    width={220}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <button
          aria-label="下一张"
          className="exp-receipt-carousel__nav exp-receipt-carousel__nav--next"
          disabled={activeIndex === images.length - 1}
          onClick={() => scrollTo(activeIndex + 1)}
          type="button"
        >
          <svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </div>
      <div className="exp-receipt-carousel__dots" role="tablist">
        {images.map((image, index) => (
          <button
            aria-label={`第 ${index + 1} 张（${index + 1}/${images.length}）`}
            aria-selected={index === activeIndex}
            className={`exp-receipt-carousel__dot ${index === activeIndex ? "exp-receipt-carousel__dot--active" : ""}`}
            key={image.id}
            onClick={() => scrollTo(index)}
            role="tab"
            type="button"
          />
        ))}
        {onAddMore ? (
          <button
            aria-label="追加更多截图"
            className="exp-receipt-carousel__add-dot"
            disabled={addingImages}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            {addingImages ? "..." : "+"}
          </button>
        ) : null}
      </div>
      {pickerOpen ? null : null}
      <input
        accept="image/jpeg,image/png,image/webp"
        hidden
        multiple
        onChange={(event) => {
          if (event.target.files) handleFiles(event.target.files);
          event.target.value = "";
        }}
        ref={fileRef}
        type="file"
      />
    </div>
  );
}

function manualBlockers(value: ExtractedExpenseReceipt): string[] {
  // Wave 3 polish (M4): shared with the store-side guard so the UI and
  // server agree on which fields block posting.
  return getBlockingFields(value);
}

export function PendingReceiptCard({
  receipt,
  draft,
  onDraftChange,
  onSave,
  onDelete,
  onCancel,
  onAddMore,
  confirming = false,
  deleting = false,
  addingImages = false,
  layout = "row"
}: Props) {
  const [expanded, setExpanded] = useState(false);
  // Wave 3 polish (M5): keep the review-reason tag list collapse state across
  // re-renders, so expanding/collapsing a long list doesn't reset every time
  // the user touches the form.
  const [showAllReasons, setShowAllReasons] = useState(false);
  // Wave 3 bulk: only "待确认" receipts participate — auto/confirmed ones are
  // out of the selection set so the bulk-confirm toolbar button stays honest.
  const bulk = useBulkSelectionOptional();
  const selectable = bulk !== null && receipt.status === "pending_review";
  const selected = bulk ? bulk.isSelected(receipt.id) : false;
  const merchant = draft.merchant_name ?? "未知商家";
  const total = draft.total_amount === null ? "金额未识别" : formatMoney(draft.total_amount, draft.currency);
  const itemCount = draft.items.length;
  // Wave 3 multi-image: surface the image count in the compact row when
  // there's more than one so users notice they're looking at a combined
  // receipt rather than a single screenshot.
  const imageCount = receipt.images.length;
  const isMultiImage = imageCount > 1;

  // Re-evaluate against the live draft so "X 项待核对" updates as the user
  // fills in fields.
  const reasons = useMemo(() => {
    const { reviewReasons } = evaluateReceiptForPosting(draft);
    return reviewReasons;
  }, [draft]);

  const ready = receipt.status === "pending_review";
  const blockers = useMemo(() => manualBlockers(draft), [draft]);
  const amountBlockers = useMemo(
    () => reasons.filter((reason) => reason.includes("金额合计") || reason.includes("金额公式")),
    [reasons]
  );
  const confirmBlockers = blockers;
  const confirmTitle =
    confirmBlockers.length > 0
      ? `请先核对：${Array.from(new Set(confirmBlockers)).join("、")}`
      : amountBlockers.length > 0
        ? "金额关系仍有差异；确认后会按当前填写内容入账"
        : "确认入账";

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  // Wave 3 polish (M6): limit visible review-reason tags to 3 to prevent the
  // modal from being pushed off-screen on receipts with many warnings. The
  // remaining count is exposed via a single expand/collapse pill.
  const MAX_VISIBLE_REASONS = 3;
  const visibleReasons = showAllReasons ? reasons : reasons.slice(0, MAX_VISIBLE_REASONS);
  const hiddenReasonCount = reasons.length - visibleReasons.length;

  // Drawer-scope style: pins --exp-drawer-width so the backdrop can size
  // itself to the receipt/transaction edit modal (820px). Manual expense
  // drawer sets its own scope to 560px.
  const drawerScopeStyle = { "--exp-drawer-width": "min(820px, calc(100vw - 36px))" } as Record<string, string>;

  // Wave 3 polish: build the compact sub-text once so we can use the full
  // untruncated string as a hover-tooltip (title) for users who want to see
  // the rest of the line after the ellipsis.
  const compactSubText = `${shortChineseDate(draft.purchased_at)} · ${itemCount} 项${
    reasons.length > 0 ? ` · ⚠️ ${reasons.length} 项待核对` : ""
  }${receipt.duplicate_hint ? ` · 疑似重复` : ""}${isMultiImage ? ` · ${imageCount} 张截图` : ""}`;

  const thumbSrc = receiptImageUrl(receipt.thumbnail_path ?? receipt.image_path);

  return (
    <article
      className={`exp-card ${receipt.duplicate_hint ? "exp-card--duplicate" : ""} ${expanded ? "exp-card--expanded" : ""} ${expanded ? "" : "exp-card--clickable"} ${selected ? "exp-card--selected" : ""} ${layout === "grid" ? "exp-card--grid" : ""}`}
    >
      {!expanded && layout === "grid" ? (
        <div
          className="exp-receipt-grid-card"
          onClick={(e) => {
            if (selectable && e.shiftKey && bulk) {
              e.preventDefault();
              bulk.handleClick(receipt.id, true);
              return;
            }
            setExpanded(true);
          }}
          role="button"
        >
          {selectable ? (
            <input
              aria-label="多选此张票据"
              checked={selected}
              className="exp-card__select-checkbox"
              onChange={() => undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (!bulk) return;
                bulk.handleClick(receipt.id, e.shiftKey);
              }}
              type="checkbox"
            />
          ) : null}
          <div className="exp-receipt-grid-card__thumb">
            {thumbSrc ? (
              <Image alt={`票据 #${receipt.id}`} className="exp-receipt-grid-card__img" height={220} loading="lazy" src={thumbSrc} unoptimized width={320} />
            ) : (
              <div className="exp-receipt-grid-card__placeholder">
                <span aria-hidden>🧾</span>
              </div>
            )}
            <span className={`exp-receipt-grid-card__status ${ready ? "exp-receipt-grid-card__status--pending" : "exp-receipt-grid-card__status--linked"}`}>
              {ready ? "待确认" : "已关联"}
            </span>
          </div>
          <div className="exp-receipt-grid-card__body">
            <div className="exp-receipt-grid-card__name">{merchant}</div>
            <div className="exp-receipt-grid-card__meta">{shortChineseDate(draft.purchased_at)} · {itemCount} 项</div>
            <div className="exp-receipt-grid-card__amount">{total}</div>
          </div>
          <div className="exp-receipt-grid-card__actions">
            {ready ? (
              <button
                className="exp-btn exp-btn--primary exp-btn--sm"
                disabled={confirmBlockers.length > 0 || confirming}
                onClick={(e) => {
                  e.stopPropagation();
                  onSave();
                }}
                title={confirming ? "处理中..." : confirmTitle}
                type="button"
              >
                {confirming ? (
                  <>
                    <span className="exp-spinner" aria-hidden /> 处理中...
                  </>
                ) : (
                  "确认入账"
                )}
              </button>
            ) : (
              <button
                className="exp-btn exp-btn--secondary exp-btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
                type="button"
              >
                查看
              </button>
            )}
            <button
              aria-label="展开编辑"
              className="exp-btn exp-btn--ghost exp-btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              type="button"
            >
              编辑
            </button>
            <button
              aria-label="删除票据"
              className="exp-btn exp-btn--ghost exp-btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              type="button"
            >
              归档
            </button>
          </div>
        </div>
      ) : null}

      {!expanded && layout === "row" ? (
        <div
          className="exp-card__compact-row"
          onClick={(e) => {
            // Wave 3 bulk: shift-click ranges across cards, plain click expands.
            if (selectable && e.shiftKey && bulk) {
              e.preventDefault();
              bulk.handleClick(receipt.id, true);
              return;
            }
            setExpanded(true);
          }}
          role="button"
        >
          {selectable ? (
            <input
              aria-label="多选此张票据"
              checked={selected}
              className="exp-card__select-checkbox"
              onChange={() => undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (!bulk) return;
                bulk.handleClick(receipt.id, e.shiftKey);
              }}
              type="checkbox"
            />
          ) : null}
          <div className="exp-card__accent-bar" style={{ background: "var(--exp-warn)" }} />
          {(() => {
            const primaryEmoji =
              draft.items[0]?.category_zh != null ? categoryEmoji(draft.items[0].category_zh) : "📦";
            return thumbSrc ? (
              <Image alt="" className="exp-card__compact-thumb" height={36} loading="lazy" src={thumbSrc} unoptimized width={36} />
            ) : (
              <span aria-hidden className="exp-card__compact-emoji">
                {primaryEmoji}
              </span>
            );
          })()}
          <div className="exp-card__compact-main">
            <div className="exp-card__compact-name">{merchant}</div>
            <div
              className="exp-card__compact-sub"
              title={compactSubText}
            >
              {compactSubText}
            </div>
          </div>
          <div className="exp-card__compact-right">
            <span className="exp-card__compact-amount">{total}</span>
            {ready ? (
              <button
                aria-label="确认入账"
                className="exp-card__confirm-btn"
                disabled={confirmBlockers.length > 0 || confirming}
                onClick={(e) => {
                  e.stopPropagation();
                  onSave();
                }}
                title={
                  confirming
                    ? "处理中..."
                    : confirmTitle
                }
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              </button>
            ) : null}
            <button
              aria-label="展开编辑"
              className="exp-card__expand"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              type="button"
            >
              <svg fill="none" height="14" viewBox="0 0 24 24" width="14" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="exp-card__drawer-scope" style={drawerScopeStyle}>
          <button
            aria-label="关闭票据编辑"
            className="exp-card__backdrop"
            onClick={() => setExpanded(false)}
            type="button"
          />
          <div className="exp-card__details">
            <button
              aria-label="关闭"
              className="exp-card__details-close"
              onClick={() => setExpanded(false)}
              type="button"
            >
              <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              </svg>
            </button>
            <div className="exp-card__details-body">
              {/* Wave 1 (Feature #6): show receipt thumbnail while editing.
                  Wave 2 feature: image compression — prefer thumbnail_path, fall
                  back to image_path so old rows without a thumb still render.
                  Wave 3 multi-image: ReceiptImageCarousel handles N>1 with
                  prev/next + swipe, falling back to the plain thumb for N=1.
                  The `onAddMore` button is wired through from the parent so
                  pending_review receipts can grow their image set in-place. */}
              <ReceiptImageCarousel
                addingImages={addingImages}
                onAddMore={onAddMore}
                receipt={receipt}
              />
              {reasons.length > 0 || blockers.length > 0 ? (
                <div className="exp-reasons" style={{ padding: "0 0 12px" }}>
                  {receipt.duplicate_hint ? (
                    <span className="exp-tag exp-tag--duplicate">
                      疑似重复：{receipt.duplicate_hint.reason}
                    </span>
                  ) : null}
                  {confirmBlockers.length > 0 ? (
                    <span className="exp-tag exp-tag--warn">
                      需核对：{Array.from(new Set(confirmBlockers)).join("、")}
                    </span>
                  ) : null}
                  {confirmBlockers.length === 0 && amountBlockers.length > 0 ? (
                    <span className="exp-tag exp-tag--warn">
                      金额关系仍有差异，可按当前内容手动确认
                    </span>
                  ) : null}
                  {visibleReasons.map((reason) => (
                    <span className="exp-tag exp-tag--warn" key={reason}>
                      {reason}
                    </span>
                  ))}
                  {hiddenReasonCount > 0 ? (
                    <button
                      className="exp-tag exp-tag--warn exp-tag--toggle"
                      onClick={() => setShowAllReasons((v) => !v)}
                      type="button"
                    >
                      {showAllReasons ? "收起" : `展开剩余 ${hiddenReasonCount} 项`}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <ReceiptForm onChange={onDraftChange} value={draft} />
            </div>
            <div className="exp-form__actions">
              <button
                className="exp-btn exp-btn--danger"
                disabled={deleting}
                onClick={onDelete}
                type="button"
              >
                {deleting ? (
                  <>
                    <span className="exp-spinner" aria-hidden /> 删除中...
                  </>
                ) : (
                  "删除"
                )}
              </button>
              <button
                className="exp-btn exp-btn--secondary"
                onClick={() => {
                  onCancel();
                  setExpanded(false);
                }}
                type="button"
              >
                取消
              </button>
              <button className="exp-btn exp-btn--ghost" onClick={() => setExpanded(false)} type="button">
                关闭
              </button>
              <button
                className="exp-btn exp-btn--primary"
                disabled={confirmBlockers.length > 0 || confirming}
                onClick={() => {
                  onSave();
                  setExpanded(false);
                }}
                title={
                  confirming
                    ? "处理中..."
                    : confirmTitle
                }
                type="button"
              >
                {confirming ? (
                  <>
                    <span className="exp-spinner" aria-hidden /> 处理中...
                  </>
                ) : (
                  "确认入账"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
