# 炎症追踪 Dashboard Research：饮食-肠道-皮肤轴

> 目标：为后续 dashboard 设计提供可执行、可量化、可分析的 research 基础。本文的核心是用低成本、高一致性的自我记录，验证“饮食/肠道状态/压力/睡眠/皮肤变化”之间是否存在稳定的个体相关模式。

---

### 我的当前状态

你目前观察到：

- 全身点滴状银屑病发作，并有向斑块状发展的趋势。
- 皮肤表现是明确存在的炎症终端表现。
- 另有鼻炎或鼻窦炎样症状，但尚未确诊。
- 你主观感觉某些食物后 1-3 天内，银屑病部位更红、面积扩大。

---

## 1. 理论框架：饮食-肠道-皮肤轴

### 1.1 更谨慎的因果链模型

```text
饮食输入 / 添加剂 / 进食时间 / 酒精或高糖暴露
        ↓  数小时至数天
肠道反应：腹胀、腹痛、排便形态变化、排便频率变化
        ↓  可能相关，但不等于必然因果
免疫/炎症状态变化：Th17、TNF-α、IL-17、IL-23 等通路可能参与
        ↓  约 1-3 天，也可能更长
皮肤表现：红斑、鳞屑、厚度、瘙痒、面积变化

并行影响因素：压力、睡眠、感染、药物、天气、运动、护肤、补剂
```

### 1.2 鼻炎/鼻窦炎在系统中的位置

- 鼻炎/鼻窦炎可能与过敏、感染、鼻腔结构、环境暴露、免疫状态有关。
- 肠道菌群和慢性鼻窦炎之间有研究提示关联，但不足以在个体层面判定肠漏是决定性原因。
- 在 dashboard 中，鼻部症状应作为**并行输出变量**记录，而不是默认作为皮肤炎症同源结果。

**记录目的：**

观察鼻部症状是否与以下因素同步变化：

- 高加工食品日
- 高糖/高脂日
- 睡眠差
- 压力高
- 排便异常
- 皮肤加重日

---

## 2. Dashboard 的研究目标

### 2.1 追求个体模式识别

1. 哪些饮食或添加剂暴露后，皮肤评分在 1-3 天后更容易变差？
2. 排便异常、腹胀、睡眠差、压力高是否先于皮肤加重出现？
3. 皮肤加重更像是由某类食物触发，还是由压力/睡眠/节律共同触发？
4. 鼻部症状是否与皮肤变化同步，还是独立波动？
5. 哪些因素与“好转日”相关？

---

## 3. EMA 记录方法：如何数值化

### 3.1 EMA 是否适合本项目

生态瞬时评估法（EMA）适合，因为你的问题具有三个特点：

- 症状波动频繁。
- 回忆偏差大，尤其是饮食和压力。
- 需要寻找时间滞后关系。

### 3.2 数值化原则

数值化不是追求“医学绝对准确”，而是追求：

1. **同一个人每天用同一把尺子。**
2. **评分定义清晰，减少当天心情对评分的影响。**
3. **字段少，但足够支持 dashboard 分析。**

### 3.3 推荐评分格式

优先使用三类字段：

| 字段类型 | 例子 | 用途 |
|---|---|---|
| 枚举值 | Bristol 1-7、腹部感受：轻松/沉重/反酸 | 适合明确分类 |
| 0-4 或 0-5 分 | 红斑、瘙痒、腹胀、鼻塞、压力 | 适合症状强度 |
| 是否/数量 | 是否摄入乳化剂、蔬菜种类数、饮水杯数 | 适合暴露记录 |

**不建议大量使用 1-10 分。** 1-10 分看似精细，但自我记录时容易漂移。对症状建议用 0-4 或 0-5 分，定义更稳定。

---

## 4. 每日记录时间点：合理性检查与修正版

原方案是餐前、餐后立即、餐后 2 小时、睡前、排便时。总体方向合理，但记录负担偏高，且餐前心情不如压力/进食速度/饥饿程度有分析价值。

