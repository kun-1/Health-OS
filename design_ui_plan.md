# Design UI Plan: Personal Health Causal Analysis System

本文用于约束后续 UI 和产品结构实现。重点不是换配色、圆角或阴影，而是把产品从“字段驱动的健康记录工具”转向“个人健康因果分析系统”。

当前阶段仍然只实现 Record Layer。UI 可以提前为后续 Analysis Layer 和 Decision Layer 留出页面、导航和视觉容器，但这些区域在当前阶段只能显示空状态，不展示分析内容、趋势结论或决策建议。

## 1. 产品定位

本产品不是：

```text
健康记录工具
```

而是：

```text
个人健康因果分析系统
```

核心体验应该接近：

- Apple Health x Oura
- Linear x Health
- 高频输入
- 低认知负担
- 数据逐渐浮现
- 分析结果未来从时间线和记录中自然生长出来

UI 不能继续以数据库字段为中心，否则会持续呈现 CMS、CRUD、admin panel 的后台感。

## 2. 当前 UI 问题

当前 UI 的根本问题是字段驱动：

```text
数据库字段
↓
form
↓
页面
```

这会导致：

- 所有信息视觉权重接近
- 页面没有单一主焦点
- 记录入口像后台管理表单
- 用户先看到复杂度，而不是先看到状态和下一步动作
- 后续 Insights、Trends、Decision 很难自然接入

正确方向应该是：

```text
用户状态
↓
行为流
↓
信息层级
↓
数据浮现
```

## 3. 产品层级

系统长期结构：

```text
Record Layer
↓
Analysis Layer
↓
Decision Layer
```

UI 必须对应这个结构：

- Record Layer: 快速捕捉事实
- Analysis Layer: 未来暴露模式、相关性、滞后变化
- Decision Layer: 未来显示可执行策略和观察结果

当前阶段约束：

- 可以做出 `Insights`、`Trends`、`Decisions`、`Settings` 的页面壳和空状态
- 不展示相关性、概率、风险评分、趋势判断
- 不展示任何行动建议
- 所有真实内容必须来自 Record Layer 的原始事实或简单计数

不要把 `/record` 当作长期首页。记录只是输入方式，不是产品核心界面。

## 4. 顶层信息架构

推荐一级导航：

```text
Today | Timeline | Insights | Trends | Decisions | Settings
```

Phase 1 可以先实现完整导航：

```text
Today | Timeline | Insights | Trends | Decisions | Settings
```

页面职责：

- `Today`: 首页 Dashboard，显示记录状态、快速记录、摘要
- `Timeline`: 原始记录流，是分析层的事实来源
- `Insights`: 当前只显示空状态，后续承载模式、相关性、滞后信号
- `Trends`: 当前只显示空状态，后续承载趋势、评分变化、周期视图
- `Decisions`: 当前只显示空状态，后续承载行动决策；Phase 1 不展示任何行动建议
- `Settings`: 当前只显示页面壳和空状态，不实现导入、导出、部署配置

## 5. 首页 Dashboard

首页不应该是大表单。

首页职责：

- 告诉用户今天记录系统收集到了什么
- 提供最快的记录入口
- 显示最近关键事实
- 为未来分析结果预留位置，但当前不展示分析内容

推荐结构：

### 5.1 Hero: Today State

首屏主视觉只有一个：今天的记录状态，不是健康状态。

示例信息：

```text
Today
Record layer active
3 records today
Last record: Water, 14:20
```

Phase 1 只能显示记录层事实：

```text
Today
Record layer active
No insights generated in Record Layer
```

注意：

- 不输出医学诊断
- 不输出因果结论
- 不使用“低炎症风险”“稳定”“恢复良好”等判断性结论
- Phase 1 可以展示“今日已记录事件数”“最近一次记录”“今日饮水总量”等事实
- 禁止显示“稳定、变差、改善、恢复、风险、炎症水平、触发因素、建议”等判断性健康文案

### 5.2 Quick Capture

记录入口应该是首页核心操作，但不是整页表单。

