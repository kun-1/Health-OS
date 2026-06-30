// Verify: does MiniMax's Anthropic-compatible endpoint accept `thinking: true`
// (boolean — what its docs say) faster than `thinking: {type, budget_tokens}`
// (object — what the app currently sends)?
//
// Usage: node scripts/test-thinking-shape.mjs <image-path>

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
if (!API_KEY) {
  console.error("MINIMAX_API_KEY not found");
  process.exit(1);
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node scripts/test-thinking-shape.mjs <image>");
  process.exit(1);
}
const bytes = await readFile(imagePath);
const base64 = bytes.toString("base64");
console.log(`image: ${(bytes.length / 1024).toFixed(1)} KB\n`);

const SMALL_PROMPT = "只看这张图，回答：这是哪家店的发票？只输出商家名，10字以内。";

async function call(thinking, label) {
  const t0 = performance.now();
  try {
    const res = await fetch("https://api.minimaxi.com/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        model: "MiniMax-M3",
        max_tokens: 12000,
        thinking,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SMALL_PROMPT },
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: base64 }
              }
            ]
          }
        ]
      })
    });
    const dt = Math.round(performance.now() - t0);
    if (!res.ok) {
      const text = await res.text();
      return { label, thinking, status: res.status, duration_ms: dt, error: text.slice(0, 300) };
    }
    const data = await res.json();
    const text = data.content?.find((b) => b.type === "text")?.text;
    const think = data.content?.find((b) => b.type === "thinking")?.thinking;
    return {
      label,
      thinking,
      status: res.status,
      duration_ms: dt,
      stop_reason: data.stop_reason,
      block_types: data.content?.map((b) => b.type),
      text_len: text?.length ?? 0,
      thinking_len: think?.length ?? 0,
      text_preview: text?.slice(0, 200)
    };
  } catch (e) {
    return { label, thinking, duration_ms: Math.round(performance.now() - t0), error: e.message };
  }
}

// 1) object form (what the app currently sends)
const obj = await call({ type: "enabled", budget_tokens: 1024 }, "OBJECT-en-budget-1024");
console.log("--- OBJECT {type:enabled, budget_tokens:1024} (current code) ---");
console.log(JSON.stringify(obj, null, 2));

// 2) boolean true (what MiniMax docs say)
const bool = await call(true, "BOOLEAN-true");
console.log("\n--- BOOLEAN true (per MiniMax docs) ---");
console.log(JSON.stringify(bool, null, 2));

// 3) object form but disabled
const off = await call({ type: "disabled" }, "OBJECT-disabled");
console.log("\n--- OBJECT {type:disabled} ---");
console.log(JSON.stringify(off, null, 2));

console.log("\n=== SUMMARY ===");
console.log(`OBJECT-EN:    ${obj.duration_ms}ms  status=${obj.status}  stop_reason=${obj.stop_reason ?? "(none)"}`);
console.log(`BOOLEAN-true: ${bool.duration_ms}ms  status=${bool.status}  stop_reason=${bool.stop_reason ?? "(none)"}`);
console.log(`OBJECT-DIS:   ${off.duration_ms}ms  status=${off.status}  stop_reason=${off.stop_reason ?? "(none)"}`);
