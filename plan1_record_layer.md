# Phase 1 Plan: Record Layer

目标是定义第一阶段的记录层：稳定、低成本地采集原始数据，保存到服务器端 SQLite，并在时间线中确认记录已保存。

Phase 1 不做因果判断，不做医学诊断，不生成 insight，不生成 decision。这个阶段只保证数据能被快速、连续、结构化地记录下来。

## 1. Phase 1 目标

Phase 1 只完成三件事：

- 快速记录
- 保存到服务器端 SQLite
- 在时间线中确认记录已保存

Phase 1 不判断：

- 某个食物是否触发炎症
- 腹胀是否代表该餐触发炎症
- 鼻部症状是否由肠漏导致
- 单日症状变化是否有明确医学意义

## 2. 产品边界

必须遵守：

- 数据写入服务器端 SQLite
- 前端通过 API 写入数据
- 不让前端直接访问数据库
- iPhone 只负责通过 PWA 页面提交数据
- 核心数据不依赖 IndexedDB

不做：

- 登录系统
- 多用户
- 云同步
- AI 分析
- 医学诊断
- 推送通知
- 复杂图表
- 食物数据库
- DII 自动计算
- 配料表 OCR
- 治疗建议

## 3. 页面范围

Phase 1 只需要两个核心页面。

### `/record`

记录入口页。

页面展示 8 个入口，每个入口进入一个小表单，不做成一张巨大表单：

- 记录一餐
- 补剂
- 餐后两小时反应
- 排泄状态
- 喝水
- 流鼻血
- 睡前总结
- 次日早晨睡眠质量评估

所有入口都必须有 `notes` 字段。`notes` 用于补充结构化字段无法表达的信息，例如特殊食材、异常感受、当天背景、药物变化、环境变化、记录不确定性等。Phase 1 中 `notes` 只作为原始文本保存，不参与自动判断。

所有存在理解门槛的枚举字段，UI 都应该提供简短示例或定义提示，避免用户因为不知道标准而乱填。例如：

- `bristol_type` 要直接展示 1-7 型示例说明
- 食材做法字段要明确告诉用户“鸡胸肉”和“水煮”应拆开记录
- 不确定时允许先填原始文本，再补结构化字段

### `/timeline`

记录时间线。

用于确认数据已经保存。时间线按时间倒序展示：

- 餐食记录
- 补剂记录
- 餐后反应
- 排便记录
- 饮水记录
- 流鼻血记录
- 睡前总结
- 睡眠记录

Phase 1 的时间线只展示原始记录，不解释、不分析、不生成建议。

## 4. 数据存储方式

`方向.md` 中规定的数据存储方式是服务器端 SQLite。

固定数据流：

```text
React 页面
↓
Next.js Route Handler
↓
lib/db
↓
SQLite
```

Phase 1 可以先使用一张 `records` 表，把不同类型记录作为 JSON payload 保存。

建议字段：

```text
id
type
occurred_at
payload_json
created_at
updated_at
```

说明：

- `type` 表示记录类型。
- `occurred_at` 是记录排序和事件窗口分析的权威时间。
- 事件型记录中，`occurred_at` 表示实际发生时间，不在 payload 中重复保存 `*_time` 字段。
- 汇总型记录中，`occurred_at` 表示填写时间，payload 中可保存归属日期，例如 `summary_date`、`sleep_date`。
- `payload_json` 保存该记录类型对应的数据样式。
- `notes` 是每类 payload 的通用可选字段。
- 使用 Zod 校验不同 `type` 对应的 payload。
- API 层负责校验 `related_record_id` 指向的记录存在且类型正确。
- `daily_summary` 按 `summary_date` 做 upsert；同一天再次提交时更新原记录。
- `sleep` 按 `sleep_date` 做 upsert；同一睡眠归属日期再次提交时更新原记录。
- 后续 Phase 2 再从 `records` 生成更规整的 `structured_records`。

Phase 1 不要过早拆很多表，除非实现明显更简单。

## 5. API

Phase 1 使用：

