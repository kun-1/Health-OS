"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Score, Segmented, TriState } from "@/components/form-controls";
import type { TimelineRecord } from "@/lib/records/types";

type EntryKey =
  | "meal"
  | "supplement"
  | "post_meal_symptom"
  | "bowel"
  | "water"
  | "nosebleed"
  | "daily_summary"
  | "sleep";

const entries: { key: EntryKey; label: string; title: string; description: string; accent: string; tint: string }[] = [
  {
    key: "meal",
    label: "记录一餐",
    title: "Meal Capture",
    description: "先保存餐食文本、饥饿和压力。细节可以稍后补充。",
    accent: "bg-teal-700",
    tint: "from-teal-50 to-white"
  },
  {
    key: "supplement",
    label: "补剂",
    title: "Supplement Capture",
    description: "记录补剂名称、剂量和是否随餐服用。",
    accent: "bg-emerald-600",
    tint: "from-emerald-50 to-white"
  },
  {
    key: "post_meal_symptom",
    label: "餐后两小时反应",
    title: "Post-meal Capture",
    description: "关联一餐后记录短期胃肠反应，只保存原始感受。",
    accent: "bg-amber-500",
    tint: "from-amber-50 to-white"
  },
  {
    key: "bowel",
    label: "排泄状态",
    title: "Bowel Capture",
    description: "快速记录 Bristol 和费力程度，可选细节默认收起。",
    accent: "bg-cyan-700",
    tint: "from-cyan-50 to-white"
  },
  {
    key: "water",
    label: "喝水",
    title: "Water Capture",
    description: "选择本次饮水量和饮品类型，保存一条饮水事件。",
    accent: "bg-sky-500",
    tint: "from-sky-50 to-white"
  },
  {
    key: "nosebleed",
    label: "流鼻血",
    title: "Nosebleed Capture",
    description: "低频事件只做事实记录，侧别和持续时间可选。",
    accent: "bg-rose-400",
    tint: "from-rose-50 to-white"
  },
  {
    key: "daily_summary",
    label: "睡前总结",
    title: "Daily Summary",
    description: "睡前记录皮肤、鼻部和压力的核心事实。",
    accent: "bg-indigo-500",
    tint: "from-indigo-50 to-white"
  },
  {
    key: "sleep",
    label: "睡眠质量",
    title: "Sleep Capture",
    description: "早晨记录前一晚睡眠归属日期、时长和质量。",
    accent: "bg-slate-500",
    tint: "from-slate-100 to-white"
  }
];

const foodMethodOptions = [
  ["", "未记录"],
  ["steam", "蒸"],
  ["boil", "煮/水煮"],
  ["stir_fry", "炒"],
  ["deep_fry", "炸"],
  ["bake", "烤"],
  ["raw", "生食"],
  ["eat_out", "外食/做法不明"],
  ["unknown", "不确定"]
] as const;

const bristolExamples = [
  { value: 1, title: "1 型", detail: "分离硬块，像羊屎蛋，通常偏便秘" },
  { value: 2, title: "2 型", detail: "香肠状但表面结块，仍偏便秘" },
  { value: 3, title: "3 型", detail: "香肠状，表面有裂纹" },
  { value: 4, title: "4 型", detail: "光滑柔软，像香蕉或蛇，通常最理想" },
  { value: 5, title: "5 型", detail: "边缘清楚的软块，偏软" },
  { value: 6, title: "6 型", detail: "松散糊状，边缘不规则" },
  { value: 7, title: "7 型", detail: "完全水样，没有成形固体" }
];

function isEntryKey(value: string | null): value is EntryKey {
  return entries.some((entry) => entry.key === value);
}

function nowLocal() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function inferredMealType() {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function optionalText(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value ? value : undefined;
}

function optionalNumber(form: FormData, key: string) {
  const value = String(form.get(key) ?? "").trim();
  return value ? Number(value) : undefined;
}

function optionalBoolean(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "")) as T;
}

function parseFoodItems(form: FormData) {
  const names = form.getAll("food_item_name");
  const methods = form.getAll("food_item_method");

  return names
    .map((rawName, index) => {
      const name = String(rawName ?? "").trim();
      const method = String(methods[index] ?? "").trim();
      if (!name) {
        return null;
      }
      return compact({
        name,
        method: method || undefined
      });
    })
    .filter(Boolean) as { name: string; method?: string }[];
}

function buildSupplementPayloads(form: FormData) {
  const base = {
    taken_with_meal: optionalBoolean(form, "taken_with_meal"),
    related_record_id: optionalNumber(form, "related_record_id"),
    notes: optionalText(form, "notes")
  };
  const names = form.getAll("supplement_name");
  const brands = form.getAll("brand");
  const doses = form.getAll("dose_text");

  return names
    .map((rawName, index) => {
      const supplementName = String(rawName ?? "").trim();
      if (!supplementName) {
        return null;
      }
      return compact({
        ...base,
        supplement_name: supplementName,
        brand: String(brands[index] ?? "").trim() || undefined,
        dose_text: String(doses[index] ?? "").trim() || undefined
      });
    })
    .filter(Boolean) as {
    supplement_name: string;
    brand?: string;
    dose_text?: string;
    taken_with_meal?: boolean;
    related_record_id?: number;
    notes?: string;
  }[];
}

