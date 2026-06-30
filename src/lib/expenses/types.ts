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
  // Wave 3: widened to string so the schema can preserve the model's raw
  // value when it returns a non-canonical category (e.g. "咖啡" → "饮料/咖啡"
  // is an alias, but "服装" stays as-is + flagged via category_raw). The
  // categoryColor/Emoji/Label helpers all degrade gracefully on unknowns
  // (fall back to the "其他" palette entry / show the raw string).
  category_zh: string;
  // The model's original output for category_zh. Null when the value is
  // already canonical (e.g. "饮料/咖啡" stays as "饮料/咖啡", category_raw
  // is null). Populated when we mapped an alias OR kept an unknown value.
  category_raw: string | null;
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
  // Wave 3: when a receipt has multiple images, all paths are listed here
  // (position-ordered, with image_path being the first). Empty array = legacy
  // single-image receipt (use image_path). The UI shows a carousel in this
  // case so the user can switch between screenshots.
  images: ReceiptImage[];
  duplicate_hint?: ExpenseDuplicateHint | null;
  confidence: number;
  review_reasons: string[];
  extracted: ExtractedExpenseReceipt;
  transaction_id: number | null;
  created_at: string;
  updated_at: string;
};

// Wave 3: per-image metadata for multi-image receipts. Mirrors the columns
// of expense_receipt_images. The receipt's image_path is the position=0 row
// for legacy compat; new code reads from `images` exclusively.
export type ReceiptImage = {
  id: number;
  image_path: string;
  image_mime_type: string;
  position: number;
};

export type ExpenseReceiptJob = {
  id: number;
  image_path: string;
  image_mime_type: string;
  // Wave 3 multi-image: ordered list of every image this job is processing.
  // For legacy single-image jobs the store layer synthesises a 1-element
  // array from `image_path` + `image_mime_type` when this is null. The first
  // entry always equals `{ path: image_path, mime: image_mime_type }`.
  image_paths: JobImage[];
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

// Wave 3 multi-image: a single image inside a multi-image job. Mirrors the
// shape stored in expense_receipt_jobs.image_paths_json. Renamed from the
// earlier schema concept to disambiguate from the receipt-side ReceiptImage
// (which has an `id` + `receipt_id`).
export type JobImage = {
  path: string;
  mime: string;
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
  base_monthly_budget: number;
  budget_top_up: number;
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
  category_breakdown: { category_zh: string; amount: number; currency: string }[];
  // Apple Card chart: per-day totals (yuan) for the current and previous
  // month, sorted ascending by `day` (YYYY-MM-DD). `amount` is in the same
  // unit as `primary_currency`.
  daily_totals: { day: string; amount: number }[];
  prev_month_daily_totals: { day: string; amount: number }[];
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