### 4.1 推荐版本：核心记录节点

| 时间点 | 必填字段 | 可选字段 | 理由 |
|---|---|---|---|
| 每餐开始前 | 饥饿感 0-4、压力 0-4 | 情绪备注 | 建立进食前状态，压力比“心情”更有机制价值 |
| 每餐结束后 3 分钟内 | 食物、加工食品、补剂、开始时间、结束时间 | 进食速度、外食/自制 | 趁记忆新鲜记录输入变量 |
| 餐后 2 小时 | 腹胀 0-4、腹痛 0-4、反酸/沉重感 | 鼻塞是否加重 | 捕捉短期胃肠反应，但不直接判定触发 |
| 每次排便后 | Bristol 1-7、费力程度 0-3、是否急迫 | 颜色异常备注 | 排便是低成本、高价值的肠道代理指标 |
| 睡前 | 皮肤评分、鼻部评分、当天压力峰值、饮水、加工食品暴露、纤维多样性 | 口腔症状 | 汇总当天输出变量和协变量 |
| 次日早晨 | 睡眠时长、睡眠质量、夜醒次数 | 起床疲劳 | 睡眠回忆在次日早晨更准确 |

---

## 5. 必须记录指标

## 5.1 饮食内容

### 5.1.1 记录目标

不是精确营养学称重，而是识别模式：

- 哪类食物后皮肤更容易加重？
- 加工食品/添加剂暴露后是否更容易腹胀或皮肤变差？
- 高纤维、多样化饮食后排便是否更稳定？

### 5.1.2 记录粒度

每餐记录：

```text
meal_id
meal_start_time
meal_duration_min
meal_type: breakfast/lunch/dinner/snack
food_items: 主要食材列表
cooking_method: 蒸/煮/炒/炸/烤/生食/外食
processed_food: yes/no
additives_seen: 文本或标签
supplements: 品名 + 剂量
portion_level: 少/正常/多
```

### 5.1.3 DII 食物清单问题

膳食炎症指数（DII）不是一个简单的“食物黑白名单”，而是基于多种膳食参数计算的文献衍生评分。原始 DII 包含 45 个食物参数/营养参数，例如能量、碳水、蛋白质、脂肪、饱和脂肪、胆固醇、纤维、酒精、咖啡因、维生素、矿物质、姜黄、姜、蒜、洋葱、茶、黄酮类等。

**对 dashboard 的实际处理：**

不建议你自己手算 DII。建议把它转译成更可执行的字段：

| Dashboard 字段 | 解释 |
|---|---|
| `fiber_diversity_score` | 蔬菜/豆类/粗粮种类数 |
| `processed_food_exposure` | 是否摄入超加工食品 |
| `added_sugar_exposure` | 是否明显高糖 |
| `fried_food_exposure` | 是否油炸/高温煎炸 |
| `alcohol_exposure` | 是否饮酒 |
| `omega3_food` | 是否摄入鱼类/亚麻籽/核桃等 |
| `spice_polyphenol` | 是否摄入姜黄、姜、蒜、洋葱、茶等 |

**DII 原始来源：**

- Shivappa N et al. *Designing and developing a literature-derived, population-based dietary inflammatory index.* Public Health Nutrition. 2014. DOI: 10.1017/S1368980013002115

---

## 5.2 排便状态：Bristol + 费力程度

### 5.2.1 是否需要记录费力程度？

需要，但应作为轻量字段。

Bristol 反映粪便形态，费力程度反映排便过程。二者不完全等价。例如：

- Bristol 3 但很费力，仍可能提示便秘倾向。
- Bristol 4 但排便不尽，也可能影响主观腹部状态。
- Bristol 6-7 加急迫感，比单纯 Bristol 6 更像腹泻/刺激反应。

### 5.2.2 推荐记录字段

```text
bowel_time
bristol_type: 1-7
strain_level: 0-3
urgency: yes/no
incomplete_emptying: yes/no
blood_or_black_stool: yes/no
```

