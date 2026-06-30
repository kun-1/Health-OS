import { expenseCategories, type ExpenseCategory } from "@/lib/expenses/types";

const palette: Record<ExpenseCategory, { color: string; emoji: string; label: string }> = {
  食物: { color: "#4F6EF7", emoji: "🍎", label: "食物" },
  外食: { color: "#F5A623", emoji: "🍜", label: "外食" },
  "饮料/咖啡": { color: "#E14B3A", emoji: "☕", label: "饮料 / 咖啡" },
  日用品: { color: "#2CA02C", emoji: "🧴", label: "日用品" },
  清洁用品: { color: "#9467BD", emoji: "🧹", label: "清洁用品" },
  个人护理: { color: "#17BECF", emoji: "💆", label: "个人护理" },
  "药品/医疗": { color: "#8C564B", emoji: "💊", label: "药品 / 医疗" },
  补剂: { color: "#BCBD22", emoji: "💪", label: "补剂" },
  交通: { color: "#6B6B6B", emoji: "🚇", label: "交通" },
  居住: { color: "#AEC7E8", emoji: "🏠", label: "居住" },
  娱乐: { color: "#FF9DA6", emoji: "🎬", label: "娱乐" },
  其他: { color: "#C49C94", emoji: "📦", label: "其他" }
};

// Wave 3: the item schema can now return non-canonical category strings
// (e.g. "服装" — the model's raw guess that didn't match any alias or
// canonical entry). We accept `string` here and fall back to the "其他"
// palette entry for color/emoji; the label helper returns the raw string
// so the user sees what the model actually said.
export function categoryMeta(name: string) {
  return palette[name as ExpenseCategory] ?? palette["其他"];
}

export function categoryColor(name: string) {
  return palette[name as ExpenseCategory]?.color ?? "#C49C94";
}

export function categoryEmoji(name: string) {
  return palette[name as ExpenseCategory]?.emoji ?? "📦";
}

export function categoryLabel(name: string) {
  return palette[name as ExpenseCategory]?.label ?? name;
}

export const categoryNames = expenseCategories;