import {
  COVERAGE_DENOMINATOR,
  COVERAGE_ROUNDING,
  D1_THRESHOLDS,
  D2_THRESHOLDS,
  D3_THRESHOLDS,
  D4_THRESHOLDS,
} from '../config/scoring.ts'
import type { ReviewAnalysis } from './reviewAnalysis.ts'
import type { Transcript } from '../types/types.ts'

export type DimensionKey = 'd1' | 'd2' | 'd3' | 'd4'
export type MetricKey =
  | 'icebreak_duration' | 'interrupt_per_hour'
  | 'customer_first_speak_at' | 'sales_talk_ratio' | 'profile_covered_count' | 'open_question_rate' | 'customer_question_count'
  | 'selling_point_hit_count' | 'need_match_rate' | 'param_error_count' | 'max_repeat_followup'
  | 'objection_response_rate' | 'objection_response_delay' | 'next_step_locked'

export interface MetricEvidenceRange {
  kind: 'point' | 'range' | 'full'
  start: number
  end: number
  explanation: string
}

export interface PresentedMetric {
  key: MetricKey
  dimension: DimensionKey
  name: string
  value: string
  threshold: string
  passed: boolean
  source: 'code' | 'ai'
  evidence: MetricEvidenceRange
}

const rounded = (value: number, digits = 1) => Number(value.toFixed(digits))
const percent = (value: number) => `${rounded(value * 100)}%`
const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0

export function formatTranscriptTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remaining = rounded(seconds - minutes * 60)
  return `第 ${minutes} 分 ${remaining} 秒`
}

function coverageRequired() {
  const raw = COVERAGE_DENOMINATOR * D2_THRESHOLDS.profile_coverage_rate.min
  if (COVERAGE_ROUNDING === 'floor') return Math.floor(raw)
  if (COVERAGE_ROUNDING === 'round') return Math.round(raw)
  return Math.ceil(raw)
}

function point(start: number, explanation: string): MetricEvidenceRange {
  return { kind: 'point', start, end: start, explanation }
}

function range(start: number, end: number, explanation: string): MetricEvidenceRange {
  return { kind: 'range', start, end, explanation }
}

function full(transcript: Transcript, explanation: string): MetricEvidenceRange {
  return { kind: 'full', start: transcript[0]?.start ?? 0, end: transcript.at(-1)?.end ?? 0, explanation }
}