### 5.2.3 费力程度定义

| 分数 | 定义 |
|---|---|
| 0 | 不费力，自然排出 |
| 1 | 轻微用力 |
| 2 | 明显用力，但可完成 |
| 3 | 很费力/排不尽/需要很久 |

---

## 5.3 腹部症状

### 5.3.1 原记录粒度的科学性检查

“餐后 2 小时记录腹胀 1-5 分 + 腹痛有/无”方向合理，但需要修正两点：

1. 腹痛不应只记有/无，至少应记录 0-4 强度。
2. 腹胀出现不应直接写成“该餐触发炎症”。它只是短期胃肠反应信号。

### 5.3.2 推荐字段

```text
post_meal_2h_bloating: 0-4
post_meal_2h_pain: 0-4
post_meal_2h_reflux: yes/no
post_meal_2h_heaviness: 0-4
gas: 0-4，可选
```

### 5.3.3 腹胀评分定义

| 分数 | 定义 |
|---|---|
| 0 | 无腹胀 |
| 1 | 轻微，注意到但不影响活动 |
| 2 | 明显，但可忽略 |
| 3 | 不舒服，影响专注或活动 |
| 4 | 严重，明显影响活动或需要处理 |

---

## 5.4 饮水量

### 5.4.1 你的身高体重下的建议

你身高 181 cm，体重 136 斤，即约 68 kg。成年男性的通用参考是每日总水摄入约 3.7 L，其中包括食物中的水分；来自饮品的水约 3.0 L/天是常用估算。该参考不是按体重精确计算，而是成人男性充足摄入量。

对你更实用的记录目标：

- 普通天气、低运动日：饮品水量约 2.3-3.0 L/天。
- 出汗、运动、天气热、吃得咸：额外增加 0.5-1.0 L。
- 不要把“越多越好”作为目标；看尿色、口渴、排便状态和夜尿情况。

### 5.4.2 Dashboard 字段

```text
water_cups_250ml
caffeinated_drinks_cups
alcohol: yes/no
sweating_or_exercise: none/light/moderate/heavy
urine_color_optional: light/normal/dark
```

**建议目标字段：**

- `water_cups_250ml`: 9-12 杯作为初始目标区间。
- 若夜尿明显增加，说明睡前集中补水过多，应调整分布，而不是盲目加量。

---

## 5.5 皮肤评分

### 5.5.1 金标准是什么？

银屑病临床研究常用 PASI（Psoriasis Area and Severity Index）。它把身体分为头颈、上肢、躯干、下肢四个区域，并分别评估：

- 红斑 erythema
- 厚度/浸润 induration
- 鳞屑 scaling
- 受累面积 area

PASI 总分范围为 0-72。它适合医生和临床试验，但对日常自我追踪过重。

### 5.5.2 简化版省略了什么？

简化版通常省略：

- 身体区域权重。
- 每个区域的面积分级。
- 红斑、厚度、鳞屑分别评分。
- 医生视角下的标准化评估。

因此，单个“皮肤状态 1-5 分”不够好，因为它把红、痒、鳞屑、面积混在一起，后期分析会变脏。

### 5.5.3 推荐：自我追踪版 mini-PASI

每天睡前记录 4 个字段：

```text
skin_redness: 0-4
skin_thickness: 0-4
skin_scaling: 0-4
skin_itch: 0-4
skin_area_change: -1/0/+1
photo_taken: yes/no，可选
```

| 分数 | 红斑/厚度/鳞屑/瘙痒通用定义 |
|---|---|
| 0 | 无 |
| 1 | 轻微 |
| 2 | 明显但可忍受 |
| 3 | 较重，影响注意力或舒适度 |
| 4 | 严重，明显影响生活/睡眠 |

`skin_area_change`：

| 值 | 定义 |
|---|---|
| -1 | 比昨天缩小或变淡 |
| 0 | 基本不变 |
| +1 | 比昨天扩大或更红 |

### 5.5.4 准确性与便携性的平衡