- `POST /api/records`
- `GET /api/records`

### `POST /api/records`

用于创建记录。

请求体包含：

```text
type
occurred_at
payload
```

`type` 可选：

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

`payload` 存放对应记录类型的字段。每个 `payload` 都允许：

```text
notes
```

写入规则：

- `daily_summary`: 按 `summary_date` upsert。
- `sleep`: 按 `sleep_date` upsert。
- `supplement.related_record_id`: 如果存在，必须指向 `type = meal` 的记录。
- `post_meal_symptom.related_record_id`: 必须指向 `type = meal` 的记录。
- upsert 请求必须在服务端防重复点击导致的重复插入。

### `GET /api/records`

用于时间线展示。

支持按时间倒序返回记录。Phase 1 不需要复杂筛选。

最小分页参数：

```text
limit
cursor
```

说明：

- `limit` 控制每次返回数量。
- `cursor` 用于加载更早记录。
- 排序使用 `(occurred_at DESC, id DESC)`。
- `cursor` 包含上一页最后一条记录的 `occurred_at + id`，避免同一时间多条记录时分页重复或漏记录。
- Phase 1 不做复杂筛选，但时间线不应该一次性加载全部历史记录。

Phase 1.1 可以补充：

- `PATCH /api/records/:id`
- `DELETE /api/records/:id`

说明：

- 健康记录很容易误填，编辑/删除能力有利于数据质量；但它不是 Phase 1 首屏闭环的阻塞项。
- 删除记录时，如果该记录被其他记录的 `related_record_id` 引用，Phase 1.1 默认禁止删除，避免产生断裂关联。

## 6. 记录类型

Phase 1 按事件类型记录，而不是按一张 daily form 记录。

每个记录类型统一包含：

- `type`
- `occurred_at`
- 对应 payload 字段
- `notes`

`notes` 不代替结构化字段。能稳定量化的内容仍然优先使用结构化字段；只有结构化字段不够描述时，才补充到 `notes`。

通用实现规则：

- `yes/no` 在代码和 JSON 中统一保存为 boolean：`true/false`。
- 固定选项字段用 enum，例如 `meal_type: breakfast/lunch/dinner/snack`。
- 时间线按 `records.occurred_at` 排序。
- 关联其他记录时，使用 `related_record_id` 指向被关联记录的 `records.id`。
- UI 默认值不能直接等于真实数据。只有用户确认或字段被明确保存时，才写入 `false`、`0` 等确定值；未确认状态应保存为 `null` 或不保存该字段。
- `notes` 建议限制长度，例如 500 字以内；时间线只展示截断摘要，详情页展示完整内容。

### 6.1 记录一餐

记录目的：记录饮食输入变量，同时建立进食前状态。重点不是精确称重，而是识别哪些食物、加工食品、添加剂暴露后，腹胀、排便、皮肤、鼻部症状是否有稳定变化。

记录时间：

```text
餐前状态：每餐开始前 0-5 分钟内记录
餐食内容：每餐结束后 3 分钟内补充或确认
```

说明：`hunger_before` 和 `stress_before` 不单独做一个 record type，直接合并进 `meal` payload。这样可以减少记录负担，也避免额外维护 `meal_id` 关联。

必填字段：

```text
meal_type: breakfast/lunch/dinner/snack
hunger_before: 0-4
stress_before: 0-4
food_text_raw OR food_items
```

建议字段：

