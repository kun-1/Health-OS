# Phase 2 Plan: Structured Analysis Layer

目标是把 Phase 1 保存下来的原始 `records` 转成可稳定分析的日级、餐级、事件级指标，并生成第一版 `insights`。Phase 2 的重点不是证明因果，而是回答：

- 最近记录是否足够连续？
- 皮肤、肠道、鼻部、睡眠、压力是否有趋势变化？
- 哪些暴露之后，症状更常在特定时间窗口内变差？
- 哪些结果只是同步波动，哪些值得进入后续决策层验证？

Phase 2 必须遵守 `方向.md` 的产品分层：

```text
数据收集层
↓
结构化层
↓
分析层
↓
决策层
```

因此 Phase 2 不应该直接从 `payload_json` 临时拼复杂图表，而应该先做一层可复用的结构化派生。

---

## 1. Phase 2 边界

Phase 2A 今晚先做：

- 从 `records` 派生结构化指标
- 每日总结指标
- 每周趋势
- 数据质量 insight
- 趋势 insight
- 有限的餐级短期反应观察
- 数据质量提示
- `/insights` 和 `/trends` 的第一版可用页面
- `GET /api/insights`
- `GET /api/trends`

Phase 2B/2C 后续再做：

- 完整事件窗口分析
- 滞后候选关联
- 补剂开始/停止前后观察
- 持久化 `structured_records`
- `decisions` 层的排除/再引入验证计划

Phase 2 不做：

- 医学诊断
- 自动治疗建议
- 复杂 AI 聊天
- 复杂因果模型
- 食物数据库
- DII 精确计算
- 营养素精确估算
- 自动识别配料表
- 自动告诉用户“某食物一定触发银屑病”
- 决策层的“排除/再引入实验计划”

Phase 2 输出的措辞必须是：

```text
可能相关
值得观察
候选模式
数据不足
受睡眠/压力等因素干扰
```

不能输出：

```text
确诊
导致
治愈
必须停止
医学结论
```

---

## 2. 参考依据

### 2.1 来自 `research_v2.md`

Phase 2 的分析逻辑应直接围绕这些研究目标：

- 饮食或添加剂暴露后，皮肤评分是否在 1-3 天后更容易变差。
- 排便异常、腹胀、睡眠差、压力高是否先于皮肤加重出现。
- 皮肤加重更像是饮食触发，还是压力、睡眠、节律共同触发。
- 鼻部症状是与皮肤同步变化，还是独立波动。
- 哪些因素与好转日相关。

关键时间窗口：

| 暴露/信号 | 观察窗口 | Phase 2 用法 |
|---|---:|---|
| 餐后腹胀/腹痛 | 0-2 小时 | 餐级短期胃肠反应 |
| 排便变化 | 12-48 小时 | 肠道状态变化 |
| 加工食品/添加剂 | 0-3 天 | 暴露后皮肤/肠道变化 |
| 睡眠差/压力高 | 当天至 2 天后 | 协变量和独立风险信号 |
| 皮肤变化 | 1-3 天 | 下游输出变量 |

### 2.2 来自外部资料

- EMA 饮食记录适合捕捉真实环境中的饮食、行为和上下文信息，可降低传统回忆式饮食记录的偏差；因此本项目应继续保留事件型记录，而不是只做每日回忆。
- DII 是文献衍生的膳食炎症指数，不适合在没有完整营养参数的情况下直接计算；本项目只把它转译为可执行的暴露标签，例如加工食品、油炸、高糖、纤维多样性。
- 银屑病饮食证据整体不能支持“特定食物对所有人都有效或有害”的强结论；Phase 2 只能做个体模式识别。
- Bristol Stool Form Scale 是常用的粪便形态自评工具，适合继续作为肠道代理指标之一，但要和费力程度、急迫感一起看。

---

## 3. 现有数据资产

Phase 1 当前已有 8 类记录：

```text
meal
supplement
post_meal_symptom
bowel
water
nosebleed
daily_summary
sleep
```

Phase 2 不改变这些原始 record 类型。原始 `records` 仍然是事实来源，分析层只派生，不覆盖。

---

## 4. 结构化层设计

### 4.1 为什么需要结构化层

直接从 `payload_json` 做图表会很快变乱：