推荐两层方案：

**每日轻量版：**

- 红斑 0-4
- 鳞屑 0-4
- 瘙痒 0-4
- 面积变化 -1/0/+1

**每周一次详细版：**

- 固定光线、固定距离拍照。
- 按身体区域记录受累面积：头颈、上肢、躯干、下肢。
- 记录是否出现新发区域。

这样 dashboard 日常数据足够连续，每周数据又能校正主观评分漂移。

---

## 5.6 鼻部症状评分

### 5.6.1 推荐字段

```text
nasal_blockage: 0-4
runny_nose: 0-4
sneezing: 0-4
facial_pressure_or_sinus_pain: 0-4
smell_reduction: yes/no
```

如果你不想每天记录太多，最小版本为：

```text
nasal_blockage: 0-4
sinus_pressure: 0-4
```

### 5.6.2 重要边界

如果出现以下情况，应考虑就医，而不是仅靠 dashboard 追踪：

- 发热。
- 单侧严重面痛。
- 黄绿脓涕持续加重。
- 症状持续超过 10 天不改善。
- 反复鼻窦炎发作。

---

## 6. 建议记录指标

## 6.1 加工食品与添加剂暴露

### 6.1.1 促炎/肠道屏障相关添加剂关注清单

这不是“绝对禁用清单”，而是 dashboard 的暴露标签。证据强弱不同，优先记录证据较集中的类别。

| 类别 | 常见名称 | 证据摘要 | Dashboard 标签 |
|---|---|---|---|
| 乳化剂 | carboxymethylcellulose / CMC / 羧甲基纤维素 / E466 | 动物和人体 proof-of-principle 研究提示可改变菌群、降低 SCFA、增加腹部不适 | `emulsifier_cmc` |
| 乳化剂 | polysorbate 80 / 聚山梨酯-80 / E433 | 动物研究和体外人源菌群模型提示可影响菌群和黏液层 | `emulsifier_p80` |
| 增稠/胶体 | carrageenan / 卡拉胶 | 动物和体外研究提示与肠道炎症模型相关 | `carrageenan` |
| 胶体 | xanthan gum / guar gum / gellan gum | 部分体外研究提示对菌群有影响；不同胶体差异大 | `gums` |
| 人工甜味剂 | sucralose / saccharin / aspartame | 部分研究提示可改变菌群或代谢反应，但个体差异大 | `artificial_sweetener` |
| 糖醇 | erythritol / xylitol / sorbitol | 更确定的是可导致腹胀、腹泻；炎症证据不如乳化剂直接 | `sugar_alcohol` |
| 合成色素 | tartrazine, Allura Red 等 | 更适合作为 UPF 暴露标签；肠炎证据不如 CMC/P80 | `artificial_color` |
| 防腐剂 | BHA/BHT、丙酸盐等 | 证据分散，先作为加工食品暴露标签 | `preservative` |

### 6.1.2 记录方式

不建议每次手动解析所有配料。推荐三层：

1. `processed_food`: yes/no
2. `additive_risk_level`: none/low/medium/high
3. `additive_tags`: CMC/P80/carrageenan/gums/artificial_sweetener/sugar_alcohol/color/preservative

### 6.1.3 风险等级定义

| 等级 | 定义 |
|---|---|
| none | 原型食物或家常烹饪，无明显包装添加剂 |
| low | 有包装食品，但配料简单 |
| medium | 有 1-2 类乳化剂/甜味剂/胶体/防腐剂 |
| high | 多种添加剂叠加，或典型超加工食品：冰淇淋、奶茶、薯片、夹心饼干、即食甜点等 |

---

## 6.2 压力与情绪

### 6.2.1 原“心情 1-10 分”的问题

你指出得对：单独记录“心情 1-10”太粗，也不够贴近机制。压力对炎症和肠道通透性的影响，关键不只是开心/不开心，而是：

- 失控感
- 紧张感
- 过载感
- 急性压力事件
- 身体化反应，如心悸、胃紧、肌肉紧张

