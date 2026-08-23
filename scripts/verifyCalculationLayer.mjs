#!/usr/bin/env node

import assert from 'node:assert/strict'

process.env.DB_FILE = './backend/data/app.db'
process.env.USE_MOCK = 'true'

let fetchCalls = 0
globalThis.fetch = async () => {
  fetchCalls += 1
  throw new Error('T24 必须全程使用 mock，禁止真实网络请求')
}

const { analyzeTranscript } = await import('../backend/src/dify.ts')
const { db } = await import('../backend/src/db/client.ts')
const { products } = await import('../backend/src/db/schema.ts')
const { buildReviewAnalysis } = await import(
  '../frontend/src/lib/reviewAnalysis.ts'
)
const { metricEvidenceA, metricEvidenceB } = await import(
  '../frontend/src/samples/metricEvidence.ts'
)
const { transcriptA } = await import('../frontend/src/samples/transcriptA.ts')
const { transcriptB } = await import('../frontend/src/samples/transcriptB.ts')

const sellingPoints = (await db.select().from(products))
  .filter((product) => product.industry === '装修')
  .flatMap((product) => product.sellingPoints ?? [])

const mockA = await analyzeTranscript({ transcript: transcriptA })
const mockB = await analyzeTranscript({ transcript: transcriptB })
const analysisA = buildReviewAnalysis({
  transcript: transcriptA,
  sellingPoints,
  aiResult: mockA.result,
  evidence: metricEvidenceA,
})
const analysisB = buildReviewAnalysis({
  transcript: transcriptB,
  sellingPoints,
  aiResult: mockB.result,
  evidence: metricEvidenceB,
})

function metricRows(analysis) {
  const { metrics: m, checks: c, sources: s } = analysis
  return [
    ['icebreak_duration', `${m.icebreak_duration.toFixed(1)}s`, s.icebreak_duration, c.d1.icebreak_duration],
    ['interrupt_per_hour', m.interrupt_per_hour.toFixed(3), s.interrupt_per_hour, c.d1.interrupt_per_hour],
    ['customer_first_speak_at', `${m.customer_first_speak_at.toFixed(1)}s`, s.customer_first_speak_at, c.d2.customer_first_speak_at],
    ['sales_talk_ratio', m.sales_talk_ratio.toFixed(3), s.sales_talk_ratio, c.d2.sales_talk_ratio],
    ['profile_coverage', `${m.profile_covered_count}/8`, s.profile_coverage, c.d2.profile_covered_count],
    ['open_question_rate', `${m.open_question_count}/${m.total_question_count}`, s.open_question_rate, c.d2.open_question_rate],
    ['customer_question_count', String(m.customer_question_count), s.customer_question_count, c.d2.customer_question_count],
    ['selling_point_hit_count', String(m.selling_point_hit_count), s.selling_point_hit_count, c.d3.selling_point_hit_count],
    ['need_match_rate', `${m.need_matched_count}/${m.need_total_count}`, s.need_match_rate, c.d3.need_match_rate],
    ['param_error_count', String(m.param_error_count), s.param_error_count, c.d3.param_error_count],
    ['max_repeat_followup', String(m.max_repeat_followup), s.max_repeat_followup, c.d3.max_repeat_followup],
    ['objection_response_rate', m.objection_response_rate.toFixed(3), s.objection_response_rate, c.d4.objection_response_rate],
    ['objection_response_delay', `${m.objection_response_delay.toFixed(2)}s`, s.objection_response_delay, c.d4.objection_response_delay],
    ['next_step_locked', String(m.next_step_locked), s.next_step_locked, c.d4.next_step_locked],
  ].map(([metric, value, source, passed]) => ({
    metric,
    value,
    source,
    result: passed ? 'PASS' : 'FAIL',
  }))
}

let passed = 0

function check(name, assertion) {
  try {
    assertion()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `期望约 ${expected}，实际 ${actual}`,
  )
}

check('两份样本均走本地 mock，真实 fetch 调用为 0', () => {
  assert.equal(mockA.source, 'mock')
  assert.equal(mockB.source, 'mock')
  assert.equal(fetchCalls, 0)
})

check('样本 A 的 10 项代码指标与人工基线一致', () => {
  const m = analysisA.metrics
  closeTo(m.icebreak_duration, 79.5)
  closeTo(m.interrupt_per_hour, 3600 / 1761.2)
  closeTo(m.customer_first_speak_at, 272.5)
  closeTo(m.sales_talk_ratio, 1300.4 / (1300.4 + 364.4))
  assert.equal(m.customer_question_count, 13)
  assert.equal(m.selling_point_hit_count, 7)
  assert.equal(m.max_repeat_followup, 3)
  closeTo(m.objection_response_rate, 1 / 3)
  closeTo(m.objection_response_delay, 90.6)
  assert.equal(m.next_step_locked, false)
})

check('样本 B 的 10 项代码指标与人工基线一致', () => {
  const m = analysisB.metrics
  closeTo(m.icebreak_duration, 66.5)
  closeTo(m.interrupt_per_hour, 7200 / 1898)
  closeTo(m.customer_first_speak_at, 85.6)
  closeTo(m.sales_talk_ratio, 857.5 / (857.5 + 993.1))
  assert.equal(m.customer_question_count, 7)
  assert.equal(m.selling_point_hit_count, 6)
  assert.equal(m.max_repeat_followup, 2)
  closeTo(m.objection_response_rate, 1)
  closeTo(m.objection_response_delay, (6.8 + 6.3 + 6.5) / 3)
  assert.equal(m.next_step_locked, true)
})

check('两份结果都包含 14 项来源和 14 项判定', () => {
  for (const analysis of [analysisA, analysisB]) {
    assert.equal(metricRows(analysis).length, 14)
    assert.equal(Object.keys(analysis.sources).length, 14)
    assert.equal(
      Object.values(analysis.checks).flatMap(Object.values).length,
      14,
    )
  }
})

check('样本 A 总分落在 0~1，实际为 1', () => {
  assert.ok(analysisA.scores.total >= 0 && analysisA.scores.total <= 1)
  assert.deepEqual(analysisA.scores, {
    d1: 1,
    d2: 0,
    d3: 0,
    d4: 0,
    total: 1,
  })
})

check('样本 B 总分落在 3~4，实际为 3', () => {
  assert.ok(analysisB.scores.total >= 3 && analysisB.scores.total <= 4)
  assert.deepEqual(analysisB.scores, {
    d1: 0,
    d2: 1,
    d3: 1,
    d4: 1,
    total: 3,
  })
})

console.log('\n样本 A · 打得差')
console.table(metricRows(analysisA))
console.log('Scores A:', analysisA.scores)

console.log('\n样本 B · 打得好')
console.table(metricRows(analysisB))
console.log('Scores B:', analysisB.scores)

if (process.exitCode) {
  console.error(`\nT24 检查点失败：通过 ${passed} / 6`)
} else {
  console.log(`\nT24 检查点通过：通过 ${passed} / 6`)
  console.log('分档成立：样本 A = 1（要求 0~1），样本 B = 3（要求 3~4）')
}