```text
meal_duration_min
processed_food: boolean
additive_risk_level: none/low/medium/high
additive_tags
portion_level: small/normal/large
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `occurred_at` | 记录这餐的开始时间，用于观察进食节律与症状变化。 |
| `meal_duration_min` | 记录用餐时长，用于描述进食节奏。 |
| `meal_type` | 区分早餐、午餐、晚餐、零食。 |
| `hunger_before` | 建立进食前状态；记录时间为每餐开始前 0-5 分钟内。 |
| `stress_before` | 记录餐前压力，作为压力/肠脑轴相关协变量，避免把压力影响误认为食物影响。 |
| `food_items` | 记录主要食材及对应做法，是饮食输入端的核心变量。 |
| `food_text_raw` | 可选保留原始餐食文本，适合先粗略记录、之后再结构化。 |
| `processed_food` | 标记是否摄入加工/超加工食品，是添加剂暴露和 UPF 暴露的第一层标签。 |
| `additive_risk_level` | 粗略记录添加剂风险等级，便于观察 medium/high 暴露后 0-3 天内腹胀、排便、皮肤是否变化。 |
| `additive_tags` | 标签化记录 CMC、P80、卡拉胶、胶体、人工甜味剂、糖醇、色素、防腐剂等，不做复杂配料解析。 |
| `portion_level` | 记录摄入量大致水平，用于区分少量尝试和大量摄入。 |
| `notes` | 记录结构化字段无法表达的餐食细节，例如混合菜、外食不确定成分、特殊调料、异常进食场景。 |

说明：

- `food_items` 使用数组结构，食材和做法绑定在同一个对象中。
- 做法优先作为 `food_items[].method` 单独记录，而不是直接揉进食材名。推荐写法是 `鸡胸肉 + boil`，而不是把所有东西都写成 `水煮鸡胸肉`。
- 如果用户只知道成品名或外卖名，例如 `鸡米花`，允许直接写在 `food_text_raw` 中，后续再决定是否拆成结构化食材。
- 如果用户只想快速输入一整段餐食文本，可以先保存到 `food_text_raw`；`food_items` 可之后补齐。
- `food_text_raw` 和 `food_items` 至少有一个非空，二者不要求同时填写。
- `additive_tags` 使用标签，不做复杂配料解析。
- 不计算 DII。
- 不使用 `meal_id` 或 `meal_start_time`。餐食记录保存后由数据库生成 `records.id`，其他记录用 `related_record_id` 关联这条 meal record。
- `cooking_method` 不作为餐次级单值字段；同一餐可能有多个菜品和做法，因此每个 `food_items` 元素可以有自己的 `method`。
- `processed_food` 不默认写入 `false`；未确认时应为 `null` 或不保存。

`food_items` 结构：

```text
food_text_raw?: string
food_items?: Array<{
  name: string
  method?: steam/boil/stir_fry/deep_fry/bake/raw/eat_out/unknown
}>
```

添加剂风险等级定义：

| 等级 | 定义 |
|---|---|
| `none` | 原型食物或家常烹饪，无明显包装添加剂。 |
| `low` | 有包装食品，但配料简单。 |
| `medium` | 有 1-2 类乳化剂/甜味剂/胶体/防腐剂。 |
| `high` | 多种添加剂叠加，或典型超加工食品：冰淇淋、奶茶、薯片、夹心饼干、即食甜点等。 |

### 6.2 补剂

记录目的：补剂属于干预变量，应该独立于食物记录，避免混在 `food_items` 里污染饮食输入。

记录时间：

```text
服用后立即记录，或随餐服用时在餐食记录后补充
```

必填字段：

```text
supplement_name
```

建议字段：

```text
brand
dose_text
taken_with_meal: boolean
related_record_id
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `occurred_at` | 记录补剂实际摄入时间。 |
| `supplement_name` | 记录补剂名称，作为独立干预变量。 |
| `brand` |  |
| `dose_text` | 记录剂量/含量，便于区分不同摄入强度。 |
| `taken_with_meal` | 标记是否随餐服用。 |
| `related_record_id` | 如果随餐服用，指向对应 meal 记录的 `records.id`。 |
| `notes` | 记录结构化字段无法表达的补剂信息，例如临时换品牌、漏服、分次服用、身体反应、剂量不确定。 |

说明：

- 补剂先用自由文本，不做补剂数据库。
- 如果补剂随餐服用，可以关联到一条餐食记录。
- 补剂入口应支持“同一时间点批量录入多个补剂”，但底层仍保存为多条独立 `supplement` record，而不是把多个补剂揉成一个数组字段。这样后续分析仍能把每种补剂视为独立干预变量。