function datetimeToIso(value: FormDataEntryValue | null) {
  return new Date(String(value)).toISOString();
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? String(value) : undefined;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.join(",") : "";
}

function localDatetimeValue(value: unknown) {
  if (typeof value !== "string") {
    return nowLocal();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return nowLocal();
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function datetimeFieldValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function NotesField({ initialValue }: { initialValue?: string }) {
  const [open, setOpen] = useState(Boolean(initialValue));
  const [value, setValue] = useState(initialValue ?? "");
  return (
    <div className="field">
      <button className="segment w-fit" onClick={() => setOpen((current) => !current)} type="button">
        {open ? "收起备注" : "添加备注"}
      </button>
      {open ? (
        <>
          <textarea
            className="control min-h-24"
            maxLength={500}
            name="notes"
            onChange={(event) => setValue(event.target.value)}
            placeholder="特殊背景、异常感受、用药或记录不确定性"
            value={value}
          />
          <div className="text-xs text-slate-500">{value.length}/500</div>
        </>
      ) : null}
    </div>
  );
}

function OccurredAtField({ value }: { value?: string }) {
  return (
    <div className="field">
      <label htmlFor="occurred_at">发生时间</label>
      <input className="control" defaultValue={localDatetimeValue(value)} id="occurred_at" name="occurred_at" type="datetime-local" />
    </div>
  );
}

export function RecordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const requestedType = searchParams.get("type");
  const focusedType = !editId && isEntryKey(requestedType) ? requestedType : null;
  const [active, setActive] = useState<EntryKey>("meal");
  const [message, setMessage] = useState("");
  const [recentMeals, setRecentMeals] = useState<TimelineRecord[]>([]);
  const [editingRecord, setEditingRecord] = useState<TimelineRecord | null>(null);
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    fetch("/api/records?limit=100")
      .then((response) => response.json())
      .then((data) => {
        setRecentMeals((data.records ?? []).filter((record: TimelineRecord) => record.type === "meal").slice(0, 5));
      })
      .catch(() => undefined);
  }, [message]);

  useEffect(() => {
    if (!editId) {
      setEditingRecord(null);
      setEditError("");
      setEditLoading(false);
      if (isEntryKey(requestedType)) {
        setActive(requestedType);
      }
      return;
    }

    setEditLoading(true);
    setEditError("");
    fetch(`/api/records/${editId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("记录不存在");
        }
        const data = (await response.json()) as { record: TimelineRecord };
        setEditingRecord(data.record);
        setActive(data.record.type);
      })
      .catch((error: unknown) => {
        setEditingRecord(null);
        setEditError(error instanceof Error ? error.message : "记录加载失败");
      })
      .finally(() => setEditLoading(false));
  }, [editId, requestedType]);

  async function submit(type: EntryKey, form: FormData) {
    setMessage("保存中...");
    const occurredAt = datetimeToIso(form.get("occurred_at"));

    if (type === "supplement" && !editingRecord) {
      const payloads = buildSupplementPayloads(form);
      if (payloads.length === 0) {
        setMessage("请至少填写一个补剂名称");
        return;
      }

      let savedCount = 0;
      for (const payload of payloads) {
        const response = await fetch("/api/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, occurred_at: occurredAt, payload })
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setMessage(savedCount > 0 ? `已保存 ${savedCount} 条，剩余失败：${data.error ?? "保存失败"}` : data.error ?? "保存失败");
          return;
        }
        savedCount += 1;
      }

      setMessage(`已保存 ${savedCount} 条补剂记录`);
      return;
    }

    const body = {
      type,
      occurred_at: occurredAt,
      payload: buildPayload(type, form)
    };

    const url = editingRecord ? `/api/records/${editingRecord.id}` : "/api/records";
    const method = editingRecord ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.error ?? "保存失败");
      return;
    }

    if (editingRecord) {
      router.push("/timeline");
      return;
    }

    setMessage("已保存");
  }

  const activeEntry = useMemo(() => entries.find((entry) => entry.key === active) ?? entries[0], [active]);
  const activeLabel = activeEntry.label;
  const formKey = editingRecord ? `edit-${editingRecord.id}` : `new-${active}`;

  return (
    <div className="grid gap-6">
      <div className={`surface-card bg-gradient-to-br p-5 sm:p-6 ${focusedType ? activeEntry.tint : "from-white to-white"}`}>
        {focusedType ? <span className={`mb-5 block h-2 w-14 rounded-full ${activeEntry.accent}`} /> : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-800">{focusedType ? "Focused Capture" : "Capture"}</p>
            <h1 className="mt-2 text-[32px] font-bold leading-tight text-[#17201c]">
              {focusedType ? activeEntry.title : "Record"}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#5d6963]">
              {focusedType ? activeEntry.description : "每次只保存一个原始事件。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {focusedType ? (
              <Link className="secondary-action" href="/record">
                All captures
              </Link>
            ) : null}
            <Link className="secondary-action" href="/timeline">
              Timeline
            </Link>
          </div>
        </div>
      </div>

      {!focusedType && !editingRecord ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {entries.map((entry) => (
            <button
              className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold shadow-sm transition ${
                active === entry.key
                  ? "border-teal-700 bg-teal-50 text-teal-950"
                  : "border-[rgba(38,55,49,0.10)] bg-white/70 text-[#45524c] hover:bg-white"
              }`}
              data-active={active === entry.key}
              key={entry.key}
              onClick={() => {
                setActive(entry.key);
                setEditingRecord(null);
                router.replace("/record");
                setMessage("");
              }}
              type="button"
            >
              <span className={`mb-3 block h-1.5 w-8 rounded-full ${entry.accent}`} />
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      <section className="surface-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#17201c]">
              {editingRecord ? `编辑记录 #${editingRecord.id}` : activeLabel}
            </h2>
            {editingRecord ? <p className="mt-1 text-sm text-[#5d6963]">当前只修改这条记录，不会新建一条。</p> : null}
          </div>
          {editingRecord ? (
            <button
              className="secondary-action"
              onClick={() => {
                setEditingRecord(null);
                router.replace("/record");
              }}
              type="button"
            >
              取消编辑
            </button>
          ) : null}
        </div>
        {editLoading ? <p className="mb-4 text-sm text-[#5d6963]">正在加载记录...</p> : null}
        {editError ? <p className="mb-4 text-sm font-semibold text-red-700">{editError}</p> : null}
        <RecordForm
          active={editingRecord?.type ?? active}
          editingRecord={editingRecord}
          key={formKey}
          onDelete={editingRecord ? async () => deleteEditingRecord(editingRecord.id, router, setMessage) : undefined}
          onSubmit={submit}
          recentMeals={recentMeals}
        />
        {message ? <p className="mt-4 text-sm font-semibold text-[#45524c]">{message}</p> : null}
      </section>
    </div>
  );
}