### 6.2.2 推荐记录方案

每日不要做完整心理量表，负担太高。建议用“每日压力简表”：

```text
stress_peak: 0-4
stress_duration: none/<1h/1-4h/>4h
control_feeling: 0-4
major_stressor: yes/no
stress_note: 可选文本
```

### 6.2.3 评分定义

`stress_peak`：当天最高压力强度。

| 分数 | 定义 |
|---|---|
| 0 | 无压力 |
| 1 | 轻微紧张 |
| 2 | 明显压力，但可正常处理 |
| 3 | 压力较高，影响专注/消化/情绪 |
| 4 | 极高压力，明显影响身体或睡眠 |

`control_feeling`：当天失控感。

| 分数 | 定义 |
|---|---|
| 0 | 完全可控 |
| 1 | 基本可控 |
| 2 | 一半可控一半不可控 |
| 3 | 多数时间感到不可控 |
| 4 | 强烈失控感 |

### 6.2.4 每周校准

每周一次可加 PSS-4（Perceived Stress Scale 4-item）作为校准，而不是每天做。这样 dashboard 有每日连续数据，也有每周更稳定的心理压力尺度。

---

## 6.3 睡眠

### 6.3.1 原记录粒度的问题

“睡眠质量 1-5 + 时长”方向对，但不够解释问题。睡眠差有多种类型：

- 睡得少。
- 入睡困难。
- 夜醒多。
- 睡够但恢复感差。
- 因瘙痒/鼻塞导致睡眠中断。

这些对皮肤和鼻炎分析意义不同。

### 6.3.2 推荐字段

次日早晨记录：

```text
sleep_duration_hours
sleep_latency_min: 入睡耗时
night_awakenings: 0/1/2/3+
sleep_quality: 0-4
wake_rested: 0-4
itch_disrupted_sleep: yes/no
nasal_disrupted_sleep: yes/no
bed_time
wake_time
```

### 6.3.3 最小版本

如果嫌复杂，保留 4 个：

```text
sleep_duration_hours
night_awakenings
sleep_quality: 0-4
itch_or_nasal_disrupted_sleep: none/itch/nasal/both
```

### 6.3.4 睡眠质量评分定义

| 分数 | 定义 |
|---|---|
| 0 | 很差，明显影响白天状态 |
| 1 | 较差，醒后不恢复 |
| 2 | 一般 |
| 3 | 较好 |
| 4 | 很好，醒后恢复感强 |

---

## 7. 可选但有价值的分析维度

## 7.1 膳食纤维多样性

你说得对，它更适合作为分析层维度，而不是强制症状字段。

### 推荐字段

```text
vegetable_count
fruit_count
legume: yes/no
whole_grain: yes/no
fermented_food: yes/no
fiber_diversity_score: 自动计算
```

### 自动计算建议

```text
fiber_diversity_score = vegetable_count + fruit_count + legume(0/1) + whole_grain(0/1) + fermented_food(0/1)
```

目标不是精确营养学，而是观察：

- 高纤维多样性日后 Bristol 是否更接近 3-4。
- 高纤维多样性是否与皮肤缓解相关。
- 某些高 FODMAP 食物是否反而造成腹胀。

---

## 7.2 口腔症状

口腔症状可作为低成本可选字段：

```text
mouth_ulcer: yes/no
gum_bleeding_or_pain: yes/no
tongue_abnormality: yes/no
```

它不应被设为第一层必须字段，除非你发现口腔症状经常先于皮肤加重。

---

## 8. 完整字段体系：dashboard 版本

## 8.1 每餐表 `meals`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| date | date | 是 | 日期 |
| meal_id | string | 是 | 餐次 ID |
| meal_type | enum | 是 | breakfast/lunch/dinner/snack |
| meal_start_time | time | 是 | 开始时间 |
| meal_duration_min | number | 建议 | 用餐时长 |
| hunger_before | 0-4 | 建议 | 餐前饥饿 |
| stress_before | 0-4 | 建议 | 餐前压力 |
| food_items | text/list | 是 | 主要食材 |
| cooking_method | enum/list | 建议 | 蒸煮炒炸烤等 |
| portion_level | enum | 建议 | 少/正常/多 |
| processed_food | boolean | 是 | 是否加工食品 |
| additive_tags | list | 建议 | CMC/P80/卡拉胶等 |
| supplement | text/list | 是 | 补剂 |

