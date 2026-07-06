import { readFileSync, writeFileSync } from "node:fs";

const score = JSON.parse(readFileSync("/tmp/score.json", "utf8"));
const trend = JSON.parse(readFileSync("/tmp/trend.json", "utf8"));

function clampScore(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function structureScore(report) {
  const pdiPct = report.pdi.max > 0 ? (report.pdi.total / report.pdi.max) * 100 : 0;
  const aheiPct = report.ahei.max > 0 ? (report.ahei.total / report.ahei.max) * 100 : 0;
  const platePenalty = report.plate.deviation * 18;
  const upfPenalty = report.upf.upfShare * 16;
  return clampScore((pdiPct + aheiPct) / 2 - platePenalty - upfPenalty + 18);
}

function describeScore(s) {
  if (s >= 80) return "整体良好";
  if (s >= 65) return "中等偏稳";
  return "需要优先调整结构";
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

const scoreVal = structureScore(score);
const coverageVal = Math.round(score.coveragePct * 100);
const skipVal = Object.values(score.skipBreakdown).reduce((a, b) => a + b, 0);
const statusText = describeScore(scoreVal);

const rainbowColors = ["红", "黄绿", "绿", "紫蓝", "白", "黑棕"];
const rainbowHit = rainbowColors.filter((c) => (score.colorCounts[c] ?? 0) > 0).length;

const bullets = [
  {
    name: "蔬果",
    value: Math.round(score.plate.ratios.vegFruit * 100),
    min: 30,
    max: 50,
    color: "var(--green)",
  },
  {
    name: "优质蛋白",
    value: Math.round(score.plate.ratios.protein * 100),
    min: 20,
    max: 30,
    color: "var(--blue)",
  },
  {
    name: "全谷物",
    value: Math.round(score.plate.ratios.wholeGrain * 100),
    min: 20,
    max: 30,
    color: "var(--yellow)",
  },
  {
    name: "超加工",
    value: Math.round(score.upf.upfShare * 100),
    min: 0,
    max: 10,
    color: "var(--red)",
  },
  {
    name: "添加糖",
    value: Math.round(
      (score.ahei.breakdown["含糖饮料"].gramsThisPeriod / Math.max(score.upf.totalWeight, 1)) * 100
    ),
    min: 0,
    max: 5,
    color: "#9aa3ad",
  },
];

const recommendations = [
  {
    title: "增加全谷物摄入",
    body: `当前全谷占比 ${pct(score.plate.ratios.wholeGrain)}，目标靠近 20% - 30%。`,
    tone: score.plate.ratios.wholeGrain >= 0.2 ? "good" : score.plate.ratios.wholeGrain >= 0.1 ? "warn" : "bad",
  },
  {
    title: "控制超加工食品",
    body: `超加工占比 ${pct(score.upf.upfShare)}，继续压低加工肉、含糖饮料和反式零食。`,
    tone: score.upf.grade === "好" ? "good" : score.upf.grade === "可" ? "warn" : "bad",
  },
  {
    title: "保持蔬果多样性",
    body: `彩虹饮食覆盖 ${rainbowHit} / ${rainbowColors.length} 个颜色。`,
    tone: "good",
  },
];

const CATEGORY_LABELS = {
  蔬菜: "蔬菜",
  水果: "水果",
  全谷物: "全谷物",
  豆类: "豆类",
  坚果: "坚果",
  香料: "香料",
  动物性: "优质蛋白",
  油脂: "油脂",
  含糖饮料: "含糖饮料",
  加工肉: "加工肉",
  反式零食: "反式零食",
  未分类: "未分类",
};

const drillGroups = Object.entries(score.topByCategory)
  .map(([cat, items]) => ({
    cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: items.slice(0, 3),
    total: items.reduce((s, it) => s + (it.grams || 0), 0),
  }))
  .filter((g) => g.items.length > 0)
  .sort((a, b) => b.total - a.total)
  .slice(0, 5);

function makeTrendRows(months) {
  return months.map((month) => {
    const grams = month.grams;
    const veg = (grams["蔬菜"] || 0) + (grams["水果"] || 0);
    const protein = (grams["豆类"] || 0) + (grams["坚果"] || 0) + (grams["动物性"] || 0);
    const whole = grams["全谷物"] || 0;
    const bad = (grams["加工肉"] || 0) + (grams["含糖饮料"] || 0) + (grams["反式零食"] || 0);
    const total = Object.values(grams).reduce((s, n) => s + n, 0) || 1;
    const s = clampScore(
      58 + (veg / total) * 30 + (protein / total) * 12 + (whole / total) * 14 - (bad / total) * 24
    );
    return { period: month.period, label: month.period.slice(5), score: s };
  });
}

const rows = makeTrendRows(trend.months);

function makeAreaPath(rows) {
  const w = 800;
  const h = 220;
  const padX = 40;
  const padTop = 20;
  const padBottom = 40;
  const graphH = h - padTop - padBottom;
  const n = rows.length;
  const step = (w - padX * 2) / (n - 1);
  const points = rows.map((r, i) => {
    const x = padX + i * step;
    const y = padTop + graphH * (1 - r.score / 100);
    return { x, y, label: r.label, score: r.score };
  });

  const topPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${topPath} L${points[points.length - 1].x.toFixed(1)} ${h - padBottom} L${points[0].x.toFixed(1)} ${h - padBottom} Z`;

  const dots = points
    .map(
      (p, i) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === n - 1 ? "5" : "4"}" fill="${
          i === n - 1 ? "#fff" : "#7be027"
        }" stroke="#7be027" stroke-width="${i === n - 1 ? "2.5" : "0"}" />`
    )
    .join("");

  const labels = points
    .map(
      (p) =>
        `<text x="${p.x.toFixed(1)}" y="${h - 16}" fill="#6b7280" font-size="12" text-anchor="middle">${p.label}月</text>`
    )
    .join("");

  return { areaPath, topPath, dots, labels };
}

const chart = makeAreaPath(rows);

function renderBullet(b) {
  const inRange = b.value >= b.min && b.value <= b.max;
  const diff = b.value < b.min ? b.min - b.value : b.value - b.max;
  const status = inRange
    ? `<span class="ok">在区间内</span>`
    : `<span class="gap">${b.value < b.min ? "偏低" : "偏高"} ${diff}%</span>`;
  return `
    <div class="bullet">
      <div class="bullet-head"><span>${b.name}</span><strong>${b.value}%</strong></div>
      <div class="bullet-track">
        <span class="bullet-range" style="left:${b.min}%; width:${b.max - b.min}%; background:${b.color};"></span>
        <span class="bullet-marker" style="left:${Math.min(100, Math.max(0, b.value))}%; border-color:${b.color};"></span>
      </div>
      <div class="bullet-foot"><small>目标 ${b.min}% - ${b.max}%</small>${status}</div>
    </div>
  `;
}

function renderCheck(item) {
  const tagClass = item.tone === "bad" ? "high" : item.tone === "warn" ? "mid" : "";
  const tagText = item.tone === "bad" ? "优先级 高" : item.tone === "warn" ? "优先级 中" : "优先级 低";
  return `
    <li class="check-item">
      <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
      </svg>
      <div>
        <div class="check-title">${item.title}</div>
        <div class="check-body">${item.body}</div>
      </div>
      <span class="check-tag ${tagClass}">${tagText}</span>
    </li>
  `;
}

function renderDrillCard(g) {
  const rows = g.items
    .map(
      (it) => `
        <div class="drill-row">
          <span>${it.name}</span>
          <small>${Math.round(it.grams)} g</small>
        </div>
      `
    )
    .join("");
  return `
    <div class="drill-card">
      <strong>${g.label}</strong>
      ${rows}
    </div>
  `;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>营养模块布局方案（真实数据）</title>
  <style>
    :root {
      --bg: #f6f7f8;
      --shell: #ffffff;
      --card: #ffffff;
      --card-soft: #f4f5f6;
      --border: rgba(15, 23, 42, 0.08);
      --text: #0f172a;
      --muted: #6b7280;
      --subtle: #9aa3ad;
      --green: #9BFD44;
      --green-ink: #1a4d22;
      --green-soft: rgba(155, 253, 68, 0.18);
      --blue: #60a5fa;
      --blue-soft: rgba(96, 165, 250, 0.18);
      --yellow: #f5b833;
      --yellow-soft: rgba(245, 184, 51, 0.18);
      --red: #ff6b6b;
      --red-soft: rgba(255, 107, 107, 0.12);
      --radius: 16px;
      --shadow: 0 8px 28px rgba(15, 23, 42, 0.05);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    .shell {
      display: grid;
      grid-template-columns: 220px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      background: var(--shell);
      border-right: 1px solid var(--border);
      padding: 22px 14px;
    }
    .brand { display: flex; align-items: center; gap: 12px; padding: 6px 10px 24px; }
    .brand-logo {
      width: 38px; height: 38px; border-radius: 11px;
      background: linear-gradient(135deg, var(--green) 0%, #7be027 100%);
      display: grid; place-items: center;
      color: var(--green-ink); font-weight: 800; font-size: 18px;
    }
    .brand-name { font-size: 1.04rem; font-weight: 800; }
    .brand-tagline { font-size: 0.72rem; color: var(--muted); margin-top: 2px; }
    .nav-label { font-size: 0.7rem; color: var(--subtle); font-weight: 700; letter-spacing: 0.06em; padding: 8px 12px 6px; text-transform: uppercase; }
    .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; font-weight: 600; color: var(--text); margin-bottom: 2px; }
    .nav-item.active { background: linear-gradient(180deg, rgba(155,253,68,0.22) 0%, rgba(155,253,68,0.14) 100%); color: var(--green-ink); box-shadow: inset 0 0 0 1px rgba(155,234,61,0.35); }
    .nav-icon { width: 19px; height: 19px; color: var(--muted); }
    .nav-item.active .nav-icon { color: var(--green-ink); }

    .main { display: grid; grid-template-rows: 64px 1fr; min-width: 0; }
    .topbar {
      background: var(--shell); border-bottom: 1px solid var(--border);
      padding: 0 32px; display: flex; align-items: center; gap: 18px;
    }
    .topbar-title { font-size: 1.1rem; font-weight: 800; }
    .topbar-subtitle { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
    .spacer { flex: 1; }
    .month-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border);
      background: var(--card); font-size: 0.84rem; font-weight: 700;
    }

    .content { padding: 28px 36px 40px; }

    .card {
      background: var(--card); border-radius: var(--radius);
      box-shadow: var(--shadow); padding: 18px; min-width: 0;
      display: flex; flex-direction: column;
    }
    .section-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 14px; flex-shrink: 0;
    }
    .eyebrow {
      color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.01em;
      margin: 0 0 6px; text-transform: uppercase;
    }
    h2 { font-size: 1.05rem; font-weight: 800; margin: 0; line-height: 1.2; }
    .hint { font-size: 0.72rem; color: var(--subtle); font-weight: 600; }

    /* KPIs */
    .kpis {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;
      margin-bottom: 18px;
    }
    .kpi { display: flex; align-items: center; gap: 14px; min-height: 112px; }
    .kpi-value { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
    .kpi-label { font-size: 0.78rem; color: var(--muted); font-weight: 700; margin-top: 6px; }
    .kpi-ring { width: 56px; height: 56px; flex-shrink: 0; }
    .pill {
      display: inline-flex; align-items: center;
      background: var(--green-soft); color: var(--green-ink);
      border-radius: 999px; font-size: 0.78rem; font-weight: 700; padding: 6px 12px; margin-top: 8px;
    }

    /* Body: strict 2x2 aligned grid */
    .body-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr);
      grid-template-rows: auto auto;
      gap: 18px;
      align-items: stretch;
    }

    .chart-wrap { flex: 1; min-height: 0; }

    /* Bullet compact */
    .bullet { display: grid; gap: 8px; }
    .bullet + .bullet { margin-top: 14px; }
    .bullet-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.84rem; }
    .bullet-head strong { font-size: 1.05rem; }
    .bullet-track {
      height: 7px; border-radius: 999px; background: var(--card-soft); position: relative; overflow: visible;
    }
    .bullet-range { position: absolute; top: 0; height: 100%; border-radius: 999px; opacity: 0.45; }
    .bullet-marker {
      position: absolute; top: -3.5px; width: 14px; height: 14px; border-radius: 50%;
      background: #fff; border: 3px solid; box-shadow: 0 1px 4px rgba(15,23,42,0.18);
      transform: translateX(-50%); z-index: 2;
    }
    .bullet-foot { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--muted); }
    .bullet-foot .ok { color: var(--green-ink); font-weight: 700; }
    .bullet-foot .gap { color: var(--red); font-weight: 700; }

    /* Checklist */
    .checklist { list-style: none; margin: 0; padding: 0; }
    .check-item {
      display: grid; grid-template-columns: 22px 1fr auto; gap: 10px;
      align-items: flex-start; padding: 11px 0; border-top: 1px solid var(--border);
    }
    .check-item:first-child { border-top: none; padding-top: 0; }
    .check-icon { color: var(--green-ink); width: 22px; height: 22px; }
    .check-title { font-size: 0.86rem; font-weight: 700; }
    .check-body { font-size: 0.76rem; color: var(--muted); line-height: 1.4; margin-top: 2px; }
    .check-tag {
      font-size: 0.68rem; font-weight: 700; padding: 3px 8px; border-radius: 999px;
      border: 1px solid var(--border); color: var(--muted); white-space: nowrap;
    }
    .check-tag.high { background: var(--red-soft); border-color: rgba(255,107,107,0.25); color: var(--red); }
    .check-tag.mid { background: var(--yellow-soft); border-color: rgba(245,184,51,0.25); color: #b45309; }

    /* Drill grid */
    .drill-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .drill-card {
      background: var(--card-soft); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px;
    }
    .drill-card strong { font-size: 0.84rem; display: block; margin-bottom: 8px; }
    .drill-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text); }
    .drill-row small { color: var(--muted); font-weight: 600; }

    @media (max-width: 1100px) {
      .body-grid { grid-template-columns: 1fr; grid-template-rows: auto; }
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .drill-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo">⌘</div>
        <div>
          <div class="brand-name">Life OS</div>
          <div class="brand-tagline">Personal command center</div>
        </div>
      </div>
      <div class="nav-label">主模块</div>
      <div class="nav-item">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
        <span>总览</span>
      </div>
      <div class="nav-item active">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        <span>营养</span>
      </div>
      <div class="nav-item">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 12v5h16a2 2 0 0 1 0 4H3v-4"/></svg>
        <span>支出</span>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div>
          <div class="topbar-title">营养 · 结构诊断</div>
          <div class="topbar-subtitle">2026 年 6 月 · 周一</div>
        </div>
        <div class="spacer"></div>
        <div class="month-chip">2026-06 ▾</div>
      </header>

      <main class="content">
        <!-- KPIs -->
        <div class="kpis">
          <div class="card kpi">
            <svg class="kpi-ring" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--card-soft)" stroke-width="5" />
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--green)" stroke-width="5" stroke-linecap="round"
                stroke-dasharray="150.8 150.8" stroke-dashoffset="${150.8 * (1 - scoreVal / 100)}" transform="rotate(-90 28 28)" />
            </svg>
            <div>
              <div class="kpi-value">${scoreVal}</div>
              <div class="kpi-label">综合质量</div>
            </div>
          </div>
          <div class="card kpi">
            <div>
              <div class="kpi-value">${coverageVal}%</div>
              <div class="kpi-label">质量覆盖</div>
            </div>
          </div>
          <div class="card kpi">
            <div>
              <div class="kpi-value">${skipVal}</div>
              <div class="kpi-label">待补记录</div>
            </div>
          </div>
          <div class="card kpi" style="flex-direction:column; align-items:flex-start; justify-content:center;">
            <div class="kpi-label">状态评估</div>
            <div class="pill">${statusText}</div>
          </div>
        </div>

        <div class="body-grid">
          <!-- Row 1 -->
          <div class="card">
            <div class="section-head">
              <div>
                <div class="eyebrow">趋势分析</div>
                <h2>近 6 个月营养质量走势</h2>
              </div>
              <div class="hint">悬停查看当月诊断</div>
            </div>
            <div class="chart-wrap">
              <svg width="100%" height="100%" viewBox="0 0 800 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stop-color="#9BFD44" stop-opacity="0.32"/>
                    <stop offset="95%" stop-color="#9BFD44" stop-opacity="0.02"/>
                  </linearGradient>
                </defs>
                <line x1="40" y1="20" x2="760" y2="20" stroke="rgba(15,23,42,0.06)" stroke-dasharray="3 6"/>
                <line x1="40" y1="80" x2="760" y2="80" stroke="rgba(15,23,42,0.06)" stroke-dasharray="3 6"/>
                <line x1="40" y1="140" x2="760" y2="140" stroke="rgba(15,23,42,0.06)" stroke-dasharray="3 6"/>
                <path d="${chart.areaPath}" fill="url(#area)"/>
                <path d="${chart.topPath}" fill="none" stroke="#7be027" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                ${chart.dots}
                ${chart.labels}
              </svg>
            </div>
          </div>

          <div class="card">
            <div class="section-head">
              <div>
                <div class="eyebrow">结构诊断</div>
                <h2>饮食结构 vs 目标区间</h2>
              </div>
            </div>
            ${bullets.map(renderBullet).join("")}
          </div>

          <!-- Row 2 -->
          <div class="card">
            <div class="section-head">
              <div>
                <div class="eyebrow">来源明细</div>
                <h2>按类别查看主要食材</h2>
              </div>
            </div>
            <div class="drill-grid">
              ${drillGroups.map(renderDrillCard).join("")}
            </div>
          </div>

          <div class="card">
            <div class="section-head">
              <div>
                <div class="eyebrow">下一步建议</div>
                <h2>只保留三件值得做的事</h2>
              </div>
            </div>
            <ul class="checklist">
              ${recommendations.map(renderCheck).join("")}
            </ul>
          </div>
        </div>
      </main>
    </div>
  </div>
</body>
</html>
`;

writeFileSync("nutrition-layout-prototype.html", html, "utf8");
console.log("Wrote nutrition-layout-prototype.html");
