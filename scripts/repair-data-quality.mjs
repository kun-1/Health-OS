import Database from "better-sqlite3";
import path from "node:path";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");

const ALIAS_FIXES = [
  ["黄喉", "动物性"],
  ["鸭血", "动物性"],
  ["鹅血", "动物性"],
  ["鸭肝", "动物性"],
  ["鸭肠", "动物性"],
  ["鸡心", "动物性"],
  ["鸡杂", "动物性"],
  ["墨鱼", "动物性"],
  ["花蛤", "动物性"],
  ["蚝", "动物性"],
  ["黑鱼", "动物性"],
  ["鱼籽", "动物性"],
  ["猪汤骨", "动物性"],
  ["猪腿肉", "动物性"],
  ["蘑菇", "蔬菜"],
  ["松茸", "蔬菜"],
  ["牛肝菌", "蔬菜"],
  ["裙带菜", "蔬菜"],
  ["贡菜", "蔬菜"],
  ["上海青", "蔬菜"],
  ["芋艿", "淀粉类蔬菜"],
  ["芦笋", "蔬菜"],
  ["沙葱", "蔬菜"],
  ["松花菜", "蔬菜"],
  ["雪菜", "蔬菜"],
  ["小葱", "香料"],
  ["小香葱", "香料"],
  ["香葱", "香料"],
  ["洋葱", "香料"],
  ["红洋葱", "香料"],
  ["大葱", "香料"],
  ["蒜", "香料"],
  ["干姜", "香料"],
  ["姜", "香料"],
  ["调料", "香料"],
  ["小龙虾调料", "香料"],
  ["火锅蘸料", "香料"],
  ["蘸料", "香料"],
  ["低钠盐", "香料"],
  ["二八酱", "坚果"],
  ["意大利面", "精制谷物"],
  ["恰巴塔", "精制谷物"],
  ["粽", "精制谷物"],
  ["花卷", "精制谷物"],
  ["吐司", "精制谷物"],
  ["面包", "精制谷物"],
  ["土豆", "淀粉类蔬菜"],
  ["红薯", "淀粉类蔬菜"],
  ["紫薯", "淀粉类蔬菜"],
  ["蜜薯", "淀粉类蔬菜"],
  ["南瓜", "淀粉类蔬菜"],
  ["山药", "淀粉类蔬菜"],
  ["蛋糕", "甜点"],
  ["Lady M", "甜点"],
  ["拿破仑", "甜点"],
  ["巴斯克", "甜点"]
];

const CATEGORY_MIGRATIONS = [
  ["土豆", "淀粉类蔬菜"],
  ["红薯", "淀粉类蔬菜"],
  ["紫薯", "淀粉类蔬菜"],
  ["蜜薯", "淀粉类蔬菜"],
  ["西瓜蜜薯", "淀粉类蔬菜"],
  ["南瓜", "淀粉类蔬菜"],
  ["贝贝南瓜", "淀粉类蔬菜"],
  ["芋艿", "淀粉类蔬菜"],
  ["山药", "淀粉类蔬菜"],
  ["洋葱", "香料"],
  ["红洋葱", "香料"],
  ["小香葱", "香料"],
  ["香葱", "香料"],
  ["小葱", "香料"],
  ["大葱", "香料"],
  ["蒜苗", "香料"],
  ["蒜苔", "香料"],
  ["蒜头", "香料"],
  ["大蒜", "香料"],
  ["蒜瓣", "香料"],
  ["意大利面", "精制谷物"],
  ["恰巴塔", "精制谷物"],
  ["花卷", "精制谷物"],
  ["葱油花卷", "精制谷物"],
  ["粽", "精制谷物"],
  ["面包", "精制谷物"],
  ["吐司", "精制谷物"],
  ["Lady M", "甜点"],
  ["蛋糕", "甜点"],
  ["拿破仑", "甜点"],
  ["巴斯克", "甜点"]
];

const LEGACY_CATEGORY_MIGRATIONS = [
  ["反式零食", "甜点"]
];

const MANUAL_ITEM_FIXES = [
  {
    id: 176,
    foodAmountValue: 500,
    foodAmountUnit: "ml",
    note: "manual_verified: 用户确认重量为500ml"
  },
  {
    id: 175,
    foodAmountValue: 200,
    foodAmountUnit: "g",
    note: "manual_verified: 用户确认重量为200g"
  },
  {
    id: 174,
    foodAmountValue: 120,
    foodAmountUnit: "g",
    note: "manual_verified: 用户确认重量为120g"
  },
  {
    id: 170,
    foodAmountValue: 300,
    foodAmountUnit: "g",
    note: "manual_verified: 用户确认重量为300g"
  },
  {
    id: 167,
    foodAmountValue: 550,
    foodAmountUnit: "g",
    note: "manual_verified: 用户确认重量为550g"
  },
  {
    id: 161,
    foodAmountValue: 130,
    foodAmountUnit: "g",
    note: "manual_verified: 用户确认重量为130g"
  },
  {
    id: 249,
    foodAmountValue: 100,
    foodAmountUnit: "g",
    note: "manual_estimated: Lady M单片蛋糕未找到可靠官方克重，暂按100g估算"
  },
  {
    id: 274,
    nameZh: "牛油果油",
    foodAmountValue: 2500,
    foodAmountUnit: "ml",
    note: "manual_verified: 用户纠正确认为2.5L牛油果油，按2500ml记录",
    replaceNotes: true
  },
  {
    id: 305,
    foodAmountValue: 500,
    foodAmountUnit: "g",
    note: "manual_verified: 用户确认重量为500g"
  }
];