- 不同 record type 的日期归属不同。
- `sleep` 的 `occurred_at` 是填写时间，`sleep_date` 才是睡眠归属日期。
- `daily_summary` 的 `summary_date` 才是皮肤/鼻部/压力归属日期。
- 餐级暴露需要按 `occurred_at` 所在日期聚合。
- 餐后反应需要通过 `related_record_id` 回到对应 meal。
- 补剂可能同一时间点多条记录，需要独立保存但按天聚合。

所以 Phase 2 应增加派生逻辑，把原始 records 统一成可查询的结构化指标。

### 4.2 Phase 2A 结构化策略

Phase 2A 先不新增数据库表，使用实时派生的 typed DTO：

```text
TimelineRecord[]
↓
DailyMetric[]
MealReactionMetric[]
TrendSeries[]
InsightCard[]
```

原因：

- 当前数据量小，实时计算足够。
- `structured_records` 如果要落库，需要解决重算、去重、版本化、窗口指标来源追溯。
- 过早使用半通用 EAV 表会让后续分析难以维护。

Phase 2A 的代码仍按结构化层组织，后续可以把 `DailyMetric[]` 和 `MealReactionMetric[]` 写入派生表。

### 4.3 后续持久化表要求

如果 Phase 2B/2C 需要持久化 `structured_records`，表结构必须包含：

建议字段：

```text
id
metric_date
metric_period_start
metric_period_end
metric_scope
metric_key
metric_value_number
metric_value_text
entity_type
entity_id
source_record_ids_json
dimensions_json
algorithm_version
computed_at
recomputed_at
stale
```

字段说明：

| 字段 | 说明 |
|---|---|
| `metric_date` | 统一后的归属日期。 |
| `metric_period_start/end` | 聚合窗口，例如 7 日均值、D+2 窗口。 |
| `metric_scope` | `day`、`meal`、`sleep`、`bowel`、`supplement`、`window`。 |
| `metric_key` | 指标名，例如 `skin_total`、`water_total_ml`。 |
| `metric_value_number` | 数值型指标。 |
| `metric_value_text` | 标签型指标。 |
| `entity_type/entity_id` | 指标归属实体，例如某一餐、某一天、某一暴露标签。 |
| `source_record_ids_json` | 多来源追溯，日级和窗口指标不能只存一个 source id。 |
| `dimensions_json` | 额外维度，例如 `{"method":"deep_fry","lag_day":2}`。 |
| `algorithm_version` | 规则版本，避免指标定义变化后混用旧结果。 |
| `computed_at` | 计算时间。 |
| `stale` | 原始记录编辑/删除后标记派生结果需要重算。 |

`insights` 后续落库前，先使用展示卡片 schema：

```text
insight_type
title
summary
severity
support_level
date_range_start
date_range_end
sample_size
metric_key
window
possible_confounders
evidence_json
```

`support_level` 不表示医学可信度，只表示本地数据支持程度：

```text
insufficient
weak
moderate
```

Phase 2A 默认最高只展示 `weak`。`moderate` 可以保留在类型里，但需要 28 天以上数据和足够样本，后续再打开。

### 4.4 缺失值规则

所有派生函数必须区分：

```text
0 = 用户明确记录为 0
null = 没有记录 / 不适用 / 字段缺失
```

均值、趋势、覆盖率的分母只包含“该字段实际有值”的日期或事件。不能把未记录当作没有症状。

例子：

| 字段 | 缺失处理 |
|---|---|
| `skin_thickness` | 可选，不参与 `skin_core_score`。 |
| `runny_nose/sneezing` | 可选，缺失时只计算 `nasal_core_score = nasal_blockage`。 |
| `meal_duration_min` | 缺失时不参与用餐速度分析。 |
| `wake_rested` | 缺失时不参与睡眠恢复感趋势。 |
| `bed_at/wake_at` | 缺失时不计算睡眠规律性。 |

---

## 5. 派生指标

### 5.1 每日皮肤指标

来源：`daily_summary`

```text
skin_redness
skin_scaling
skin_itch
skin_thickness
skin_area_change
photo_taken
```

派生：

