# Dify「复盘分析」工作流契约（T09 定稿）

本文件是**唯一契约来源**。T27 在 Dify 后台配提示词时照着这份填；
后端 `src/dify.ts` 与前端 `src/types/types.ts` 的 `AiResult` 均与此对齐。
三处任意一处要改，三处一起改。

---

## 〇、总原则

1. **Dify 只返回计数与文本，绝不返回分数。**
   返回 JSON 里不允许出现 `d1` / `d2` / `d3` / `d4` / `total` / `score` / `等级` / `评价`
   之类字段。全部阈值判定与 0/1 打分在前端 `scoring.ts` 完成。
   模型若自行输出分数，视为提示词写错，需回 Dify 后台修。
2. **只输出 JSON，不输出任何其他内容。**
   不要 ``` 代码块包裹、不要「好的，以下是分析结果」这类前言。
   （后端仍会做剥离兜底，但那是保险，不是许可。）
3. **时间戳一律用秒（浮点），与传入的 `transcript[].start` 同口径。**
   引用某句原话时，`start` 必须直接取自该句 segment 的 `start`，不得自行估算。
4. **原话 `quote` 必须是逐字稿中的原文片段，不得改写、不得润色、不得凭空生成。**
   找不到对应原话时，宁可少输出一条，也不要编。

---

## 一、发给 Dify 的输入

后端 `callDifyOnce()` 以 Dify Workflow 的 `POST /workflows/run`
（`response_mode: "blocking"`）提交，`inputs` 下四个变量。
**四个变量在 Dify 后台都按「段落 / Paragraph」类型建，值均为 JSON 字符串**
（`industry` 为纯文本），提示词里用 `{{#变量名#}}` 引用。

| 变量名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `transcript` | 段落（JSON 字符串） | 是 | 逐字稿数组，见下 |
| `selling_points` | 段落（JSON 字符串） | 否，默认 `[]` | 本次拜访涉及的产品卖点，见下 |
| `profile_fields` | 段落（JSON 字符串） | 否，默认 `[]` | 8 项客户档案字段名清单，见下 |
| `industry` | 文本 | 否，默认 `""` | 行业标签：`教培` / `装修` / `广告` |

### 1.1 `transcript`

`TranscriptSegment[]` 序列化后的 JSON 字符串：

```json
[
  { "speaker": "sales",    "start": 0.0,   "end": 6.4,   "text": "张姐您好，我是……" },
  { "speaker": "customer", "start": 6.8,   "end": 12.1,  "text": "哦你好你好，快请坐。" }
]
```

- `speaker`：只有 `"sales"` 与 `"customer"` 两个取值，没有第三方，没有 `unknown`。
- `start` / `end`：**秒（浮点）**。腾讯云 ASR 的毫秒已在后端适配层除过 1000，
  进到这里的一定是秒。
- `text`：该句最终识别结果。

### 1.2 `selling_points`

`SellingPoint[]` 序列化后的 JSON 字符串。用于判断「需求有没有被对应卖点回应」
以及「有没有漏讲错讲」：

```json
[
  {
    "tag": "收纳能力",
    "script": "通顶柜做到 2.7 米，顶部 40 公分专门放换季被褥……",
    "match_keywords": ["空间小", "东西多", "放不下", "收纳"]
  }
]
```

`match_keywords` 是「需求 ↔ 卖点」建立映射的唯一依据。

### 1.3 `profile_fields`

字符串数组序列化后的 JSON 字符串，当前 8 项，取自
`frontend/src/config/scoring.ts` 的 `PROFILE_FIELDS`：

```json
["称呼与身份","联系方式","在采购中的角色","预算区间","核心需求与购买意向","关注维度优先级排序","注意事项","采购时间点/交付期限"]
```

**`counts.profile_covered_fields` 只能从这个数组里挑，不得自造字段名、不得改写措辞。**

---

## 二、期望 Dify 返回什么

顶层七个字段**必须全部出现**，没有内容时给空数组 `[]` / 计数给 `0`，
**不要给 `null`，不要省略字段**。完整样例见同目录 `difyResult.json`。

```
{
  counts: { … },      // 4 项 AI 计数
  needs: [ … ],       // 需求 L1/L2 标记
  highlights: [ … ],  // 亮点
  improvements: [ … ],// 改进点
  commitments: [ … ], // 承诺清单
  missed_points: [ … ],// 漏讲错讲
  next_actions: [ … ] // 下次三件事
}
```

### 2.1 `counts`（4 项 AI 计数）

| 字段 | 类型 | 含义与判定口径 |
|---|---|---|
| `open_question_count` | number | **开放式提问数**。销售提出的、无法用「是 / 否 / 一个数字」作答的问句数量。「您现在最头疼的是哪块？」记 1；「预算二十万以内是吧？」不记。 |
| `total_question_count` | number | **总提问数**。销售提出的全部问句数量（开放式 + 封闭式）。**必须 ≥ `open_question_count`**。只数销售的问句，客户的问句由代码另算，不要混入。 |
| `profile_covered_fields` | string[] | **8 项档案中问出了哪几项**。只放实际问到并得到有效信息的字段名，取值必须严格出现在输入的 `profile_fields` 里。数组长度即前端的 `profile_covered_count`。一项也没问到给 `[]`。 |
| `param_error_count` | number | **参数讲错或含糊带过的条数**。销售陈述的产品参数（规格、价格、工期、质保年限、材质等级等）与 `selling_points` 中口径不一致，或用「大概」「差不多」「应该」含糊带过的条数。没有给 `0`。达标线是 0，但**判定在前端做，这里只给条数**。 |

> 前端拿到后：`open ÷ total` 对照 ≥ 50%；`profile_covered_fields.length ÷ 8` 对照 ≥ 50%；
> `param_error_count` 对照 = 0。**这三条判定与你无关，不要在返回里体现。**

### 2.2 `needs`（需求 L1/L2 标记）

数组，每条：

| 字段 | 类型 | 含义 |
|---|---|---|
| `level` | `"L1"` \| `"L2"` | **L1 = 明确需求**：客户直接说出的、有具体指向的诉求。**L2 = 潜在需求**：客户未明说、但从抱怨或犹豫中可推断的诉求。只有这两个值。 |
| `text` | string | 需求描述，一句话说清「谁、要什么、为什么」。 |
| `quote` | string | 客户原话，逐字稿原文，不得改写。 |
| `start` | number | 该句原话在逐字稿中的起始秒，直接取自对应 segment 的 `start`。 |
| `satisfied` | boolean | **该条需求有没有被对应卖点回应**。销售在后续对话中用 `selling_points` 里能对上的卖点做了实质回应 → `true`；只字未提、或只是敷衍带过 → `false`。 |

> 前端据此算 D3 需求-卖点对齐率：`satisfied=true 的条数 ÷ needs 总条数`，对照 ≥ 60%。
> **不要自己算这个比例。**

### 2.3 `highlights` / `improvements` / `missed_points`

三者结构相同（`AiEvidenceItem`）：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `text` | string | 是 | 结论描述。亮点写「做对了什么、为什么有效」；改进点写「哪里没做好、本该怎么做」；漏讲错讲写「讲错了什么、正确口径是什么」。 |
| `quote` | string | 否 | 支撑该结论的逐字稿原话。 |
| `start` | number | 否 | 该原话的起始秒。 |

- `highlights`：话术亮点，建议 2~3 条。
- `improvements`：改进点，建议 2~3 条，**对事不对人，写成可执行的动作**。
- `missed_points`：漏讲错讲，**只放两类**——(a) 该讲的卖点没讲（客户有对应需求却没提及）；
  (b) 参数讲错（与 `selling_points` 口径不符）。与 `counts.param_error_count` 中
  (b) 类的条数应当自洽。

### 2.4 `commitments`（承诺清单）

销售在通话中对客户做出的、需要事后兑现的承诺：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `text` | string | 是 | 承诺内容，写成可打钩的动作。 |
| `due` | string | 否 | 承诺的时间点**原文**，如「本周五前」「今天下班前」。客户未提及时间则省略该字段（不要给空字符串，更不要给 `null`）。 |
| `start` | number | 否 | 承诺那句话的起始秒。 |

### 2.5 `next_actions`（下次三件事）

字符串数组，**正好 3 条**。每条写成销售下次见面前 / 见面时能直接执行的动作，
要具体到「带什么、问什么、给什么」，不要写「加强沟通」这类空话。
优先覆盖：本次没问到的档案字段、`satisfied=false` 的需求、需要纠正的错讲口径。

---

## 三、USE_MOCK 开关怎么用

开关只有一处：环境变量 `USE_MOCK`，读取点在 `backend/src/dify.ts` 的
`isMockEnabled()`，判定为**严格等于字符串 `'true'`**。

| 取值 | 行为 |
|---|---|
| `USE_MOCK=true` | `analyzeTranscript()` 直接读取本目录的 `difyResult.json` 并返回，**函数在此 return，后面的 `fetch` 一行都不执行，不产生任何网络请求，不消耗 Dify 额度**。 |
| `USE_MOCK=false`（或未设置 / 任何其他值） | 走真实 HTTP 调用，密钥从 `process.env.DIFY_API_KEY` 取。**每次调用消耗一次 Dify 额度。** |

用法：

```bash
# 联调（默认，零额度消耗）
echo "USE_MOCK=true" >> backend/.env

# 真调 Dify（T27 / T28 / T54 才需要）
# backend/.env 里改成 USE_MOCK=false，并填上 DIFY_API_KEY
```

后端启动时会打印当前开关状态，跑之前先看一眼这行：

```
Dify 开关: USE_MOCK=true → 走本地 mock，不发网络请求
```

### 自检：确认真的一次请求都没发

```bash
cd backend && USE_MOCK=true npx tsx src/index.ts
```

另开一个终端：

```bash
curl -s -X POST http://localhost:3000/api/analyze -H 'Content-Type: application/json' -d '{"transcript":[{"speaker":"sales","start":0,"end":2,"text":"张姐您好"}]}'
```

服务端日志里应当只有一行 `[dify] USE_MOCK=true，返回本地 mock，未发起任何网络请求`，
**不应出现任何 `api.dify.ai` 相关记录**。响应中 `"source":"mock"`。

---

## 四、返回结构不稳定时的兜底（技术方案 风险 4.5）

真实调用分支（`USE_MOCK=false`）在 `src/dify.ts` 内按四步兜底，
**任何情况下都不会向上抛异常**：

1. **剥离代码块标记** —— `stripCodeFence()` 去掉 ` ```json … ``` `；
   若模型在 JSON 前后夹了自然语言，退一步截取最外层 `{ … }`。
2. **解析** —— `parseAiText()` 内 `JSON.parse`，失败返回 `null` 而非抛错。
3. **逐字段校验 + 缺失填默认值** —— `normalizeAiResult()`：
   数组字段缺失填 `[]`，计数字段缺失填 `0`，可选字符串缺失则省略该键。
   **一律不填 `null`。** `level` 非 `L1` 时归为 `L2`；`satisfied` 非 `true` 时为 `false`。
4. **重试一次** —— 第一次调用或解析失败则重试一次（共两次）；
   再失败返回 `{ ok: false, source: "fallback", result: <空壳 AiResult>, error: "…" }`，
   前端据 `ok === false` 显示「分析失败」，`result` 仍是完整结构，不会白屏。
