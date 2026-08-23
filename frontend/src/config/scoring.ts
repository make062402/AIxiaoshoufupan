/**
 * 评分阈值配置 —— T08
 *
 * 本文件只放配置常量与必要类型，**不含任何计算函数与评分逻辑**。
 * 计算在 T21 的 scoring.ts / metrics.ts 中进行，逐项取用本文件的常量。
 * 数值逐字取自需求说明 3.3，不得在别处硬编码或就地改写。
 *
 * ------------------------------------------------------------------
 * 【重要：三个独立导出项，改档案字段时必须三个一起看】
 *
 *   PROFILE_FIELDS        客户档案字段名数组（当前 8 项，需求说明 3.1）
 *   COVERAGE_DENOMINATOR  D2 关键信息覆盖率的分母（当前独立字面量 8）
 *   COVERAGE_THRESHOLD    覆盖率达标线（0.5），配合 COVERAGE_ROUNDING 取整方向
 *
 * 「8」这一数值同时服务于两个语义不同的用途：档案字段数量，与覆盖率计算分母。
 * 二者当前一致，但**不必然同步**：
 *   - 若分母硬编码而字段扩展至 9 项，评分会静默出错；
 *   - 若分母自动跟随字段数（写成 PROFILE_FIELDS.length），
 *     达标线就由「4 项」变成「4.5 项」，取整规则又成了新的隐藏歧义。
 * 因此这里刻意让 COVERAGE_DENOMINATOR 保持为自己的独立字面量，
 * 并把取整方向 COVERAGE_ROUNDING 提升为具名导出，而不是埋在注释或计算式里。
 * 这是全套代码中唯一一处「单一数值承担双重语义」的位置——
 * **修改客户档案字段时，请同时检查上面三项。**
 * ------------------------------------------------------------------
 */

/* ============================================================
 * 〇、客户档案字段与覆盖率三件套（技术方案 3.3）
 * ============================================================ */

/**
 * 客户档案字段清单（需求说明 3.1，当前 8 项）。
 * 语义 = 「一次拜访应当问清哪些信息」，供档案表单与 AI 抽取共用。
 * 注意：本数组的长度**不是**覆盖率分母，分母见 COVERAGE_DENOMINATOR。
 */
export const PROFILE_FIELDS = [
  '称呼与身份',
  '联系方式',
  '在采购中的角色',
  '预算区间',
  '核心需求与购买意向',
  '关注维度优先级排序',
  '注意事项',
  '采购时间点/交付期限',
] as const;

/** 档案字段名联合类型，供 AiResult.counts.profile_covered_fields 校验时取用 */
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * D2 关键信息覆盖率的**分母**，当前为 8。
 *
 * 刻意写成独立字面量，**不要**改成 PROFILE_FIELDS.length —— 那样就回到了
 * 「一个数字管两件事」，正是技术方案点名要避免的。
 * 档案字段增减时，请人工判断分母是否要跟着改。
 */
export const COVERAGE_DENOMINATOR = 8;

/** D2 关键信息覆盖率达标线：≥ 50%（8 项中问出 4 项及以上） */
export const COVERAGE_THRESHOLD = 0.5;

/**
 * 覆盖率达标所需项数的**取整方向**：向上取整。
 *
 * 即达标项数 = ceil(COVERAGE_DENOMINATOR * COVERAGE_THRESHOLD)。
 * 当前 ceil(8 * 0.5) = 4，与需求说明「问出 4 项及以上」一致；
 * 若分母将来变为 9，则 ceil(9 * 0.5) = 5（从严），不会出现 4.5 项的歧义。
 */
export const COVERAGE_ROUNDING: 'ceil' | 'floor' | 'round' = 'ceil';

/* ============================================================
 * 一、14 项指标阈值（需求说明 3.3）
 *   键名与 types.ts 中 Metrics 的字段名一一对应，便于 T21 逐项取用。
 * ============================================================ */

