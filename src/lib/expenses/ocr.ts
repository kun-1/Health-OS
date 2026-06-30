import { extractedExpenseReceiptSchema } from "@/lib/expenses/validation";
import type { ExtractedExpenseReceipt } from "@/lib/expenses/types";

// Debug-logging types. Surfaced to receipt-jobs.ts on failure so a single
// [expenses:receipt-job] line tells you where the OCR stream was when it
// gave up — no need to grep backwards through hundreds of [expenses:ocr:*]
// lines to find the right one.
type EventTypeHistogram = Record<string, number>;
export type StreamStats = {
  traceId: string;
  eventCount: number;
  eventTypeHistogram: EventTypeHistogram;
  textChars: number;
  thinkingChars: number;
  lastEventType: string | null;
  // Wall ms between the most recent event and stream end (or current time
  // if the stream is still alive when something else fails). null if no
  // events were ever received.
  lastEventAgeMs: number | null;
  // Largest wall-ms gap between two consecutive events. Exposes "model
  // went silent for 200s" — the smoking gun for hangs vs slow-but-moving.
  maxGapMs: number;
  totalMs: number;
  stopReason: string | null;
  aborted: boolean;
};
type RequestMeta = {
  model: string;
  maxTokens: number;
  thinkingType: string;
  imageCount: number;
  imageBytesTotal: number;
  requestTimeoutMs: number;
  chunkTimeoutMs: number;
};
// Wave N+1: structured OCR debug log. Always on (overhead is negligible —
// just a few counters per SSE event). Body content is never logged; set
// MINIMAX_OCR_DEBUG_BODY=1 to dump the raw response text (off by default
// since a single response can be 24k tokens).
export class OcrError extends Error {
  constructor(
    message: string,
    public readonly traceId: string,
    public readonly stage: string,
    public readonly streamStats?: StreamStats,
    public readonly requestMeta?: RequestMeta,
    public readonly responseMeta?: { status: number; ttfbMs: number }
  ) {
    super(message);
    this.name = "OcrError";
  }
}
function newTraceId(prefix: string): string {
  // 8 hex chars is enough for human-eye disambiguation across a single
  // session — collision odds are ~1 in 4 billion. No need for UUIDs.
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}
function logOcr(stage: string, fields: Record<string, unknown>): void {
  // Sorted-keys serialization keeps two log lines about the same request
  // visually diffable in a terminal (timestamps vary, but key order
  // doesn't), which makes copy-paste into an issue easier.
  const keys = Object.keys(fields).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = fields[k];
  console.info(`[expenses:ocr:${stage}]`, ordered);
}

const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M3";
// Total output cap (thinking + text). 24576 leaves headroom for ~6-8k of
// thinking and ~16k of JSON text — a 2-image, 24-item Chinese receipt
// with rules G-K can pull ~8-10k of JSON text. 12288 worked for single-
// image receipts; 16384 started hitting stop_reason=max_tokens on 2-image
// Chinese orders once the Wave 4 prompt additions (G-K) + the new
// reconciliation context pushed the model's thinking output higher.
// Don't drop below 16384 without testing: Wave 3.5 first tried 8192
// and a 7-item Chinese receipt hit stop_reason=max_tokens; Wave 4.1
// retried at 16384 and a 2-image Chinese order still hit it.
const DEFAULT_MINIMAX_MAX_TOKENS = 24576;
// Soft cap on thinking tokens. MiniMax doesn't strictly respect it, but a
// generous value (vs the old 1024) lets the model think through the 16-rule
// OCR prompt without forcing a thinking→text→thinking ping-pong.
const DEFAULT_MINIMAX_THINKING_BUDGET_TOKENS = 6144;
// Overall request timeout. With thinking on, the model can take 100s+ to
// think before producing text. 5min gives safe headroom (was 180s).
const DEFAULT_MINIMAX_REQUEST_TIMEOUT_MS = 300_000;
// Per-chunk timeout for the SSE stream. If no event arrives for 30s, abort.
// This is the real protection against hangs (vs the old single 180s wall
// that would silently wait through a stuck request).
const DEFAULT_MINIMAX_CHUNK_TIMEOUT_MS = 30_000;
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

