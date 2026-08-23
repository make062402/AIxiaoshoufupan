/**
 * T10 —— Drizzle 表结构定义（8 张表）
 * customers / intent_logs / visits / reviews / needs / products / todos / scripts
 * 对应《技术方案_专业版》3.1 表结构、3.4 数据模型设计决策。
 *
 * 本文件只做建表定义，不含任何查询、接口与种子数据（那是 T11 / T12）。
 *
 * ============================================================
 * 【3.4 三条设计决策，在本文件中的体现】
 *
 * 决策 1｜客户状态 S1/S2/S3 不落字段。
 *   该值由 count(reviews where customer_id = ?) 实时派生：
 *   0 条 → S1，1 条 → S2，≥2 条 → S3。
 *   若落为字段，会出现「已复盘两次但状态仍为 S1」的不一致。
 *   同理，「未被满足的需求」由 needs where satisfied = false 查出，不冗余存储。
 *   ※ 因此 customers 表中刻意没有 status / stage / s_level 之类字段。
 *
 * 决策 2｜作战包不建表。
 *   「复盘结果回写下次作战包」是业务动作描述，实现上采用读取时聚合
 *   （按 customer_id 聚合 customers + needs + todos + scripts），而非写入时同步，
 *   因此不存在 battlecards / battle_cards 表。
 *
 * 决策 3｜intent_manual 是必要字段。
 *   缺少它时，下一次复盘的自动判定会覆盖人工修改结果。
 *   有该标记时，自动判定仅记录建议值，不直接写入 intent_level / intent_score。
 *   人工覆盖的每一次变更都留痕到 intent_logs。
 *
 * ============================================================
 * 【时间字段单位与格式的统一约定】
 *
 *   needs.timestamp_sec        —— 秒（浮点，可含小数），与 TranscriptSegment.start 同口径。
 *   created_at（各表）         —— Unix 时间戳，整数秒（integer + mode: 'timestamp'），
 *                                 Drizzle 读写时自动与 JS Date 互转。
 *   visits.scheduled_at        —— 同上，Unix 时间戳整数秒（timestamp）。
 *   todos.due_date             —— 日期字符串 'YYYY-MM-DD'（只到日，不含时分秒）。
 *   customers.deadline         —— 自由文本，存客户口述的采购时间点/交付期限原文
 *                                 （如「本季度末」「9 月中旬前」），不做日期解析。
 *
 * ============================================================
 * 【JSON 字段的类型来源】
 *
 * 以下类型与 frontend/src/types/types.ts 中的同名类型结构完全一致，
 * 在此重新声明一份的原因：backend 的 tsconfig.json 的 include 仅覆盖 ./src，
 * 且 backend 与 frontend 为两个独立包，跨目录 import 无法被 drizzle-kit 正确解析。
 * types.ts 是唯一权威定义，本文件为其镜像副本，不得反向修改 types.ts；
 * 若 types.ts 变更，需同步本文件。
 * ============================================================
 */

import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

/* ============================================================
 * 零、JSON 字段类型镜像（源：frontend/src/types/types.ts）
 * ============================================================ */

/** 源：types.ts Speaker */
type Speaker = 'sales' | 'customer'

/** 源：types.ts TranscriptSegment（start / end 单位为秒，浮点） */
interface TranscriptSegment {
  speaker: Speaker
  start: number
  end: number
  text: string
}

/** 源：types.ts Transcript */
type Transcript = TranscriptSegment[]

/**
 * 源：types.ts SellingPoint
 * match_keywords 是客户侧诉求词（需求↔卖点映射）；
 * sales_keywords 是销售侧话术词（D3 卖点提及数）。两者说话人不同，不可混用。
 */
interface SellingPoint {
  tag: string
  script: string
  match_keywords: string[]
  sales_keywords: string[]
}

/** 源：types.ts Metrics（D1 2 项 + D2 5 项 + D3 4 项 + D4 3 项 = 14 项） */
interface Metrics {
  /* D1 开场破冰 */
  icebreak_duration: number
  interrupt_per_hour: number
  /* D2 需求挖掘 */
  customer_first_speak_at: number
  sales_talk_ratio: number
  customer_question_count: number
  profile_covered_count: number
  open_question_count: number
  total_question_count: number
  /* D3 价值传递 */
  selling_point_hit_count: number
  max_repeat_followup: number
  need_matched_count: number
  need_total_count: number
  param_error_count: number
  /* D4 异议处理与推进 */
  objection_response_rate: number
  objection_response_delay: number
  next_step_locked: boolean
}