推荐交互：

```text
What happened?
[Meal] [Supplement] [Post-meal] [Bowel] [Water] [Nosebleed] [Summary] [Sleep]
```

Quick Capture 必须覆盖 Phase 1 的 8 类记录：

- Meal
- Supplement
- Post-meal symptom
- Bowel
- Water
- Nosebleed
- Daily summary
- Sleep

首页可以突出最高频入口，但完整入口必须在同一层级或 `More` 中可达。

点击后进入：

- drawer
- modal
- bottom sheet
- 或当前页面内的 focused capture panel

复杂字段默认隐藏。

### 5.3 Today Summary

Phase 1 可展示原始汇总：

- 今日记录数
- 今日饮水总量
- 最近一餐
- 最近排便
- 是否已填写睡前总结
- 是否已填写睡眠记录

Phase 2 后这些位置可以替换为真实指标，但 Phase 1 只保留占位外观：

- digestive metric placeholder
- sleep metric placeholder
- stress metric placeholder
- skin metric placeholder

### 5.4 Insights Placeholder

Phase 1 只放占位区，不生成 insight。

示例：

```text
Insights will appear after enough records accumulate.
```

不要在 Phase 1 占位中放示例结论。示例结论会让产品看起来已经在分析，这会越过当前边界。

## 6. Record 交互原则

记录页应该从“表单页”转为“capture flow”。

每种记录使用同一结构：

```text
Primary question
Core fields
Add details
Save
```

### 6.0 Capture Mode Design Language

Capture mode 的目标不是让每类记录看起来完全不同，而是：

```text
同一个骨架
+
不同的主输入焦点
+
轻量的语义色彩
```

原因：

- 这是高频输入工具，交互骨架必须稳定
- 每类记录的数据形态不同，主输入焦点必须不同
- 差异化应该帮助用户更快完成记录，而不是制造新学习成本

统一骨架：

```text
Mode header
Primary input zone
Secondary controls
More details
Save action
```

#### Mode Header

Mode header 只负责确认当前 capture 类型，不负责装饰页面。

要求：

- 一行小型 mode label
- 一个明确标题，例如 `Water Capture`
- 一句说明，说明此处只保存原始事实
- 一个轻量 accent，不要大面积铺色

不要：

- 每个 mode 做完全不同 layout
- 使用大面积高饱和背景
- 用插画、emoji 或装饰图标抢主输入焦点
- 写“风险、触发、恢复、建议”等分析词

#### Primary Input Zone

每个 mode 只能有一个主输入焦点：

| Mode | Primary focus |
|---|---|
| Meal | food text |
| Supplement | supplement name |
| Post-meal symptom | related meal + symptom score |
| Bowel | Bristol selector |
| Water | amount selector |
| Nosebleed | event confirmation |
| Daily summary | core skin/nasal/stress scores |
| Sleep | sleep duration + quality |

主输入区应该比其他字段更大、更靠前、更易点。

#### Secondary Controls

Secondary controls 包含必要但不抢焦点的字段。

示例：

- Meal: hunger, stress
- Water: drink type
- Bowel: strain level
- Sleep: night awakenings
- Supplement: dose text, taken with meal

#### More Details

所有可选字段统一收进 `More details`。

包括：

- notes
- additive tags
- additive level
- meal duration
- optional symptom details
- optional stool flags
- optional sleep datetime
- optional water context

默认状态下不展开。

#### Save Action

Save action 始终在表单底部，并保持稳定位置。

文案应跟 mode 对应：

- Save meal
- Save water
- Save stool
- Save sleep

但不要使用建议性文案。

#### Focused Capture Mode

从 Today Quick Capture 进入 `/record?type=water` 时，必须进入 single-mode capture：

- 只显示当前 mode
- 不显示 8 个入口网格
- 提供低权重 `All captures` 返回完整记录中心
- 不改变数据结构

从普通 `/record` 进入时，才显示所有记录入口。

### 6.1 Meal Capture

默认层：