### 6.3 餐后两小时反应

记录目的：捕捉短期胃肠反应。`research_v2.md` 明确要求不要把腹胀直接写成“该餐触发炎症”，它只是短期胃肠反应信号。

记录时间：

```text
餐后约 2 小时记录
```

必填字段：

```text
related_record_id
```

建议字段：

```text
post_meal_2h_bloating: 0-4
post_meal_2h_pain: 0-4
post_meal_2h_reflux: boolean
post_meal_2h_heaviness: 0-4
gas: 0-4
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `related_record_id` | 指向对应 meal 记录的 `records.id`，便于观察餐后短期胃肠反应。 |
| `occurred_at` | 记录餐后反应实际评估时间；如果是补记，允许用户手动调整。Phase 2 可用它和 meal 的 `occurred_at` 计算 `minutes_after_meal`。 |
| `post_meal_2h_bloating` | 腹胀强度，是短期胃肠反应信号。 |
| `post_meal_2h_pain` | 腹痛强度；不只记录有/无。 |
| `post_meal_2h_reflux` | 记录反酸。 |
| `post_meal_2h_heaviness` | 记录餐后沉重感。 |
| `gas` | 可选记录产气/胀气。 |
| `notes` | 记录结构化字段无法表达的餐后反应，例如恶心、困倦、心悸、头痛、鼻塞加重、症状开始和结束时间。 |

说明：

- 该记录必须关联到一条餐食记录。
- 服务端必须校验 `related_record_id` 指向的记录存在，且 `type = meal`。
- 症状字段未确认时应为 `null` 或不保存，不要把未点击默认值当作真实 0。
- 不允许在 UI 中写“该餐触发炎症”。
- 腹胀只是短期反应信号，不是因果结论。

腹胀评分定义：

| 分数 | 定义 |
|---|---|
| 0 | 无腹胀 |
| 1 | 轻微，注意到但不影响活动 |
| 2 | 明显，但可忽略 |
| 3 | 不舒服，影响专注或活动 |
| 4 | 严重，明显影响活动或需要处理 |

### 6.4 排泄状态

记录目的：Bristol 反映粪便形态，费力程度反映排便过程。二者不完全等价，所以都需要记录。排便是低成本、高价值的肠道代理指标。

记录时间：

```text
每次排便后记录
```

必填字段：

```text
bristol_type: 1-7
strain_level: 0-3
```

建议字段：

```text
urgency: boolean
incomplete_emptying: boolean
blood_or_black_stool: boolean
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `occurred_at` | 记录排便时间。 |
| `bristol_type` | 反映粪便形态，是肠道通过时间/刺激反应的代理指标。 |
| `strain_level` | 反映排便过程；Bristol 3 但很费力仍可能提示便秘倾向。 |
| `urgency` | Bristol 6-7 加急迫感，比单纯 Bristol 6 更像腹泻/刺激反应。 |
| `incomplete_emptying` | 记录排便不尽，可能影响主观腹部状态。 |
| `blood_or_black_stool` | 异常警示字段；出现黑便或血便时不应只靠 dashboard 追踪。 |
| `notes` | 记录结构化字段无法表达的排便情况，例如颜色异常描述、腹痛伴随、是否和月经/药物/外食相关、记录不确定性。 |

说明：

- Bristol 和费力程度都要记录。
- boolean 字段未确认时应为 `null` 或不保存；UI 默认状态不能直接写入真实 `false`。
- 如果 `blood_or_black_stool = true`，只显示固定安全提示；这不是系统分析结论。

### 6.5 喝水

记录目的：记录饮水量及可能影响水分需求的因素。`research_v2.md` 建议普通天气、低运动日饮品水量约 2.3-3.0 L/天，250ml 计约 9-12 杯。

记录时间：

```text
每喝完一瓶或一大段水后追加记录；也可以用快捷按钮记录任意毫升数
```

必填字段：

```text
amount_ml
```

建议字段：