// Split the prompt into system (rules) + user (task + JSON shape) so:
//   1. The model treats the 21 rules as ROLE instructions, not user content
//   2. The user content stays small and focused on the actual task
//   3. The thinking budget has fewer user-side tokens to “reason about”
const SYSTEM_PROMPT = `你是个人生活支出票据识别助手。提取消费票据到结构化 JSON。

要求：
1. 所有分类、中文标准名、备注都使用中文。
2. 看不清或票据中不存在的字段填 null，不要猜。merchant_name 和 purchased_at 如果图片没有显示，直接填 null。
3. 商品分类只能使用：食物、外食、饮料/咖啡、日用品、清洁用品、个人护理、药品/医疗、补剂、交通、居住、娱乐、其他。
4. 默认币种为 CNY，除非票据明确显示其他币种。
5. spec_text 用于记录规格、重量、容量或包装，例如”250g””596ml*12瓶”；quantity 只记录购买份数，例如右侧 X1/X2。spec_text 不要包含”约””大约””左右”等模糊词。票据写”约250g”时，spec_text 写”250g”即可，不要因为”约重”本身降低置信度或加入备注。
6. food_amount_value 和 food_amount_unit 用于记录可计算的食物/饮品总量。优先使用标准单位：重量统一成 g，容量统一成 ml；例如”250g”填 250/g，”0.5kg”填 500/g，”596ml”填 596/ml，”2L”填 2000/ml，”220ml*12盒”填 2640/ml，”330ml × 2听”填 660/ml。只有件数没有重量/容量时才用原单位，例如 12/瓶、3/个、4/块。如果只有购买份数没有规格，food_amount_value 可等于 quantity 数字且 unit 写”份”。无法可靠判断时两个字段都填 null。
7. unit_price 表示商品原单价/标价；discounted_unit_price 表示优惠后单价/折扣价/会员价/券后单价。票据没有单独显示优惠后单价时，discounted_unit_price 必须填 null，不要用 amount 反推。
8. amount 表示该商品行最终小计，计算优先级固定为：quantity × discounted_unit_price；如果 discounted_unit_price 为 null，则 quantity × unit_price。若票据直接显示折后行金额，以票据显示值为准。票据没有显示商品行金额、也无法通过数量和单价/优惠价计算时必须填 null，不要把重量、规格或数量写入 amount。
9. subtotal_amount 表示商品原价总额或商品折前总额，total_amount 表示实际支付。
10. 中国生鲜订单如有配送费、配送费减免、活动优惠、加工费，要分别写入 delivery_fee、delivery_discount、discount_amount、processing_fee。整单优惠写 discount_amount；单品折扣价写 discounted_unit_price，不要重复计入。
11. 商品明细尽量逐行提取；如果商品行无法可靠拆分，把无法确认原因写入 needs_review_reasons。票据缺少商品行金额时，只说明”商品行金额缺失”，不要编造金额。
12. confidence 使用 0 到 1 的数字，只表示图片文字识别和字段拆分的可靠性；不要因为票据本身缺少商家、时间或商品行金额而降低 confidence，这些缺失只写入 needs_review_reasons。
13. recognition_note 只写识别不确定性，不要写消费建议。
14. user_note 必须为 null。
15. model_suggested_auto_post 只有在商家、时间、总金额、商品明细、费用关系都清晰时才为 true。
16. 优先输出最终 JSON，推理保持简短，不要输出除 JSON 以外的内容。

置信度校准规则（务必严格遵守）：
A. confidence 是 OCR 对票据视觉识别的把握，仅反映”图片文字读得是否清楚、字段拆分是否合理”，不要把票据本身的缺失（如无商家、无时间、无商品行金额）算进扣分项。
B. 当图片整体清晰、商家清晰可读、时间/合计/币种/商品明细都能定位时，confidence 应不低于 0.90。
C. 当图片轻微模糊但所有必要字段（商家、时间、合计、商品明细、商品行金额）都能定位、金额无矛盾时，confidence 应在 0.85–0.90。
D. 仅当图片存在显著反光、严重模糊、关键文字被遮挡、或多个商品行无法拆分时，confidence 才应低于 0.85，并把这些视觉问题写入 needs_review_reasons。
E. 不要因为票据缺少某些可选字段（配送费、税费、加工费、会员折扣等）而降低 confidence。
F. 商品行 confidence：单行清晰可读且金额能计算时 ≥ 0.90；轻微模糊但在 0.85–0.90；该行几乎看不清或金额缺失时 ≤ 0.70。

多图合并与折叠商品规则：
G. 当附图为同一笔订单的多张截图时（图片顺序就是浏览顺序），按上传顺序合并处理：第一张先看，第二张接着看。先逐图提取可见商品行，然后跨图合并——商品名相同或相近（如”鸡蛋 500g”在两张图都出现）且单价/金额一致的行应合并为一行（quantity 累加），不要重复计入。
H. 折叠/收起提示：如果某图显示”...还有 N 件”、”查看更多”、”等 N 件”、”已省略 N 件”、”更多 N 件”等文字，说明该订单存在未完整提取的商品行。请优先从其他图片的对应位置或该提示中推断这部分商品（如提示中包含 N 这个数字，必须精确读取）；如果确实无法判断，把这段合并为一行 placeholder：name_zh 写”折叠商品（未展开 N 件）”，amount 写该折叠段金额（仅当金额在图中明确可见时填写，否则填 null），并在 needs_review_reasons 中说明。
I. 总金额是判断提取完整性的最终依据：商品行金额合计 + 税 + 加工费 + 配送费 - 配送费减免 - 折扣 应等于 total_amount。如果不一致，先逐行核对金额读数；如仍有差额，最可能的原因是漏读折叠商品或漏读某行；不要因为差额修改总金额或调高 confidence。
J. 不要从总金额和已知商品行反推未识别行的金额，宁可写一行”折叠商品（未展开 N 件）”也不要编造金额。
K. 当商品行数明显少于常见该商家的同类订单（生鲜超市订单通常 5–20 行），优先怀疑存在折叠/收起未展开，再次检查图片顶部和底部的”还有 N 件”类提示。`;