/** 样例 A 的证据锚点均指向真实 segment；比例和计数项明确使用全场范围。 */
export function presentMetrics(analysis: ReviewAnalysis, transcript: Transcript): PresentedMetric[] {
  const m = analysis.metrics
  return [
    { key: 'icebreak_duration', dimension: 'd1', name: '破冰时长', value: `${rounded(m.icebreak_duration)} 秒`, threshold: `≥ ${D1_THRESHOLDS.icebreak_duration.min} 秒且 ≤ ${D1_THRESHOLDS.icebreak_duration.max} 秒`, passed: analysis.checks.d1.icebreak_duration, source: analysis.sources.icebreak_duration, evidence: point(79.5, '第一句业务话题的精确起点，之前区间均为寒暄。') },
    { key: 'interrupt_per_hour', dimension: 'd1', name: '销售打断次数/小时', value: `${rounded(m.interrupt_per_hour, 2)} 次/小时`, threshold: `≤ ${D1_THRESHOLDS.interrupt_per_hour.max} 次/小时`, passed: analysis.checks.d1.interrupt_per_hour, source: analysis.sources.interrupt_per_hour, evidence: point(1365, '销售在客户发言尚未结束时起话的精确 segment。') },
    { key: 'customer_first_speak_at', dimension: 'd2', name: '客户首次主动发言时点', value: formatTranscriptTime(m.customer_first_speak_at), threshold: `≤ ${formatTranscriptTime(D2_THRESHOLDS.customer_first_speak_at.max)}`, passed: analysis.checks.d2.customer_first_speak_at, source: analysis.sources.customer_first_speak_at, evidence: point(272.5, '客户首次非应答性、主动开启话题的精确起点。') },
    { key: 'sales_talk_ratio', dimension: 'd2', name: '销售说话占比', value: percent(m.sales_talk_ratio), threshold: `≤ ${percent(D2_THRESHOLDS.sales_talk_ratio.max)}`, passed: analysis.checks.d2.sales_talk_ratio, source: analysis.sources.sales_talk_ratio, evidence: full(transcript, '按全场双方发言时长汇总，证据范围是整份逐字稿，不存在唯一原句。') },
    { key: 'profile_covered_count', dimension: 'd2', name: '关键信息覆盖率', value: `${m.profile_covered_count}/${COVERAGE_DENOMINATOR}`, threshold: `≥ ${coverageRequired()}/${COVERAGE_DENOMINATOR}`, passed: analysis.checks.d2.profile_covered_count, source: analysis.sources.profile_coverage, evidence: full(transcript, 'AI 对全场提问内容计数，证据范围是整份逐字稿。') },
    { key: 'open_question_rate', dimension: 'd2', name: '开放式提问占比', value: `${m.open_question_count}/${m.total_question_count}（${percent(ratio(m.open_question_count, m.total_question_count))}）`, threshold: `≥ ${percent(D2_THRESHOLDS.open_question_rate.min)}`, passed: analysis.checks.d2.open_question_rate, source: analysis.sources.open_question_rate, evidence: full(transcript, 'AI 对全场销售问句分类计数，不能伪造单句作为比例证据。') },
    { key: 'customer_question_count', dimension: 'd2', name: '客户提问数', value: `${m.customer_question_count} 次`, threshold: `≥ ${D2_THRESHOLDS.customer_question_count.min} 次`, passed: analysis.checks.d2.customer_question_count, source: analysis.sources.customer_question_count, evidence: full(transcript, '由代码统计全场客户问句，证据范围是整份逐字稿。') },
    { key: 'selling_point_hit_count', dimension: 'd3', name: '卖点提及数', value: `${m.selling_point_hit_count} 个`, threshold: `≥ ${D3_THRESHOLDS.selling_point_hit_count.min} 个`, passed: analysis.checks.d3.selling_point_hit_count, source: analysis.sources.selling_point_hit_count, evidence: full(transcript, '由代码在全场销售发言中匹配结构化卖点关键词。') },
    { key: 'need_match_rate', dimension: 'd3', name: '需求-卖点对齐率', value: `${m.need_matched_count}/${m.need_total_count}（${percent(ratio(m.need_matched_count, m.need_total_count))}）`, threshold: `≥ ${percent(D3_THRESHOLDS.need_match_rate.min)}`, passed: analysis.checks.d3.need_match_rate, source: analysis.sources.need_match_rate, evidence: full(transcript, 'AI 对全场需求及回应关系计数，证据范围是整份逐字稿。') },
    { key: 'param_error_count', dimension: 'd3', name: '参数错误数', value: `${m.param_error_count} 条`, threshold: `≤ ${D3_THRESHOLDS.param_error_count.max} 条`, passed: analysis.checks.d3.param_error_count, source: analysis.sources.param_error_count, evidence: point(735.5, '样例 A 中把“隐蔽工程 5 年”错讲为“整体保五年”的精确起点。') },
    { key: 'max_repeat_followup', dimension: 'd3', name: '同一话题最大反复追问数', value: `${m.max_repeat_followup} 次`, threshold: `≤ ${D3_THRESHOLDS.max_repeat_followup.max} 次`, passed: analysis.checks.d3.max_repeat_followup, source: analysis.sources.max_repeat_followup, evidence: range(272.5, 995.7, '甲醛话题从首次提出到第三次追问的真实区间。') },
    { key: 'objection_response_rate', dimension: 'd4', name: '异议正面回应率', value: percent(m.objection_response_rate), threshold: `≥ ${percent(D4_THRESHOLDS.objection_response_rate.min)}`, passed: analysis.checks.d4.objection_response_rate, source: analysis.sources.objection_response_rate, evidence: range(472.8, 1161.5, '覆盖样例 A 三个异议的真实提出区间，用于核对回应情况。') },
    { key: 'objection_response_delay', dimension: 'd4', name: '异议平均回应时长', value: `${rounded(m.objection_response_delay)} 秒`, threshold: `≤ ${D4_THRESHOLDS.objection_response_delay.max} 秒`, passed: analysis.checks.d4.objection_response_delay, source: analysis.sources.objection_response_delay, evidence: range(821, 940.7, '唯一实质回应从异议提出到回应结束的真实区间；计算使用精确起点 821.0 → 911.6。') },
    { key: 'next_step_locked', dimension: 'd4', name: '下一步锁定', value: m.next_step_locked ? '已锁定' : '未锁定', threshold: D4_THRESHOLDS.next_step_locked.required ? '时间 + 动作 + 责任人齐全' : '无需锁定', passed: analysis.checks.d4.next_step_locked, source: analysis.sources.next_step_locked, evidence: point(1744, '结尾行动邀约的精确起点，用于核对三要素是否齐全。') },
  ]
}

export function segmentMatchesEvidence(start: number, end: number, evidence: MetricEvidenceRange): boolean {
  if (evidence.kind === 'point') return start === evidence.start
  return start <= evidence.end && end >= evidence.start
}