```text
drink_type: water/coffee/tea/other
sweating_or_exercise: none/light/moderate/heavy
urine_color_optional: light/normal/dark
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `occurred_at` | 记录这次饮水发生时间。 |
| `amount_ml` | 记录本次饮水量，支持 250/500/750/1000 ml 快捷值和自定义值。 |
| `drink_type` | 记录本次饮品类型。你经常喝咖啡，因此咖啡作为事件级饮品类型记录。 |
| `sweating_or_exercise` | 标记出汗/运动导致的额外水分需求。 |
| `urine_color_optional` | 可辅助判断水分状态。 |
| `notes` | 记录结构化字段无法表达的补水背景，例如天气热、运动、出汗、夜尿、口渴、饮料类型。 |

说明：

- `amount_ml` 必须是正整数，建议 Zod 限制为 `1-5000`，避免误填污染当天总量。
- 当天总饮水量由系统按日期自动汇总 `water.amount_ml`。
- 当天咖啡摄入可通过 `drink_type = coffee` 的记录汇总。
- 不在睡前总结中重复填写当天确认总量，避免两个水量来源冲突。
- 若夜尿明显增加，说明睡前集中补水过多，应调整分布，而不是盲目加量。
- 你基本不喝酒，Phase 1 不设置酒精字段；如果偶发饮酒，用 `notes` 记录即可。

### 6.6 流鼻血

记录目的：`research_v2.md` 没有说明流鼻血在饮食-肠道-皮肤轴中的作用，因此 Phase 1 只作为原始事件记录，不解释、不归因。

记录时间：

```text
发生后尽快记录
```

必填字段：

```text
无额外必填字段
```

建议字段：

```text
nosebleed_side: left/right/both/unknown
nosebleed_amount: light/moderate/heavy
nosebleed_duration_min
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `occurred_at` | 记录流鼻血发生时间。 |
| `nosebleed_side` |  |
| `nosebleed_amount` |  |
| `nosebleed_duration_min` |  |
| `notes` | 记录结构化字段无法表达的情况，例如天气干燥、擤鼻、外伤、鼻塞、用药、是否反复发生。 |

### 6.7 睡前总结

记录目的：睡前汇总当天输出变量和协变量。皮肤是明确存在的炎症终端表现；鼻部症状作为并行输出变量记录，不默认与皮肤同源，也不默认归因于肠漏。

记录时间：

```text
每天睡前记录
```

必填字段：

```text
summary_date
skin_redness: 0-4
skin_scaling: 0-4
skin_itch: 0-4
skin_area_change: -1/0/+1
nasal_blockage: 0-4
stress_peak: 0-4
```

建议字段：

