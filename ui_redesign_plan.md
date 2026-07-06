# Life OS UI Redesign Plan

日期: 2026-06-30
状态: draft for review

## 0. 目标

把当前 Health Monitor 改名并重塑为 `Life OS`。

这不是一次小修 UI，而是一次产品形象重做: 首页和主要模块都要从“功能页面集合”变成一个强数据感的个人生活控制台。视觉参考强制复刻用户提供的 Dribbble 参考方向: 浅色 command center、左侧固定导航、顶部工具栏、模块化数据卡、图表、日历/活动侧栏、绿色高亮和干净的商业仪表盘质感。

当前第一阶段只关注桌面 Web。移动端暂不作为主约束，只要求后续不被桌面实现彻底卡死。

## 0.1 参考材料

参考网站:

- Dribbble: https://dribbble.com/shots/27178040-Sales-Analytics-Business-Command-Center

本地参考图:

- `references/life-os-command-center-reference.png`

使用规则:

- 实现和 QA 时必须把该参考图作为视觉真相来源。
- 参考网站用于理解原始设计语境；如果网站内容不可访问或发生变化，以本地参考图为准。
- 后续截图对比应至少覆盖 1440px 桌面视口，把 Life OS 首页截图和本地参考图并排检查。

## 1. 产品定位

新名称: `Life OS`

核心叙事:

> Life OS 是一个个人营养、支出和生活数据的指挥台。它不只是记录事实，而是把今天的状态、近期趋势、异常信号和下一步行动放到同一屏。

第一阶段包含三类信息:

- 营养评分: 作为首页最重要的健康状态指标。
- 今日支出: 作为首页第二个稳定指标，来自现有 expenses 数据。
- 支出与营养趋势洞察: 把“花了多少钱”和“买了什么食物/营养结构如何变化”放在同一张趋势叙事里。

暂不承诺:

- 医学诊断。
- 自动治疗建议。
- 手机端体验完全重做。
- 大模型自动健康结论。

## 2. 参考图复刻要求

参考图不是灵感来源，而是第一版视觉目标。

必须复刻:

- 左侧固定 sidebar: logo、主导航、分组图标、底部 help/settings。
- 顶部 bar: welcome 文案、搜索/日期选择、导出、圆形图标按钮。
- 首页主画布: 左侧大内容区 + 右侧窄侧栏。
- KPI 卡片: 白底、8px 左右圆角、细边框、局部浅绿高亮、超大数字。
- 图表风格: 浅灰网格、圆角柱状图、柔和橙/绿/蓝/紫。
- 日历/活动卡: 右侧独立模块，日期圆点和强对比选中态。
- 视觉密度: 信息要多但不乱，保持商业 dashboard 的扫描效率。
- 字体层级: 大数字优先，标题短，说明文字小而灰。

必须避免:

- 继续使用当前 nutrition 的深色霓虹风格作为主视觉。
- 使用大面积深色背景、渐变光斑、装饰性 hero。
- 做成营销页。
- 把所有信息塞进同尺寸卡片，导致没有主次。
- 做假的可点击筛选器。无真实状态时显示为静态 chip。

## 3. 当前数据基础

### 3.1 营养评分

当前已有 `GET /api/nutrition/score?period=YYYY-MM`，核心实现在 `src/lib/nutrition/score.ts`。

它返回四类营养报告:

- `pdi`: 简化版植物性饮食指数。按蔬菜、水果、全谷物、豆类、坚果、香料等月度重量达成度计分。
- `plate`: Harvard Healthy Eating Plate 风格的餐盘结构。把蔬果、全谷物、蛋白、其他计算成占比，并和 50% / 25% / 25% 的理想结构比较。
- `upf`: 超加工占比。把含糖饮料、加工肉、反式零食等作为 UPF 类别，计算重量占比。
- `ahei`: 简化 AHEI。包括蔬菜、水果、全谷物、豆类坚果、omega-3、加工肉、含糖饮料、反式脂肪等；钠、酒精、多不饱和脂肪目前是无数据源的中性 stub。

前端当前在 `src/components/nutrition/nutrition-dashboard.tsx` 中把这四类报告压成一个 0-100 的 `structureScore`:

```text
PDI 百分制 + AHEI 百分制的平均值
- 餐盘偏离惩罚
- UPF 占比惩罚
+ 18 基础校正
最后 clamp 到 0-100
```

Plan 决策:

- 首页主指标用这个 `structureScore`，命名为 `Nutrition Score` / `营养评分`。
- UI 必须显示一个小注释: 该评分基于“月度购买/票据数据”，反映饮食结构倾向，不等同于真实每日摄入或医学判断。
- 评分下钻显示四个子指标: PDI、AHEI、Plate、UPF。
- 后续可以把 `structureScore` 从组件内移到共享 selector，避免首页和 nutrition 页面重复实现。

### 3.2 今日支出