## 8.2 餐后反应表 `post_meal_symptoms`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| meal_id | string | 是 | 对应餐次 |
| bloating_2h | 0-4 | 是 | 腹胀 |
| pain_2h | 0-4 | 是 | 腹痛 |
| heaviness_2h | 0-4 | 建议 | 沉重感 |
| reflux_2h | boolean | 建议 | 反酸 |
| notes | text | 可选 | 特殊备注 |

## 8.3 排便表 `bowel_movements`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| datetime | datetime | 是 | 时间 |
| bristol_type | 1-7 | 是 | Bristol 类型 |
| strain_level | 0-3 | 是 | 费力程度 |
| urgency | boolean | 建议 | 是否急迫 |
| incomplete_emptying | boolean | 可选 | 是否排不尽 |
| abnormal_color_or_blood | boolean | 是 | 异常时就医 |

## 8.4 每日汇总表 `daily_summary`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| date | date | 是 | 日期 |
| water_cups_250ml | number | 是 | 饮水杯数 |
| stress_peak | 0-4 | 是 | 当天最高压力 |
| stress_duration | enum | 建议 | none/<1h/1-4h/>4h |
| control_feeling | 0-4 | 建议 | 失控感 |
| skin_redness | 0-4 | 是 | 红斑 |
| skin_thickness | 0-4 | 是 | 厚度 |
| skin_scaling | 0-4 | 是 | 鳞屑 |
| skin_itch | 0-4 | 是 | 瘙痒 |
| skin_area_change | -1/0/+1 | 是 | 面积变化 |
| nasal_blockage | 0-4 | 是 | 鼻塞 |
| sinus_pressure | 0-4 | 建议 | 鼻窦压痛/面部压迫 |
| mouth_ulcer | boolean | 可选 | 口腔溃疡 |

## 8.5 睡眠表 `sleep`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| date_for_sleep | date | 是 | 对应前一晚 |
| bed_time | time | 是 | 上床时间 |
| wake_time | time | 是 | 起床时间 |
| sleep_duration_hours | number | 是 | 实际睡眠时长 |
| night_awakenings | enum | 是 | 0/1/2/3+ |
| sleep_quality | 0-4 | 是 | 主观睡眠质量 |
| wake_rested | 0-4 | 是 | 恢复感 |
| itch_disrupted_sleep | boolean | 是 | 瘙痒是否影响睡眠 |
| nasal_disrupted_sleep | boolean | 是 | 鼻塞是否影响睡眠 |

---

## 9. 分析逻辑

## 9.1 核心滞后窗口

| 暴露/信号 | 观察窗口 | 分析方式 |
|:--|:--|:--|
| 餐后腹胀/腹痛 | 0-2 小时 | 短期胃肠反应 |
| 排便变化 | 12-48 小时 | 肠道通过时间/刺激反应 |
| 皮肤红斑/瘙痒变化 | 1-3 天 | 下游炎症输出 |
| 睡眠差/压力高 | 当天至 2 天后 | 协变量或独立触发因素 |
| 加工食品/添加剂 | 0-3 天 | 暴露-反应模式 |

## 9.2 不要只做相关性，先做事件窗口分析

推荐 dashboard 第一阶段使用简单、可解释的分析：

### 事件窗口示例

```text
当 additive_risk_level = high 时：
观察 D+0 腹胀、D+1 Bristol、D+1~D+3 皮肤评分变化。
```

### 触发模式定义

某个食物或标签只有满足以下条件，才进入“疑似触发因素”：

