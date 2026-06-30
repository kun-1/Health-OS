// A/B test: MiniMax OCR with thinking enabled vs disabled, on the SAME image.
// Usage: node scripts/test-ocr-thinking.mjs <path-to-receipt.jpg>
//
// Loads .env.local, then calls the same Anthropic-compatible endpoint the app
// uses (ocr.ts:188), with thinking toggled via MINIMAX_OCR_THINKING.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

// --- Load .env.local (don't print secrets) ---
const envPath = resolve(process.cwd(), ".env.local");
const envText = await readFile(envPath, "utf-8");
for (const rawLine of envText.split("\n")) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  const value = line
    .slice(eq + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

const API_KEY = process.env.MINIMAX_API_KEY;
if (!API_KEY) {
  console.error("MINIMAX_API_KEY not found in .env.local");
  process.exit(1);
}

const BASE_URL = (process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
const MODEL = process.env.MINIMAX_OCR_MODEL ?? "MiniMax-M3";
const MAX_TOKENS = 12000;
const TIMEOUT_MS = 180_000;

const PROMPT = `你是个人生活支出票据识别助手。请从图片中提取消费票据，只输出严格 JSON，不要输出 markdown，不要解释。

要求：
1. 所有分类、中文标准名、备注都使用中文。
2. 看不清或票据中不存在的字段填 null，不要猜。merchant_name 和 purchased_at 如果图片没有显示，直接填 null。
3. 商品分类只能使用：食物、外食、饮料/咖啡、日用品、清洁用品、个人护理、药品/医疗、补剂、交通、居住、娱乐、其他。
4. 默认币种为 CNY，除非票据明确显示其他币种。
5. spec_text 用于记录规格、重量、容量或包装，例如"250g""596ml*12瓶"；quantity 只记录购买份数，例如右侧 X1/X2。spec_text 不要包含"约""大约""左右"等模糊词。票据写"约250g"时，spec_text 写"250g"即可，不要因为"约重"本身降低置信度或加入备注。
6. food_amount_value 和 food_amount_unit 用于记录可计算的食物/饮品总量。优先使用标准单位：重量统一成 g，容量统一成 ml；例如"250g"填 250/g，"0.5kg"填 500/g，"596ml"填 596/ml，"2L"填 2000/ml，"220ml*12盒"填 2640/ml，"330ml × 2听"填 660/ml。只有件数没有重量/容量时才用原单位，例如 12/瓶、3/个、4/块。如果只有购买份数没有规格，food_amount_value 可等于 quantity 数字且 unit 写"份"。无法可靠判断时两个字段都填 null。
7. unit_price 表示商品原单价/标价；discounted_unit_price 表示优惠后单价/折扣价/会员价/券后单价。票据没有单独显示优惠后单价时，discounted_unit_price 必须填 null，不要用 amount 反推。
8. amount 表示该商品行最终小计，计算优先级固定为：quantity × discounted_unit_price；如果 discounted_unit_price 为 null，则 quantity × unit_price。若票据直接显示折后行金额，以票据显示值为准。票据没有显示商品行金额、也无法通过数量和单价/优惠价计算时必须填 null，不要把重量、规格或数量写入 amount。
9. subtotal_amount 表示商品原价总额或商品折前总额，total_amount 表示实际支付。
10. 中国生鲜订单如有配送费、配送费减免、活动优惠、加工费，要分别写入 delivery_fee、delivery_discount、discount_amount、processing_fee。整单优惠写 discount_amount；单品折扣价写 discounted_unit_price，不要重复计入。
11. 商品明细尽量逐行提取；如果商品行无法可靠拆分，把无法确认原因写入 needs_review_reasons。票据缺少商品行金额时，只说明"商品行金额缺失"，不要编造金额。
12. confidence 使用 0 到 1 的数字，只表示图片文字识别和字段拆分的可靠性；不要因为票据本身缺少商家、时间或商品行金额而降低 confidence，这些缺失只写入 needs_review_reasons。
13. recognition_note 只写识别不确定性，不要写消费建议。
14. user_note 必须为 null。
15. model_suggested_auto_post 只有在商家、时间、总金额、商品明细、费用关系都清晰时才为 true。
16. 优先输出最终 JSON，推理保持简短，不要输出除 JSON 以外的内容。

JSON 格式：
{
  "merchant_name": "商家名称或 null",
  "purchased_at": "ISO 8601 带时区时间或 null",
  "currency": "CNY",
  "subtotal_amount": 0,
  "total_amount": 0,
  "tax_amount": 0,
  "processing_fee": 0,
  "delivery_fee": 0,
  "delivery_discount": 0,
  "discount_amount": 0,
  "confidence": 0.0,
  "model_suggested_auto_post": false,
  "needs_review_reasons": [],
  "recognition_note": null,
  "user_note": null,
  "items": [
    {
      "name_raw": "票据原始名称",
      "name_zh": "中文标准名",
      "category_zh": "食物",
      "quantity": "1",
      "spec_text": "250g",
      "food_amount_value": 250,
      "food_amount_unit": "g",
      "unit_price": 0,
      "discounted_unit_price": null,
      "amount": null,
      "confidence": 0.0,
      "notes": null
    }
  ]
}`;

async function callOcr({ imageBase64, mimeType, thinkingEnabled, label }) {
  const thinking = thinkingEnabled
    ? { type: "enabled", budget_tokens: 1024 }
    : { type: "disabled" };

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: imageBase64 }
          }
        ]
      }
    ]
  };

  const start = performance.now();
  let res;
  try {
    res = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify(body)
    });
  } catch (err) {
    return { label, error: `network: ${err.message}`, duration_ms: Math.round(performance.now() - start) };
  }
  const duration_ms = Math.round(performance.now() - start);

  if (!res.ok) {
    const text = await res.text();
    return { label, status: res.status, error: text.slice(0, 500), duration_ms };
  }

  const data = await res.json();
  const contentBlocks = (data.content ?? []).map((b) => ({
    type: b.type,
    text_len: b.text?.length ?? 0,
    thinking_len: b.thinking?.length ?? 0,
    preview: (b.text ?? b.thinking ?? "").slice(0, 120)
  }));

  const textBlock = data.content?.find((b) => b.type === "text")?.text;
  const thinkingBlock = data.content?.find((b) => b.type === "thinking")?.thinking;

  let parsed = null;
  let parseError = null;
  if (textBlock) {
    try {
      parsed = JSON.parse(textBlock);
    } catch {
      const m = textBlock.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch (e) {
          parseError = `json-regex-fail: ${e.message}`;
        }
      } else {
        parseError = "no-json-object-found";
      }
    }
  }

  let summary = null;
  if (parsed && typeof parsed === "object") {
    summary = {
      merchant_name: parsed.merchant_name ?? null,
      purchased_at: parsed.purchased_at ?? null,
      total_amount: parsed.total_amount ?? null,
      subtotal_amount: parsed.subtotal_amount ?? null,
      item_count: Array.isArray(parsed.items) ? parsed.items.length : 0,
      confidence: parsed.confidence ?? null,
      needs_review_reasons: parsed.needs_review_reasons ?? [],
      model_suggested_auto_post: parsed.model_suggested_auto_post ?? null,
      // Cheap "did the items look real?" check:
      items_with_amount: Array.isArray(parsed.items)
        ? parsed.items.filter((i) => i && typeof i.amount === "number").length
        : 0,
      items_with_category: Array.isArray(parsed.items)
        ? parsed.items.filter((i) => i && typeof i.category_zh === "string").length
        : 0,
      raw_text_len: textBlock?.length ?? 0
    };
  }

  return {
    label,
    status: res.status,
    duration_ms,
    stop_reason: data.stop_reason ?? null,
    content_blocks: contentBlocks,
    thinking_block_len: thinkingBlock?.length ?? 0,
    text_block_len: textBlock?.length ?? 0,
    parseError,
    summary
  };
}

