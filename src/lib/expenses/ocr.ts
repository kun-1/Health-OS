import { extractedExpenseReceiptSchema } from "@/lib/expenses/validation";

const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M3";
const DEFAULT_MINIMAX_MAX_TOKENS = 12000;
const DEFAULT_MINIMAX_RETRY_MAX_TOKENS = 16000;
const DEFAULT_MINIMAX_THINKING_BUDGET_TOKENS = 1024;
const DEFAULT_FALLBACK_MODELS = [
  "moonshotai/kimi-k2.6:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-nano-12b-v2-vl:free"
];

function parseModelList(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    : [];
}

function getOcrModels(): string[] {
  return Array.from(
    new Set([
      process.env.OPENROUTER_OCR_MODEL ?? DEFAULT_MODEL,
      ...parseModelList(process.env.OPENROUTER_OCR_FALLBACK_MODELS),
      ...DEFAULT_FALLBACK_MODELS
    ])
  );
}

const prompt = `你是个人生活支出票据识别助手。请从图片中提取消费票据，只输出严格 JSON，不要输出 markdown，不要解释。

要求：
1. 所有分类、中文标准名、备注都使用中文。
2. 看不清或票据中不存在的字段填 null，不要猜。merchant_name 和 purchased_at 如果图片没有显示，直接填 null。
3. 商品分类只能使用：食物、外食、饮料/咖啡、日用品、清洁用品、个人护理、药品/医疗、补剂、交通、居住、娱乐、其他。
4. 默认币种为 CNY，除非票据明确显示其他币种。
5. spec_text 用于记录规格、重量、容量或包装，例如“250g”“596ml*12瓶”；quantity 只记录购买份数，例如右侧 X1/X2。spec_text 不要包含“约”“大约”“左右”等模糊词。票据写“约250g”时，spec_text 写“250g”即可，不要因为“约重”本身降低置信度或加入备注。
6. food_amount_value 和 food_amount_unit 用于记录可计算的食物/饮品总量。优先使用标准单位：重量统一成 g，容量统一成 ml；例如“250g”填 250/g，“0.5kg”填 500/g，“596ml”填 596/ml，“2L”填 2000/ml，“220ml*12盒”填 2640/ml，“330ml × 2听”填 660/ml。只有件数没有重量/容量时才用原单位，例如 12/瓶、3/个、4/块。如果只有购买份数没有规格，food_amount_value 可等于 quantity 数字且 unit 写“份”。无法可靠判断时两个字段都填 null。
7. unit_price 表示商品原单价/标价；discounted_unit_price 表示优惠后单价/折扣价/会员价/券后单价。票据没有单独显示优惠后单价时，discounted_unit_price 必须填 null，不要用 amount 反推。
8. amount 表示该商品行最终小计，计算优先级固定为：quantity × discounted_unit_price；如果 discounted_unit_price 为 null，则 quantity × unit_price。若票据直接显示折后行金额，以票据显示值为准。票据没有显示商品行金额、也无法通过数量和单价/优惠价计算时必须填 null，不要把重量、规格或数量写入 amount。
9. subtotal_amount 表示商品原价总额或商品折前总额，total_amount 表示实际支付。
10. 中国生鲜订单如有配送费、配送费减免、活动优惠、加工费，要分别写入 delivery_fee、delivery_discount、discount_amount、processing_fee。整单优惠写 discount_amount；单品折扣价写 discounted_unit_price，不要重复计入。
11. 商品明细尽量逐行提取；如果商品行无法可靠拆分，把无法确认原因写入 needs_review_reasons。票据缺少商品行金额时，只说明“商品行金额缺失”，不要编造金额。
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

function extractJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return JSON");
    return JSON.parse(match[0]);
  }
}

function preview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 800);
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function elapsedSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function miniMaxThinkingEnabled(): boolean {
  return !["0", "false", "disabled", "off"].includes((process.env.MINIMAX_OCR_THINKING ?? "enabled").toLowerCase());
}

function miniMaxThinkingConfig(maxTokens: number) {
  if (!miniMaxThinkingEnabled()) return { type: "disabled" };
  const configuredBudget = envNumber("MINIMAX_OCR_THINKING_BUDGET_TOKENS", DEFAULT_MINIMAX_THINKING_BUDGET_TOKENS);
  const budgetTokens = Math.max(1024, Math.min(configuredBudget, maxTokens - 1024));
  return { type: "enabled", budget_tokens: budgetTokens };
}

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("MiniMax OCR failed: 401") || message.includes("MiniMax OCR failed: 403");
}

function shouldRetryWithMoreTokens(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("returned no text content") ||
    message.includes("returned non-JSON content") ||
    message.includes("stop_reason=max_tokens")
  );
}

function parseReceiptContent({ content, provider, model }: { content: string; provider: string; model: string }) {
  let raw: unknown;
  try {
    raw = extractJsonObject(content);
  } catch (error) {
    throw new Error(
      `${provider} OCR returned non-JSON content from ${model}: ${preview(content)}${
        error instanceof Error ? ` (${error.message})` : ""
      }`
    );
  }

  const parsedResult = extractedExpenseReceiptSchema.safeParse(raw);
  if (!parsedResult.success) {
    throw new Error(
      `${provider} OCR JSON did not match receipt schema from ${model}: ${JSON.stringify(
        parsedResult.error.flatten()
      ).slice(0, 1200)}`
    );
  }

  return { raw, extracted: parsedResult.data, model };
}

async function extractReceiptWithMiniMaxOfficial({
  imageBase64,
  mimeType
}: {
  imageBase64: string;
  mimeType: string;
}) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not configured");
  }

  const model = process.env.MINIMAX_OCR_MODEL ?? DEFAULT_MINIMAX_MODEL;
  const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.com/anthropic";
  const timings: { provider: string; model: string; duration_ms: number; max_tokens: number; thinking: string }[] = [];
  const primaryMaxTokens = Math.max(2048, envNumber("MINIMAX_OCR_MAX_TOKENS", DEFAULT_MINIMAX_MAX_TOKENS));
  const retryMaxTokens = Math.max(primaryMaxTokens, envNumber("MINIMAX_OCR_RETRY_MAX_TOKENS", DEFAULT_MINIMAX_RETRY_MAX_TOKENS));
  const attempts = Array.from(new Set([primaryMaxTokens, retryMaxTokens].filter((value) => value >= primaryMaxTokens)));
  let lastError: unknown;

  for (const maxTokens of attempts) {
    const startedAt = performance.now();
    const thinking = miniMaxThinkingConfig(maxTokens);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        signal: timeoutSignal(envNumber("MINIMAX_OCR_TIMEOUT_MS", 180000)),
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          thinking,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mimeType,
                    data: imageBase64
                  }
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`MiniMax OCR failed: ${response.status} ${preview(text)}`);
      }

      const data = (await response.json()) as { content?: { type?: string; text?: string; thinking?: string }[]; stop_reason?: string };
      const content = data.content?.find((part) => part.type === "text")?.text ?? data.content?.[0]?.text;
      if (!content) {
        const blockTypes = data.content?.map((part) => part.type).join(", ") || "none";
        throw new Error(`MiniMax OCR returned no text content; block types=${blockTypes}; stop_reason=${data.stop_reason ?? "unknown"}`);
      }

      try {
        const parsed = parseReceiptContent({ content, provider: "MiniMax", model });
        timings.push({
          provider: "MiniMax",
          model,
          duration_ms: elapsedSince(startedAt),
          max_tokens: maxTokens,
          thinking: thinking.type
        });
        return { ...parsed, provider: "MiniMax", timings };
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}; stop_reason=${data.stop_reason ?? "unknown"}`);
      }
    } catch (error) {
      timings.push({
        provider: "MiniMax",
        model,
        duration_ms: elapsedSince(startedAt),
        max_tokens: maxTokens,
        thinking: thinking.type
      });
      lastError = error;
      if (isAuthError(error) || maxTokens === attempts[attempts.length - 1] || !shouldRetryWithMoreTokens(error)) break;
    }
  }

  throw new Error(`${lastError instanceof Error ? lastError.message : String(lastError)}; timings=${JSON.stringify(timings)}`);
}

