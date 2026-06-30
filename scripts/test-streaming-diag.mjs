// Streaming diagnostic: what is the model emitting during the 180s hang?
// Compare:
//   A) thinking=disabled + full prompt (known-fast: ~24s)
//   B) thinking=object    + small prompt (known-fast: ~13s)
//   C) thinking=object    + full prompt (known-hang: 180s)
//
// With streaming we get to see each SSE chunk as it arrives, so we can tell
// whether the model is emitting thinking deltas, text deltas, or genuinely
// stuck. This is the diagnostic the previous non-streaming test couldn't do.

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
  console.error("Usage: node scripts/test-streaming-diag.mjs <image>");
  process.exit(1);
}
const bytes = await readFile(imagePath);
const base64 = bytes.toString("base64");

const SMALL_PROMPT = "只看这张图，回答：这是哪家店的发票？只输出商家名，10字以内。";

// Use a representative slice of the app's real prompt — same 16 rules + same
// JSON schema description, abbreviated. We don't need the full 3KB to expose
// the hang; even a moderately long prompt triggers it.
const FULL_PROMPT = `你是个人生活支出票据识别助手。从图片提取消费票据，只输出严格 JSON。

要求：
1. 所有分类、中文标准名、备注都使用中文。
2. 看不清或票据中不存在的字段填 null，不要猜。
3. 商品分类只能使用：食物、外食、饮料/咖啡、日用品、清洁用品、个人护理、药品/医疗、补剂、交通、居住、娱乐、其他。
4. 默认币种为 CNY。
5. spec_text 记录规格/重量/容量/包装。quantity 记录购买份数。
6. food_amount_value 和 food_amount_unit 记录可计算的食物/饮品总量。重量统一 g，容量统一 ml。
7. unit_price 是商品原单价/标价；discounted_unit_price 是优惠后单价。票据没有单独显示优惠后单价时，discounted_unit_price 必须填 null。
8. amount 是该商品行最终小计。计算优先级：quantity × discounted_unit_price；若 null 则 quantity × unit_price。
9. subtotal_amount 是商品原价总额，total_amount 是实际支付。
10. 中国生鲜订单的配送费/减免/活动优惠/加工费分别写入 delivery_fee, delivery_discount, discount_amount, processing_fee。
11. 商品明细尽量逐行提取；无法可靠拆分的原因写入 needs_review_reasons。
12. confidence 是 0-1 的数字，只表示图片文字识别和字段拆分的可靠性。
13. recognition_note 只写识别不确定性。
14. user_note 必须为 null。
15. model_suggested_auto_post 仅在所有信息都清晰时为 true。
16. 优先输出最终 JSON，推理保持简短。

JSON 格式：{
  "merchant_name": "string|null", "purchased_at": "ISO 8601|null", "currency": "CNY",
  "subtotal_amount": 0, "total_amount": 0, "tax_amount": 0, "processing_fee": 0,
  "delivery_fee": 0, "delivery_discount": 0, "discount_amount": 0,
  "confidence": 0.0, "model_suggested_auto_post": false, "needs_review_reasons": [],
  "recognition_note": null, "user_note": null,
  "items": [{"name_raw":"","name_zh":"","category_zh":"","quantity":"1","spec_text":null,
    "food_amount_value":null,"food_amount_unit":null,"unit_price":0,
    "discounted_unit_price":null,"amount":null,"confidence":0.0,"notes":null}]
}`;

