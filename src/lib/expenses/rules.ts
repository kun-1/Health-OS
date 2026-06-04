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
    if (!expenseCategories.includes(item.category_zh)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”分类不在白名单`);
    if (!validQuantity(item.quantity)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”数量`);
    if (!validNullableMoney(item.unit_price)) reasons.push(`分析字段格式错误：商品“${item.name_zh}”单价`);
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
    "置信度较低"
  ];
  return !recomputedReasonPatterns.some((pattern) => reason.includes(pattern));
}

export function evaluateReceiptForPosting(extracted: ExtractedExpenseReceipt): {
  canAutoPost: boolean;
  reviewReasons: string[];
} {
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
      reasons.push(`订单底部金额公式与实际支付不一致，差额 ${diff.toFixed(2)}`);
    }
  }

  const uniqueReasons = Array.from(new Set(reasons));
  return {
    canAutoPost: uniqueReasons.length === 0 && extracted.model_suggested_auto_post,
    reviewReasons: uniqueReasons
  };
}
