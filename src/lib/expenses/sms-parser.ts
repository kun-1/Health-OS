// Wave 4: SMS auto-entry for bank debit alerts (Beijing subway, etc.).
// This module parses a raw SMS body and, if it looks like a public-transit
// charge, returns structured data that can be turned into an expense
// transaction. It is intentionally conservative: when in doubt it returns
// `matched: false` and lets the caller log the reason.

export type SmsParseResult =
  | { matched: false; reason: string }
  | {
      matched: true;
      merchantName: string;
      itemName: string;
      category: "交通";
      amount: number;
      currency: "CNY";
      purchasedAt: string;
      cardTail: string | null;
      rawText: string;
    };

const TRANSIT_KEYWORDS = [
  "地铁",
  "轨道交通",
  "北京地铁",
  "公交地铁",
  "metro",
  "subway",
  "subwaycard",
  "一卡通",
  "市政交通"
];

const DEBIT_KEYWORDS = [
  "支出",
  "消费",
  "扣费",
  "扣款",
  "交易",
  "完成",
  "已付款",
  "paid",
  "debit",
  "withdrawal"
];

function normalizeSms(value: string): string {
  // Replace full-width digits/punctuation with ASCII equivalents so regexes
  // can stay simple.
  return value
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[（）]/g, "()")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeDebit(text: string): boolean {
  return DEBIT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function looksLikeTransit(text: string): boolean {
  const lowered = text.toLowerCase();
  return TRANSIT_KEYWORDS.some((keyword) => lowered.includes(keyword.toLowerCase()));
}

function extractCardTail(text: string): string | null {
  // Match "尾号1234", "尾号 1234", "卡号后四位1234", etc.
  const match = text.match(/尾号\s*(\d{4})/);
  if (match) return match[1];
  const tailMatch = text.match(/卡号.*?(?:后四位|末四位)\s*(\d{4})/);
  if (tailMatch) return tailMatch[1];
  return null;
}

function extractAmount(text: string): number | null {
  // Try to find an amount near currency / debit language. We prefer patterns
  // that explicitly mention currency, but fall back to a bare number followed
  // by "元".
  const currencyPatterns = [
    /(?:支出|消费|扣费|扣款|金额|人民币|RMB|CNY|¥)\s*[：:]?\s*(\d{1,6}(?:\.\d{1,2})?)\s*(?:元|人民币|CNY|RMB)?/,
    /(\d{1,6}(?:\.\d{1,2})?)\s*(?:元|人民币|CNY|RMB)(?![\d\w])/,
    /¥\s*(\d{1,6}(?:\.\d{1,2})?)/
  ];
  for (const pattern of currencyPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0 && value < 1_000_000) return value;
    }
  }
  return null;
}

function extractMerchant(text: string): string | null {
  // "交易商户：北京地铁" / "商户名称：xxx" / "付款给xxx"
  const explicit = text.match(/(?:交易商户|商户名称|收款方|付款给|商家|商户)[：:\s]+([^，,。.;\s]{2,20})/);
  if (explicit) return explicit[1].trim();

  // Fallback: if the text mentions a known transit operator, use it.
  const lowered = text.toLowerCase();
  if (lowered.includes("北京地铁")) return "北京地铁";
  if (lowered.includes("上海地铁")) return "上海地铁";
  if (lowered.includes("广州地铁")) return "广州地铁";
  if (lowered.includes("深圳地铁")) return "深圳地铁";
  if (lowered.includes("地铁")) return "地铁";
  if (lowered.includes("轨道交通")) return "轨道交通";
  if (lowered.includes("市政交通一卡通")) return "市政交通一卡通";

  return null;
}

function parseSmsDateTime(text: string): Date {
  const now = new Date();

  // Pattern 1: "2026年07月06日13:30" / "2026年7月6日 13时30分"
  const isoLike = text.match(
    /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日]?\s*(\d{1,2})[:：时](\d{1,2})[分]?/
  );
  if (isoLike) {
    const candidate = new Date(
      Number(isoLike[1]),
      Number(isoLike[2]) - 1,
      Number(isoLike[3]),
      Number(isoLike[4]),
      Number(isoLike[5]),
      0,
      0
    );
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }

  // Pattern 2: "07月06日13:30" / "07月06日13时30分" (current year)
  const monthDay = text.match(/(\d{1,2})[月](\d{1,2})[日]?\s*(\d{1,2})[:：时](\d{1,2})[分]?/);
  if (monthDay) {
    const candidate = new Date(
      now.getFullYear(),
      Number(monthDay[1]) - 1,
      Number(monthDay[2]),
      Number(monthDay[3]),
      Number(monthDay[4]),
      0,
      0
    );
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }

  // Pattern 3: "13:30" / "13时30分" only — use today
  const timeOnly = text.match(/(\d{1,2})[:：时](\d{1,2})[分]?/);
  if (timeOnly) {
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(timeOnly[1]),
      Number(timeOnly[2]),
      0,
      0
    );
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }

  return now;
}

function formatOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
  return `${sign}${offsetHours}:${offsetMins}`;
}

function formatPurchasedAt(date: Date): string {
  const iso = date.toISOString(); // "2026-07-06T13:30:00.000Z"
  // Drop milliseconds and append the local offset instead of Z.
  const base = iso.slice(0, 19);
  return `${base}${formatOffset(date)}`;
}

export function parseTransitSms(text: string): SmsParseResult {
  if (!text || !text.trim()) {
    return { matched: false, reason: "短信内容为空" };
  }

  const normalized = normalizeSms(text);

  if (!looksLikeDebit(normalized)) {
    return { matched: false, reason: "不是扣费/支出类短信" };
  }

  if (!looksLikeTransit(normalized)) {
    return { matched: false, reason: "未识别到公共交通关键词" };
  }

  const amount = extractAmount(normalized);
  if (amount === null) {
    return { matched: false, reason: "无法从短信中提取金额" };
  }

  const merchantName = extractMerchant(normalized) ?? "地铁";
  const cardTail = extractCardTail(normalized);
  const purchasedAt = formatPurchasedAt(parseSmsDateTime(normalized));

  return {
    matched: true,
    merchantName,
    itemName: "地铁乘车",
    category: "交通",
    amount,
    currency: "CNY",
    purchasedAt,
    cardTail,
    rawText: text
  };
}