async function streamCall({ label, prompt, thinking, maxTokens = 12000, timeoutMs = 180000 }) {
  console.log(`\n=== ${label} ===`);
  console.log(`thinking=${JSON.stringify(thinking)}  prompt_len=${prompt.length}  max_tokens=${maxTokens}`);

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
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: "MiniMax-M3",
        max_tokens: maxTokens,
        thinking,
        stream: true,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } }
            ]
          }
        ]
      })
    });
  } catch (e) {
    console.log(`  ✗ network error at ${Math.round(performance.now() - t0)}ms: ${e.message}`);
    return { label, error: e.message, duration_ms: Math.round(performance.now() - t0) };
  }

  if (!res.ok) {
    const text = await res.text();
    console.log(`  ✗ http ${res.status} at ${Math.round(performance.now() - t0)}ms`);
    console.log(`    body: ${text.slice(0, 200)}`);
    return { label, status: res.status, error: text.slice(0, 200), duration_ms: Math.round(performance.now() - t0) };
  }

  console.log(`  ✓ http 200, headers received at ${Math.round(performance.now() - t0)}ms`);
  console.log(`  --- streaming chunks ---`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;
  let thinkingChars = 0;
  let textChars = 0;
  let lastEventAt = performance.now();
  let firstEventAt = null;
  let lastEventType = null;
  let lastEventSummary = null;
  let eventLog = []; // [{t_ms, type, preview}]

  // SSE format: lines of `event: ...\ndata: {...}\n\n`
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const now = performance.now();
    buffer += decoder.decode(value, { stream: true });

    // Split on SSE event boundary
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split("\n");
      let eventType = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLine += line.slice(6);
      }
      if (!dataLine || dataLine === "[DONE]") continue;

      let evt;
      try {
        evt = JSON.parse(dataLine);
      } catch {
        continue;
      }
      chunkCount++;
      const t_ms = Math.round(now - t0);
      if (firstEventAt === null) firstEventAt = now;

      // Extract delta info
      let deltaInfo = "";
      if (evt.type === "content_block_start") {
        const cbType = evt.content_block?.type;
        deltaInfo = `block_start: ${cbType}`;
        lastEventType = `block_start:${cbType}`;
      } else if (evt.type === "content_block_delta") {
        const dt = evt.delta?.type;
        if (dt === "thinking_delta") {
          const t = evt.delta?.thinking ?? "";
          thinkingChars += t.length;
          deltaInfo = `thinking_delta (+${t.length} chars, total ${thinkingChars})`;
          lastEventType = "thinking_delta";
          if (t) lastEventSummary = t.slice(-60);
        } else if (dt === "text_delta") {
          const t = evt.delta?.text ?? "";
          textChars += t.length;
          deltaInfo = `text_delta "${t}" (total ${textChars})`;
          lastEventType = "text_delta";
          lastEventSummary = t;
        } else if (dt === "signature_delta") {
          deltaInfo = `signature_delta`;
        } else {
          deltaInfo = `delta type=${dt}`;
        }
      } else if (evt.type === "content_block_stop") {
        deltaInfo = `block_stop`;
        lastEventType = "block_stop";
      } else if (evt.type === "message_start") {
        deltaInfo = `message_start`;
        lastEventType = "message_start";
      } else if (evt.type === "message_delta") {
        deltaInfo = `message_delta stop_reason=${evt.delta?.stop_reason}`;
        lastEventType = "message_delta";
      } else if (evt.type === "message_stop") {
        deltaInfo = `message_stop`;
        lastEventType = "message_stop";
      } else if (evt.type === "ping") {
        continue; // Skip pings to reduce noise
      } else if (evt.type === "error") {
        deltaInfo = `ERROR ${JSON.stringify(evt.error)}`;
        lastEventType = "error";
      }

      const tStr = t_ms.toString().padStart(6);
      console.log(`  [${tStr}ms] chunk #${chunkCount}: ${deltaInfo}`);
      eventLog.push({ t_ms, type: lastEventType, summary: lastEventSummary });
      lastEventAt = now;
    }
  }

  const totalMs = Math.round(performance.now() - t0);
  console.log(`  --- end of stream ---`);
  console.log(`  total: ${totalMs}ms  chunks=${chunkCount}  thinking_chars=${thinkingChars}  text_chars=${textChars}`);

  return {
    label,
    duration_ms: totalMs,
    chunks: chunkCount,
    thinking_chars: thinkingChars,
    text_chars: textChars,
    first_event_ms: firstEventAt ? Math.round(firstEventAt - t0) : null,
    last_event_type: lastEventType
  };
}

// Run all three
const a = await streamCall({ label: "A) thinking=DISABLED, full prompt",  prompt: FULL_PROMPT,  thinking: { type: "disabled" } });
const b = await streamCall({ label: "B) thinking=OBJECT,    small prompt", prompt: SMALL_PROMPT, thinking: { type: "enabled", budget_tokens: 1024 } });
const c = await streamCall({ label: "C) thinking=OBJECT,    full prompt",  prompt: FULL_PROMPT,  thinking: { type: "enabled", budget_tokens: 1024 }, timeoutMs: 200000 });

console.log("\n=== SUMMARY ===");
for (const r of [a, b, c]) {
  console.log(
    `${r.label.padEnd(48)}  ${(r.duration_ms + "ms").padStart(8)}  chunks=${r.chunks}  think=${r.thinking_chars}c  text=${r.text_chars}c  first_evt=${r.first_event_ms}ms  last=${r.last_event_type}`
  );
}