```text
What did you eat?
[text area]

Hunger
[0] [1] [2] [3] [4]

Stress
[0] [1] [2] [3] [4]

+ Add details
```

展开层：

- 用餐时长
- 加工食品
- 添加剂风险
- 添加剂标签
- 份量
- 备注

### 6.2 Symptom Capture

默认层：

- 关联最近一餐
- 腹胀
- 腹痛
- 反酸

展开层：

- 沉重感
- 产气
- 备注

### 6.3 Stool Capture

默认层：

- Bristol
- 费力程度

展开层：

- 急迫感
- 排便不尽
- 血便或黑便
- 备注

### 6.4 Water Capture

默认层：

- 250 ml
- 500 ml
- 750 ml
- 1000 ml
- drink type

展开层：

- 出汗/运动
- 尿色
- 备注

## 7. Timeline

Timeline 不应该像数据库列表，而应该像健康事件 feed。

目标气质：

- Apple Health
- Day One
- Oura activity feed

每条记录应有清晰层级：

```text
12:30 Lunch
Chicken salad, rice
Stress: low

2h later
Mild bloating
```

Phase 1 时间线只展示事实：

- 不解释
- 不分析
- 不建议
- 不做医学判断

但可以为未来分析预留视觉区域：

- related event chip
- source marker
- edited marker
- notes preview
- expandable details

编辑和删除属于 record quality 操作。若当前代码已支持，则在 Timeline 中低权重保留；若未支持，不作为 Phase UI-1 的阻塞验收项。

## 8. Insights、Trends 和 Decisions 预留

不要在 Phase 1 实现分析结论或决策建议，但 IA 要预留模块。当前这些页面只做结构、视觉和空状态。

### 8.1 Insights

当前状态：

- 页面存在
- 有标题和空状态
- 可以说明“积累足够记录后显示”
- 不展示任何相关性、模式、风险、概率或建议

未来模块：

- Correlations
- Pattern Detection
- Lagged Effects
- Confidence Level
- Data Quality Warning

### 8.2 Trends

当前状态：

- 页面存在
- 有标题和空状态
- 可以提示当前只收集原始记录
- 不展示图表趋势、改善/恶化判断或分数解释

未来模块：

- Skin redness trend
- Sleep recovery trend
- Bowel stability
- Water intake
- Stress load

趋势页应该服务于“变化观察”，不是堆图表。

### 8.3 Decisions

当前状态：

- 页面存在
- 有标题和空状态
- 可以提示当前只收集原始记录
- 不展示行动建议、治疗建议、饮食建议、风险规避建议或策略推荐

未来模块：

- Decision candidates
- Experiment plans
- Action history
- Outcome review

Phase 1 不能实现 decisions API、decisions 表或任何决策生成逻辑。

## 9. Visual System

视觉方向：

```text
Clinical Calm
+
Natural Intelligence
+
Soft Depth
```

避免：

- hospital white
- admin dashboard gray
- generic green form
- overly decorative gradients

### 9.1 Colors

Base:

```text
background: #F4F7F5 or #F6F8F7
surface: rgba(255, 255, 255, 0.72)
surface-solid: #FFFFFF
text-primary: #17201C
text-secondary: #5D6963
border: rgba(38, 55, 49, 0.10)
```

Primary:

```text
teal-700: #0F766E
teal-900: #134E4A
```

Semantic:

```text
sleep: muted indigo-gray
digestion: deep teal
skin: soft rose/clay
stress: amber
water: blue-cyan
```

不要让界面只剩一种绿色。健康系统需要多维变量的色彩暗示。

### 9.2 Surface

卡片：

```text
background: rgba(255,255,255,0.72)
backdrop-filter: blur(16px)
border: 1px solid rgba(38,55,49,0.10)
border-radius: 8px
box-shadow: 0 12px 40px rgba(20, 35, 30, 0.06)
```

阴影要轻，层次靠 spacing、surface 和 typography 建立。

### 9.3 Typography

建立明确层级：

| Size | Usage |
|---|---|
| 32 | Dashboard hero |
| 24 | Section title |
| 18 | Card title |
| 16 | Body |
| 14 | Metadata |
| 12 | Muted label |