/** 源：types.ts DimensionScore */
type DimensionScore = 0 | 1

/** 源：types.ts Scores */
interface Scores {
  d1: DimensionScore
  d2: DimensionScore
  d3: DimensionScore
  d4: DimensionScore
  total: 0 | 1 | 2 | 3 | 4
}

/**
 * 源：types.ts NeedLevel —— 仅 L1 / L2。
 * 这是 Dify 返回值的类型，保持不变。
 * 数据库 needs.level 比它多一个 L3，差异原因见 needs 表注释。
 */
type NeedLevel = 'L1' | 'L2'

/** 源：types.ts AiNeed */
interface AiNeed {
  level: NeedLevel
  text: string
  quote: string
  /** 单位：秒 */
  start: number
  satisfied: boolean
}

/** 源：types.ts AiEvidenceItem */
interface AiEvidenceItem {
  text: string
  quote?: string
  /** 单位：秒 */
  start?: number
}

/** 源：types.ts AiCommitment */
interface AiCommitment {
  text: string
  due?: string
  /** 单位：秒 */
  start?: number
}

/** 源：types.ts AiResult —— Dify 只返回计数与文本，绝不返回分数 */
interface AiResult {
  counts: {
    open_question_count: number
    total_question_count: number
    profile_covered_fields: string[]
    param_error_count: number
  }
  needs: AiNeed[]
  highlights: AiEvidenceItem[]
  improvements: AiEvidenceItem[]
  commitments: AiCommitment[]
  missed_points: AiEvidenceItem[]
  next_actions: string[]
}

