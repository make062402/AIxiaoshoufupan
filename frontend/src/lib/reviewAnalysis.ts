import type { AiResult, Metrics, Scores, SellingPoint, Transcript } from '../types/types.ts'
import {
  getAverageObjectionResponseDelaySeconds,
  getCustomerFirstActiveSpeakAtSeconds,
  getCustomerQuestionCount,
  getIcebreakDurationSeconds,
  getMaxRepeatFollowup,
  getObjectionResponseRate,
  getSalesInterruptionsPerHour,
  getSalesTalkRatio,
  getSellingPointHitCount,
  isNextStepLocked,
  type CustomerTopicEvidence,
  type ObjectionEvidence,
} from './metrics.ts'
import {
  evaluateMetricChecks,
  scoreMetrics,
  type MetricChecks,
} from './scoring.ts'

export type MetricSource = 'code' | 'ai'

/** 14 个概念指标的数据来源；比例项虽由代码相除，但原始计数来自 AI。 */
export const METRIC_SOURCES = {
  icebreak_duration: 'code',
  interrupt_per_hour: 'code',
  customer_first_speak_at: 'code',
  sales_talk_ratio: 'code',
  profile_coverage: 'ai',
  open_question_rate: 'ai',
  customer_question_count: 'code',
  selling_point_hit_count: 'code',
  need_match_rate: 'ai',
  param_error_count: 'ai',
  max_repeat_followup: 'code',
  objection_response_rate: 'code',
  objection_response_delay: 'code',
  next_step_locked: 'code',
} as const satisfies Record<string, MetricSource>

export interface ReviewMetricEvidence {
  businessTopicStartSeconds: number
  topics: readonly CustomerTopicEvidence[]
  objections: readonly ObjectionEvidence[]
}

export interface BuildReviewAnalysisInput {
  transcript: Transcript
  sellingPoints: readonly SellingPoint[]
  aiResult: AiResult
  evidence: ReviewMetricEvidence
}

export interface ReviewAnalysis {
  metrics: Metrics
  checks: MetricChecks
  scores: Scores
  sources: typeof METRIC_SOURCES
}

/** 合并 10 项代码指标与 4 项 AI 计数指标，再统一交给评分函数。 */
export function buildReviewAnalysis(
  input: BuildReviewAnalysisInput,
): ReviewAnalysis {
  const { transcript, sellingPoints, aiResult, evidence } = input
  const metrics: Metrics = {
    icebreak_duration: getIcebreakDurationSeconds(
      transcript,
      evidence.businessTopicStartSeconds,
    ),
    interrupt_per_hour: getSalesInterruptionsPerHour(transcript),
    customer_first_speak_at:
      getCustomerFirstActiveSpeakAtSeconds(transcript),
    sales_talk_ratio: getSalesTalkRatio(transcript),
    customer_question_count: getCustomerQuestionCount(transcript),
    profile_covered_count: aiResult.counts.profile_covered_fields.length,
    open_question_count: aiResult.counts.open_question_count,
    total_question_count: aiResult.counts.total_question_count,
    selling_point_hit_count: getSellingPointHitCount(transcript, sellingPoints),
    max_repeat_followup: getMaxRepeatFollowup(transcript, evidence.topics),
    need_matched_count: aiResult.needs.filter((need) => need.satisfied).length,
    need_total_count: aiResult.needs.length,
    param_error_count: aiResult.counts.param_error_count,
    objection_response_rate: getObjectionResponseRate(
      transcript,
      evidence.objections,
    ),
    objection_response_delay: getAverageObjectionResponseDelaySeconds(
      transcript,
      evidence.objections,
    ),
    next_step_locked: isNextStepLocked(transcript),
  }

  return {
    metrics,
    checks: evaluateMetricChecks(metrics),
    scores: scoreMetrics(metrics),
    sources: METRIC_SOURCES,
  }
}
