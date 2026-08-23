import {
  COVERAGE_DENOMINATOR,
  COVERAGE_ROUNDING,
  D1_THRESHOLDS,
  D2_THRESHOLDS,
  D3_THRESHOLDS,
  D4_THRESHOLDS,
  DIMENSION_RULES,
} from '../config/scoring.ts'
import type { DimensionScore, Metrics, Scores } from '../types/types.ts'

export interface MetricChecks {
  d1: {
    icebreak_duration: boolean
    interrupt_per_hour: boolean
  }
  d2: {
    customer_first_speak_at: boolean
    sales_talk_ratio: boolean
    profile_covered_count: boolean
    open_question_rate: boolean
    customer_question_count: boolean
  }
  d3: {
    selling_point_hit_count: boolean
    need_match_rate: boolean
    param_error_count: boolean
    max_repeat_followup: boolean
  }
  d4: {
    objection_response_rate: boolean
    objection_response_delay: boolean
    next_step_locked: boolean
  }
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function getCoverageRequiredCount(): number {
  const rawRequired =
    COVERAGE_DENOMINATOR * D2_THRESHOLDS.profile_coverage_rate.min

  switch (COVERAGE_ROUNDING) {
    case 'ceil':
      return Math.ceil(rawRequired)
    case 'floor':
      return Math.floor(rawRequired)
    case 'round':
      return Math.round(rawRequired)
  }
}

/** 逐项套用 config/scoring.ts 的阈值，返回 14 个可举证的布尔判定。 */
export function evaluateMetricChecks(metrics: Metrics): MetricChecks {
  return {
    d1: {
      icebreak_duration:
        metrics.icebreak_duration >= D1_THRESHOLDS.icebreak_duration.min &&
        metrics.icebreak_duration <= D1_THRESHOLDS.icebreak_duration.max,
      interrupt_per_hour:
        metrics.interrupt_per_hour <= D1_THRESHOLDS.interrupt_per_hour.max,
    },
    d2: {
      customer_first_speak_at:
        metrics.customer_first_speak_at <=
        D2_THRESHOLDS.customer_first_speak_at.max,
      sales_talk_ratio:
        metrics.sales_talk_ratio <= D2_THRESHOLDS.sales_talk_ratio.max,
      profile_covered_count:
        metrics.profile_covered_count >= getCoverageRequiredCount(),
      open_question_rate:
        divideOrZero(
          metrics.open_question_count,
          metrics.total_question_count,
        ) >= D2_THRESHOLDS.open_question_rate.min,
      customer_question_count:
        metrics.customer_question_count >=
        D2_THRESHOLDS.customer_question_count.min,
    },
    d3: {
      selling_point_hit_count:
        metrics.selling_point_hit_count >=
        D3_THRESHOLDS.selling_point_hit_count.min,
      need_match_rate:
        divideOrZero(metrics.need_matched_count, metrics.need_total_count) >=
        D3_THRESHOLDS.need_match_rate.min,
      param_error_count:
        metrics.param_error_count <= D3_THRESHOLDS.param_error_count.max,
      max_repeat_followup:
        metrics.max_repeat_followup <=
        D3_THRESHOLDS.max_repeat_followup.max,
    },
    d4: {
      objection_response_rate:
        metrics.objection_response_rate >=
        D4_THRESHOLDS.objection_response_rate.min,
      objection_response_delay:
        metrics.objection_response_delay <=
        D4_THRESHOLDS.objection_response_delay.max,
      next_step_locked:
        metrics.next_step_locked === D4_THRESHOLDS.next_step_locked.required,
    },
  }
}

function scoreDimension(
  checks: readonly boolean[],
  dimension: keyof typeof DIMENSION_RULES,
): DimensionScore {
  const rule = DIMENSION_RULES[dimension]
  if (checks.length !== rule.total) return 0

  return checks.filter(Boolean).length >= rule.required ? 1 : 0
}

/** 14 项指标 → D1~D4 各 0/1 → 总分 0~4。 */
export function scoreMetrics(metrics: Metrics): Scores {
  const checks = evaluateMetricChecks(metrics)
  const d1 = scoreDimension(Object.values(checks.d1), 'd1')
  const d2 = scoreDimension(Object.values(checks.d2), 'd2')
  const d3 = scoreDimension(Object.values(checks.d3), 'd3')
  const d4 = scoreDimension(Object.values(checks.d4), 'd4')
  const total = (d1 + d2 + d3 + d4) as Scores['total']

  return { d1, d2, d3, d4, total }
}