const USER_PROMPT = `从附图提取消费票据，输出以下 JSON 格式：

{
  “merchant_name”: “商家名称或 null”,
  “purchased_at”: “ISO 8601 带时区时间或 null”,
  “currency”: “CNY”,
  “subtotal_amount”: 0,
  “total_amount”: 0,
  “tax_amount”: 0,
  “processing_fee”: 0,
  “delivery_fee”: 0,
  “delivery_discount”: 0,
  “discount_amount”: 0,
  “confidence”: 0.0,
  “model_suggested_auto_post”: false,
  “needs_review_reasons”: [],
  “recognition_note”: null,
  “user_note”: null,
  “items”: [
    {
      “name_raw”: “票据原始名称”,
      “name_zh”: “中文标准名”,
      “category_zh”: “食物”,
      “quantity”: “1”,
      “spec_text”: “250g”,
      “food_amount_value”: 250,
      “food_amount_unit”: “g”,
      “unit_price”: 0,
      “discounted_unit_price”: null,
      “amount”: null,
      “confidence”: 0.0,
      “notes”: null
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

// Parse one SSE event (text between two \n\n boundaries) into a typed object.
// The MiniMax Anthropic-compatible endpoint sends:
//   event: <type>
//   data: <json>
//
// We use the JSON's `type` field as the source of truth, falling back to the
// `event:` line if the JSON doesn't include one.
function parseSseEvent(eventStr: string): Record<string, unknown> | null {
  let eventType: string | null = null;
  let dataStr = "";
  for (const line of eventStr.split("\n")) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataStr += line.slice(6);
    }
  }
  if (!dataStr) return null;
  try {
    const obj = JSON.parse(dataStr) as Record<string, unknown>;
    if (eventType) obj.type = eventType;
    return obj;
  } catch {
    return null;
  }
}

// Read the streaming response and aggregate the text content. Aborts if no
// chunk arrives within chunkTimeoutMs (i.e. the model is stuck). This is
// the real protection against hangs — the old 180s single-wall timeout
// couldn't tell "still thinking" from "dead".
//
// Emits [expenses:ocr:stream:progress] every PROGRESS_MS or every
// PROGRESS_EVENTS (whichever first). On exit — success, error, or
// timeout — emits [expenses:ocr:stream:done] (or :timeout) with the full
// stats snapshot. The stats are also returned to the caller so they can
// be surfaced on the failure path (see OcrError).
async function readMiniMaxSseStream(
  response: Response,
  chunkTimeoutMs: number,
  traceId: string
): Promise<{
  textContent: string;
  stopReason: string | null;
  errorPayload: unknown;
  streamStats: StreamStats;
}> {
  if (!response.body) {
    throw new Error("MiniMax OCR: response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textContent = "";
  let stopReason: string | null = null;
  let errorPayload: unknown = null;

  // Debug-log accumulators. Kept local to the stream so a slow request
  // can't bleed into the next one.
  const streamStartedAt = performance.now();
  let eventCount = 0;
  const eventTypeHistogram: EventTypeHistogram = {};
  let textChars = 0;
  let thinkingChars = 0;
  let lastEventType: string | null = null;
  let lastEventAt: number | null = null;
  let maxGapMs = 0;
  let lastProgressAt = streamStartedAt;
  let eventsSinceLastProgress = 0;
  let aborted = false;

  const PROGRESS_MS = 10_000;
  const PROGRESS_EVENTS = 20;

  function snapshotStats(finalTotalMs?: number): StreamStats {
    const now = performance.now();
    const totalMs = finalTotalMs ?? Math.round(now - streamStartedAt);
    const lastEventAgeMs =
      lastEventAt === null ? null : Math.round(now - lastEventAt);
    return {
      traceId,
      eventCount,
      eventTypeHistogram: { ...eventTypeHistogram },
      textChars,
      thinkingChars,
      lastEventType,
      lastEventAgeMs,
      maxGapMs: Math.round(maxGapMs),
      totalMs,
      stopReason,
      aborted
    };
  }
  function maybeEmitProgress(reason: string): void {
    const now = performance.now();
    const sinceLastProgress = now - lastProgressAt;
    if (
      eventCount > 0 &&
      (eventsSinceLastProgress >= PROGRESS_EVENTS || sinceLastProgress >= PROGRESS_MS)
    ) {
      // snapshotStats() already carries traceId, so don't double-emit it.
      logOcr("stream:progress", { reason, ...snapshotStats() });
      lastProgressAt = now;
      eventsSinceLastProgress = 0;
    }
  }
  function emitDone(stage: string): void {
    logOcr(stage, snapshotStats());
  }

  const readWithTimeout = (): Promise<ReadableStreamReadResult<Uint8Array>> =>
    new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reader.cancel().catch(() => undefined);
        reject(new Error(`MiniMax OCR chunk timeout: no SSE event for ${chunkTimeoutMs}ms`));
      }, chunkTimeoutMs);
      reader
        .read()
        .then((result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    });

  try {
    while (true) {
      const { value, done } = await readWithTimeout();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const eventStr = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const evt = parseSseEvent(eventStr);
        if (!evt) continue;

        const eventType = typeof evt.type === "string" ? evt.type : "unknown";
        const now = performance.now();
        eventCount++;
        eventTypeHistogram[eventType] = (eventTypeHistogram[eventType] ?? 0) + 1;
        if (lastEventAt !== null) {
          const gap = now - lastEventAt;
          if (gap > maxGapMs) maxGapMs = gap;
        }
        lastEventAt = now;
        lastEventType = eventType;
        eventsSinceLastProgress++;

        if (evt.type === "content_block_delta") {
          const delta = evt.delta as { type?: string; text?: string } | undefined;
          if (delta?.type === "text_delta" && delta.text) {
            textContent += delta.text;
            textChars += delta.text.length;
          } else if (delta?.type === "thinking_delta" && delta.text) {
            thinkingChars += delta.text.length;
          }
          // signature_delta: we don't surface these to callers, just let
          // the model spend its thinking budget.
        } else if (evt.type === "message_delta") {
          const d = evt.delta as { stop_reason?: string } | undefined;
          if (d?.stop_reason) stopReason = d.stop_reason;
        } else if (evt.type === "error") {
          errorPayload = evt.error;
        }

        maybeEmitProgress("interval");
      }
    }
    emitDone("stream:done");
  } catch (err) {
    // Two flavours of failure:
    //   1. Overall AbortSignal fired (300s wall) → name === "AbortError"
    //   2. Per-chunk timeout (30s no event)      → custom Error string
    // Both leave the stream partially populated; emit a final progress
    // line so the failure log carries "what we got before dying".
    aborted = true;
    maybeEmitProgress("pre-error");
    if (err instanceof Error && err.name === "AbortError") {
      emitDone("stream:timeout");
      throw new OcrError(
        "MiniMax OCR aborted (overall request timeout)",
        traceId,
        "stream:timeout",
        snapshotStats()
      );
    }
    // Per-chunk timeout — wrap so the upstream catch's `instanceof OcrError`
    // short-circuits instead of double-wrapping as "stream:read failed".
    emitDone("stream:chunk-timeout");
    throw new OcrError(
      err instanceof Error ? err.message : String(err),
      traceId,
      "stream:chunk-timeout",
      snapshotStats()
    );
  }

  return {
    textContent,
    stopReason,
    errorPayload,
    streamStats: snapshotStats()
  };
}

function parseReceiptContent({
  content,
  provider,
  model,
  traceId
}: {
  content: string;
  provider: string;
  model: string;
  traceId: string;
}): { raw: unknown; extracted: ExtractedExpenseReceipt; model: string } {
  let raw: unknown;
  let jsonError: string | null = null;
  try {
    raw = extractJsonObject(content);
  } catch (error) {
    jsonError = error instanceof Error ? error.message : String(error);
    logOcr("parse", {
      traceId,
      provider,
      model,
      parse_ok: false,
      content_length: content.length,
      error: jsonError,
      preview: preview(content)
    });
    throw new Error(
      `${provider} OCR returned non-JSON content from ${model}: ${preview(content)}${
        error instanceof Error ? ` (${error.message})` : ""
      }`
    );
  }

  const parsedResult = extractedExpenseReceiptSchema.safeParse(raw);
  if (!parsedResult.success) {
    const errors = JSON.stringify(parsedResult.error.flatten()).slice(0, 600);
    logOcr("parse", {
      traceId,
      provider,
      model,
      parse_ok: true,
      schema_ok: false,
      content_length: content.length,
      errors
    });
    throw new Error(
      `${provider} OCR JSON did not match receipt schema from ${model}: ${errors}`
    );
  }

  logOcr("parse", {
    traceId,
    provider,
    model,
    parse_ok: true,
    schema_ok: true,
    content_length: content.length,
    item_count: parsedResult.data.items.length
  });

  return { raw, extracted: parsedResult.data, model };
}

// Shape every OCR-provider function returns. Defining this once means
// callers (extractReceiptWithReconciliation, receipt-jobs) can read
// `.streamStats` without the union of (with-stats | without-stats)
// hiding it.
type OcrResult = {
  raw: unknown;
  extracted: ExtractedExpenseReceipt;
  provider: string;
  model: string;
  timings: Array<Record<string, unknown>>;
  streamStats?: StreamStats;
};

async function extractReceiptWithMiniMaxOfficial({
  images,
  reconciliationContext,
  traceId: providedTraceId
}: {
  images: Array<{ base64: string; mimeType: string }>;
  // Optional prepended text for the 2-pass reconciliation flow (see
  // extractReceiptWithReconciliation below). When set, the model sees
  // [images..., reconciliationContext, USER_PROMPT] and re-examines the
  // images with the discrepancy context. Treated as user content (not
  // system) so the model treats it as the current turn's task, not a rule.
  reconciliationContext?: string;
  // Caller-supplied trace ID (usually "job-<id>"). Echoed in every log
  // line so the upload endpoint, the worker, and the OCR module all
  // share one identifier to grep for.
  traceId?: string;
}): Promise<OcrResult> {
  const traceId = providedTraceId ?? newTraceId("minimax");
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new OcrError("MINIMAX_API_KEY is not configured", traceId, "config");
  }
  if (images.length === 0) {
    throw new OcrError(
      "extractReceiptWithMiniMaxOfficial: images array is empty",
      traceId,
      "config"
    );
  }

  const model = process.env.MINIMAX_OCR_MODEL ?? DEFAULT_MINIMAX_MODEL;
  const baseUrl = (process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
  // 16384 default; can be overridden via MINIMAX_OCR_MAX_TOKENS. Dropping
  // below 12288 risks stop_reason=max_tokens on 2-image Chinese receipts
  // (rules G-K push the model's thinking output higher than 1-image did).
  const maxTokens = Math.max(2048, envNumber("MINIMAX_OCR_MAX_TOKENS", DEFAULT_MINIMAX_MAX_TOKENS));
  const thinking = miniMaxThinkingConfig(maxTokens);
  const requestTimeoutMs = envNumber("MINIMAX_OCR_TIMEOUT_MS", DEFAULT_MINIMAX_REQUEST_TIMEOUT_MS);
  const chunkTimeoutMs = envNumber("MINIMAX_OCR_STREAMING_CHUNK_TIMEOUT_MS", DEFAULT_MINIMAX_CHUNK_TIMEOUT_MS);

  // Approximation of total bytes — base64 inflates by 4/3 so the actual
  // on-wire body is ~33% larger than this number. Close enough for
  // diagnostics; we deliberately don't compute the real base64 length to
  // avoid walking each buffer (base64 encoding is ~5MB/ms even at the
  // slowest end).
  const imageBytesTotal = images.reduce(
    (sum, image) => sum + Math.floor((image.base64.length * 3) / 4),
    0
  );

  const requestMeta: RequestMeta = {
    model,
    maxTokens,
    thinkingType: thinking.type,
    imageCount: images.length,
    imageBytesTotal,
    requestTimeoutMs,
    chunkTimeoutMs
  };

  const startedAt = performance.now();

  const userText = reconciliationContext
    ? `${reconciliationContext}\n\n${USER_PROMPT}`
    : USER_PROMPT;

  logOcr("request", {
    traceId,
    provider: "MiniMax",
    base_url: baseUrl,
    ...requestMeta,
    is_reconciliation: Boolean(reconciliationContext)
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      signal: timeoutSignal(requestTimeoutMs),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        thinking,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              // Wave 3: N images come first so the model "looks" at them all
              // before reading the task description. Order is preserved
              // (uploader's intent) and the prompt tells the model these are
              // multiple screenshots of the SAME order to extract once.
              ...images.map((image) => ({
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mimeType,
                  data: image.base64
                }
              })),
              { type: "text", text: userText }
            ]
          }
        ],
        stream: true
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ttfbMs = elapsedSince(startedAt);
    logOcr("request:error", { traceId, error: message, ttfb_ms: ttfbMs });
    throw new OcrError(`MiniMax OCR request failed: ${message}`, traceId, "request", undefined, requestMeta);
  }

  const ttfbMs = elapsedSince(startedAt);
  if (!response.ok) {
    const text = await response.text();
    logOcr("response", { traceId, status: response.status, ttfb_ms: ttfbMs, ok: false });
    throw new OcrError(
      `MiniMax OCR failed: ${response.status} ${preview(text)}`,
      traceId,
      "response",
      undefined,
      requestMeta,
      { status: response.status, ttfbMs }
    );
  }

  logOcr("response", {
    traceId,
    status: response.status,
    ttfb_ms: ttfbMs,
    ok: true,
    content_type: response.headers.get("content-type"),
    request_id: response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? null
  });

  let streamResult: Awaited<ReturnType<typeof readMiniMaxSseStream>>;
  try {
    streamResult = await readMiniMaxSseStream(response, chunkTimeoutMs, traceId);
  } catch (error) {
    // readMiniMaxSseStream already emits stream:timeout / stream:chunk-timeout
    // and attaches StreamStats to its own OcrError throws. Anything reaching
    // here is an unexpected error (e.g. "response has no body") — wrap so the
    // caller still gets the request meta for context.
    if (error instanceof OcrError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new OcrError(
      `MiniMax OCR stream read failed: ${message}`,
      traceId,
      "stream:read",
      undefined,
      requestMeta,
      { status: response.status, ttfbMs }
    );
  }

  if (streamResult.errorPayload) {
    throw new OcrError(
      `MiniMax OCR stream error: ${preview(JSON.stringify(streamResult.errorPayload))}`,
      traceId,
      "stream:payload",
      streamResult.streamStats,
      requestMeta,
      { status: response.status, ttfbMs }
    );
  }

  if (!streamResult.textContent) {
    throw new OcrError(
      `MiniMax OCR returned no text content; stop_reason=${streamResult.stopReason ?? "unknown"}`,
      traceId,
      "stream:empty",
      streamResult.streamStats,
      requestMeta,
      { status: response.status, ttfbMs }
    );
  }

  const timings = [
    {
      provider: "MiniMax",
      model,
      duration_ms: elapsedSince(startedAt),
      max_tokens: maxTokens,
      thinking: thinking.type,
      chunk_timeout_ms: chunkTimeoutMs
    }
  ];

  try {
    const parsed = parseReceiptContent({
      content: streamResult.textContent,
      provider: "MiniMax",
      model,
      traceId
    });
    // Optional body dump — gated by env so the happy path doesn't fill the
    // log with 24k-token outputs.
    if (process.env.MINIMAX_OCR_DEBUG_BODY === "1") {
      logOcr("body", {
        traceId,
        text_length: streamResult.textContent.length,
        text: streamResult.textContent
      });
    }
    return { ...parsed, provider: "MiniMax", timings, streamStats: streamResult.streamStats };
  } catch (error) {
    throw new OcrError(
      `${error instanceof Error ? error.message : String(error)}; stop_reason=${streamResult.stopReason ?? "unknown"}`,
      traceId,
      "parse",
      streamResult.streamStats,
      requestMeta,
      { status: response.status, ttfbMs }
    );
  }
}

async function extractReceiptWithModel({
  images,
  model,
  reconciliationContext,
  traceId: providedTraceId
}: {
  images: Array<{ base64: string; mimeType: string }>;
  model: string;
  // See extractReceiptWithMiniMaxOfficial. Prepended to USER_PROMPT when
  // set. Currently unused for OpenRouter (we only reconcile on the
  // primary provider path) but accepted for API symmetry.
  reconciliationContext?: string;
  traceId?: string;
}): Promise<OcrResult> {
  const traceId = providedTraceId ?? newTraceId("openrouter");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OcrError("OPENROUTER_API_KEY is not configured", traceId, "config");
  }
  if (images.length === 0) {
    throw new OcrError("extractReceiptWithModel: images array is empty", traceId, "config");
  }

  const userText = reconciliationContext
    ? `${reconciliationContext}\n\n${USER_PROMPT}`
    : USER_PROMPT;

  const startedAt = performance.now();
  const timeoutMs = envNumber("OPENROUTER_OCR_TIMEOUT_MS", 45000);
  logOcr("request", {
    traceId,
    provider: "OpenRouter",
    model,
    image_count: images.length,
    request_timeout_ms: timeoutMs,
    is_reconciliation: Boolean(reconciliationContext)
  });

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Health Monitor Expenses"
      },
      signal: timeoutSignal(timeoutMs),
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              // Image first to match the MiniMax call's order. N images in the
              // same order; the prompt tells the model these are multiple
              // screenshots of the SAME order.
              ...images.map((image) => ({
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` }
              })),
              { type: "text", text: userText }
            ]
          }
        ],
        temperature: 0,
        // 24576 default; matches the MiniMax call. Don't drop below 16384 —
        // Wave 4 first tried 12288 and a 2-image Chinese receipt hit
        // stop_reason=max_tokens because the new G-K rules made the model
        // think more than the older 1-image prompt did.
        max_tokens: envNumber("OPENROUTER_OCR_MAX_TOKENS", 24576),
        response_format: { type: "json_object" }
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const ttfbMs = elapsedSince(startedAt);
    logOcr("request:error", { traceId, error: message, ttfb_ms: ttfbMs });
    throw new OcrError(
      `OpenRouter OCR request failed: ${message}`,
      traceId,
      "request"
    );
  }

  const ttfbMs = elapsedSince(startedAt);
  if (!response.ok) {
    const text = await response.text();
    logOcr("response", { traceId, status: response.status, ttfb_ms: ttfbMs, ok: false });
    if (response.status === 404 && model.endsWith(":free")) {
      throw new OcrError(
        `OpenRouter OCR failed: ${response.status}. 当前模型 ${model} 没有可用 endpoint，请检查 OPENROUTER_OCR_MODEL 是否为当前可用的 OpenRouter 模型 ID，然后重启服务。`,
        traceId,
        "response"
      );
    }
    throw new OcrError(
      `OpenRouter OCR failed: ${response.status} ${preview(text)}`,
      traceId,
      "response"
    );
  }

  logOcr("response", { traceId, status: response.status, ttfb_ms: ttfbMs, ok: true });

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new OcrError("OpenRouter OCR returned empty content", traceId, "response:empty");
  }

  const parsed = parseReceiptContent({ content, provider: "OpenRouter", model, traceId });
  return {
    ...parsed,
    provider: "OpenRouter",
    timings: [{ provider: "OpenRouter", model, duration_ms: elapsedSince(startedAt) }]
  };
}