async function extractReceiptWithModel({
  imageBase64,
  mimeType,
  model
}: {
  imageBase64: string;
  mimeType: string;
  model: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const startedAt = performance.now();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Health Monitor Expenses"
    },
    signal: timeoutSignal(envNumber("OPENROUTER_OCR_TIMEOUT_MS", 45000)),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: envNumber("OPENROUTER_OCR_MAX_TOKENS", 8192),
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 && model.endsWith(":free")) {
      throw new Error(
        `OpenRouter OCR failed: ${response.status}. 当前模型 ${model} 没有可用 endpoint，请检查 OPENROUTER_OCR_MODEL 是否为当前可用的 OpenRouter 模型 ID，然后重启服务。`
      );
    }
    throw new Error(`OpenRouter OCR failed: ${response.status} ${preview(text)}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter OCR returned empty content");

  const parsed = parseReceiptContent({ content, provider: "OpenRouter", model });
  return {
    ...parsed,
    provider: "OpenRouter",
    timings: [{ provider: "OpenRouter", model, duration_ms: elapsedSince(startedAt) }]
  };
}

export async function extractReceiptWithOpenRouter({
  imageBase64,
  mimeType
}: {
  imageBase64: string;
  mimeType: string;
}) {
  const failures: string[] = [];
  if (process.env.MINIMAX_API_KEY) {
    try {
      return await extractReceiptWithMiniMaxOfficial({ imageBase64, mimeType });
    } catch (error) {
      failures.push(`MiniMax official: ${error instanceof Error ? error.message : String(error)}`);
      if (isAuthError(error)) {
        throw new Error(`MiniMax official authentication failed. ${failures.join(" | ")}`);
      }
      if (process.env.MINIMAX_ALLOW_OPENROUTER_FALLBACK !== "true") {
        throw new Error(
          `MiniMax official OCR failed and OpenRouter fallback is disabled. Set MINIMAX_ALLOW_OPENROUTER_FALLBACK=true to try free fallback models. ${failures.join(" | ")}`
        );
      }
    }
  }

  for (const model of getOcrModels()) {
    try {
      return await extractReceiptWithModel({ imageBase64, mimeType, model });
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All OCR providers failed. ${failures.join(" | ")}`);
}