/* ============================================================
 * 一、customers 客户
 *
 * name ~ deadline 共 9 列，对应需求档案 8 项
 * （「称呼与身份」在业务上算一项，这里拆成 name / identity 两列）。
 *
 * ※ 不设客户状态字段（S1/S2/S3），见文件头决策 1。
 * ============================================================ */
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  /* —— 需求档案 8 项 —— */
  /** 档案①-a 称呼 */
  name: text('name').notNull(),
  /** 档案①-b 身份（与 name 同属「称呼与身份」一项） */
  identity: text('identity'),
  /** 档案② 联系方式 */
  phone: text('phone'),
  /** 档案③ 采购角色：使用者 / 影响者 / 拍板人 */
  role: text('role'),
  /** 档案④ 预算区间 */
  budget: text('budget'),
  /** 档案⑤ 核心需求与购买意向 */
  coreNeed: text('core_need'),
  /** 档案⑥ 关注排序，JSON 字符串数组，如 ["价格","质量","服务","周期"] */
  priorityOrder: text('priority_order', { mode: 'json' }).$type<string[]>(),
  /** 档案⑦ 注意事项 */
  notes: text('notes'),
  /** 档案⑧ 采购时间点或交付期限；自由文本原文，不做日期解析 */
  deadline: text('deadline'),

  /* —— 其他 —— */
  /** 行业 */
  industry: text('industry'),
  /** 意向分级：A / B / C / D */
  intentLevel: text('intent_level'),
  /** 意向强度分：0-3 */
  intentScore: integer('intent_score'),
  /** 是否人工覆盖过意向分级；true 时自动判定只记录建议值，不直接写入（决策 3） */
  intentManual: integer('intent_manual', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** 创建时间；Unix 时间戳，整数秒 */
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/* ============================================================
 * 二、intent_logs 意向覆盖留痕
 *   每一次人工修改意向分级都写一条，用于回溯「谁在什么时候把 B 改成了 A」。
 * ============================================================ */
export const intentLogs = sqliteTable('intent_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  /** 改前值（意向分级 A/B/C/D；首次设置时可为空） */
  fromLevel: text('from_level'),
  /** 改后值（意向分级 A/B/C/D） */
  toLevel: text('to_level').notNull(),
  /** 操作人 */
  operator: text('operator'),
  /** 操作时间；Unix 时间戳，整数秒 */
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/* ============================================================
 * 三、visits 拜访日程
 * ============================================================ */
export const visits = sqliteTable('visits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  /** 计划拜访时间；Unix 时间戳，整数秒 */
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
  /** 状态：待拜访 / 已完成 */
  status: text('status'),
  /** 场景标签：一次拜访 / 二次拜访 / 多次拜访 */
  scene: text('scene'),
})

/* ============================================================
 * 四、reviews 复盘
 *   customers 的 S1/S2/S3 状态即由本表按 customer_id 计数派生（决策 1）。
 * ============================================================ */
export const reviews = sqliteTable('reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  visitId: integer('visit_id').references(() => visits.id),
  /** 逐字稿 JSON，片段内 start / end 单位为秒（浮点） */
  transcript: text('transcript', { mode: 'json' }).$type<Transcript>(),
  /** 14 项指标计算值 JSON */
  metrics: text('metrics', { mode: 'json' }).$type<Metrics>(),
  /** 评分 JSON：{ d1, d2, d3, d4, total } */
  scores: text('scores', { mode: 'json' }).$type<Scores>(),
  /** Dify 返回原始结果 JSON（只含计数与文本，不含分数） */
  aiResult: text('ai_result', { mode: 'json' }).$type<AiResult>(),
  /** 创建时间；Unix 时间戳，整数秒 */
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/* ============================================================
 * 五、needs 需求
 *
 * 【level 取值差异说明】
 *   本表 level 允许 L1 / L2 / L3 三个值，比 types.ts 的 NeedLevel（仅 L1/L2）多一个 L3。
 *   原因：NeedLevel 描述的是 Dify 返回值 —— Dify 只会标记它识别出的明确需求(L1)
 *   与潜在需求(L2)，它不会返回「无需求」。而数据库要落的是本次复盘的完整结论，
 *   包含「该客户本次未表达出需求」这一业务状态，即 L3 = 无需求。
 *   L3 由后端在写库时判定并写入，不来自 Dify，因此 types.ts 的 NeedLevel 是正确的，
 *   不需要也不应该为了迁就数据库而加上 L3。
 *
 * 【不冗余存储的部分】
 *   「未被满足的需求」不另设表或字段，直接 where satisfied = false 查出（决策 1）。
 * ============================================================ */
export const needs = sqliteTable('needs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reviewId: integer('review_id')
    .notNull()
    .references(() => reviews.id),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  /** 需求层级：L1 明确需求 / L2 潜在需求 / L3 无需求（L3 为数据库独有，见上方说明） */
  level: text('level').$type<'L1' | 'L2' | 'L3'>(),
  /** 需求内容 */
  text: text('text'),
  /** 客户原话 */
  quote: text('quote'),
  /** 原话在逐字稿中的起始时间；单位：秒（浮点，可含小数） */
  timestampSec: real('timestamp_sec'),
  /** 本次是否被对应卖点回应 */
  satisfied: integer('satisfied', { mode: 'boolean' }).notNull().default(false),
})

/* ============================================================
 * 六、products 产品
 * ============================================================ */
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  price: real('price'),
  /** 关键参数 JSON */
  params: text('params', { mode: 'json' }).$type<Record<string, string>>(),
  /**
   * 结构化卖点 JSON；卖点不得存为非结构化文本。
   * match_keywords 是需求↔卖点映射的唯一依据；sales_keywords 是卖点提及数的唯一依据。
   */
  sellingPoints: text('selling_points', { mode: 'json' }).$type<SellingPoint[]>(),
  /** 常见异议与答法 JSON */
  objections: text('objections', { mode: 'json' })
    .$type<{ objection: string; answer: string }[]>(),
  /** 行业 */
  industry: text('industry'),
})

/* ============================================================
 * 七、todos 待办
 * ============================================================ */
export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  reviewId: integer('review_id').references(() => reviews.id),
  /** 待办内容 */
  text: text('text').notNull(),
  /** 截止日期；日期字符串 'YYYY-MM-DD'，只到日 */
  dueDate: text('due_date'),
  /** 是否已完成 */
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
})

/* ============================================================
 * 八、scripts 话术库
 * ============================================================ */
export const scripts = sqliteTable('scripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 五段式所属阶段 */
  stage: text('stage'),
  /** 使用时机 */
  scene: text('scene'),
  /** 话术原文 */
  text: text('text').notNull(),
  /** 来源复盘 ID；通用话术为空 */
  fromReviewId: integer('from_review_id').references(() => reviews.id),
})