```text
skin_core_score = skin_redness + skin_scaling + skin_itch
skin_extended_score = skin_redness + skin_scaling + skin_itch + skin_thickness
skin_worse_today = skin_area_change = 1 OR skin_core_score > previous_day_skin_core_score
skin_better_today = skin_area_change = -1 OR skin_core_score < previous_day_skin_core_score
skin_7d_avg = 7 日移动平均
skin_7d_delta = 最近 7 日均值 - 前 7 日均值
```

说明：

- `skin_core_score` 优先使用，因为当前表单核心区稳定记录红斑、鳞屑、瘙痒。
- `skin_thickness` 作为扩展指标；缺失时不能把它当 0。
- 移动平均用于趋势显示，不用于单日结论。

### 5.2 每日鼻部指标

来源：`daily_summary`

```text
nasal_blockage
runny_nose
sneezing
facial_pressure_or_sinus_pain
smell_reduction
nosebleed
```

派生：

```text
nasal_core_score = nasal_blockage
nasal_extended_score = nasal_blockage + runny_nose + sneezing + facial_pressure_or_sinus_pain
nosebleed_count
```

分析重点：

- 鼻部症状是否和皮肤同日同步上升。
- 鼻部症状是否更像独立波动。
- 流鼻血只作为事件频次，不做饮食归因。

### 5.3 每日肠道指标

来源：`bowel`、`post_meal_symptom`

```text
bowel_count
bristol_min
bristol_max
bristol_median
bristol_abnormal_count
strain_max
urgency_count
incomplete_count
bloating_avg
bloating_max
pain_avg
reflux_count
```

定义：

```text
bristol_normal = 3-4
bristol_constipation_like = 1-2 OR strain_level >= 2
bristol_diarrhea_like = 6-7 OR urgency = true
```

注意：

- Bristol 不是诊断，只是形态代理指标。
- `strain_level` 和 `urgency` 必须一起看。
- `blood_or_black_stool = true` 只生成安全提示，不进入相关性分析。

### 5.4 每日饮食暴露指标

来源：`meal`

```text
meal_count
late_meal_count
snack_count
processed_food_count
additive_high_count
additive_medium_or_high_count
fried_food_count
eat_out_count
raw_food_count
meal_duration_avg
hunger_before_avg
stress_before_avg
portion_large_count
```

从 `food_items[].method` 派生：

```text
deep_fry -> fried_food_exposure
eat_out -> eat_out_exposure
raw -> raw_food_exposure
boil/steam -> simple_cooking_exposure
```

从 `additive_tags` 派生：

```text
emulsifier_exposure
sugar_alcohol_exposure
artificial_sweetener_exposure
gums_exposure
preservative_exposure
```

Phase 2 不做：

- 精确卡路里
- 精确蛋白质/脂肪/碳水
- 精确 DII
- 自动识别所有食材类别

### 5.5 每日补剂指标

来源：`supplement`

```text
supplement_count
supplement_names
supplement_taken_with_meal_count
supplement_stack_size_at_same_time
```

分析重点：

- 服用规律性。
- 同日补剂数量和补剂名称共现。
- Phase 2A 不分析某补剂开始/停止前后变化，因为当前 `supplement_name`、`brand`、`dose_text` 仍是自由文本，缺少名称归一化、剂量归一化、连续服用区间和停止日推断。
- 不输出“某补剂有效/无效”。

### 5.6 每日水分指标

来源：`water`

```text
water_total_ml
coffee_count
tea_count
other_drink_count
sweating_or_exercise_max
late_water_ml
```

分析重点：

- 饮水量低的日子后，Bristol 是否更偏 1-2 或费力增加。
- 睡前集中饮水是否和睡眠中断相关。
- 咖啡记录只做暴露，不做自动利弊判断。

### 5.7 睡眠指标

来源：`sleep`

```text
sleep_duration_hours
sleep_quality
night_awakenings
sleep_disruption
sleep_latency_min
wake_rested
bed_at
wake_at
```

派生：

```text
short_sleep = sleep_duration_hours < 6
poor_sleep = sleep_quality <= 1 OR night_awakenings in 2/3_plus
itch_or_nasal_disrupted = sleep_disruption != none
sleep_regular_score = bed_at/wake_at 的稳定程度
```

分析重点：

