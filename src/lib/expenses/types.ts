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
export type ExpenseReceiptJobStatus = "queued" | "processing" | "failed" | "completed" | "dead";

export type ExpenseDuplicateHint = {
  level: "high";
  matched_kind: "receipt" | "transaction";
  matched_id: number;
  reason: string;
};

export type ExtractedExpenseItem = {
  name_raw: string;
  name_zh: string;
  category_zh: ExpenseCategory;
  quantity: string | null;
  spec_text: string | null;
  food_amount_value: number | null;
  food_amount_unit: string | null;
  unit_price: number | null;
  discounted_unit_price: number | null;
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
  image_mime_type: string;
  // Wave 2 feature: image compression — null means no thumbnail was generated
  // (old data or sharp failure); UI falls back to image_path.
  thumbnail_path?: string | null;
  duplicate_hint?: ExpenseDuplicateHint | null;
  confidence: number;
  review_reasons: string[];
  extracted: ExtractedExpenseReceipt;
  transaction_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseReceiptJob = {
  id: number;
  image_path: string;
  image_mime_type: string;
  original_filename: string;
  status: ExpenseReceiptJobStatus;
  error_message: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  receipt_id: number | null;
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
  timezone: string;
  monthly_budget: number;
  spent_this_month: number;
  excluded_this_month: number;
  effective_spent_this_month: number;
  budget_progress_label: string | null;
  remaining_this_month: number;
  remaining_daily_budget: number;
  projected_month_end_spend: number;
  over_budget_now: boolean;
  projected_over_budget: boolean;
  category_totals: { category_zh: ExpenseCategory; amount: number; formatted_amount: string }[];
  recent_transactions: (ExpenseTransaction & {
    formatted_total: string;
    formatted_subtotal: string | null;
    receipt_image_path: string | null;
    // Wave 2 feature: image compression
    receipt_thumbnail_path: string | null;
    duplicate_hint?: ExpenseDuplicateHint | null;
  })[];
  pending_receipts: ExpenseReceiptSummary[];
  receipt_jobs: ExpenseReceiptJob[];
  // Wave 1 cleanup: page-level totals broken down by currency. Pre-cleanup
  // these sums were rendered in a single "CNY" label, which silently produced
  // nonsense numbers (e.g. CNY total + USD number) for multi-currency users.
  // All amounts below are in cents; the frontend converts to display units.
  total_by_currency: Record<string, number>;
  excluded_this_month_by_currency: Record<string, number>;
  primary_currency: string;
  budget_currency: string;
  budget_progress: {
    spent: number;
    budget: number;
    remaining: number;
    over_budget: boolean;
  };
  category_breakdown: { category_zh: ExpenseCategory; amount: number; currency: string }[];
};

// Wave 3 subscription: types — recurring rules the scheduler ticks on
// independently of OCR jobs. dayOfMonth is restricted to 1-28 by the Zod
// schema and the DB has no constraint, so callers must validate.
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type RecurringExpense = {
  id: number;
  merchant_name: string;
  amount_cents: number;
  currency: string;
  category_zh: string;
  frequency: RecurringFrequency;
  day_of_month: number | null;
  day_of_week: number | null;
  month_of_year: number | null;
  active: boolean;
  start_date: string;
  end_date: string | null;
  last_run_at: string | null;
  next_run_at: string;
  notes: string | null;
  excluded_from_budget: boolean;
  created_at: string;
  updated_at: string;
};