1. 至少出现 3 次暴露。
2. 暴露后 1-3 天内皮肤评分上升的比例明显高于未暴露日。
3. 不能完全由压力高、睡眠差、感染、熬夜解释。
4. 最好经过一次“排除-再引入”验证。

## 9.3 推荐 dashboard 图表

| 图表 | 用途 |
|---|---|
| 时间线：饮食/压力/睡眠/排便/皮肤 | 看整体趋势 |
| 皮肤评分 7 日移动平均 | 降低单日噪声 |
| 食物/添加剂暴露后的 D+1/D+2/D+3 平均皮肤变化 | 识别滞后模式 |
| Bristol 分布图 | 看肠道状态稳定性 |
| 高压力日 vs 低压力日皮肤变化 | 判断压力影响 |
| 睡眠差日后皮肤变化 | 判断睡眠影响 |
| 加工食品风险等级与腹胀/皮肤变化 | 判断 UPF 暴露影响 |

---

## 11. 关键参考资料

### 银屑病、肠道屏障、肠道-皮肤轴

- Tlaskalová-Hogenová H et al. *Gut microbiome as regulator of the gut-skin axis.* Frontiers in Microbiology. 2018. PubMed PMID: 30061869.
- PubMed PMID: 1911568. 早期关于银屑病患者肠道通透性的研究。
- 关于 2025 Uppsala University 银屑病与肠道通透性研究，可搜索：`Uppsala psoriasis intestinal permeability 2025`。

### DII 膳食炎症指数

- Shivappa N et al. *Designing and developing a literature-derived, population-based dietary inflammatory index.* Public Health Nutrition. 2014. DOI: 10.1017/S1368980013002115.
- PubMed PMID: 39069586. 2024 年关于 DII 与银屑病关系的研究。

### 食品添加剂、乳化剂、超加工食品

- Chassaing B et al. *Dietary emulsifiers impact the mouse gut microbiota promoting colitis and metabolic syndrome.* Nature. 2015. DOI: 10.1038/nature14232.
- Naimi S et al. *Direct impact of commonly used dietary emulsifiers on human gut microbiota.* Microbiome. 2021.
- Whelan K et al. *Ultra-processed foods and food additives in gut health and disease.* Nature Reviews Gastroenterology & Hepatology. 2024.
- Martino JV et al. *The Role of Carrageenan and Carboxymethylcellulose in the Development of Intestinal Inflammation.* Frontiers in Pediatrics. 2017.

### Bristol 大便分类法

- Lewis SJ, Heaton KW. *Stool form scale as a useful guide to intestinal transit time.* Scandinavian Journal of Gastroenterology. 1997. PMID: 9299672.

### 压力

- Cohen S, Kamarck T, Mermelstein R. *A global measure of perceived stress.* Journal of Health and Social Behavior. 1983. PMID: 6668417.
- Karl JP et al. *Effects of psychological, environmental and physical stressors on the gut microbiota.* Frontiers in Microbiology. 2018. DOI: 10.3389/fmicb.2018.02013.

### 睡眠

- PROMIS Sleep Disturbance 量表可作为未来扩展参考，但日常 dashboard 不建议完整照搬。

### 饮水

- National Academies / Institute of Medicine. *Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate.* 成人男性总水充足摄入量约 3.7 L/天，其中约 3.0 L 来自饮品。

---

## 12. 最终结论

最重要的数据记录设计原则：

1. 皮肤评分不要只用一个总分，至少拆成红斑、鳞屑、瘙痒、面积变化。
2. 压力不要只记心情，改为压力峰值、持续时间、失控感。
3. 睡眠不要只记质量，至少加睡眠时长、夜醒、是否被痒/鼻塞打断。
4. 腹胀是短期反应信号。
5. 鼻部症状作为并行输出变量，不默认归因于肠漏。
6. 添加剂记录采用标签化，不做复杂营养学计算。
7. 第一阶段用事件窗口分析，而不是复杂因果建模。
8. dashboard 的价值来自连续记录 4-8 周后的个体模式，而不是单日解释。