// --- Main ---
const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node scripts/test-ocr-thinking.mjs <image-path>");
  process.exit(1);
}

console.log(`\n=== A/B test on: ${basename(imagePath)} ===\n`);
console.log(`model=${MODEL}  baseUrl=${BASE_URL}  max_tokens=${MAX_TOKENS}\n`);

const imageBytes = await readFile(imagePath);
const imageBase64 = imageBytes.toString("base64");
const mimeType = "image/jpeg"; // The originals/ folder only holds .jpg
console.log(`image: ${(imageBytes.length / 1024).toFixed(1)} KB  (base64: ${(imageBase64.length / 1024).toFixed(1)} KB)\n`);

console.log("--- thinking ON (budget=1024) ---");
const on = await callOcr({ imageBase64, mimeType, thinkingEnabled: true, label: "on" });
console.log(JSON.stringify(on, null, 2));

console.log("\n--- thinking OFF ---");
const off = await callOcr({ imageBase64, mimeType, thinkingEnabled: false, label: "off" });
console.log(JSON.stringify(off, null, 2));

// --- Side-by-side comparison ---
console.log("\n=== COMPARISON ===");
const rows = [
  ["http status", on.status, off.status],
  ["duration (ms)", on.duration_ms, off.duration_ms],
  ["stop_reason", on.stop_reason, off.stop_reason],
  ["thinking_block_len", on.thinking_block_len, off.thinking_block_len],
  ["text_block_len", on.text_block_len, off.text_block_len],
  ["parse error", on.parseError, off.parseError],
  ["merchant_name", on.summary?.merchant_name, off.summary?.merchant_name],
  ["purchased_at", on.summary?.purchased_at, off.summary?.purchased_at],
  ["total_amount", on.summary?.total_amount, off.summary?.total_amount],
  ["subtotal_amount", on.summary?.subtotal_amount, off.summary?.subtotal_amount],
  ["item_count", on.summary?.item_count, off.summary?.item_count],
  ["items_with_amount", on.summary?.items_with_amount, off.summary?.items_with_amount],
  ["items_with_category", on.summary?.items_with_category, off.summary?.items_with_category],
  ["confidence", on.summary?.confidence, off.summary?.confidence],
  ["model_suggested_auto_post", on.summary?.model_suggested_auto_post, off.summary?.model_suggested_auto_post],
  ["needs_review_reasons", JSON.stringify(on.summary?.needs_review_reasons), JSON.stringify(off.summary?.needs_review_reasons)]
];
const w = Math.max(...rows.map((r) => String(r[0]).length));
for (const [k, a, b] of rows) {
  const same = JSON.stringify(a) === JSON.stringify(b) ? " " : "*";
  console.log(`${same} ${k.padEnd(w)}  on=${JSON.stringify(a)}  off=${JSON.stringify(b)}`);
}
console.log("(* = differs)\n");
