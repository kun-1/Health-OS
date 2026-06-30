// Stage 1 nutrition scoring: "rainbow diet" colour signals for vegetables
// and fruits. Maps a Chinese food substring to one of 6 colour buckets,
// matching the longest pattern (so `青苹果` wins over `苹果`).
//
// The list is intentionally hardcoded for now — it's small and stable
// (≈80 entries covering the common Chinese produce aisle). If the user
// later wants per-row overrides we can promote this to a DB table the
// same way `nutrition_food_aliases` works.
//
// Yellow + orange are merged into one bucket ("黄绿") because nutritionally
// they share the same carotenoid story; the UI shows them as a single row.

export type RainbowColor = "红" | "黄绿" | "绿" | "紫蓝" | "白" | "黑棕";

export const rainbowColors: ReadonlyArray<RainbowColor> = [
  "红",
  "黄绿",
  "绿",
  "紫蓝",
  "白",
  "黑棕"
];

// Sorted by insertion order — iteration finds the longest match, so order
// here is for readability, not correctness.
const COLOR_RULES: ReadonlyArray<[string, RainbowColor]> = [
  // 红 — 番茄红素 / 花青素
  ["番茄", "红"],
  ["西红柿", "红"],
  ["红椒", "红"],
  ["红心火龙果", "红"],
  ["西瓜", "红"],
  ["樱桃", "红"],
  ["车厘子", "红"],
  ["草莓", "红"],
  ["蔓越莓", "红"],
  ["树莓", "红"],
  ["红提", "红"],
  ["红苹果", "红"],
  ["苹果", "红"],
  ["红洋葱", "红"],
  ["红萝卜", "红"],
  ["甜菜", "红"],
  ["红心红薯", "红"],

  // 黄绿 — 胡萝卜素
  ["胡萝卜", "黄绿"],
  ["南瓜", "黄绿"],
  ["贝贝南瓜", "黄绿"],
  ["黄椒", "黄绿"],
  ["玉米", "黄绿"],
  ["小米", "黄绿"],
  ["小米椒", "黄绿"],
  ["香蕉", "黄绿"],
  ["芒果", "黄绿"],
  ["木瓜", "黄绿"],
  ["橙子", "黄绿"],
  ["橘子", "黄绿"],
  ["砂糖橘", "黄绿"],
  ["蜜橘", "黄绿"],
  ["柚子", "黄绿"],
  ["柠檬", "黄绿"],
  ["菠萝", "黄绿"],
  ["凤梨", "黄绿"],
  ["柿子", "黄绿"],
  ["哈密瓜", "黄绿"],
  ["杏", "黄绿"],
  ["金枕榴莲", "黄绿"],
  ["榴莲", "黄绿"],
  ["黄豆", "黄绿"],

  // 绿 — 叶绿素 / 叶酸
  ["西兰花", "绿"],
  ["菠菜", "绿"],
  ["生菜", "绿"],
  ["油麦菜", "绿"],
  ["芹菜", "绿"],
  ["韭菜", "绿"],
  ["莴苣", "绿"],
  ["苦瓜", "绿"],
  ["黄瓜", "绿"],
  ["丝瓜", "绿"],
  ["秋葵", "绿"],
  ["青椒", "绿"],
  ["青苹果", "绿"],
  ["猕猴桃", "绿"],
  ["奇异果", "绿"],
  ["牛油果", "绿"],
  ["芦笋", "绿"],
  ["豌豆", "绿"],
  ["四季豆", "绿"],
  ["荷兰豆", "绿"],
  ["卷心菜", "绿"],
  ["青甘蓝", "绿"],
  ["包菜", "绿"],
  ["油菜", "绿"],
  ["小白菜", "绿"],
  ["青菜", "绿"],
  ["绿豆", "绿"],
  ["青豆", "绿"],
  ["佛手瓜", "绿"],

  // 紫蓝 — 花青素
  ["紫薯", "紫蓝"],
  ["茄子", "紫蓝"],
  ["蓝莓", "紫蓝"],
  ["葡萄", "紫蓝"],
  ["提子", "紫蓝"],
  ["紫甘蓝", "紫蓝"],
  ["桑葚", "紫蓝"],
  ["黑莓", "紫蓝"],
  ["李子", "紫蓝"],
  ["西梅", "紫蓝"],
  ["无花果", "紫蓝"],

  // 白 — 硫化合物 / 抗氧化
  ["白蘑菇", "白"],
  ["蘑菇", "白"],
  ["杏鲍菇", "白"],
  ["金针菇", "白"],
  ["蟹味菇", "白"],
  ["香菇", "白"],
  ["平菇", "白"],
  ["鲜香菇", "白"],
  ["白菜", "白"],
  ["大白菜", "白"],
  ["娃娃菜", "白"],
  ["白萝卜", "白"],
  ["洋葱", "白"],
  ["蒜", "白"],
  ["大蒜", "白"],
  ["姜", "白"],
  ["老姜", "白"],
  ["生姜", "白"],
  ["莲藕", "白"],
  ["山药", "白"],
  ["茭白", "白"],
  ["豆腐", "白"],
  ["白芝麻", "白"],
  ["梨", "白"],
  ["雪梨", "白"],
  ["鸭梨", "白"],
  ["椰子水", "白"],

  // 黑棕 — 多酚 / 铁
  ["黑木耳", "黑棕"],
  ["木耳", "黑棕"],
  ["黑豆", "黑棕"],
  ["黑芝麻", "黑棕"],
  ["黑米", "黑棕"],
  ["海带", "黑棕"],
  ["海带苗", "黑棕"],
  ["紫菜", "黑棕"],
  ["黑胡椒", "黑棕"],
  ["黑麦", "黑棕"],
  ["红米", "黑棕"],
  ["全麦", "黑棕"]
];

export function colorOf(nameZh: string): RainbowColor | null {
  let bestPattern: string | null = null;
  let bestColor: RainbowColor | null = null;
  for (const [pattern, color] of COLOR_RULES) {
    if (!nameZh.includes(pattern)) continue;
    if (!bestPattern || pattern.length > bestPattern.length) {
      bestPattern = pattern;
      bestColor = color;
    }
  }
  return bestColor;
}

export type ColorCounts = Record<RainbowColor, number>;

export function emptyColorCounts(): ColorCounts {
  return { 红: 0, 黄绿: 0, 绿: 0, 紫蓝: 0, 白: 0, 黑棕: 0 };
}