当前已有 `GET /api/expenses?month=YYYY-MM&tz=Asia/Shanghai`，返回 `ExpenseAnalytics`。

首页可直接使用:

- `spent_this_month`
- `remaining_this_month`
- `remaining_daily_budget`
- `projected_month_end_spend`
- `budget_progress`
- `daily_totals`
- `category_breakdown`
- `recent_transactions`
- `pending_receipts`
- `receipt_jobs`

Plan 决策:

- 首页 KPI 的“今日支出”需要一个日级值。当前 API 有 `daily_totals`，可以在前端按今天日期取当天 amount。
- 若今天没有记录，显示 `¥0`，并保留“本月已花”作为次级数字。
- 不新增数据库字段。

### 3.3 支出与营养趋势洞察

当前 nutrition trend 已有 `GET /api/nutrition/trend?months=6`。

第一阶段趋势洞察不做复杂因果分析，只做 dashboard 级观察:

- 营养评分近 6 个月趋势。
- 本月累计消费曲线。
- 食物类支出占总支出的比例。
- 营养评分变化和食物/外食/饮料咖啡支出变化的并排展示。

必须避免写成“支出导致健康变好/变差”。文案使用:

- “同时变化”
- “值得回看”
- “可能有关”
- “数据不足，先补记录”

## 4. 信息架构

### 4.1 全局导航

左侧 sidebar:

- Overview: `/`
- Nutrition: `/nutrition`
- Expenses: `/expenses`
- Receipts: `/expenses` 的 receipt task 或后续独立路由
- Trends: 可先落在首页趋势区，后续独立
- Settings: `/settings`

品牌区:

- logo: 圆形浅绿色 Life OS 标记，可先用 lucide Activity / Leaf 组合风格，不手绘 SVG。
- 名称: `Life OS`
- 副标题: `Personal command center`

### 4.2 首页布局

桌面画布按参考图:

```text
┌ sidebar ┬ top bar ───────────────────────────────┐
│         │ Welcome Back / Date / Export / Actions  │
│         ├ KPI cards ───────────────┬ Calendar     │
│         │ Nutrition Score          │ month view   │
│         │ Today Spend              ├ Activity     │
│         │ Food Spend Ratio         │ recent signal│
│         │ Pending Receipts         │              │
│         ├ Main trend chart ────────┤              │
│         │ nutrition + spend trend  │              │
│         ├ Recent transactions / nutrition signals │
└─────────┴─────────────────────────────────────────┘
```

首页第一屏优先级:

1. 营养评分大卡。
2. 今日支出卡。
3. 本月预算/预计超支卡。
4. 记录质量或待处理票据卡。
5. 主趋势图。
6. 右侧日历和 activity。

### 4.3 Nutrition 页面

保留现有功能，但迁移到 Life OS 视觉:

- 子任务: Overview / Structure / Trend / Review。
- 删除深色背景作为默认外观。
- 使用与首页相同的 KPI 卡、图表卡、右侧 insight panel。
- `Review` 内没有真实写入能力的操作继续禁用或明确是待实现。

### 4.4 Expenses 页面

保留现有功能，但迁移到 Life OS 视觉:

- 子任务: Budget / Categories / Receipts / Ledger。
- 当前 receipt upload、manual expense、budget settings、CSV export 继续可用。
- 图表、交易列表、pending receipt 卡片统一到浅色 command center 组件。
- 不再保留独立的 Mercury-style header 和另一套视觉语言。

## 5. 视觉系统

### 5.1 Tokens

建议新增一套全局 Life OS token，避免 `nut-*` 和 `exp-*` 各自为政。

```css
:root {
  --life-bg: #eef3f1;
  --life-shell: #f7faf8;
  --life-card: #ffffff;
  --life-card-soft: #f4f8f5;
  --life-border: rgba(15, 23, 42, 0.08);
  --life-border-strong: rgba(15, 23, 42, 0.14);
  --life-text: #101512;
  --life-muted: #6d776f;
  --life-subtle: #a0aaa3;
  --life-green: #c8ff7a;
  --life-green-strong: #9bea3d;
  --life-orange: #ff9f45;
  --life-blue: #83b7ff;
  --life-purple: #a891ff;
  --life-yellow: #ffe28a;
  --life-danger: #ff6b6b;
  --life-radius: 8px;
}
```

说明:

- 绿色必须接近参考图的浅荧光绿，但不能让整个页面变成单色。
- 卡片圆角控制在 8px 左右。
- 背景以浅灰绿为主，卡片白底。
- 数字使用 tabular-nums。
- 不使用负 letter-spacing。

### 5.2 组件

第一阶段应建立这些可复用组件:

