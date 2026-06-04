export const expenseCategories = [
  "食物",
  "外食",
  "饮料/咖啡",
  "日用品",
  "清洁用品",
  "个人护理",
  "药品/医疗",
  "补剂",
  "交通",
  "居住",
  "娱乐",
  "其他"
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export type ExpenseReceiptStatus = "auto_posted" | "pending_review" | "confirmed";

export type ExtractedExpenseItem = {
  name_raw: string;
  name_zh: string;
  category_zh: ExpenseCategory;
  quantity: string | null;
  spec_text: string | null;
  unit_price: number | null;
  amount: number | null;
  confidence: number;
  notes: string | null;
};

export type ExtractedExpenseReceipt = {
  merchant_name: string | null;
  purchased_at: string | null;
  currency: string;
  subtotal_amount: number | null;
  total_amount: number | null;
  tax_amount: number | null;
  processing_fee: number | null;
  delivery_fee: number | null;
  delivery_discount: number | null;
  discount_amount: number | null;
  confidence: number;
  model_suggested_auto_post: boolean;
  needs_review_reasons: string[];
  recognition_note: string | null;
  user_note: string | null;
  items: ExtractedExpenseItem[];
};

export type ExpenseReceiptSummary = {
  id: number;
  status: ExpenseReceiptStatus;
  image_path: string;
  confidence: number;
  review_reasons: string[];
  extracted: ExtractedExpenseReceipt;
  transaction_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseItem = ExtractedExpenseItem & {
  id: number;
  transaction_id: number;
};

export type ExpenseTransaction = {
  id: number;
  receipt_id: number | null;
  merchant_name: string;
  purchased_at: string;
  subtotal_amount: number | null;
  total_amount: number;
  currency: string;
  tax_amount: number;
  processing_fee: number;
  delivery_fee: number;
  delivery_discount: number;
  discount_amount: number;
  notes: string | null;
  excluded_from_budget: boolean;
  items: ExpenseItem[];
  created_at: string;
  updated_at: string;
};

export type ExpenseAnalytics = {
  month: string;
  monthly_budget: number;
  spent_this_month: number;
  remaining_this_month: number;
  remaining_daily_budget: number;
  projected_month_end_spend: number;
  over_budget_now: boolean;
  projected_over_budget: boolean;
  category_totals: { category_zh: ExpenseCategory; amount: number }[];
  recent_transactions: ExpenseTransaction[];
  pending_receipts: ExpenseReceiptSummary[];
};
