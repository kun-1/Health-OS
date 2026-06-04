import { expenseCategories, type ExpenseCategory } from "@/lib/expenses/types";

const palette: Record<ExpenseCategory, { color: string; emoji: string; label: string }> = {
  食物: { color: "#3b82f6", emoji: "🍎", label: "食物" },
  外食: { color: "#06b6d4", emoji: "🍜", label: "外食" },
  "饮料/咖啡": { color: "#6366f1", emoji: "☕", label: "饮料 / 咖啡" },
  日用品: { color: "#0ea5e9", emoji: "🧴", label: "日用品" },
  清洁用品: { color: "#8b5cf6", emoji: "🧹", label: "清洁用品" },
  个人护理: { color: "#d946ef", emoji: "💆", label: "个人护理" },
  "药品/医疗": { color: "#0891b2", emoji: "💊", label: "药品 / 医疗" },
  补剂: { color: "#0284c7", emoji: "💪", label: "补剂" },
  交通: { color: "#475569", emoji: "🚇", label: "交通" },
  居住: { color: "#64748b", emoji: "🏠", label: "居住" },
  娱乐: { color: "#c084fc", emoji: "🎬", label: "娱乐" },
  其他: { color: "#94a3b8", emoji: "📦", label: "其他" }
};

export function categoryMeta(name: ExpenseCategory) {
  return palette[name];
}

export function categoryColor(name: ExpenseCategory) {
  return palette[name]?.color ?? "#94a3b8";
}

export function categoryEmoji(name: ExpenseCategory) {
  return palette[name]?.emoji ?? "📦";
}

export function categoryLabel(name: ExpenseCategory) {
  return palette[name]?.label ?? name;
}

export const categoryNames = expenseCategories;