- 睡眠差当天或次日皮肤是否更差。
- 皮肤痒/鼻塞是否反过来干扰睡眠。
- 避免把睡眠差误判成饮食触发。

### 5.8 压力指标

来源：`daily_summary` 和 `meal.stress_before`

```text
day_stress_peak
day_stress_duration
day_control_feeling
day_major_stressor
meal_context_stress_avg
meal_context_stress_max
```

分析重点：

- 高压力日和皮肤加重日是否同日或次日重叠。
- 高餐前压力是否和餐后腹胀更容易同现。
- 压力作为候选协变量，参与饮食暴露分析的解释。

说明：

- `daily_summary.stress_peak` 是日级压力峰值。
- `meal.stress_before` 是餐级上下文。
- 两者不能直接合并成一个 `stress_peak`。

### 5.9 当前字段映射与不可分析项

| 分析维度 | 当前可直接分析 | 当前不能稳定分析 |
|---|---|---|
| 皮肤 | 红斑、鳞屑、瘙痒、面积变化 | 标准 PASI、身体区域面积、照片自动评分 |
| 鼻部 | 鼻塞、可选鼻涕/喷嚏/面压 | 鼻炎/鼻窦炎诊断、感染判断 |
| 肠道 | Bristol、费力、急迫、餐后腹胀/腹痛 | 肠道通透性、菌群变化 |
| 饮食 | 加工食品、添加剂等级、添加剂标签、做法、份量 | 精确营养素、精确 DII、自动识别糖/酒精/omega3/多酚 |
| 纤维 | `vegetable_count`、`fruit_count`、豆类/全谷/发酵食品可选字段 | 具体膳食纤维克数 |
| 补剂 | 名称文本、剂量文本、随餐、同日数量 | 补剂名称归一化、开始/停止效果、剂量反应 |
| 睡眠 | 时长、夜醒、质量、被痒/鼻部打断 | 精准睡眠阶段、可穿戴设备指标 |
| 压力 | 日级峰值、餐前压力 | 完整心理量表、因果解释 |

---

## 6. 分析角度

### 6.1 数据质量分析

先判断数据是否足够，避免对稀疏数据输出过度解释。

指标：

```text
recording_days
daily_summary_coverage
sleep_coverage
meal_coverage
bowel_coverage
post_meal_symptom_coverage
water_coverage
```

规则：

| 条件 | 输出 |
|---|---|
| 少于 7 天记录 | 只展示数据质量，不生成关联 insight。 |
| 7-13 天记录 | 只展示趋势预览。 |
| 14-27 天记录 | 可以生成弱候选关联。 |
| 28 天以上记录 | 可以生成中等可信度候选关联。 |

### 6.2 当前状态分析

用于 Dashboard 首页和 `/insights` 顶部。

输出：

```text
最近 7 天皮肤均值
最近 7 天鼻部均值
最近 7 天睡眠均值
最近 7 天压力均值
最近 7 天 Bristol 分布
最近 7 天饮水均值
```

目的：

- 让用户知道最近整体是在变好、变差还是稳定。
- 不解释原因。

### 6.3 趋势分析

核心图表：

```text
skin_core_score 7 日移动平均
nasal_core_score 7 日移动平均
sleep_quality 7 日移动平均
stress_peak 7 日移动平均
water_total_ml 7 日移动平均
bristol_median / bowel_abnormal_rate
```

趋势判断：

```text
delta_7d = current_7d_avg - previous_7d_avg
```

输出示例：

```text
最近 7 天皮肤核心评分比前 7 天高 1.3 分，属于变差趋势。
```

不要输出：

```text
因为某食物导致皮肤变差。
```

### 6.4 餐级短期反应分析

问题：

```text
哪些餐后更容易出现腹胀、腹痛、反酸、沉重感？
```

分析单位：`meal`

关联方式：

```text
meal.id -> post_meal_symptom.related_record_id
```

可分析维度：

- `processed_food`
- `additive_risk_level`
- `additive_tags`
- `food_items[].method`
- `portion_level`
- `meal_duration_min`
- `stress_before`
- `hunger_before`
- `meal_type`

规则：

```text
暴露餐数 >= 3
暴露餐后 bloating_avg - 未暴露餐后 bloating_avg >= 1
或 暴露餐后 bloating>=3 的比例明显更高
```

