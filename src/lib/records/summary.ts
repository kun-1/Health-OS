import type { TimelineRecord } from "@/lib/records/types";

const typeLabels = {
  meal: "餐食",
  supplement: "补剂",
  post_meal_symptom: "餐后反应",
  bowel: "排便",
  water: "饮水",
  nosebleed: "流鼻血",
  daily_summary: "睡前总结",
  sleep: "睡眠"
};

function value(payload: Record<string, unknown>, key: string) {
  return payload[key];
}

function notes(payload: Record<string, unknown>) {
  const raw = typeof payload.notes === "string" ? payload.notes.trim() : "";
  if (!raw) {
    return "";
  }
  return `；备注：${raw.length > 60 ? `${raw.slice(0, 60)}...` : raw}`;
}

function textList(items: unknown) {
  if (!Array.isArray(items)) {
    return "";
  }

  const methodLabels: Record<string, string> = {
    steam: "蒸",
    boil: "煮",
    stir_fry: "炒",
    deep_fry: "炸",
    bake: "烤",
    raw: "生",
    eat_out: "外食",
    unknown: "做法不明"
  };

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const name = "name" in item && typeof item.name === "string" ? item.name : "";
      const method =
        "method" in item && typeof item.method === "string" && methodLabels[item.method]
          ? `（${methodLabels[item.method]}）`
          : "";
      return name.trim() ? `${name.trim()}${method}` : "";
    })
    .filter(Boolean)
    .join("、");
}

export function summarizeRecord(record: TimelineRecord): string {
  const payload = record.payload;

  switch (record.type) {
    case "meal": {
      const food = typeof payload.food_text_raw === "string" && payload.food_text_raw.trim()
        ? payload.food_text_raw.trim()
        : textList(payload.food_items) || "未填写食材";
      return `${typeLabels.meal}：${food}；饥饿 ${value(payload, "hunger_before")}，压力 ${value(
        payload,
        "stress_before"
      )}${notes(payload)}`;
    }
    case "supplement":
      return `${typeLabels.supplement}：${value(payload, "supplement_name") ?? ""}${
        value(payload, "dose_text") ? ` ${value(payload, "dose_text")}` : ""
      }${notes(payload)}`;
    case "post_meal_symptom":
      return `${typeLabels.post_meal_symptom}：腹胀 ${value(payload, "post_meal_2h_bloating") ?? "未记录"}，腹痛 ${
        value(payload, "post_meal_2h_pain") ?? "未记录"
      }${notes(payload)}`;
    case "bowel":
      return `${typeLabels.bowel}：Bristol ${value(payload, "bristol_type")}，费力 ${value(
        payload,
        "strain_level"
      )}${value(payload, "blood_or_black_stool") === true ? "；血便/黑便已标记" : ""}${notes(payload)}`;
    case "water":
      return `${typeLabels.water}：${value(payload, "amount_ml")} ml${
        value(payload, "drink_type") ? `，${value(payload, "drink_type")}` : ""
      }${notes(payload)}`;
    case "nosebleed":
      return `${typeLabels.nosebleed}：${value(payload, "nosebleed_side") ?? "未填侧别"}${
        value(payload, "nosebleed_amount") ? `，${value(payload, "nosebleed_amount")}` : ""
      }${notes(payload)}`;
    case "daily_summary":
      return `${typeLabels.daily_summary}：红斑 ${value(payload, "skin_redness")}，鳞屑 ${value(
        payload,
        "skin_scaling"
      )}，瘙痒 ${value(payload, "skin_itch")}，鼻塞 ${value(payload, "nasal_blockage")}${notes(payload)}`;
    case "sleep":
      return `${typeLabels.sleep}：${value(payload, "sleep_duration_hours")}h，夜醒 ${value(
        payload,
        "night_awakenings"
      )}，质量 ${value(payload, "sleep_quality")}${notes(payload)}`;
    default:
      return "记录";
  }
}