```text
skin_thickness: 0-4
photo_taken: boolean
runny_nose: 0-4
sneezing: 0-4
facial_pressure_or_sinus_pain: 0-4
smell_reduction: boolean
stress_duration: none/<1h/1-4h/>4h
control_feeling: 0-4
major_stressor: boolean
stress_note
vegetable_count
fruit_count
legume: boolean
whole_grain: boolean
fermented_food: boolean
mouth_ulcer: boolean
gum_bleeding_or_pain: boolean
tongue_abnormality: boolean
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `summary_date` | 对应当天日期。 |
| `skin_redness` | 皮肤红斑评分；不要用单个皮肤总分混合红、痒、鳞屑、面积。 |
| `skin_thickness` | 皮肤厚度/浸润评分。 |
| `skin_scaling` | 鳞屑评分。 |
| `skin_itch` | 瘙痒评分。 |
| `skin_area_change` | 记录相对昨天的面积/红斑变化，用于观察 1-3 天滞后变化。 |
| `photo_taken` | 可用于每周校正主观评分漂移。 |
| `nasal_blockage` | 鼻塞评分，作为并行输出变量。 |
| `runny_nose` | 流鼻涕评分，作为鼻部症状维度。 |
| `sneezing` | 打喷嚏评分，作为鼻部症状维度。 |
| `facial_pressure_or_sinus_pain` | 面部压迫/鼻窦痛评分。 |
| `smell_reduction` | 嗅觉下降记录。 |
| `stress_peak` | 当天最高压力强度。 |
| `stress_duration` | 当天压力持续时间。 |
| `control_feeling` | 当天失控感。 |
| `major_stressor` | 标记是否发生重大压力事件。 |
| `stress_note` | 可选记录压力事件备注。 |
| `vegetable_count` | 用于膳食纤维多样性分析。 |
| `fruit_count` | 用于膳食纤维多样性分析。 |
| `legume` | 用于膳食纤维多样性分析。 |
| `whole_grain` | 用于膳食纤维多样性分析。 |
| `fermented_food` | 用于膳食纤维多样性分析。 |
| `mouth_ulcer` | 可选口腔症状字段；如果经常先于皮肤加重，可作为早期预警信号。 |
| `gum_bleeding_or_pain` | 可选口腔症状字段。 |
| `tongue_abnormality` | 可选口腔症状字段。 |
| `notes` | 记录结构化字段无法表达的当天背景，例如皮肤新发部位、照片条件、鼻部特殊症状、压力事件、用药、天气、运动、感染迹象。 |

说明：

- 不使用单个“皮肤总分”。
- 皮肤至少拆成红斑、鳞屑、瘙痒、面积变化。
- 鼻部症状作为并行变量，不默认归因于肠漏。
- 睡前总结不再填写 `water_cups_250ml`；当天饮水总量从 `water.amount_ml` 自动汇总。

纤维多样性可在结构化层自动计算：

```text
fiber_diversity_score = vegetable_count + fruit_count + legume(0/1) + whole_grain(0/1) + fermented_food(0/1)
```

### 6.8 次日早晨睡眠质量评估

记录目的：睡眠回忆在次日早晨更准确。睡眠是协变量，后续分析可以控制睡眠差对皮肤、鼻部、肠道症状的独立影响。

记录时间：

```text
次日早晨记录前一晚睡眠
```

必填字段：

```text
sleep_date
sleep_duration_hours
night_awakenings: 0/1/2/3_plus
sleep_quality: 0-4
sleep_disruption: none/itch/nasal/both
```

建议字段：

```text
bed_at
wake_at
sleep_latency_min
wake_rested: 0-4
notes
```

变量作用：

| 变量 | 作用 |
|---|---|
| `occurred_at` | 记录次日早晨填写睡眠记录的时间。 |
| `sleep_date` | 对应前一晚睡眠归属日期。 |
| `sleep_duration_hours` | 记录实际睡眠时长。 |
| `sleep_latency_min` | 记录入睡耗时，用于区分入睡困难。 |
| `night_awakenings` | 记录夜醒次数。 |
| `sleep_quality` | 主观睡眠质量。 |
| `wake_rested` | 起床恢复感。 |
| `sleep_disruption` | 记录睡眠是否被瘙痒或鼻部症状打断。 |
| `bed_at` | 记录上床时间，使用完整 datetime，避免跨午夜歧义。 |
| `wake_at` | 记录起床时间，使用完整 datetime，避免跨午夜歧义。 |
| `notes` | 记录结构化字段无法表达的睡眠背景，例如做梦、熬夜原因、环境噪音、夜尿、鼻塞时段、瘙痒部位。 |

说明：

- 睡眠记录建议在次日早晨填写。
- `sleep_date` 表示这条睡眠记录归属的夜晚日期，默认使用前一天日期；`bed_at` 和 `wake_at` 如填写，必须保存完整 datetime。
- 不只记录“睡眠质量”，必须记录时长和夜醒次数。
- 睡眠中断只保留 `sleep_disruption` 一个 enum，避免与多个 boolean 字段互相矛盾。

## 7. 评分规则

症状类字段统一使用 0-4。

```text
0 = 无
1 = 轻微
2 = 明显但可忍受
3 = 较重，影响注意力或舒适度
4 = 严重，明显影响生活、活动或睡眠
```

费力程度使用 0-3。

```text
0 = 不费力，自然排出
1 = 轻微用力
2 = 明显用力，但可完成
3 = 很费力、排不尽或需要很久
```

皮肤面积变化使用 -1/0/+1。

```text
-1 = 比昨天缩小或变淡
0 = 基本不变
+1 = 比昨天扩大或更红
```

压力峰值定义：

| 分数 | 定义 |
|---|---|
| 0 | 无压力 |
| 1 | 轻微紧张 |
| 2 | 明显压力，但可正常处理 |
| 3 | 压力较高，影响专注/消化/情绪 |
| 4 | 极高压力，明显影响身体或睡眠 |

失控感定义：

| 分数 | 定义 |
|---|---|
| 0 | 完全可控 |
| 1 | 基本可控 |
| 2 | 一半可控一半不可控 |
| 3 | 多数时间感到不可控 |
| 4 | 强烈失控感 |

睡眠质量评分定义：

| 分数 | 定义 |
|---|---|
| 0 | 很差，明显影响白天状态 |
| 1 | 较差，醒后不恢复 |
| 2 | 一般 |
| 3 | 较好 |
| 4 | 很好，醒后恢复感强 |

## 8. 表单原则

表单必须适合快速填写。

要求：

- 每个表单尽量 10-60 秒完成
- 数值字段用按钮或 segmented control
- 是否字段用 toggle
- 文本字段允许空值
- 每个表单都有 `notes` 文本框
- `notes` 默认折叠或放在表单末尾，避免增加日常记录负担
- 保存失败要明确提示
- 保存成功后返回 `/record` 或显示继续记录入口

不要要求用户一次补全全天所有字段。

## 9. 时间线展示

时间线展示原始记录摘要。

示例：

```text
08:30 早餐：燕麦、鸡蛋；饥饿 2，压力 1；加工食品：否
08:35 补剂：维生素 D 1000 IU
10:30 餐后反应：腹胀 1，腹痛 0
13:20 排便：Bristol 4，费力 0
20:00 饮水：1000 ml
23:10 睡前总结：红斑 2，鳞屑 2，瘙痒 1，鼻塞 1
次日 08:00 睡眠：7.2h，夜醒 1，质量 3
```

如果 `notes` 不为空，时间线可以显示简短提示，例如：

```text
10:30 餐后反应：腹胀 1，腹痛 0；备注：饭后明显困倦
```

时间线 fallback：

- 餐食缺少结构化食材时，显示 `food_text_raw`。
- 餐食既没有 `food_text_raw` 也没有 `food_items` 时，显示“餐食：未填写食材”。
- 关联餐食不可用时，显示“关联餐食不可用”，不隐藏该记录。
- `notes` 只展示前 60 字，完整内容在详情中显示。

时间线不能输出分析结论。

## 10. 验收标准

Phase 1 完成后应满足：

- 可以在 `/record` 创建所有 Phase 1 记录类型
- 每个记录入口都有 `notes` 字段
- 记录通过 API 保存到 SQLite
- Zod 能校验每类记录 payload
- `/timeline` 能按时间倒序展示记录
- 刷新页面后记录仍存在
- 不依赖 IndexedDB 存储核心数据
- 不出现医学诊断、因果判断或行动建议

## 11. 懒人记录优化

记录系统的第一原则是减少摩擦。字段再完整，如果不能连续记录 4-8 周，就没有分析价值。

### 11.1 通用快捷原则

- `occurred_at` 默认使用当前时间，允许手动调整。
- `notes` 默认折叠，只有需要补充时再展开。
- `notes` 输入框显示字数计数和上限提示。
- 最近使用过的选项优先展示。
- 所有 0-4 评分用一排按钮，不用输入框。
- boolean 字段用 toggle。
- enum 字段用 segmented control。
- 保存后回到 `/record`，并显示“继续记录同类/记录相关事件”的入口。

### 11.2 餐食记录优化

餐食记录是最容易变重的入口，优先做成“先保存粗粒度，再补细节”。

推荐交互：

- 默认根据当前时间推断 `meal_type`。
- `hunger_before`、`stress_before` 使用 0-4 快捷按钮。
- `processed_food` 不默认保存为 `false`；UI 可以默认显示“未确认”，用户点选后再保存 `true/false`。
- `portion_level` 默认 `normal`。
- `food_items` 支持先输入一整段文本保存到 `food_text_raw`，再逐步结构化为 `{ name, method }`。
- 提供“复制上一餐”“复制昨日同餐”。
- 常吃食物、常用做法、常见早餐组合可作为快捷模板。

最小可保存版本：

```text
meal_type
hunger_before
stress_before
food_text_raw OR food_items
```

### 11.3 补剂记录优化

补剂通常重复性高，适合收藏模板。

推荐交互：

- 常用补剂做成一键按钮，例如“维生素 D 1000 IU”。
- 点一次直接保存当前时间。
- 如果刚记录过一餐，自动提示是否关联最近一餐。
- `brand` 和 `dose_text` 可从上次同名补剂自动带出。

### 11.4 餐后反应优化

餐后反应应该尽量减少寻找餐次的成本。

推荐交互：

- 默认关联最近一条 meal record。
- 显示最近 3 餐供切换。
- 腹胀/腹痛默认显示“未记录”，用户点选后才保存 0-4。
- 保存后自动计算并展示“距离该餐约 X 分钟”，但不做因果判断。

### 11.5 排便记录优化

排便记录应尽量一屏完成。

推荐交互：

- Bristol 1-7 用图标或 7 个按钮。
- `strain_level` 用 0-3 按钮。
- `urgency`、`incomplete_emptying`、`blood_or_black_stool` 放在可选区；用户未确认时不写入真实 `false`。
- 正常情况两次点击即可保存：Bristol + 费力程度。

### 11.6 喝水记录优化

你的习惯是每喝完约 1L 记录一次，因此水记录应以快捷毫升按钮为主。

推荐交互：

- 快捷按钮：250 ml、500 ml、750 ml、1000 ml。
- 默认突出显示 1000 ml。
- `drink_type` 默认显示 water，可快速切换 coffee/tea/other。
- 支持自定义 `amount_ml`。
- 当天累计水量由系统自动展示。
- 当天咖啡摄入次数由系统按 `drink_type = coffee` 自动展示。
- 不要求睡前再次确认总量。

### 11.7 流鼻血记录优化

流鼻血是低频事件，不应占用日常入口太多空间。

推荐交互：

- 默认只需点“发生流鼻血”即可保存。
- 侧别、出血量、持续时间放在展开区。
- `notes` 用于补充诱因或特殊情况。

### 11.8 睡前总结优化

睡前总结字段较多，但默认只展示核心字段。

核心区：

```text
skin_redness
skin_scaling
skin_itch
skin_area_change
nasal_blockage
stress_peak
```

展开区：

```text
skin_thickness
photo_taken
runny_nose
sneezing
facial_pressure_or_sinus_pain
smell_reduction
stress_duration
control_feeling
major_stressor
stress_note
fiber fields
mouth fields
notes
```

推荐交互：

- 默认带出昨天的皮肤评分，用户只调整变化项。
- `skin_area_change` 用三个按钮：变好/不变/变差。
- 鼻部和压力字段用按钮，不用输入框。
- 纤维和口腔字段默认折叠。

### 11.9 睡眠记录优化

睡眠记录应在早晨 30 秒内完成。

推荐交互：

- `sleep_date` 默认前一天日期。
- `sleep_duration_hours` 支持数字步进或快捷值。
- `night_awakenings` 用 0/1/2/3+ 按钮。
- `sleep_quality` 用 0-4 按钮。
- `sleep_disruption` 用 none/itch/nasal/both 四选一。
- `bed_at`、`wake_at`、`sleep_latency_min` 放在展开区。

## 12. 明确不做

以下内容留到后续阶段：

- 自动标签
- 结构化层解析
- insights
- decisions
- Dashboard 图表
- 导出 / 导入
- Docker 部署

Phase 1 只保证数据被低成本、稳定、结构化地记录下来。