async function deleteEditingRecord(
  id: number,
  router: ReturnType<typeof useRouter>,
  setMessage: (value: string) => void
) {
  const confirmed = window.confirm("确认删除这条记录？");
  if (!confirmed) {
    return;
  }

  setMessage("删除中...");
  const response = await fetch(`/api/records/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    setMessage(data.error ?? "删除失败");
    return;
  }

  router.push("/timeline");
}

function RecordForm({
  active,
  editingRecord,
  recentMeals,
  onDelete,
  onSubmit
}: {
  active: EntryKey;
  editingRecord: TimelineRecord | null;
  recentMeals: TimelineRecord[];
  onDelete?: () => Promise<void>;
  onSubmit: (type: EntryKey, form: FormData) => void;
}) {
  const saveLabel = editingRecord ? "更新记录" : `保存${entries.find((entry) => entry.key === active)?.label ?? "记录"}`;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(active, new FormData(event.currentTarget));
      }}
      >
      <OccurredAtField value={editingRecord?.occurred_at} />
      {active === "meal" ? <MealFields initialPayload={editingRecord?.payload ?? null} /> : null}
      {active === "supplement" ? (
        <SupplementFields
          initialPayload={editingRecord?.payload ?? null}
          isEditing={Boolean(editingRecord)}
          recentMeals={recentMeals}
        />
      ) : null}
      {active === "post_meal_symptom" ? <PostMealFields initialPayload={editingRecord?.payload ?? null} recentMeals={recentMeals} /> : null}
      {active === "bowel" ? <BowelFields initialPayload={editingRecord?.payload ?? null} /> : null}
      {active === "water" ? <WaterFields initialPayload={editingRecord?.payload ?? null} /> : null}
      {active === "nosebleed" ? <NosebleedFields initialPayload={editingRecord?.payload ?? null} /> : null}
      {active === "daily_summary" ? <DailySummaryFields initialPayload={editingRecord?.payload ?? null} /> : null}
      {active === "sleep" ? <SleepFields initialPayload={editingRecord?.payload ?? null} /> : null}
      <NotesField initialValue={typeof editingRecord?.payload.notes === "string" ? editingRecord.payload.notes : undefined} />
      {onDelete ? (
        <button
          className="rounded-md border border-red-300 bg-white/80 px-4 py-3 font-bold text-red-700"
          onClick={() => void onDelete()}
          type="button"
        >
          删除这条记录
        </button>
      ) : null}
      <button className="primary-action w-full" type="submit">
        {saveLabel}
      </button>
    </form>
  );
}

function PrimaryZone({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="capture-primary">
      <div className="mb-3">
        <h3 className="text-base font-bold text-[#17201c]">{title}</h3>
        {description ? <p className="mt-1 text-sm text-[#5d6963]">{description}</p> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function DetailSection({ title = "More details", children }: { title?: string; children: React.ReactNode }) {
  return (
    <details className="capture-details">
      <summary className="cursor-pointer text-sm font-semibold text-[#45524c]">{title}</summary>
      <div className="mt-3 grid gap-4">{children}</div>
    </details>
  );
}

function MealFields({ initialPayload }: { initialPayload: Record<string, unknown> | null }) {
  const [mealType, setMealType] = useState(String(initialPayload?.meal_type ?? inferredMealType()));
  const [hunger, setHunger] = useState(String(initialPayload?.hunger_before ?? "2"));
  const [stress, setStress] = useState(String(initialPayload?.stress_before ?? "1"));
  const [processed, setProcessed] = useState(
    initialPayload?.processed_food === true ? "true" : initialPayload?.processed_food === false ? "false" : ""
  );
  const [portion, setPortion] = useState(String(initialPayload?.portion_level ?? "normal"));
  const initialItems =
    Array.isArray(initialPayload?.food_items) && initialPayload.food_items.length > 0
      ? initialPayload.food_items.map((item, index) => ({
          key: `saved-${index}`,
          name: typeof item === "object" && item && "name" in item ? String(item.name ?? "") : "",
          method: typeof item === "object" && item && "method" in item ? String(item.method ?? "") : ""
        }))
      : [{ key: "item-0", name: "", method: "" }];
  const [foodItems, setFoodItems] = useState(initialItems);

  function updateFoodItem(index: number, field: "name" | "method", value: string) {
    setFoodItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function addFoodItem() {
    setFoodItems((current) => [...current, { key: `item-${Date.now()}-${current.length}`, name: "", method: "" }]);
  }

  function removeFoodItem(index: number) {
    setFoodItems((current) => (current.length === 1 ? [{ ...current[0], name: "", method: "" }] : current.filter((_, itemIndex) => itemIndex !== index)));
  }

  return (
    <>
      <PrimaryZone title="What did you eat?" description="先写原始餐食文本；如果你愿意，再把主要食材和做法拆出来。">
        <div className="field">
          <label htmlFor="food_text_raw">餐食内容</label>
          <textarea
            className="control min-h-28"
            defaultValue={stringValue(initialPayload?.food_text_raw)}
            id="food_text_raw"
            name="food_text_raw"
            placeholder="例如：燕麦、鸡蛋、咖啡；或者：鸡米花、冰美式"
          />
          <p className="text-xs text-slate-500">
            不确定怎么拆时，先按你最自然的说法写原文。后面的结构化食材里，建议把“鸡胸肉”写成食材名，把“水煮”单独写到做法。
          </p>
        </div>
      </PrimaryZone>
      <DetailSection title="食材和做法（推荐）">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700">
          做法建议单独记录，不要硬塞进食材名里。<code>鸡胸肉 + boil</code> 比 <code>水煮鸡胸肉</code>{" "}
          更利于后续统计；如果你只知道成品名，比如 <code>鸡米花</code>，原文里直接写 <code>鸡米花</code> 也没问题。
        </div>
        <div className="grid gap-3">
          {foodItems.map((item, index) => (
            <div className="rounded-lg border border-slate-200 p-3" key={item.key}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="field">
                  <label htmlFor={`food_item_name_${index}`}>食材 {index + 1}</label>
                  <input
                    className="control"
                    id={`food_item_name_${index}`}
                    name="food_item_name"
                    onChange={(event) => updateFoodItem(index, "name", event.target.value)}
                    placeholder="例如：鸡胸肉、土豆、酸奶"
                    value={item.name}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`food_item_method_${index}`}>做法（可选）</label>
                  <select
                    className="control"
                    id={`food_item_method_${index}`}
                    name="food_item_method"
                    onChange={(event) => updateFoodItem(index, "method", event.target.value)}
                    value={item.method}
                  >
                    {foodMethodOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="mt-2 text-sm font-semibold text-slate-600" onClick={() => removeFoodItem(index)} type="button">
                删除这项食材
              </button>
            </div>
          ))}
          <button className="secondary-action w-full" onClick={addFoodItem} type="button">
            添加一个食材
          </button>
        </div>
      </DetailSection>
      <div className="field">
        <div className="field-label">餐次</div>
        <Segmented
          name="meal_type"
          onChange={setMealType}
          options={[
            { label: "早餐", value: "breakfast" },
            { label: "午餐", value: "lunch" },
            { label: "晚餐", value: "dinner" },
            { label: "零食", value: "snack" }
          ]}
          value={mealType}
        />
      </div>
      <div className="field">
        <div className="field-label">饥饿 0-4</div>
        <Score name="hunger_before" onChange={setHunger} value={hunger} />
      </div>
      <div className="field">
        <div className="field-label">压力 0-4</div>
        <Score name="stress_before" onChange={setStress} value={stress} />
      </div>
      <DetailSection>
        <div className="field">
          <label htmlFor="meal_duration_min">用餐时长（分钟，可选）</label>
          <input
            className="control"
            defaultValue={numberValue(initialPayload?.meal_duration_min)}
            id="meal_duration_min"
            min={1}
            name="meal_duration_min"
            type="number"
          />
        </div>
        <div className="field">
          <div className="field-label">加工食品</div>
          <TriState name="processed_food" onChange={setProcessed} value={processed} />
        </div>
        <SelectField
          defaultValue={stringValue(initialPayload?.additive_risk_level)}
          label="添加剂等级"
          name="additive_risk_level"
          options={[
            ["", "未记录"],
            ["none", "none"],
            ["low", "low"],
            ["medium", "medium"],
            ["high", "high"]
          ]}
        />
        <div className="field">
          <label htmlFor="additive_tags">添加剂标签（逗号分隔）</label>
          <input
            className="control"
            defaultValue={arrayValue(initialPayload?.additive_tags)}
            id="additive_tags"
            name="additive_tags"
            placeholder="CMC,P80,糖醇"
          />
        </div>
        <div className="field">
          <div className="field-label">份量</div>
          <Segmented
            name="portion_level"
            onChange={setPortion}
            options={[
              { label: "少", value: "small" },
              { label: "正常", value: "normal" },
              { label: "多", value: "large" }
            ]}
            value={portion}
          />
        </div>
      </DetailSection>
    </>
  );
}

function SupplementFields({
  recentMeals,
  initialPayload,
  isEditing
}: {
  recentMeals: TimelineRecord[];
  initialPayload: Record<string, unknown> | null;
  isEditing: boolean;
}) {
  const [takenWithMeal, setTakenWithMeal] = useState(
    initialPayload?.taken_with_meal === true ? "true" : initialPayload?.taken_with_meal === false ? "false" : ""
  );
  const [items, setItems] = useState(
    isEditing
      ? [
          {
            key: "edit-0",
            supplement_name: stringValue(initialPayload?.supplement_name),
            brand: stringValue(initialPayload?.brand),
            dose_text: stringValue(initialPayload?.dose_text)
          }
        ]
      : [{ key: "supplement-0", supplement_name: "", brand: "", dose_text: "" }]
  );

  function updateItem(index: number, field: "supplement_name" | "brand" | "dose_text", value: string) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setItems((current) => [...current, { key: `supplement-${Date.now()}-${current.length}`, supplement_name: "", brand: "", dose_text: "" }]);
  }

  function removeItem(index: number) {
    setItems((current) =>
      current.length === 1
        ? [{ ...current[0], supplement_name: "", brand: "", dose_text: "" }]
        : current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  return (
    <>
      <PrimaryZone
        title="Supplement stack"
        description={isEditing ? "编辑当前这条补剂记录。" : "如果你一次会吃多种补剂，可以在同一个时间点连续添加多条。"}
      >
        <div className="grid gap-3">
          {items.map((item, index) => (
            <div className="rounded-lg border border-slate-200 p-3" key={item.key}>
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  defaultValue={undefined}
                  id={`supplement_name_${index}`}
                  label={`补剂名称 ${index + 1}`}
                  name="supplement_name"
                  placeholder="例如：维生素 D3"
                  required={isEditing}
                  value={item.supplement_name}
                  onValueChange={(value) => updateItem(index, "supplement_name", value)}
                />
                <TextField
                  defaultValue={undefined}
                  id={`brand_${index}`}
                  label="品牌（可选）"
                  name="brand"
                  placeholder="例如：Now"
                  value={item.brand}
                  onValueChange={(value) => updateItem(index, "brand", value)}
                />
                <TextField
                  defaultValue={undefined}
                  id={`dose_text_${index}`}
                  label="剂量（可选）"
                  name="dose_text"
                  placeholder="例如：1000 IU / 2 粒"
                  value={item.dose_text}
                  onValueChange={(value) => updateItem(index, "dose_text", value)}
                />
              </div>
              {!isEditing ? (
                <button className="mt-2 text-sm font-semibold text-slate-600" onClick={() => removeItem(index)} type="button">
                  删除这条补剂
                </button>
              ) : null}
            </div>
          ))}
          {!isEditing ? (
            <button className="secondary-action w-full" onClick={addItem} type="button">
              再添加一个补剂
            </button>
          ) : null}
        </div>
      </PrimaryZone>
      <div className="field">
        <div className="field-label">随餐服用</div>
        <TriState name="taken_with_meal" onChange={setTakenWithMeal} value={takenWithMeal} />
      </div>
      <MealSelect recentMeals={recentMeals} required={false} value={numberValue(initialPayload?.related_record_id)} />
    </>
  );
}

function PostMealFields({
  recentMeals,
  initialPayload
}: {
  recentMeals: TimelineRecord[];
  initialPayload: Record<string, unknown> | null;
}) {
  const [bloating, setBloating] = useState(stringValue(initialPayload?.post_meal_2h_bloating));
  const [pain, setPain] = useState(stringValue(initialPayload?.post_meal_2h_pain));
  const [reflux, setReflux] = useState(
    initialPayload?.post_meal_2h_reflux === true ? "true" : initialPayload?.post_meal_2h_reflux === false ? "false" : ""
  );
  const [heaviness, setHeaviness] = useState(stringValue(initialPayload?.post_meal_2h_heaviness));
  const [gas, setGas] = useState(stringValue(initialPayload?.gas));
  return (
    <>
      <PrimaryZone title="How did you feel after that meal?" description="先关联一餐，再记录这次短期反应。">
        <MealSelect recentMeals={recentMeals} required value={numberValue(initialPayload?.related_record_id)} />
        <OptionalScore label="腹胀 0-4" name="post_meal_2h_bloating" onChange={setBloating} value={bloating} />
        <OptionalScore label="腹痛 0-4" name="post_meal_2h_pain" onChange={setPain} value={pain} />
        <div className="field">
          <div className="field-label">反酸</div>
          <TriState name="post_meal_2h_reflux" onChange={setReflux} value={reflux} />
        </div>
      </PrimaryZone>
      <DetailSection>
        <OptionalScore label="沉重感 0-4" name="post_meal_2h_heaviness" onChange={setHeaviness} value={heaviness} />
        <OptionalScore label="产气 0-4" name="gas" onChange={setGas} value={gas} />
      </DetailSection>
    </>
  );
}

function BowelFields({ initialPayload }: { initialPayload: Record<string, unknown> | null }) {
  const [bristol, setBristol] = useState(String(initialPayload?.bristol_type ?? "4"));
  const [strain, setStrain] = useState(String(initialPayload?.strain_level ?? "0"));
  const [urgency, setUrgency] = useState(
    initialPayload?.urgency === true ? "true" : initialPayload?.urgency === false ? "false" : ""
  );
  const [incomplete, setIncomplete] = useState(
    initialPayload?.incomplete_emptying === true ? "true" : initialPayload?.incomplete_emptying === false ? "false" : ""
  );
  const [blood, setBlood] = useState(
    initialPayload?.blood_or_black_stool === true ? "true" : initialPayload?.blood_or_black_stool === false ? "false" : ""
  );
  return (
    <>
      <PrimaryZone title="Stool status" description="先完成这次排便的两个核心事实。">
        <div className="field">
          <div className="field-label">Bristol 1-7</div>
          <Score max={7} name="bristol_type" onChange={setBristol} value={bristol} />
        </div>
        <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
          {bristolExamples.map((example) => (
            <div className={Number(bristol) === example.value ? "font-semibold" : ""} key={example.value}>
              {example.title}：{example.detail}
            </div>
          ))}
        </div>
        <div className="field">
          <div className="field-label">费力程度 0-3</div>
          <Score max={3} name="strain_level" onChange={setStrain} value={strain} />
        </div>
      </PrimaryZone>
      <DetailSection>
        <TriStateField label="急迫感" name="urgency" onChange={setUrgency} value={urgency} />
        <TriStateField label="排便不尽" name="incomplete_emptying" onChange={setIncomplete} value={incomplete} />
        <TriStateField label="血便或黑便" name="blood_or_black_stool" onChange={setBlood} value={blood} />
      </DetailSection>
    </>
  );
}

function WaterFields({ initialPayload }: { initialPayload: Record<string, unknown> | null }) {
  const [amount, setAmount] = useState(String(initialPayload?.amount_ml ?? "1000"));
  const [drinkType, setDrinkType] = useState(String(initialPayload?.drink_type ?? "water"));
  return (
    <>
      <PrimaryZone title="How much did you drink?" description="优先选择本次饮水量，再补充饮品类型。">
        <div className="field">
          <div className="field-label">饮水量 ml</div>
          <Segmented
            name="amount_ml"
            onChange={setAmount}
            options={["250", "500", "750", "1000"].map((item) => ({ label: `${item} ml`, value: item }))}
            value={amount}
          />
          <input
            className="control"
            defaultValue={initialPayload?.amount_ml ? "" : undefined}
            min={1}
            max={5000}
            name="amount_ml_custom"
            placeholder="自定义 ml，可选"
            type="number"
          />
        </div>
      </PrimaryZone>
      <div className="field">
        <div className="field-label">饮品类型</div>
        <Segmented
          name="drink_type"
          onChange={setDrinkType}
          options={[
            { label: "水", value: "water" },
            { label: "咖啡", value: "coffee" },
            { label: "茶", value: "tea" },
            { label: "其他", value: "other" }
          ]}
          value={drinkType}
        />
      </div>
      <DetailSection>
        <SelectField
          defaultValue={stringValue(initialPayload?.sweating_or_exercise)}
          label="出汗/运动"
          name="sweating_or_exercise"
          options={[
            ["", "未记录"],
            ["none", "none"],
            ["light", "light"],
            ["moderate", "moderate"],
            ["heavy", "heavy"]
          ]}
        />
        <SelectField
          defaultValue={stringValue(initialPayload?.urine_color_optional)}
          label="尿色（可选）"
          name="urine_color_optional"
          options={[
            ["", "未记录"],
            ["light", "light"],
            ["normal", "normal"],
            ["dark", "dark"]
          ]}
        />
      </DetailSection>
    </>
  );
}

function NosebleedFields({ initialPayload }: { initialPayload: Record<string, unknown> | null }) {
  return (
    <>
      <SelectField
        defaultValue={stringValue(initialPayload?.nosebleed_side)}
        label="侧别"
        name="nosebleed_side"
        options={[
          ["", "未记录"],
          ["left", "left"],
          ["right", "right"],
          ["both", "both"],
          ["unknown", "unknown"]
        ]}
      />
      <SelectField
        defaultValue={stringValue(initialPayload?.nosebleed_amount)}
        label="出血量"
        name="nosebleed_amount"
        options={[
          ["", "未记录"],
          ["light", "light"],
          ["moderate", "moderate"],
          ["heavy", "heavy"]
        ]}
      />
      <TextField
        defaultValue={numberValue(initialPayload?.nosebleed_duration_min)}
        label="持续时间（分钟，可选）"
        name="nosebleed_duration_min"
        type="number"
      />
    </>
  );
}

function DailySummaryFields({ initialPayload }: { initialPayload: Record<string, unknown> | null }) {
  const [values, setValues] = useState<Record<string, string>>({
    skin_redness: String(initialPayload?.skin_redness ?? "2"),
    skin_scaling: String(initialPayload?.skin_scaling ?? "2"),
    skin_itch: String(initialPayload?.skin_itch ?? "1"),
    skin_area_change: String(initialPayload?.skin_area_change ?? "0"),
    nasal_blockage: String(initialPayload?.nasal_blockage ?? "1"),
    stress_peak: String(initialPayload?.stress_peak ?? "1")
  });
  const update = (key: string) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <>
      <TextField defaultValue={stringValue(initialPayload?.summary_date ?? today())} label="归属日期" name="summary_date" required type="date" />
      {[
        ["skin_redness", "红斑 0-4"],
        ["skin_scaling", "鳞屑 0-4"],
        ["skin_itch", "瘙痒 0-4"],
        ["nasal_blockage", "鼻塞 0-4"],
        ["stress_peak", "压力峰值 0-4"]
      ].map(([name, label]) => (
        <div className="field" key={name}>
          <div className="field-label">{label}</div>
          <Score name={name} onChange={update(name)} value={values[name]} />
        </div>
      ))}
      <div className="field">
        <div className="field-label">皮肤面积变化</div>
        <Segmented
          name="skin_area_change"
          onChange={update("skin_area_change")}
          options={[
            { label: "减少", value: "-1" },
            { label: "无变化", value: "0" },
            { label: "增加", value: "1" }
          ]}
          value={values.skin_area_change}
        />
      </div>
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold text-slate-700">展开可选字段</summary>
        <div className="mt-3 grid gap-4">
          <OptionalNumber defaultValue={numberValue(initialPayload?.vegetable_count)} label="蔬菜种类数" name="vegetable_count" />
          <OptionalNumber defaultValue={numberValue(initialPayload?.fruit_count)} label="水果种类数" name="fruit_count" />
          <TextField defaultValue={stringValue(initialPayload?.stress_note)} label="压力备注" name="stress_note" />
        </div>
      </details>
    </>
  );
}

function SleepFields({ initialPayload }: { initialPayload: Record<string, unknown> | null }) {
  const [awakenings, setAwakenings] = useState(String(initialPayload?.night_awakenings ?? "1"));
  const [quality, setQuality] = useState(String(initialPayload?.sleep_quality ?? "2"));
  const [disruption, setDisruption] = useState(String(initialPayload?.sleep_disruption ?? "none"));
  return (
    <>
      <PrimaryZone title="Sleep snapshot" description="早晨先记下昨晚睡了多久、睡得怎样。">
        <TextField defaultValue={stringValue(initialPayload?.sleep_date ?? yesterday())} label="睡眠归属日期" name="sleep_date" required type="date" />
        <TextField
          defaultValue={numberValue(initialPayload?.sleep_duration_hours)}
          label="睡眠时长（小时）"
          name="sleep_duration_hours"
          required
          step="0.1"
          type="number"
        />
        <div className="field">
          <div className="field-label">睡眠质量 0-4</div>
          <Score name="sleep_quality" onChange={setQuality} value={quality} />
        </div>
      </PrimaryZone>
      <div className="field">
        <div className="field-label">夜醒次数</div>
        <Segmented
          name="night_awakenings"
          onChange={setAwakenings}
          options={["0", "1", "2", "3_plus"].map((item) => ({ label: item, value: item }))}
          value={awakenings}
        />
      </div>
      <div className="field">
        <div className="field-label">睡眠中断</div>
        <Segmented
          name="sleep_disruption"
          onChange={setDisruption}
          options={[
            { label: "无", value: "none" },
            { label: "痒", value: "itch" },
            { label: "鼻部", value: "nasal" },
            { label: "两者", value: "both" }
          ]}
          value={disruption}
        />
      </div>
      <DetailSection>
          <TextField defaultValue={datetimeFieldValue(initialPayload?.bed_at)} label="上床时间" name="bed_at" type="datetime-local" />
          <TextField defaultValue={datetimeFieldValue(initialPayload?.wake_at)} label="起床时间" name="wake_at" type="datetime-local" />
          <OptionalNumber defaultValue={numberValue(initialPayload?.sleep_latency_min)} label="入睡耗时（分钟）" name="sleep_latency_min" />
      </DetailSection>
    </>
  );
}

function MealSelect({ recentMeals, required, value }: { recentMeals: TimelineRecord[]; required: boolean; value?: string }) {
  const hasSelectedMeal = value ? recentMeals.some((meal) => String(meal.id) === value) : true;

  return (
    <div className="field">
      <label htmlFor="related_record_id">关联餐食{required ? "" : "（可选）"}</label>
      <select className="control" defaultValue={value ?? ""} id="related_record_id" name="related_record_id" required={required}>
        <option value="">选择最近餐食</option>
        {!hasSelectedMeal && value ? <option value={value}>关联餐食 #{value}</option> : null}
        {recentMeals.map((meal) => (
          <option key={meal.id} value={meal.id}>
            #{meal.id} {new Date(meal.occurred_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  id,
  label,
  name,
  required = false,
  type = "text",
  defaultValue,
  value,
  onValueChange,
  placeholder,
  step
}: {
  id?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id ?? name}>{label}</label>
      <input
        className="control"
        defaultValue={defaultValue}
        id={id ?? name}
        name={name}
        onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
        value={value}
      />
    </div>
  );
}

function OptionalNumber({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return <TextField defaultValue={defaultValue} label={label} name={name} type="number" />;
}

function SelectField({
  label,
  name,
  options,
  defaultValue = ""
}: {
  label: string;
  name: string;
  options: [string, string][];
  defaultValue?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select className="control" defaultValue={defaultValue} id={name} name={name}>
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function OptionalScore({
  label,
  name,
  value,
  onChange
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <Score name={name} onChange={onChange} optional value={value} />
    </div>
  );
}

function TriStateField({
  label,
  name,
  value,
  onChange
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <TriState name={name} onChange={onChange} value={value} />
    </div>
  );
}

function buildPayload(type: EntryKey, form: FormData) {
  const base = { notes: optionalText(form, "notes") };
  if (type === "meal") {
    const foodItems = parseFoodItems(form);
    return compact({
      ...base,
      meal_type: form.get("meal_type"),
      hunger_before: Number(form.get("hunger_before")),
      stress_before: Number(form.get("stress_before")),
      food_text_raw: optionalText(form, "food_text_raw"),
      food_items: foodItems.length > 0 ? foodItems : undefined,
      meal_duration_min: optionalNumber(form, "meal_duration_min"),
      processed_food: optionalBoolean(form, "processed_food"),
      additive_risk_level: optionalText(form, "additive_risk_level"),
      additive_tags: optionalText(form, "additive_tags")?.split(",").map((item) => item.trim()).filter(Boolean),
      portion_level: form.get("portion_level")
    });
  }
  if (type === "supplement") {
    return compact({
      ...buildSupplementPayloads(form)[0],
      ...base
    });
  }
  if (type === "post_meal_symptom") {
    return compact({
      ...base,
      related_record_id: Number(form.get("related_record_id")),
      post_meal_2h_bloating: optionalNumber(form, "post_meal_2h_bloating"),
      post_meal_2h_pain: optionalNumber(form, "post_meal_2h_pain"),
      post_meal_2h_reflux: optionalBoolean(form, "post_meal_2h_reflux"),
      post_meal_2h_heaviness: optionalNumber(form, "post_meal_2h_heaviness"),
      gas: optionalNumber(form, "gas")
    });
  }
  if (type === "bowel") {
    return compact({
      ...base,
      bristol_type: Number(form.get("bristol_type")),
      strain_level: Number(form.get("strain_level")),
      urgency: optionalBoolean(form, "urgency"),
      incomplete_emptying: optionalBoolean(form, "incomplete_emptying"),
      blood_or_black_stool: optionalBoolean(form, "blood_or_black_stool")
    });
  }
  if (type === "water") {
    return compact({
      ...base,
      amount_ml: optionalNumber(form, "amount_ml_custom") ?? Number(form.get("amount_ml")),
      drink_type: form.get("drink_type"),
      sweating_or_exercise: optionalText(form, "sweating_or_exercise"),
      urine_color_optional: optionalText(form, "urine_color_optional")
    });
  }
  if (type === "nosebleed") {
    return compact({
      ...base,
      nosebleed_side: optionalText(form, "nosebleed_side"),
      nosebleed_amount: optionalText(form, "nosebleed_amount"),
      nosebleed_duration_min: optionalNumber(form, "nosebleed_duration_min")
    });
  }
  if (type === "daily_summary") {
    return compact({
      ...base,
      summary_date: form.get("summary_date"),
      skin_redness: Number(form.get("skin_redness")),
      skin_scaling: Number(form.get("skin_scaling")),
      skin_itch: Number(form.get("skin_itch")),
      skin_area_change: Number(form.get("skin_area_change")),
      nasal_blockage: Number(form.get("nasal_blockage")),
      stress_peak: Number(form.get("stress_peak")),
      vegetable_count: optionalNumber(form, "vegetable_count"),
      fruit_count: optionalNumber(form, "fruit_count"),
      stress_note: optionalText(form, "stress_note")
    });
  }
  return compact({
    ...base,
    sleep_date: form.get("sleep_date"),
    sleep_duration_hours: Number(form.get("sleep_duration_hours")),
    night_awakenings: form.get("night_awakenings"),
    sleep_quality: Number(form.get("sleep_quality")),
    sleep_disruption: form.get("sleep_disruption"),
    bed_at: optionalText(form, "bed_at") ? new Date(String(form.get("bed_at"))).toISOString() : undefined,
    wake_at: optionalText(form, "wake_at") ? new Date(String(form.get("wake_at"))).toISOString() : undefined,
    sleep_latency_min: optionalNumber(form, "sleep_latency_min")
  });
}