export async function extractReceiptWithOpenRouter({
  images,
  reconciliationContext,
  traceId
}: {
  images: Array<{ base64: string; mimeType: string }>;
  reconciliationContext?: string;
  traceId?: string;
}): Promise<OcrResult> {
  const failures: string[] = [];
  if (process.env.MINIMAX_API_KEY) {
    try {
      return await extractReceiptWithMiniMaxOfficial({
        images,
        reconciliationContext,
        traceId
      });
    } catch (error) {
      failures.push(`MiniMax official: ${error instanceof Error ? error.message : String(error)}`);
      // Auth errors are fatal: a bad key won't be fixed by trying
      // OpenRouter, and OpenRouter doesn't carry the same MiniMax content.
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
      return await extractReceiptWithModel({
        images,
        model,
        reconciliationContext,
        traceId
      });
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All OCR providers failed. ${failures.join(" | ")}`);
}

// Wave 4: 2-pass reconciliation. The model occasionally misses items on
// multi-image orders with overlapping products — the symptom is item sum
// (with fees) materially under the receipt's total_amount. This wrapper:
//
//   1. Runs the normal 1-pass OCR.
//   2. Computes item sum + tax + processing_fee + delivery_fee -
//      delivery_discount - discount_amount and compares to total_amount.
//   3. If the diff exceeds 5% of total OR ¥2 (whichever is larger), runs a
//      second pass with the discrepancy context prepended. The model is
//      told the previous item sum, the receipt's total, and the diff, then
//      re-examines the images for missing/folded items.
//   4. Prefers the second pass if it reconciles better (smaller diff), else
//      keeps the first pass and flags both failures in needs_review_reasons.
//
// Cost: 0 extra OCR calls on the happy path (sum matches total). 1 extra
// call on the failure path. The threshold (5% / ¥2) is calibrated to
// match common Chinese receipt noise: ¥0.1 rounding, ¥1-2 delivery fee
// adjustments, single-coupon discounts. Below the threshold the diff is
// almost always explainable by a single line item; above it, the model
// likely missed a row.
//
// Tested against the receipt-22 case (2 images, 7 items extracted but
// total was ¥105.29 → 36% off). The second pass was expected to add the
// folded items and reconcile; if it doesn't, the flag tells the user
// "needs eyeballing" without silently keeping the bad extraction.
const RECONCILIATION_THRESHOLD_RATIO = 0.05;
const RECONCILIATION_THRESHOLD_FLOOR = 2;

function computeReceiptTotals(extracted: {
  total_amount: number | null;
  tax_amount: number | null;
  processing_fee: number | null;
  delivery_fee: number | null;
  delivery_discount: number | null;
  discount_amount: number | null;
  items: Array<{ amount: number | null }>;
}): { itemSum: number; fees: number; computedTotal: number; diff: number; threshold: number } | null {
  if (extracted.total_amount === null) return null;
  const itemSum = extracted.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const fees =
    (extracted.tax_amount ?? 0) +
    (extracted.processing_fee ?? 0) +
    (extracted.delivery_fee ?? 0) -
    (extracted.delivery_discount ?? 0) -
    (extracted.discount_amount ?? 0);
  const computedTotal = Number((itemSum + fees).toFixed(2));
  const total = extracted.total_amount;
  const diff = Number(Math.abs(computedTotal - total).toFixed(2));
  const threshold = Math.max(
    RECONCILIATION_THRESHOLD_FLOOR,
    Number((total * RECONCILIATION_THRESHOLD_RATIO).toFixed(2))
  );
  return { itemSum, fees, computedTotal, diff, threshold };
}

export async function extractReceiptWithReconciliation({
  images,
  traceId
}: {
  images: Array<{ base64: string; mimeType: string }>;
  traceId?: string;
}): Promise<OcrResult> {
  const first = await extractReceiptWithOpenRouter({ images, traceId });
  const firstTotals = computeReceiptTotals(first.extracted);
  if (!firstTotals || firstTotals.diff <= firstTotals.threshold) {
    return first;
  }

  // firstTotals is non-null ⇒ first.extracted.total_amount is a number
  // (computeReceiptTotals returns null in that case). TypeScript can't
  // narrow through the helper, so we re-bind it.
  const totalAmount = first.extracted.total_amount as number;
  const currency = first.extracted.currency || "CNY";
  const reconciliationContext = [
    `[OCR 二次校对]`,
    `上一轮提取的商品行金额合计为 ${firstTotals.itemSum.toFixed(2)} ${currency}，`,
    `加上税费/加工费/配送费 (${firstTotals.fees.toFixed(2)}) 后应为 ${firstTotals.computedTotal.toFixed(2)} ${currency}，`,
    `但票据底部显示的实际支付为 ${totalAmount.toFixed(2)} ${currency}，`,
    `差额 ${firstTotals.diff.toFixed(2)} ${currency} 超过容差 (${firstTotals.threshold.toFixed(2)} ${currency})。`,
    ``,
    `请重新仔细查看附图，重点检查:`,
    `1. 是否漏读了某些商品行（特别是两张图重叠、滚动出屏、或被折叠/收起未展开的部分）`,
    `2. 是否漏读了"还有 N 件""查看更多"等折叠提示中的商品`,
    `3. 是否有商品行金额读错（核对到分）`,
    ``,
    `请输出完整的 JSON，包括所有商品行。`
  ].join("\n");

  console.info("[expenses:reconciliation] triggering 2-pass", {
    traceId,
    itemSum: firstTotals.itemSum,
    fees: firstTotals.fees,
    computedTotal: firstTotals.computedTotal,
    total: totalAmount,
    diff: firstTotals.diff,
    threshold: firstTotals.threshold,
    itemCount: first.extracted.items.length
  });

  let second;
  try {
    second = await extractReceiptWithOpenRouter({
      images,
      reconciliationContext,
      // Suffix the trace id so the 2nd pass's [expenses:ocr:*] lines are
      // grep-able separately from the 1st pass. Suffix-only (not prefix)
      // keeps the job id intact for the upstream caller.
      traceId: traceId ? `${traceId}-p2` : undefined
    });
  } catch (error) {
    // Second-pass failure is non-fatal: return the first pass with a flag
    // so the user still sees the (incomplete) extraction in the review UI.
    console.warn("[expenses:reconciliation] second pass failed, keeping first pass", {
      traceId,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      ...first,
      extracted: {
        ...first.extracted,
        needs_review_reasons: [
          ...first.extracted.needs_review_reasons,
          `二次校对失败: ${error instanceof Error ? error.message : String(error)}`
        ]
      }
    };
  }

  const secondTotals = computeReceiptTotals(second.extracted);
  if (!secondTotals) {
    // Second pass dropped total_amount (regression); keep first pass.
    return {
      ...first,
      extracted: {
        ...first.extracted,
        needs_review_reasons: [
          ...first.extracted.needs_review_reasons,
          `二次校对未返回总金额，保留第一轮结果（差额 ${firstTotals.diff.toFixed(2)} ${currency}）`
        ]
      }
    };
  }

  if (secondTotals.diff < firstTotals.diff) {
    console.info("[expenses:reconciliation] second pass reconciled", {
      firstDiff: firstTotals.diff,
      secondDiff: secondTotals.diff,
      firstItemCount: first.extracted.items.length,
      secondItemCount: second.extracted.items.length
    });
    return {
      ...second,
      timings: [...first.timings, ...second.timings],
      extracted: {
        ...second.extracted,
        needs_review_reasons: [
          ...second.extracted.needs_review_reasons,
          `二次校对修正：第一轮差额 ${firstTotals.diff.toFixed(2)} → ${secondTotals.diff.toFixed(2)} ${currency}`
        ].slice(0, 20)
      }
    };
  }

  // Second pass didn't help: keep first pass but flag it.
  console.info("[expenses:reconciliation] second pass did not improve", {
    firstDiff: firstTotals.diff,
    secondDiff: secondTotals.diff
  });
  return {
    ...first,
    extracted: {
      ...first.extracted,
      needs_review_reasons: [
        ...first.extracted.needs_review_reasons,
        `两轮均未对齐总金额（差额 ${firstTotals.diff.toFixed(2)} / ${secondTotals.diff.toFixed(2)} ${currency}），请人工检查折叠商品`
      ]
    }
  };
}
