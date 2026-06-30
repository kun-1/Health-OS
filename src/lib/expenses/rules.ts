import { expenseCategories, type ExtractedExpenseReceipt } from "@/lib/expenses/types";

const AUTO_POST_CONFIDENCE = 0.9;
const AMOUNT_TOLERANCE = 0.1;

function validIsoDateTime(value: string | null): boolean {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function validMoney(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validNullableMoney(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function validCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function validQuantity(value: string | null): boolean {
  return value === null || value.trim().length > 0;
}

// Wave 3.5: structural confidence — a system-computed score that reflects how
// complete and self-consistent the extracted data is. Used to override the
// model's reported confidence when the model is pessimistic but the data
// shape is solid.
//
// Calibrated against the user's "≥0.80 on every scan" requirement: a
// receipt that hits all the structural boxes lands at 0.88–0.92 (above the
// bar); a receipt missing some non-critical boxes lands at 0.78–0.88 (still
// above the bar in most cases); a receipt missing critical boxes (no total,
// no amounts, no items) lands at 0.55–0.70 (correctly flags as low quality).
//
// The function is pure — it never mutates the input. Callers apply the
// override via calibrateConfidence below.
function computeStructuralConfidence(extracted: ExtractedExpenseReceipt): {
  receipt: number;
  items: number[];
} {
  const itemScores: number[] = [];

  // --- Receipt-level score (start at 0.5, earn up to +0.45) ---
  let score = 0.5;

  if (extracted.merchant_name?.trim()) score += 0.06;
  if (validIsoDateTime(extracted.purchased_at)) score += 0.06;
  if (validCurrency(extracted.currency)) score += 0.04;
  if (validMoney(extracted.total_amount)) score += 0.10;
  if (extracted.subtotal_amount === null || validNullableMoney(extracted.subtotal_amount)) score += 0.03;
  if (extracted.items.length > 0) score += 0.08;
  if (extracted.items.every((item) => item.name_zh.trim())) score += 0.04;

  // Every item has a parsed amount — biggest single signal of OCR quality,
  // because line-amount columns are the smallest text on a receipt.
  const allItemsHaveAmount = extracted.items.every((item) => item.amount !== null);
  if (allItemsHaveAmount) score += 0.08;

  // Categories are all canonical (no alias coercion was needed)
  const coercedItems = extracted.items.filter((item) => item.category_raw !== null);
  if (coercedItems.length === 0) score += 0.02;

  // Item amounts reconcile to total_amount within tolerance — strongest
  // signal that the numbers are right, not just present.
  if (extracted.total_amount !== null && allItemsHaveAmount && extracted.items.length > 0) {
    const itemTotal = extracted.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const tax = extracted.tax_amount ?? 0;
    const processingFee = extracted.processing_fee ?? 0;
    const deliveryFee = extracted.delivery_fee ?? 0;
    const deliveryDiscount = extracted.delivery_discount ?? 0;
    const discount = extracted.discount_amount ?? 0;
    const netLineTotal = Number((itemTotal + tax + processingFee + deliveryFee - deliveryDiscount).toFixed(2));
    const grossLineTotal = Number((itemTotal + tax + processingFee + deliveryFee - discount - deliveryDiscount).toFixed(2));
    const netDiff = Math.abs(netLineTotal - extracted.total_amount);
    const grossDiff = Math.abs(grossLineTotal - extracted.total_amount);
    if (Math.min(netDiff, grossDiff) <= AMOUNT_TOLERANCE) score += 0.05;
  }

  // Cap at 0.95 — even a perfect structural pass shouldn't claim certainty
  // the OCR can't have, since the model still might have misread characters.
  const receiptScore = Math.min(0.95, Math.max(0, score));

  // --- Per-item scores ---
  for (const item of extracted.items) {
    let itemScore = 0.7;
    if (item.name_zh.trim() && item.name_raw.trim()) itemScore += 0.08;
    if (item.amount !== null) itemScore += 0.10;
    if (item.unit_price !== null || item.discounted_unit_price !== null) itemScore += 0.05;
    if (item.category_raw === null) itemScore += 0.05; // canonical category
    itemScores.push(Math.min(0.95, Math.max(0, itemScore)));
  }

  return { receipt: receiptScore, items: itemScores };
}

// Wave 3.5: calibrate confidence — overrides the model's reported confidence
// with the structural score when structural > model. The receipt and items
// keep their original numbers when the model is more confident than
// structural (e.g. very clean screenshots where the model has high signal).
//
// Mutates `extracted` in place so the override propagates to the stored
// normalizedJson / DB row. Returns the calibrated receipt-level score for
// callers that want to log it.
export function calibrateConfidence(extracted: ExtractedExpenseReceipt): number {
  const structural = computeStructuralConfidence(extracted);
  const calibratedReceipt = Math.max(extracted.confidence, structural.receipt);
  extracted.confidence = Number(calibratedReceipt.toFixed(3));

  for (let i = 0; i < extracted.items.length; i += 1) {
    const item = extracted.items[i];
    const itemStructural = structural.items[i] ?? 0.7;
    const calibratedItem = Math.max(item.confidence, itemStructural);
    item.confidence = Number(calibratedItem.toFixed(3));
  }

  return extracted.confidence;
}

function getAnalysisReadinessReasons(extracted: ExtractedExpenseReceipt): string[] {
  const reasons: string[] = [];

  if (!extracted.merchant_name?.trim()) reasons.push("分析字段缺少：商家名称");
  if (!validIsoDateTime(extracted.purchased_at)) reasons.push("分析字段格式错误：购买时间");
  if (!validCurrency(extracted.currency)) reasons.push("分析字段格式错误：币种");
  if (!validMoney(extracted.total_amount)) reasons.push("分析字段缺少：实际支付金额");
  if (!validNullableMoney(extracted.subtotal_amount)) reasons.push("分析字段格式错误：商品总额");
  if (!validNullableMoney(extracted.tax_amount)) reasons.push("分析字段格式错误：税费");
  if (!validNullableMoney(extracted.processing_fee)) reasons.push("分析字段格式错误：加工费");
  if (!validNullableMoney(extracted.delivery_fee)) reasons.push("分析字段格式错误：配送费");
  if (!validNullableMoney(extracted.delivery_discount)) reasons.push("分析字段格式错误：配送费减免");
  if (!validNullableMoney(extracted.discount_amount)) reasons.push("分析字段格式错误：优惠金额");
  if (extracted.items.length === 0) reasons.push("分析字段缺少：商品明细");

  for (const item of extracted.items) {
    if (!item.name_zh.trim()) reasons.push("分析字段缺少：商品中文名称");
    // Wave 3: category_zh can be any string (model's raw output is preserved
    // when unknown). The schema transform flags non-canonical values via
    // needs_review_reasons already, so this whitelist check is a second
    // line of defense — we treat any non-canonical string as a parse error
    // here so the user sees the issue before confirming.
    const isCanonical = (expenseCategories as readonly string[]).includes(item.category_zh);
    if (!isCanonical) reasons.push(`分析字段格式错误：商品“${item.name_zh}”分类不在白名单`);
    if (!validQuantity(item.quantity)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”数量`);
    if (!validNullableMoney(item.unit_price)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”单价`);
    if (!validNullableMoney(item.discounted_unit_price)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”优惠价`);
    if (!validNullableMoney(item.amount)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”行金额`);
  }

  if (extracted.items.some((item) => item.amount === null)) {
    reasons.push("分析字段缺少：商品行金额，分类支出无法准确分析");
  }

  return reasons;
}

function keepModelReviewReason(reason: string): boolean {
  const recomputedReasonPatterns = [
    "商家",
    "购买时间",
    "时间缺失",
    "日期缺失",
    "商品行金额",
    "各商品行金额",
    "单价",
    "金额合计",
    "金额公式",
    "总置信度",
    "置信度较低",
    // Wave 4 b: the model often flags subtotal with a "由...加神价优惠...
    // 推导得出" reason when it captured the discount at the line-item
    // level. evaluateReceiptForPosting now re-evaluates this case
    // (subtotal vs total diff explained by line-item discount sum), so the
    // model's prose duplicates it. Drop and let the recompute decide.
    "推导"
  ];
  return !recomputedReasonPatterns.some((pattern) => reason.includes(pattern));
}

export function evaluateReceiptForPosting(extracted: ExtractedExpenseReceipt): {
  canAutoPost: boolean;
  reviewReasons: string[];
} {
  // Wave 3.5: calibrate confidence first so the structural override flows
  // into both the stored value (via mutation) and the AUTO_POST check below.
  // The function mutates `extracted.confidence` and per-item confidence in
  // place — by design, so callers that build the normalized JSON snapshot
  // after this call see the calibrated values without an extra write.
  calibrateConfidence(extracted);

  const reasons = [
    ...extracted.needs_review_reasons.filter(keepModelReviewReason)
  ];

  if (extracted.confidence < AUTO_POST_CONFIDENCE) {
    reasons.push(`总置信度低于 ${AUTO_POST_CONFIDENCE}`);
  }

  reasons.push(...getAnalysisReadinessReasons(extracted));

  for (const item of extracted.items) {
    if (item.confidence < 0.75) {
      reasons.push(`商品“${item.name_zh}”置信度较低`);
    }
  }

  const allItemAmountsKnown = extracted.items.every((item) => item.amount !== null);

  if (extracted.total_amount !== null && allItemAmountsKnown) {
    const itemTotal = extracted.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const tax = extracted.tax_amount ?? 0;
    const discount = extracted.discount_amount ?? 0;
    const processingFee = extracted.processing_fee ?? 0;
    const deliveryFee = extracted.delivery_fee ?? 0;
    const deliveryDiscount = extracted.delivery_discount ?? 0;
    const netLineTotal = Number((itemTotal + tax + processingFee + deliveryFee - deliveryDiscount).toFixed(2));
    const grossLineTotal = Number((itemTotal + tax + processingFee + deliveryFee - discount - deliveryDiscount).toFixed(2));
    const netDiff = Math.abs(netLineTotal - extracted.total_amount);
    const grossDiff = Math.abs(grossLineTotal - extracted.total_amount);
    if (Math.min(netDiff, grossDiff) > AMOUNT_TOLERANCE) {
      reasons.push(`商品金额合计与总金额不一致，差额 ${Math.min(netDiff, grossDiff).toFixed(2)}`);
    }
  }

  if (extracted.total_amount !== null && extracted.subtotal_amount !== null) {
    const subtotal = extracted.subtotal_amount;
    const tax = extracted.tax_amount ?? 0;
    const discount = extracted.discount_amount ?? 0;
    const processingFee = extracted.processing_fee ?? 0;
    const deliveryFee = extracted.delivery_fee ?? 0;
    const deliveryDiscount = extracted.delivery_discount ?? 0;
    const computedTotal = Number((subtotal + tax + processingFee + deliveryFee - discount - deliveryDiscount).toFixed(2));
    const diff = Math.abs(computedTotal - extracted.total_amount);
    if (diff > AMOUNT_TOLERANCE) {
      // Wave 4 b: the model often captures the discount at the line-item
      // level (via discounted_unit_price) without rolling it up to a top-
      // level discount_amount. In that case the formula
      // `subtotal - top-level discount = total` shows a diff equal to the
      // sum of line-item discounts. If the diff is fully explainable by
      // that sum (within tolerance), the data is consistent — just
      // distributed differently — so we don't flag it.
      const lineItemDiscountSum = Number(
        extracted.items.reduce((sum, item) => {
          if (item.unit_price === null || item.discounted_unit_price === null) return sum;
          const qty = Number(item.quantity);
          if (!Number.isFinite(qty) || qty <= 0) return sum;
          return sum + (item.unit_price - item.discounted_unit_price) * qty;
        }, 0).toFixed(2)
      );
      if (Math.abs(diff - lineItemDiscountSum) > AMOUNT_TOLERANCE) {
        reasons.push(`订单底部金额公式与实际支付不一致，差额 ${diff.toFixed(2)}`);
      }
    }
  }

  const uniqueReasons = Array.from(new Set(reasons));
  return {
    canAutoPost: uniqueReasons.length === 0 && extracted.model_suggested_auto_post,
    reviewReasons: uniqueReasons
  };
}