- `LifeShell`: sidebar + topbar + main content frame。
- `LifeSidebar`: 全局导航。
- `LifeTopbar`: welcome、date/month picker、export、quick actions。
- `MetricCard`: KPI 数字卡，支持 highlighted / neutral / warning。
- `ChartCard`: 标题、metric、chart、footer insight。
- `CalendarCard`: 月历静态/可选月份，第一阶段可只显示当前月数据标记。
- `ActivityCard`: 最近交易、待处理票据、营养异常信号。
- `InsightList`: 三条以内行动提示。
- `CommandButton`: 圆形图标按钮和文字按钮。

### 5.3 图表

继续使用 Recharts。

图表风格:

- 主趋势图: 营养评分折线/面积 + 支出柱状或第二序列。
- 支出趋势: 圆角柱或面积图。
- 分类结构: donut，配参考图右侧 legend。
- 营养结构: donut + 四个子指标条。

## 6. 实施阶段

### Phase A: 品牌和外壳

目标: `/` 变成 Life OS command center 的真实首页。

任务:

- 修改 metadata: `Health Monitor` -> `Life OS`。
- 新建 `src/components/life-os/` 组件目录。
- 新建 `life-os.css` 或迁移到现有全局样式中。
- 实现 `LifeShell`、`LifeSidebar`、`LifeTopbar`。
- 首页读取 nutrition score、nutrition trend、expense analytics。
- 首页实现参考图布局。

验收:

- `/` 桌面首屏不再像当前 nutrition 页面。
- 左侧固定导航存在。
- 顶部工具栏存在。
- 至少 4 张 KPI 卡，其中营养评分和今日支出来自真实 API。
- `npm run typecheck` 和 `npm run build` 通过。

### Phase B: Nutrition 迁移

目标: `/nutrition` 不再是深色独立系统，而是 Life OS 的一个模块。

任务:

- 保留当前 nutrition 数据加载和任务切换。
- 替换 `nut-*` shell/header/panel 为 Life OS 组件。
- 把 `structureScore` 抽到共享 selector，例如 `src/lib/nutrition/selectors.ts`。
- 显示评分解释和数据覆盖率。
- 四个子指标卡: PDI、AHEI、Plate、UPF。

验收:

- `/nutrition` 和 `/` 看起来属于同一产品。
- 深色霓虹背景不再出现。
- 营养评分解释清晰可见但不喧宾夺主。

### Phase C: Expenses 迁移

目标: `/expenses` 进入同一套 Life OS 视觉。

任务:

- 保留 receipt upload、manual expense、budget settings、CSV export。
- 替换 `exp-*` shell/header/panel 的主视觉层。
- 把 Budget / Categories / Receipts 的 task nav 做成参考图式顶部或局部 tabs。
- 保留交易卡和 pending receipt 的完整交互。

验收:

- `/expenses` 不再像独立产品。
- 上传票据、记一笔、预算设置、导出仍然可用。
- 待确认票据和失败队列仍可操作。

### Phase D: 跨模块趋势洞察

目标: 首页开始真正体现 Life OS，而不是 nutrition + expenses 拼接。

任务:

- 首页主图展示 `Nutrition Score` 和 `Spend` 的时间序列。
- 增加 `Food Spend Ratio`: 食物 + 外食 + 饮料/咖啡 / 总支出。
- 增加 `Data Quality`: 有重量食物条目 / 总食物条目、待确认票据数。
- 增加三条 insight:
  - 本月营养评分变化。
  - 食物支出占比变化。
  - 最值得处理的数据缺口。

验收:

- 首页能回答“我最近生活数据发生了什么”。
- 洞察文案不做因果和医学判断。

### Phase E: QA 和视觉复刻验收

目标: 对照参考图做桌面 QA。

任务:

- 启动 dev server。
- 截图 `/`、`/nutrition`、`/expenses`。
- 与用户提供参考图做并排检查。
- 修复首屏密度、卡片圆角、图表颜色、sidebar 宽度、顶部工具栏、数字层级。
- 只做轻量移动端 smoke check，记录后续移动端专门计划。

验收:

- 桌面 1440px 宽度下，整体观感明确接近参考图。
- 没有明显文本溢出、卡片错位、图表拥挤。
- build 通过。

## 7. 关键实现注意事项

- 不要先重写业务逻辑。先做 shell 和首页，复用现有 API。
- 不要拆掉 receipt / expense 的可用交互。
- 不要把趋势洞察写成医学建议。
- 不要保留两套互相冲突的视觉系统。
- 不要在第一阶段追求移动端完美。
- 如果控件没有真实状态，显示为静态 chip，不做假按钮。
- 如果新增图标，优先用 `lucide-react`。

## 8. 推荐下一步

先执行 Phase A。

原因:

- 它最能改变产品形象。
- 风险集中在首页和外壳，不会先破坏 expenses 的复杂交互。
- 完成后可以用真实截图和参考图比较，再决定 Nutrition / Expenses 的迁移细节。

Phase A 完成后，再进入 Phase B/C 的模块迁移。