/** D1 开场与信任建立 —— 2 项 */
export const D1_THRESHOLDS = {
  /** 1. 破冰时长 icebreak_duration：15 秒 ~ 2 分钟（区间，含上下限），单位：秒 */
  icebreak_duration: { min: 15, max: 120 },
  /** 2. 销售打断次数/小时 interrupt_per_hour：≤ 3 次 */
  interrupt_per_hour: { max: 3 },
} as const;

/** D2 需求挖掘 —— 5 项 */
export const D2_THRESHOLDS = {
  /** 3. 客户首次主动发言时点 customer_first_speak_at：3 分钟内，单位：秒 */
  customer_first_speak_at: { max: 180 },
  /** 4. 客户说话占比 sales_talk_ratio：销售占比 ≤ 60%（取值 0-1） */
  sales_talk_ratio: { max: 0.6 },
  /**
   * 5. 关键信息覆盖率 profile_covered_count：≥ 50%（8 项档案字段中问出 4 项及以上）。
   * 分母、达标线、取整方向分别见 COVERAGE_DENOMINATOR / COVERAGE_THRESHOLD / COVERAGE_ROUNDING。
   */
  profile_coverage_rate: { min: COVERAGE_THRESHOLD },
  /** 6. 开放式提问占比 open_question_count ÷ total_question_count：≥ 50% */
  open_question_rate: { min: 0.5 },
  /** 7. 客户提问数 customer_question_count：客户追问次数 ≥ 3 */
  customer_question_count: { min: 3 },
} as const;

/** D3 价值传递 —— 4 项 */
export const D3_THRESHOLDS = {
  /** 8. 卖点提及数 selling_point_hit_count：≥ 3 个 */
  selling_point_hit_count: { min: 3 },
  /** 9. 需求-卖点对齐率 need_matched_count ÷ need_total_count：≥ 60% */
  need_match_rate: { min: 0.6 },
  /** 10. 参数准确率 param_error_count：错误次数 = 0 */
  param_error_count: { max: 0 },
  /**
   * 11. 客户话题反馈数 max_repeat_followup：
   * 客户未就同一话题反复追问超过两次（反复追问是扣分信号），即 ≤ 2 为达标。
   */
  max_repeat_followup: { max: 2 },
} as const;

/** D4 异议处理与推进 —— 3 项 */
export const D4_THRESHOLDS = {
  /** 12. 异议正面回应率 objection_response_rate：≥ 70% 的异议被实质回应（取值 0-1） */
  objection_response_rate: { min: 0.7 },
  /** 13. 异议平均回应时长 objection_response_delay：提出到实质回应间隔 ≤ 10 秒 */
  objection_response_delay: { max: 10 },
  /** 14. 下一步锁定率 next_step_locked：时间 + 动作 + 责任人三要素齐全（true 为达标） */
  next_step_locked: { required: true },
} as const;

/** 四维度阈值汇总，便于按维度整体取用 */
export const THRESHOLDS = {
  d1: D1_THRESHOLDS,
  d2: D2_THRESHOLDS,
  d3: D3_THRESHOLDS,
  d4: D4_THRESHOLDS,
} as const;

/* ============================================================
 * 二、维度得分规则：「几项中满足几项算 1 分」（需求说明 3.3）
 *   同样作为配置导出，不许硬编码进将来的 scoring.ts。
 * ============================================================ */

/** 单个维度的达标规则：total 项中满足 required 项即得 1 分 */
export interface DimensionRule {
  /** 该维度指标总项数 */
  total: number;
  /** 得 1 分所需的达标项数 */
  required: number;
}

export const DIMENSION_RULES: Record<'d1' | 'd2' | 'd3' | 'd4', DimensionRule> = {
  /** D1 开场与信任建立：2 项均满足 → 1 分 */
  d1: { total: 2, required: 2 },
  /** D2 需求挖掘：5 项满足 4 项 → 1 分 */
  d2: { total: 5, required: 4 },
  /** D3 价值传递：4 项满足 3 项 → 1 分 */
  d3: { total: 4, required: 3 },
  /** D4 异议处理与推进：3 项满足 2 项 → 1 分 */
  d4: { total: 3, required: 2 },
};
