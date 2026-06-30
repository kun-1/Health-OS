// Smoke test for the new ocr.ts request structure. Replicates exactly what
// extractReceiptWithMiniMaxOfficial now does (streaming + system prompt +
// image-first content array + thinking=budget 6144 + max_tokens 8192), so
// we can verify MiniMax accepts the new shape and the response parses.
//
// Usage: node scripts/test-new-ocr.mjs <image-path>

import { readFile } from "node:fs/promises";

const envText = await readFile(".env.local", "utf-8");
for (const raw of envText.split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const key = line.slice(0, eq).trim();
  const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

const API_KEY = process.env.MINIMAX_API_KEY;
const imagePath = process.argv[2];
if (!API_KEY || !imagePath) {
  console.error("Usage: node scripts/test-new-ocr.mjs <image>");
  process.exit(1);
}

const bytes = await readFile(imagePath);
const base64 = bytes.toString("base64");
console.log(`image: ${(bytes.length / 1024).toFixed(1)} KB\n`);

// Must mirror ocr.ts constants
const SYSTEM_PROMPT = `你是个人生活支出票据识别助手。提取消费票据到结构化 JSON。

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

置信度校准规则（务必严格遵守）：
A. confidence 是 OCR 对票据视觉识别的把握，仅反映"图片文字读得是否清楚、字段拆分是否合理"，不要把票据本身的缺失（如无商家、无时间、无商品行金额）算进扣分项。
B. 当图片整体清晰、商家清晰可读、时间/合计/币种/商品明细都能定位时，confidence 应不低于 0.90。
C. 当图片轻微模糊但所有必要字段（商家、时间、合计、商品明细、商品行金额）都能定位、金额无矛盾时，confidence 应在 0.85–0.90。
D. 仅当图片存在显著反光、严重模糊、关键文字被遮挡、或多个商品行无法拆分时，confidence 才应低于 0.85，并把这些视觉问题写入 needs_review_reasons。
E. 不要因为票据缺少某些可选字段（配送费、税费、加工费、会员折扣等）而降低 confidence。
F. 商品行 confidence：单行清晰可读且金额能计算时 ≥ 0.90；轻微模糊但在 0.85–0.90；该行几乎看不清或金额缺失时 ≤ 0.70。

多图合并与折叠商品规则：
G. 当附图为同一笔订单的多张截图时（图片顺序就是浏览顺序），按上传顺序合并处理：第一张先看，第二张接着看。先逐图提取可见商品行，然后跨图合并——商品名相同或相近（如"鸡蛋 500g"在两张图都出现）且单价/金额一致的行应合并为一行（quantity 累加），不要重复计入。
H. 折叠/收起提示：如果某图显示"...还有 N 件"、"查看更多"、"等 N 件"、"已省略 N 件"、"更多 N 件"等文字，说明该订单存在未完整提取的商品行。请优先从其他图片的对应位置或该提示中推断这部分商品（如提示中包含 N 这个数字，必须精确读取）；如果确实无法判断，把这段合并为一行 placeholder：name_zh 写"折叠商品（未展开 N 件）"，amount 写该折叠段金额（仅当金额在图中明确可见时填写，否则填 null），并在 needs_review_reasons 中说明。
I. 总金额是判断提取完整性的最终依据：商品行金额合计 + 税 + 加工费 + 配送费 - 配送费减免 - 折扣 应等于 total_amount。如果不一致，先逐行核对金额读数；如仍有差额，最可能的原因是漏读折叠商品或漏读某行；不要因为差额修改总金额或调高 confidence。
J. 不要从总金额和已知商品行反推未识别行的金额，宁可写一行"折叠商品（未展开 N 件）"也不要编造金额。
K. 当商品行数明显少于常见该商家的同类订单（生鲜超市订单通常 5–20 行），优先怀疑存在折叠/收起未展开，再次检查图片顶部和底部的"还有 N 件"类提示。`;

const USER_PROMPT = `从附图提取消费票据，输出以下 JSON 格式：

{
  "merchant_name": "商家名称或 null",
  "purchased_at": "ISO 8601 带时区时间或 null",
  "currency": "CNY",
  "subtotal_amount": 0, "total_amount": 0, "tax_amount": 0, "processing_fee": 0,
  "delivery_fee": 0, "delivery_discount": 0, "discount_amount": 0,
  "confidence": 0.0, "model_suggested_auto_post": false, "needs_review_reasons": [],
  "recognition_note": null, "user_note": null,
  "items": [{"name_raw":"","name_zh":"","category_zh":"","quantity":"1",
    "spec_text":null,"food_amount_value":null,"food_amount_unit":null,
    "unit_price":0,"discounted_unit_price":null,"amount":null,
    "confidence":0.0,"notes":null}]
}`;

const MAX_TOKENS = 24576;
const THINKING_BUDGET = 6144;
const REQUEST_TIMEOUT_MS = 300_000;
const CHUNK_TIMEOUT_MS = 30_000;

const t0 = performance.now();
let res;
try {
  res = await fetch("https://api.minimaxi.com/anthropic/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: "MiniMax-M3",
      max_tokens: MAX_TOKENS,
      thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: USER_PROMPT }
          ]
        }
      ],
      stream: true
    })
  });
} catch (e) {
  console.error(`✗ request error at ${Math.round(performance.now() - t0)}ms: ${e.message}`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`✗ http ${res.status} at ${Math.round(performance.now() - t0)}ms`);
  console.error(`  body: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

const headersMs = Math.round(performance.now() - t0);
console.log(`✓ http 200, headers at ${headersMs}ms — streaming events:`);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let textContent = "";
let thinkingChars = 0;
let chunks = 0;
let textChunks = 0;
let thinkingChunks = 0;
let stopReason = null;
let lastChunkMs = headersMs;
let textStartMs = null;

const readWithTimeout = () =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reader.cancel().catch(() => undefined);
      reject(new Error(`no SSE event for ${CHUNK_TIMEOUT_MS}ms`));
    }, CHUNK_TIMEOUT_MS);
    reader.read().then(
      (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } },
      (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } }
    );
  });

function parseSse(s) {
  let type = null, data = "";
  for (const l of s.split("\n")) {
    if (l.startsWith("event: ")) type = l.slice(7).trim();
    else if (l.startsWith("data: ")) data += l.slice(6);
  }
  if (!data) return null;
  try { const o = JSON.parse(data); if (type) o.type = type; return o; }
  catch { return null; }
}

try {
  while (true) {
    const { value, done } = await readWithTimeout();
    if (done) break;
    lastChunkMs = Math.round(performance.now() - t0);
    buffer += decoder.decode(value, { stream: true });
    chunks++;

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const evtStr = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evt = parseSse(evtStr);
      if (!evt) continue;

      if (evt.type === "content_block_delta") {
        const d = evt.delta;
        if (d?.type === "text_delta" && d.text) {
          if (textStartMs === null) textStartMs = Math.round(performance.now() - t0);
          textContent += d.text;
          textChunks++;
        } else if (d?.type === "thinking_delta" && d.thinking) {
          thinkingChars += d.thinking.length;
          thinkingChunks++;
        }
      } else if (evt.type === "message_delta") {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
      }
    }
  }
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}

const totalMs = Math.round(performance.now() - t0);

console.log(`\n--- summary ---`);
console.log(`total:              ${totalMs}ms`);
console.log(`headers:            ${headersMs}ms`);
console.log(`text start:         ${textStartMs ?? "(never)"}ms  (${textStartMs ? Math.round(textStartMs - headersMs) : "?"}ms after headers)`);
console.log(`text duration:      ${textStartMs ? Math.round(totalMs - textStartMs) : "?"}ms`);
console.log(`chunks:             ${chunks} (text=${textChunks}, thinking=${thinkingChunks})`);
console.log(`thinking chars:     ${thinkingChars}`);
console.log(`text chars:         ${textContent.length}`);
console.log(`stop_reason:        ${stopReason}`);

// Try to parse the JSON
let parsed = null, parseErr = null;
try {
  parsed = JSON.parse(textContent);
} catch {
  const m = textContent.match(/\{[\s\S]*\}/);
  if (m) {
    try { parsed = JSON.parse(m[0]); } catch (e) { parseErr = e.message; }
  } else {
    parseErr = "no JSON object found";
  }
}

if (parsed) {
  console.log(`\n--- parsed result ---`);
  console.log(`merchant_name:    ${parsed.merchant_name ?? "(null)"}`);
  console.log(`purchased_at:     ${parsed.purchased_at ?? "(null)"}`);
  console.log(`total_amount:     ${parsed.total_amount ?? "(null)"}`);
  console.log(`items:            ${Array.isArray(parsed.items) ? parsed.items.length : "(not array)"}`);
  console.log(`confidence:       ${parsed.confidence ?? "(null)"}`);
  console.log(`needs_review:     ${JSON.stringify(parsed.needs_review_reasons ?? [])}`);
} else {
  console.log(`\n--- parse error: ${parseErr} ---`);
  console.log(`text preview: ${textContent.slice(0, 300)}`);
}
