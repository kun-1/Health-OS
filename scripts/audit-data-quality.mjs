import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");
const DEFAULT_OUT_PATH = path.join(process.cwd(), "reports", "data-quality-audit.json");

const ALLOWED_CURRENCIES = new Set(["CNY", "USD", "EUR", "GBP", "JPY", "HKD", "TWD"]);
const KNOWN_UNITS = new Set(["g", "ml", "份", "块"]);
const NON_NUTRITION_EXPENSE_CATEGORIES = new Set([
  "日用品",
  "娱乐",
  "交通",
  "住房",
  "医疗",
  "学习",
  "其他",
  "个人护理",
  "清洁用品"
]);
const NOISE_PATTERNS = ["微信转账", "淘宝商品", "盒马超市"];
const NOT_NUTRITION_PATTERNS = ["包装费", "支出", "纯净水", "饮用水", "矿泉水", "蒸馏水"];
const NOT_NUTRITION_EXACT = new Set(["海底捞"]);
const BRAND_PREFIX_RE =
  /^(盒马|有机|精选|原野|每日|田园|清润|好货|优质|冷鲜|冰鲜|冷冻|鲜活|散养|泰森|海底捞)/;
const NOISE_RE = /[\d()（）【】\[\]gG]/g;

function parseArgs(argv) {
  const args = {
    dbPath: process.env.SQLITE_PATH ?? DEFAULT_DB_PATH,
    outPath: DEFAULT_OUT_PATH,
    sampleLimit: 25
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--db") {
      args.dbPath = argv[++i];
    } else if (arg === "--out") {
      args.outPath = argv[++i];
    } else if (arg === "--limit") {
      args.sampleLimit = Number.parseInt(argv[++i], 10);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.sampleLimit) || args.sampleLimit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run audit:data-quality -- [--db data/app.db] [--out reports/data-quality-audit.json] [--limit 25]

Runs a read-only audit over expense/nutrition data and writes a dry-run report.
No database rows are inserted, updated, or deleted.`);
}

function normalizeFoodName(name) {
  let value = String(name ?? "").replace(NOISE_RE, " ").replace(/\s+/g, " ").trim();
  value = value.replace(BRAND_PREFIX_RE, "");
  return value;
}

function classifyName(nameZh, aliases) {
  const haystack = normalizeFoodName(nameZh);
  if (!haystack) {
    return { category: "未分类", confidence: 0, matchedPattern: null };
  }

  let best = null;
  for (const alias of aliases) {
    if (!haystack.includes(alias.raw_pattern)) continue;
    const len = alias.raw_pattern.length;
    const isUserSet = Boolean(alias.is_user_set);
    if (
      best === null ||
      len > best.raw_pattern.length ||
      (len === best.raw_pattern.length && isUserSet && !Boolean(best.is_user_set))
    ) {
      best = alias;
    }
  }

  if (!best) {
    return { category: "未分类", confidence: 0, matchedPattern: null };
  }

  const lengthScore = Math.min(1, best.raw_pattern.length / 8);
  const userBonus = best.is_user_set ? 0.1 : 0;
  return {
    category: best.category,
    confidence: Math.min(1, lengthScore + userBonus),
    matchedPattern: best.raw_pattern
  };
}

function confidenceScale(confidenceValues) {
  const max = Math.max(0, ...confidenceValues.filter((value) => Number.isFinite(value)));
  if (max > 100) return { scale: "0..1000", lowThreshold: 500 };
  if (max > 1) return { scale: "0..100", lowThreshold: 50 };
  return { scale: "0..1", lowThreshold: 0.5 };
}

function isManuallyVerified(notes) {
  return String(notes ?? "").includes("[manual_verified");
}

function qualityForItem(item, classification, lowConfidenceThreshold) {
  if (NOISE_PATTERNS.some((pattern) => item.name_zh.includes(pattern))) {
    return {
      severity: "fail",
      reasons: ["noise"],
      repairAction: "ignore_for_nutrition"
    };
  }

  if (
    NOT_NUTRITION_EXACT.has(item.name_zh.trim()) ||
    NOT_NUTRITION_PATTERNS.some((pattern) => item.name_zh.includes(pattern))
  ) {
    return {
      severity: "ignored",
      reasons: ["not_nutrition"],
      repairAction: "ignore_for_nutrition"
    };
  }

  const reasons = [];
  const isNonFood = NON_NUTRITION_EXPENSE_CATEGORIES.has(item.category_zh);

  if (isNonFood) {
    reasons.push("non_food_expense_category");
  }

  if (item.food_amount_value === null) {
    reasons.push("no_weight");
  } else if (item.food_amount_unit !== null && !KNOWN_UNITS.has(item.food_amount_unit)) {
    reasons.push("ambiguous_unit");
  }

  if (classification.category === "未分类" && classification.matchedPattern) {
    reasons.push("not_nutrition");
  } else if (classification.category === "未分类") {
    reasons.push("no_alias_match");
  }

  if (!isManuallyVerified(item.notes) && item.confidence < lowConfidenceThreshold) {
    reasons.push("low_confidence");
  }

  if (isNonFood) {
    return {
      severity: "ignored",
      reasons,
      repairAction: "ignore_for_nutrition"
    };
  }

  let severity = "ok";
  if (reasons.length === 1 && !reasons.includes("no_alias_match")) {
    severity = "warn";
  } else if (reasons.length > 0) {
    severity = "fail";
  }

  if (reasons.includes("not_nutrition")) {
    return {
      severity: "ignored",
      reasons,
      repairAction: "ignore_for_nutrition"
    };
  }

  const repairAction = recommendRepairAction(item, classification, reasons, severity);
  return { severity, reasons, repairAction };
}

function recommendRepairAction(item, classification, reasons, severity) {
  if (severity === "ok") return "none";
  if (NON_NUTRITION_EXPENSE_CATEGORIES.has(item.category_zh)) return "ignore_for_nutrition";
  if (reasons.includes("noise")) return "ignore_for_nutrition";
  if (reasons.includes("not_nutrition")) return "ignore_for_nutrition";
  if (reasons.includes("no_alias_match")) return "needs_review";
  if (reasons.includes("ambiguous_unit")) return "needs_review";
  if (reasons.includes("no_weight") && classification.category !== "未分类") return "needs_review";
  if (reasons.includes("low_confidence")) return "needs_review";
  return "needs_review";
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] ?? "null";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function countReasons(assessments) {
  const counts = {};
  for (const assessment of assessments) {
    for (const reason of assessment.quality.reasons) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function pct(count, total) {
  if (total === 0) return 0;
  return Number(((count / total) * 100).toFixed(1));
}

function sample(rows, limit) {
  return rows.slice(0, limit);
}

function issue(id, layer, severity, title, evidence, risk, recommendation) {
  return { id, layer, severity, title, evidence, risk, recommendation };
}

function absDiff(a, b) {
  return Math.abs(Number(a ?? 0) - Number(b ?? 0));
}

function classifyMoneyRow(row, toleranceCents = 100) {
  const itemSum = Number(row.item_sum_cents ?? 0);
  const total = Number(row.total_amount_cents ?? 0);
  const subtotal = row.subtotal_amount_cents === null ? null : Number(row.subtotal_amount_cents);
  const bottomFormula =
    (subtotal ?? itemSum) +
    Number(row.tax_amount_cents ?? 0) +
    Number(row.processing_fee_cents ?? 0) +
    Number(row.delivery_fee_cents ?? 0) -
    Number(row.discount_amount_cents ?? 0) -
    Number(row.delivery_discount_cents ?? 0);
  const itemSumVsTotalDiff = absDiff(itemSum, total);
  const itemSumVsSubtotalDiff = subtotal === null ? null : absDiff(itemSum, subtotal);
  const bottomFormulaVsTotalDiff = absDiff(bottomFormula, total);
  const itemLooksNet = itemSumVsTotalDiff <= toleranceCents;
  const itemLooksGross = itemSumVsSubtotalDiff !== null && itemSumVsSubtotalDiff <= toleranceCents;
  const bottomFormulaOk =
    subtotal === null ||
    bottomFormulaVsTotalDiff <= toleranceCents ||
    // Some sources keep discounts at line level. In that case item_sum can
    // already equal total while subtotal/discount fields are incomplete.
    itemLooksNet;

  let itemAmountSemantics = "unclassified";
  if (itemLooksNet && itemLooksGross) itemAmountSemantics = "net_or_no_discount";
  else if (itemLooksNet) itemAmountSemantics = "net_item_amounts";
  else if (itemLooksGross) itemAmountSemantics = "gross_item_amounts";

  const needsReview = itemAmountSemantics === "unclassified" || !bottomFormulaOk;
  return {
    ...row,
    item_amount_semantics: itemAmountSemantics,
    item_sum_vs_total_diff_cents: itemSumVsTotalDiff,
    item_sum_vs_subtotal_diff_cents: itemSumVsSubtotalDiff,
    bottom_formula_total_cents: bottomFormula,
    bottom_formula_vs_total_diff_cents: bottomFormulaVsTotalDiff,
    bottom_formula_ok: bottomFormulaOk,
    needs_review: needsReview
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(args.dbPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");

  const tables = [
    "expense_transactions",
    "expense_items",
    "expense_receipts",
    "expense_receipt_jobs",
    "expense_receipt_images",
    "receipt_hashes",
    "nutrition_food_aliases",
    "recurring_expenses",
    "sms_transaction_records"
  ];

  const rowCounts = Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
    ])
  );

  const aliases = db
    .prepare(
      "SELECT raw_pattern, category, is_user_set FROM nutrition_food_aliases ORDER BY length(raw_pattern) DESC"
    )
    .all();
  const items = db.prepare("SELECT * FROM expense_items ORDER BY id DESC").all();
  const transactions = db.prepare("SELECT * FROM expense_transactions ORDER BY id DESC").all();
  const receipts = db.prepare("SELECT * FROM expense_receipts ORDER BY id DESC").all();
  const jobs = db.prepare("SELECT * FROM expense_receipt_jobs ORDER BY id DESC").all();

  const scale = confidenceScale(items.map((item) => item.confidence));
  const itemAssessments = items.map((item) => {
    const classification = classifyName(item.name_zh, aliases);
    const quality = qualityForItem(item, classification, scale.lowThreshold);
    return { item, classification, quality };
  });

  const hardChecks = {
    transaction_total_nonpositive: db
      .prepare("SELECT COUNT(*) AS count FROM expense_transactions WHERE total_amount_cents <= 0")
      .get().count,
    transaction_bad_currency: transactions.filter((row) => !ALLOWED_CURRENCIES.has(row.currency)).length,
    transaction_empty_merchant: transactions.filter((row) => row.merchant_name.trim() === "").length,
    transaction_invalid_date: transactions.filter(
      (row) => !/^\d{4}-\d{2}-\d{2}/.test(row.purchased_at)
    ).length,
    transaction_without_items: db
      .prepare(
        "SELECT COUNT(*) AS count FROM expense_transactions t WHERE NOT EXISTS (SELECT 1 FROM expense_items i WHERE i.transaction_id = t.id)"
      )
      .get().count,
    item_orphan_transaction: db
      .prepare(
        "SELECT COUNT(*) AS count FROM expense_items i WHERE NOT EXISTS (SELECT 1 FROM expense_transactions t WHERE t.id = i.transaction_id)"
      )
      .get().count,
    receipt_without_image_row: db
      .prepare(
        "SELECT COUNT(*) AS count FROM expense_receipts r WHERE NOT EXISTS (SELECT 1 FROM expense_receipt_images img WHERE img.receipt_id = r.id)"
      )
      .get().count,
    receipt_hash_orphan: db
      .prepare(
        "SELECT COUNT(*) AS count FROM receipt_hashes h WHERE NOT EXISTS (SELECT 1 FROM expense_receipts r WHERE r.id = h.receipt_id)"
      )
      .get().count,
    receipt_transaction_orphan: db
      .prepare(
        "SELECT COUNT(*) AS count FROM expense_receipts r WHERE r.transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_transactions t WHERE t.id = r.transaction_id)"
      )
      .get().count
  };

  const transactionMoneyRows = db
    .prepare(
      `
      SELECT
        t.id,
        t.merchant_name,
        t.purchased_at,
        t.total_amount_cents,
        t.subtotal_amount_cents,
        t.tax_amount_cents,
        t.processing_fee_cents,
        t.delivery_fee_cents,
        t.delivery_discount_cents,
        t.discount_amount_cents,
        COALESCE(SUM(COALESCE(i.amount_cents, 0)), 0) AS item_sum_cents
      FROM expense_transactions t
      LEFT JOIN expense_items i ON i.transaction_id = t.id
      GROUP BY t.id
      ORDER BY t.id DESC
      `
    )
    .all();
  const transactionMoneyClassifications = transactionMoneyRows.map((row) => classifyMoneyRow(row));
  const transactionMoneyReview = transactionMoneyClassifications.filter((row) => row.needs_review);
  const moneySemanticsCounts = countBy(transactionMoneyClassifications, "item_amount_semantics");

  const itemSeverityCounts = countBy(
    itemAssessments.map((row) => ({ severity: row.quality.severity })),
    "severity"
  );
  const itemRepairCounts = countBy(
    itemAssessments.map((row) => ({ repairAction: row.quality.repairAction })),
    "repairAction"
  );
  const itemReasonCounts = countReasons(itemAssessments);

  const failedOrWarnItems = itemAssessments.filter((row) =>
    ["fail", "warn"].includes(row.quality.severity)
  );
  const ignoredItems = itemAssessments.filter((row) => row.quality.severity === "ignored");
  const aliasCandidates = itemAssessments.filter(
    (row) =>
      row.quality.reasons.includes("no_alias_match") &&
      !NON_NUTRITION_EXPENSE_CATEGORIES.has(row.item.category_zh)
  );
  const weightCandidates = itemAssessments.filter(
    (row) =>
      row.quality.reasons.includes("no_weight") &&
      row.classification.category !== "未分类" &&
      !NON_NUTRITION_EXPENSE_CATEGORIES.has(row.item.category_zh)
  );
  const unitCandidates = itemAssessments.filter((row) =>
    row.quality.reasons.includes("ambiguous_unit")
  );

  const criticalHardFailures = Object.values(hardChecks).reduce((sum, value) => sum + value, 0);
  const report = {
    generated_at: new Date().toISOString(),
    mode: "dry_run_read_only",
    database_path: args.dbPath,
    standards: {
      ledger_trust: [
        "transaction_receipt_item_references_are_complete",
        "amounts_are_non_negative",
        "currency_is_allowed",
        "dates_have_iso_date_shape",
        "receipts_are_traceable_to_images"
      ],
      nutrition_usability: [
        "food_items_are_classifiable",
        "food_items_have_weight_or_convertible_unit",
        "non_food_items_are_explicitly_ignored"
      ],
      remediation_order: [
        "no_alias_match",
        "no_weight",
        "ambiguous_unit",
        "noise",
        "category_normalization"
      ],
      repair_actions: ["auto_fixable", "needs_review", "ignore_for_nutrition"]
    },
    dataset_summary: {
      row_counts: rowCounts,
      receipt_status_counts: countBy(receipts, "status"),
      receipt_job_status_counts: countBy(jobs, "status"),
      item_expense_category_counts: countBy(items, "category_zh"),
      confidence_scale: scale
    },
    ledger_quality: {
      hard_checks: hardChecks,
      item_amount_semantics_counts: moneySemanticsCounts,
      money_reconciliation_review_count: transactionMoneyReview.length,
      money_reconciliation_review_samples: sample(transactionMoneyReview, args.sampleLimit)
    },
    nutrition_quality: {
      severity_counts: {
        ok: itemSeverityCounts.ok ?? 0,
        warn: itemSeverityCounts.warn ?? 0,
        fail: itemSeverityCounts.fail ?? 0,
        ignored: itemSeverityCounts.ignored ?? 0
      },
      severity_rates_pct: {
        ok: pct(itemSeverityCounts.ok ?? 0, items.length),
        warn: pct(itemSeverityCounts.warn ?? 0, items.length),
        fail: pct(itemSeverityCounts.fail ?? 0, items.length),
        ignored: pct(itemSeverityCounts.ignored ?? 0, items.length)
      },
      reason_counts: itemReasonCounts,
      repair_action_counts: itemRepairCounts
    },
    dry_run_remediation: {
      alias_candidates: sample(
        aliasCandidates.map(formatItemAssessment),
        args.sampleLimit
      ),
      no_weight_candidates: sample(
        weightCandidates.map(formatItemAssessment),
        args.sampleLimit
      ),
      ambiguous_unit_candidates: sample(
        unitCandidates.map(formatItemAssessment),
        args.sampleLimit
      ),
      ignored_non_food_items: sample(
        ignoredItems.map(formatItemAssessment),
        args.sampleLimit
      ),
      review_items: sample(
        failedOrWarnItems.map(formatItemAssessment),
        args.sampleLimit
      )
    },
    findings: [
      issue(
        "ledger-hard-checks",
        "ledger",
        criticalHardFailures > 0 ? "critical" : "pass",
        "Ledger referential and validity checks",
        { hard_checks: hardChecks },
        "Hard failures would break trusted expense totals and receipt traceability.",
        criticalHardFailures > 0
          ? "Fix parent-child references and invalid transaction fields before nutrition cleanup."
          : "No hard ledger failures found in the current database snapshot."
      ),
      issue(
        "nutrition-coverage",
        "nutrition",
        (itemSeverityCounts.fail ?? 0) > 0 ? "high" : "pass",
        "Nutrition analysis coverage",
        {
          fail: itemSeverityCounts.fail ?? 0,
          warn: itemSeverityCounts.warn ?? 0,
          ignored: itemSeverityCounts.ignored ?? 0,
          total_items: items.length,
          reason_counts: itemReasonCounts
        },
        "Failed food items are skipped or materially weaken plate/PDI scoring.",
        "Prioritize alias review, then missing weights, then unit normalization."
      ),
      issue(
        "confidence-scale",
        "ocr",
        scale.scale === "0..1" ? "pass" : "medium",
        "OCR confidence scale normalization",
        scale,
        "A fixed 0.5 threshold only works for 0..1 confidence values.",
        "Use the detected scale threshold in audits and normalize confidence before future scoring."
      ),
      issue(
        "money-reconciliation-review",
        "ledger",
        transactionMoneyReview.length > 0 ? "medium" : "pass",
        "Transaction subtotal/item reconciliation needs review",
        { review_count: transactionMoneyReview.length },
        "Discounts, delivery fees, and subtotals can make naive item-sum comparisons misleading.",
        "Keep these as needs_review until the receipt arithmetic rule is finalized."
      )
    ]
  };

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);

  printSummary(report, args.outPath);
}

function formatItemAssessment(row) {
  return {
    id: row.item.id,
    transaction_id: row.item.transaction_id,
    name_zh: row.item.name_zh,
    expense_category: row.item.category_zh,
    nutrition_category: row.classification.category,
    matched_pattern: row.classification.matchedPattern,
    food_amount_value: row.item.food_amount_value,
    food_amount_unit: row.item.food_amount_unit,
    confidence: row.item.confidence,
    severity: row.quality.severity,
    reasons: row.quality.reasons,
    repair_action: row.quality.repairAction
  };
}

function printSummary(report, outPath) {
  const nutrition = report.nutrition_quality;
  console.log("Data quality audit complete (dry-run, read-only).");
  console.log(`Report: ${outPath}`);
  console.log("");
  console.log("Rows:");
  for (const [table, count] of Object.entries(report.dataset_summary.row_counts)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log("");
  console.log("Ledger hard checks:");
  for (const [name, count] of Object.entries(report.ledger_quality.hard_checks)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("Item amount semantics:");
  for (const [name, count] of Object.entries(report.ledger_quality.item_amount_semantics_counts)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log(`Money reconciliation review: ${report.ledger_quality.money_reconciliation_review_count}`);
  console.log("");
  console.log("Nutrition item quality:");
  console.log(
    `  ok=${nutrition.severity_counts.ok}, warn=${nutrition.severity_counts.warn}, fail=${nutrition.severity_counts.fail}, ignored=${nutrition.severity_counts.ignored}`
  );
  console.log("Reasons:");
  for (const [name, count] of Object.entries(nutrition.reason_counts)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("");
  console.log("Dry-run repair actions:");
  for (const [name, count] of Object.entries(nutrition.repair_action_counts)) {
    console.log(`  ${name}: ${count}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