输出示例：

```text
过去 28 天，高添加剂风险餐后 2 小时腹胀均值比其他餐高 1.2 分。样本 5 餐，可信度 weak。
```

### 6.5 滞后窗口分析

Phase 2A 不实现滞后窗口 insight，只保留设计规则。原因是个人小样本、重叠暴露和连续症状自相关很容易制造假模式。Phase 2A 的页面可以展示“暂未启用滞后分析”的说明，但不能输出 D+1/D+2/D+3 候选触发因素。

问题：

```text
某类暴露后 D+1/D+2/D+3 的皮肤、排便、鼻部是否更容易变差？
```

窗口：

```text
D+0: 暴露当天
D+1: 暴露后 1 天
D+2: 暴露后 2 天
D+3: 暴露后 3 天
```

暴露类型：

- `processed_food = true`
- `additive_risk_level = high`
- `additive_tags` 命中乳化剂、糖醇、人工甜味剂等
- `food_items[].method = deep_fry`
- `portion_level = large`
- `sleep.short_sleep`
- `stress_peak >= 3`
- `water_total_ml` 明显偏低

结果类型：

- `skin_core_score` 变化
- `skin_area_change`
- `bristol_abnormal`
- `bloating_max`
- `nasal_core_score`

候选关联规则：

```text
exposure_count >= 3
valid_followup_days >= exposure_count * 0.7
exposed_window_avg - baseline_window_avg >= threshold
```

Phase 2B 实现前必须补齐：

- baseline 使用“未暴露且非相邻窗口”的日期，而不是所有未暴露日。
- 同一天多个暴露只作为共暴露窗口，不单独归因。
- 连续多日同一暴露要合并成 exposure episode，避免重复计数。
- 若窗口内 `sleep_quality <= 1` 或 `stress_peak >= 3` 过多，输出协变量提示，不输出单独饮食候选。

建议阈值：

| 结果 | 阈值 |
|---|---:|
| `skin_core_score` | >= 1.0 |
| `nasal_core_score` | >= 1.0 |
| `bloating_max` | >= 1.0 |
| `bristol_abnormal_rate` | >= 25% 差异 |

### 6.6 好转日分析

问题：

```text
哪些因素常出现在皮肤好转前或好转当天？
```

定义：

```text
skin_better_day = skin_area_change = -1 OR skin_core_score 低于前 3 日均值
```

观察维度：

- 睡眠较好
- 压力较低
- 加工食品少
- 水分足够
- Bristol 3-4
- 腹胀低
- 纤维多样性较高
- 没有高添加剂暴露

输出方式：

```text
过去 28 天，皮肤好转日之前 1 天更常伴随低压力和较好睡眠。样本不足时只展示观察，不生成 insight。
```

### 6.7 协变量解释

Phase 2 不做复杂统计建模，但至少要做“冲突提示”。

例如：

```text
高添加剂暴露后 D+2 皮肤变差，但这些窗口中 4/5 同时出现 sleep_quality <= 1 或 stress_peak >= 3。
```

输出：

```text
该候选关联受睡眠/压力干扰，暂不建议作为单独饮食触发因素。
```

这是 Phase 2 最重要的分析边界之一。

---

## 7. Insight 类型

### 7.1 `data_quality`

目的：告诉用户当前能不能分析。

例子：

```text
过去 14 天中，睡前总结覆盖 11 天，睡眠记录覆盖 9 天。可以观察趋势，但饮食滞后分析可信度较低。
```

### 7.2 `trend`

目的：展示状态变化。

例子：

```text
最近 7 天皮肤核心评分比前 7 天下降 1.1 分，属于好转趋势。
```

### 7.3 `meal_reaction`

目的：餐后 2 小时短期反应。

例子：

```text
过去 28 天，油炸/高温做法餐后腹胀评分更高。样本 4 餐，可信度 weak。
```

### 7.4 `lagged_association`

目的：暴露后 1-3 天的候选关联。

Phase 2A 不生成该类型，只保留类型定义给 Phase 2B。

例子：

```text
高添加剂风险日后 D+2 皮肤核心评分平均高 1.4 分。该模式出现 4 次，可信度 moderate。
```