function parseArgs(argv) {
  const args = {
    apply: false,
    dbPath: process.env.SQLITE_PATH ?? DEFAULT_DB_PATH
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--db") {
      args.dbPath = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run repair:data-quality -- [--apply] [--db data/app.db]

Dry-runs conservative data-quality repairs by default:
- insert known nutrition aliases
- parse weight/ml values from quantity + spec_text

Use --apply to write the fixes.`);
}

function quantityMultiplier(quantity) {
  const value = String(quantity ?? "").trim();
  if (!value) return 1;
  const xMatch = value.match(/^[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (xMatch) return Number(xMatch[1]);
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function normalizeUnit(unit) {
  const lower = unit.toLowerCase();
  if (lower === "kg") return { unit: "g", multiplier: 1000 };
  if (lower === "g") return { unit: "g", multiplier: 1 };
  if (lower === "l") return { unit: "ml", multiplier: 1000 };
  return { unit: "ml", multiplier: 1 };
}

function parseSpecAmount(specText, quantity) {
  const spec = String(specText ?? "").replace(/\s+/g, "");
  if (!spec) return null;

  const packed = spec.match(/(\d+(?:\.\d+)?)(kg|g|ml|l)[*xX×](\d+(?:\.\d+)?)/i);
  if (packed) {
    const normalized = normalizeUnit(packed[2]);
    return {
      value: round(Number(packed[1]) * normalized.multiplier * Number(packed[3])),
      unit: normalized.unit,
      source: "spec_text_pack_multiplier"
    };
  }

  const range = spec.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(kg|g|ml|l)/i);
  if (range) {
    const normalized = normalizeUnit(range[3]);
    return {
      value: round(((Number(range[1]) + Number(range[2])) / 2) * normalized.multiplier * quantityMultiplier(quantity)),
      unit: normalized.unit,
      source: "spec_text_range_midpoint"
    };
  }

  const single = spec.match(/(\d+(?:\.\d+)?)(kg|g|ml|l)/i);
  if (single) {
    const normalized = normalizeUnit(single[2]);
    return {
      value: round(Number(single[1]) * normalized.multiplier * quantityMultiplier(quantity)),
      unit: normalized.unit,
      source: "spec_text_single_amount"
    };
  }

  return null;
}

function round(value) {
  return Number(value.toFixed(2));
}

function mergeNote(existing, addition) {
  const marker = `[${addition}]`;
  if (!existing || existing.trim() === "") return marker;
  if (existing.includes(marker)) return existing;
  return `${existing}; ${marker}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(args.dbPath, { fileMustExist: true });
  if (!args.apply) {
    db.pragma("query_only = ON");
  }

  const now = new Date().toISOString();
  const aliasRows = ALIAS_FIXES.map(([rawPattern, category]) => ({ rawPattern, category }));
  const aliasExisting = db
    .prepare("SELECT raw_pattern AS rawPattern FROM nutrition_food_aliases WHERE raw_pattern = ?")
    .pluck();
  const aliasInsertions = aliasRows.filter((row) => aliasExisting.get(row.rawPattern) === undefined);
  const categoryMigrationRows = CATEGORY_MIGRATIONS.map(([rawPattern, category]) => ({
    rawPattern,
    category
  }));
  const selectAliasCategory = db.prepare(
    "SELECT raw_pattern AS rawPattern, category FROM nutrition_food_aliases WHERE raw_pattern = ?"
  );
  const categoryUpdates = categoryMigrationRows
    .map((row) => {
      const existing = selectAliasCategory.get(row.rawPattern);
      if (!existing || existing.category === row.category) return null;
      return { ...row, fromCategory: existing.category };
    })
    .filter(Boolean);
  const legacyCategoryRows = LEGACY_CATEGORY_MIGRATIONS.map(([fromCategory, toCategory]) => ({
    fromCategory,
    toCategory
  }));
  const legacyCategoryUpdates = legacyCategoryRows.map((row) => ({
    ...row,
    count: db
      .prepare("SELECT COUNT(*) AS count FROM nutrition_food_aliases WHERE category = ?")
      .get(row.fromCategory).count
  }));

  const items = db
    .prepare(
      `SELECT id, name_zh, category_zh, quantity, spec_text, food_amount_value, food_amount_unit
       FROM expense_items
       WHERE food_amount_value IS NULL
         AND spec_text IS NOT NULL
         AND trim(spec_text) <> ''
         AND category_zh IN ('食物', '饮料/咖啡', '外食')
       ORDER BY id`
    )
    .all();
  const weightUpdates = items
    .map((item) => {
      const parsed = parseSpecAmount(item.spec_text, item.quantity);
      if (!parsed) return null;
      return { ...item, parsed };
    })
    .filter(Boolean);
  const selectItem = db.prepare(
    "SELECT id, name_zh AS nameZh, food_amount_value AS foodAmountValue, food_amount_unit AS foodAmountUnit, notes FROM expense_items WHERE id = ?"
  );
  const manualUpdates = MANUAL_ITEM_FIXES.map((fix) => {
    const existing = selectItem.get(fix.id);
    if (!existing) return null;
    const next = {
      id: fix.id,
      nameZh: fix.nameZh ?? existing.nameZh,
      foodAmountValue: fix.foodAmountValue,
      foodAmountUnit: fix.foodAmountUnit,
      notes: fix.replaceNotes ? `[${fix.note}]` : mergeNote(existing.notes, fix.note),
      previous: existing
    };
    const changed =
      next.nameZh !== existing.nameZh ||
      next.foodAmountValue !== existing.foodAmountValue ||
      next.foodAmountUnit !== existing.foodAmountUnit ||
      next.notes !== existing.notes;
    return changed ? next : null;
  }).filter(Boolean);

  if (args.apply) {
    const insertAlias = db.prepare(
      `INSERT OR IGNORE INTO nutrition_food_aliases
       (raw_pattern, category, is_user_set, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`
    );
    const updateWeight = db.prepare(
      `UPDATE expense_items
       SET food_amount_value = ?, food_amount_unit = ?, updated_at = ?
       WHERE id = ? AND food_amount_value IS NULL`
    );
    const updateManualItem = db.prepare(
      `UPDATE expense_items
       SET name_zh = ?, food_amount_value = ?, food_amount_unit = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    );
    const updateAliasCategory = db.prepare(
      `UPDATE nutrition_food_aliases
       SET category = ?, is_user_set = 1, updated_at = ?
       WHERE raw_pattern = ? AND category <> ?`
    );
    const updateLegacyCategory = db.prepare(
      `UPDATE nutrition_food_aliases
       SET category = ?, is_user_set = 1, updated_at = ?
       WHERE category = ?`
    );

    const run = db.transaction(() => {
      for (const row of aliasInsertions) {
        insertAlias.run(row.rawPattern, row.category, now, now);
      }
      for (const row of categoryUpdates) {
        updateAliasCategory.run(row.category, now, row.rawPattern, row.category);
      }
      for (const row of legacyCategoryUpdates) {
        updateLegacyCategory.run(row.toCategory, now, row.fromCategory);
      }
      for (const row of weightUpdates) {
        updateWeight.run(row.parsed.value, row.parsed.unit, now, row.id);
      }
      for (const row of manualUpdates) {
        updateManualItem.run(
          row.nameZh,
          row.foodAmountValue,
          row.foodAmountUnit,
          row.notes,
          now,
          row.id
        );
      }
    });
    run();
  }

  console.log(args.apply ? "Applied data-quality repairs." : "Dry-run data-quality repairs.");
  console.log(`Aliases to insert: ${aliasInsertions.length}`);
  for (const row of aliasInsertions) {
    console.log(`  ${row.rawPattern} -> ${row.category}`);
  }
  console.log(`Alias categories to update: ${categoryUpdates.length}`);
  for (const row of categoryUpdates) {
    console.log(`  ${row.rawPattern}: ${row.fromCategory} -> ${row.category}`);
  }
  console.log(`Legacy category rows to update: ${legacyCategoryUpdates.reduce((sum, row) => sum + row.count, 0)}`);
  for (const row of legacyCategoryUpdates) {
    if (row.count > 0) {
      console.log(`  ${row.fromCategory} -> ${row.toCategory}: ${row.count}`);
    }
  }
  console.log(`Weight rows to update: ${weightUpdates.length}`);
  for (const row of weightUpdates) {
    console.log(
      `  #${row.id} ${row.name_zh}: ${row.spec_text} / ${row.quantity ?? ""} -> ${row.parsed.value}${row.parsed.unit} (${row.parsed.source})`
    );
  }
  console.log(`Manual item rows to update: ${manualUpdates.length}`);
  for (const row of manualUpdates) {
    console.log(
      `  #${row.id} ${row.previous.nameZh} -> ${row.nameZh}, ${row.previous.foodAmountValue ?? "null"}${row.previous.foodAmountUnit ?? ""} -> ${row.foodAmountValue}${row.foodAmountUnit}`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