要求：

- 小卡片内不要使用 hero 级字体
- metadata 和 label 必须明显弱于主体信息
- 按钮文字不能和标题抢权重

### 9.4 Spacing

使用 8px spacing system：

```text
4, 8, 12, 16, 24, 32, 48
```

页面节奏：

- section gap: 32 或 48
- card padding: 16 或 24
- field gap: 12 或 16
- inline controls gap: 8

不要随机 spacing。

## 10. Component Principles

### 10.1 One Primary Focus

一个页面只能有一个主视觉重点。

Dashboard 主重点是 Today State。

Record 主重点是当前 capture question。

Timeline 主重点是事件内容，不是按钮。

### 10.2 Hide Complexity By Default

默认只显示核心字段。

以下字段默认折叠：

- notes
- additive tags
- additive risk
- meal duration
- optional symptom details
- optional stool flags
- optional sleep datetime

### 10.3 Cards Over Forms

记录不是后台表单，而是 capture card。

每个 capture card 应该包含：

- question
- direct input
- 1-3 个核心 controls
- optional details
- save action

### 10.4 Data Quality Without Admin Feel

编辑、删除、补录是必要能力，但应作为低权重操作。

建议：

- Timeline card 内使用 small text buttons 或 icon buttons
- 删除必须二次确认
- 被引用记录删除失败时给清晰原因

## 11. Phase Plan

### Phase UI-1: Capture + Timeline Baseline

目标：

- 保证 8 类记录入口可达
- 记录保存成功反馈清楚
- Timeline 能确认原始记录已保存
- 编辑/删除若已存在则低权重保留

可交付：

- Quick Capture entry set
- Focused capture card baseline
- Timeline event feed baseline

### Phase UI-2: Today Dashboard

目标：

- `/` 改为 Today Dashboard
- `/record` 不再是首页
- 首页接入 Quick Capture
- 只展示原始记录事实和简单计数

可交付：

- Today hero
- Today raw summary
- Recent records preview
- Quick Capture cards

### Phase UI-3: Placeholder IA

目标：

- 顶部导航改为 Today / Timeline / Insights / Trends / Decisions / Settings
- Insights / Trends / Decisions / Settings 只做空状态页面
- 不新增分析、趋势、决策相关 API、表或计算逻辑

可交付：

- Insights placeholder page
- Trends placeholder page
- Decisions placeholder page
- Settings placeholder page

### Phase UI-4: Capture Redesign

目标：

- 把大表单改为 focused capture card
- 每类记录默认只展示核心字段
- optional details 用 disclosure
- 视觉上像完整产品，内容上严格停留在 Record Layer

可交付：

- Meal Capture Card
- Water Capture Card
- Stool Capture Card
- Symptom Capture Card
- Supplement / Nosebleed / Summary / Sleep 保持简洁一致

## 12. Non-Goals

当前 UI 改造阶段不做：

- 医学诊断
- 因果结论
- AI insight
- 复杂图表
- 行动建议
- 多用户
- 推送通知

视觉升级不能越过 Record Layer 的产品边界。

## 13. Acceptance Criteria

完成 UI 改造后应满足：

- `/` 是 Today Dashboard，不是直接跳到 `/record`
- 顶层导航表达产品结构，而不是只表达 CRUD
- Quick Capture 能快速进入记录流程
- Quick Capture 覆盖 8 类 Phase 1 record type
- 记录表单默认隐藏复杂度
- Timeline 像事件 feed，不像数据库列表
- 编辑/删除能力保留但视觉降权
- 不出现医学诊断、因果判断或行动建议
- Insights / Trends / Decisions 页面只包含标题、说明和空状态，不包含图表、示例结论、风险词、建议词
- Today 页面所有数字均可追溯到原始 records 或简单计数
- 不新增 insights / trends / decisions 相关 API、表或计算逻辑
- 不出现“稳定、改善、恶化、风险、触发、恢复、建议”等判断性健康文案