### 7.5 `confounder_warning`

目的：提示候选关联被睡眠、压力、感染、用药等因素干扰。

例子：

```text
近期皮肤加重窗口中，高压力和睡眠差同时出现较多，当前无法单独归因到饮食。
```

### 7.6 `safety_note`

目的：只处理明显安全边界。

触发条件：

- `blood_or_black_stool = true`
- `facial_pressure_or_sinus_pain >= 3` 连续 3 天以上
- `sleep_quality <= 1` 连续 3 天以上

输出必须克制：

```text
这条记录包含需要额外注意的异常信号。系统不做诊断，建议必要时寻求医生判断。
```

Phase 2A 的 `safety_note` 不参与 insight 排名，只固定显示在数据质量区域。

---

## 8. 页面设计

### 8.1 `/insights`

核心内容：

- 数据质量摘要
- 最近 7 天状态摘要
- 候选 insight 列表
- 每条 insight 的证据展开
- insight 可信度和样本数
- 明确标注“不是医学结论”

每条 insight 展示：

```text
title
summary
confidence
date_range
sample_size
affected_metric
possible_confounders
evidence details
```

### 8.2 `/trends`

核心内容：

- 皮肤趋势
- 鼻部趋势
- 睡眠趋势
- 压力趋势
- 肠道趋势
- 饮食暴露趋势
- 水分趋势

第一版图表不要复杂：

- 7 日移动平均折线
- Bristol 分布柱状图
- 暴露窗口对比柱状图
- 最近 28 天热力日历

### 8.3 Dashboard 首页

首页只放高密度摘要：

```text
今天是否已记录核心数据
最近 7 天皮肤趋势
最近 7 天睡眠/压力状态
最重要的一条 insight
下一步建议入口：查看 insights / 添加记录
```

首页不要变成复杂分析页。

---

## 9. API 设计

Phase 2 新增：

```text
GET /api/insights
GET /api/trends
```

### `GET /api/insights`

参数：

```text
range_days: 14/28/56/84
type: optional
```

返回：

```text
{
  data_quality: {...},
  insights: [
    {
      id,
      insight_type,
      title,
      summary,
      confidence,
      severity,
      date_range_start,
      date_range_end,
      evidence
    }
  ]
}
```

### `GET /api/trends`

参数：

```text
range_days: 14/28/56/84
metrics: optional
```

返回：

```text
{
  date_range,
  series: [
    {
      metric_key,
      points: [{ date, value }]
    }
  ],
  distributions: {...}
}
```

---

## 10. 代码组织建议

建议新增：

```text
src/lib/analysis/date.ts
src/lib/analysis/derive.ts
src/lib/analysis/metrics.ts
src/lib/analysis/windows.ts
src/lib/analysis/insights.ts
src/lib/analysis/types.ts
src/app/api/insights/route.ts
src/app/api/trends/route.ts
```

Phase 2A 不新增图表依赖。`package.json` 当前没有 Recharts，第一版 `/trends` 使用 HTML/CSS 条形图、数字卡片和表格。后续如果趋势页面需要更复杂图表，再按需引入 Recharts。

职责：

| 文件 | 职责 |
|---|---|
| `date.ts` | 日期归属、D+N 窗口、移动平均。 |
| `derive.ts` | 从 `TimelineRecord[]` 派生日级/餐级指标。 |
| `metrics.ts` | 指标定义、阈值、评分函数。 |
| `windows.ts` | 暴露窗口分析。 |
| `insights.ts` | 规则引擎，把指标转成 insight。 |
| `types.ts` | 分析层类型。 |

第一版可以先实时计算，不落库；当记录量增长后，再把 `derive` 的结果写入 `structured_records`。

---

## 11. 第一版实现顺序

### Step 1: 分析类型与派生函数

实现：

- 读取最近 N 天 records。
- 统一日期归属。
- 派生日级指标。
- 派生餐级指标。
- 派生睡眠、压力、皮肤、鼻部、肠道、水分指标。

验收：

- 给定一组固定 records，输出稳定的 daily metrics。
- 缺失字段不会被当成 0。

### Step 2: 数据质量与趋势

实现：

- coverage 计算。
- 7 日均值。
- 当前 7 天 vs 前 7 天。
- `/api/trends`。

验收：

- 少于 7 天记录时不生成关联 insight。
- 14 天以上可显示趋势。

### Step 3: 餐级短期反应

实现：

- meal 与 post_meal_symptom 关联。
- 按加工食品、添加剂、做法、份量、压力分组。
- 输出 `meal_reaction` insight。

验收：

- 暴露餐少于 3 次不输出候选模式。
- 输出包含样本数。

### Step 4: `/insights` 页面

实现：

- 数据质量卡片。
- 趋势 insight 列表。
- 有限餐级短期反应观察。
- 证据展开。
- `support_level` 和样本数展示。
- 不输出医学结论。

验收：

- 用户能看懂为什么这条 insight 出现。
- 用户能看到它的数据不足或干扰因素。

### Step 5: Phase 2B 滞后窗口分析

Phase 2A 不实现。以下内容留给后续：

实现：

- D+0 到 D+3 窗口。
- 暴露日 vs 未暴露日 baseline。
- 皮肤、鼻部、肠道结果对比。
- 输出 `lagged_association` insight。

验收：

- insight 包含 `lag_day`、样本数、均值差、可能协变量。

---

## 12. 支持度规则

建议：

| support_level | 条件 |
|---|---|
| `insufficient` | 少于 7 天，或暴露少于 3 次。 |
| `weak` | 14 天以内或暴露 3-4 次。 |
| `moderate` | 28 天以上，暴露 5 次以上，方向一致。 |

Phase 2A 默认最多输出到 `weak`。`moderate` 只作为后续类型保留，不在第一版页面主动展示。

---

## 13. 重要边界

### 13.1 不做单日解释

不要因为某一天皮肤变差，就输出原因。至少需要窗口和重复出现。

### 13.2 不做复杂统计显著性

Phase 2 不需要 p-value。个人数据样本小、缺失多，p-value 容易制造虚假的确定性。

### 13.3 不把补剂当食物

补剂是独立干预变量，和 meal 只通过 `related_record_id` 或时间接近关联。

### 13.4 不把鼻部症状默认归因到肠道

鼻部症状是并行输出变量，可分析同步性，但不默认同源。

### 13.5 不把腹胀当炎症触发证明

腹胀是短期胃肠反应，只能作为信号。

---

## 14. 参考资料

- `research_v2.md`
- `方向.md`
- Maugeri A, Barchitta M. *A Systematic Review of Ecological Momentary Assessment of Diet: Implications and Perspectives for Nutritional Epidemiology.* Nutrients. 2019. https://pmc.ncbi.nlm.nih.gov/articles/PMC6893429/
- Stinson L, Liu Y, Dallery J. *Ecological Momentary Assessment: A Systematic Review of Validity Research.* Perspectives on Behavior Science. 2022. https://pubmed.ncbi.nlm.nih.gov/35719870/
- Shivappa N et al. *Designing and developing a literature-derived, population-based dietary inflammatory index.* Public Health Nutrition. 2014. https://pubmed.ncbi.nlm.nih.gov/23941862/
- Ford AR et al. *Dietary Recommendations for Adults With Psoriasis or Psoriatic Arthritis From the Medical Board of the National Psoriasis Foundation: A Systematic Review.* JAMA Dermatology. 2018. https://jamanetwork.com/journals/jamadermatology/article-abstract/2684587
- Lewis SJ, Heaton KW. *Stool form scale as a useful guide to intestinal transit time.* Scandinavian Journal of Gastroenterology. 1997. https://pubmed.ncbi.nlm.nih.gov/9299672/

---

## 15. 最终建议

Phase 2A 最小可行版本应该先实现：

1. `deriveDailyMetrics(records)`
2. `deriveMealReactionMetrics(records)`
3. `buildTrendInsights(metrics)`
4. `buildMealReactionInsights(metrics)`
5. `/api/insights`
6. `/api/trends`
7. `/insights` 页面
8. `/trends` 页面

不要一开始做复杂统计、AI 解释或滞后触发结论。先把 4-8 周的个人数据变成稳定、可解释、可追溯的数据质量、趋势和餐后反应观察，再进入 Phase 2B 的滞后候选关联和 Phase 3 决策层。
