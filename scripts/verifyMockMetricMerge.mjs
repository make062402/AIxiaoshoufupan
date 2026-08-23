#!/usr/bin/env node

import assert from 'node:assert/strict'

process.env.DB_FILE = './backend/data/app.db'
process.env.USE_MOCK = 'true'

let fetchCalls = 0
globalThis.fetch = async () => {
  fetchCalls += 1
  throw new Error('USE_MOCK=true 时不允许发起网络请求')
}

const { analyzeTranscript } = await import('../backend/src/dify.ts')
const { db } = await import('../backend/src/db/client.ts')
const { products } = await import('../backend/src/db/schema.ts')
const { buildReviewAnalysis } = await import(
  '../frontend/src/lib/reviewAnalysis.ts'
)
const { metricEvidenceA } = await import(
  '../frontend/src/samples/metricEvidence.ts'
)
const { transcriptA } = await import('../frontend/src/samples/transcriptA.ts')

const decorationProducts = (await db.select().from(products)).filter(
  (product) => product.industry === '装修',
)
const sellingPoints = decorationProducts.flatMap(
  (product) => product.sellingPoints ?? [],
)
const mockOutcome = await analyzeTranscript({ transcript: transcriptA })
const analysis = buildReviewAnalysis({
  transcript: transcriptA,
  sellingPoints,
  aiResult: mockOutcome.result,
  evidence: metricEvidenceA,
})

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

check('USE_MOCK=true 返回 mock，fetch 调用次数为 0', () => {
  assert.equal(mockOutcome.ok, true)
  assert.equal(mockOutcome.source, 'mock')
  assert.equal(fetchCalls, 0)
})

check('样本 A 的 10 项代码指标完整合并', () => {
  const metrics = analysis.metrics
  closeTo(metrics.icebreak_duration, 79.5)
  closeTo(metrics.interrupt_per_hour, 3600 / 1761.2)
  closeTo(metrics.customer_first_speak_at, 272.5)
  closeTo(metrics.sales_talk_ratio, 1300.4 / (1300.4 + 364.4))
  assert.equal(metrics.customer_question_count, 13)
  assert.equal(metrics.selling_point_hit_count, 7)
  assert.equal(metrics.max_repeat_followup, 3)
  closeTo(metrics.objection_response_rate, 1 / 3)
  closeTo(metrics.objection_response_delay, 90.6)
  assert.equal(metrics.next_step_locked, false)
})

check('mock 的 4 项 AI 指标完整合并', () => {
  const metrics = analysis.metrics
  assert.equal(metrics.profile_covered_count, 5)
  assert.equal(metrics.open_question_count, 7)
  assert.equal(metrics.total_question_count, 16)
  assert.equal(metrics.need_matched_count, 3)
  assert.equal(metrics.need_total_count, 4)
  assert.equal(metrics.param_error_count, 2)
})

check('14 项来源明确为 10 个 code + 4 个 ai', () => {
  assert.equal(Object.keys(analysis.sources).length, 14)
  assert.equal(
    Object.values(analysis.sources).filter((source) => source === 'code').length,
    10,
  )
  assert.equal(
    Object.values(analysis.sources).filter((source) => source === 'ai').length,
    4,
  )
})

check('样本 A + mock 输出四维分和总分', () => {
  assert.deepEqual(analysis.scores, {
    d1: 1,
    d2: 0,
    d3: 0,
    d4: 0,
    total: 1,
  })
  assert.equal(
    Object.values(analysis.checks).flatMap(Object.values).length,
    14,
  )
})

if (process.exitCode) {
  console.error(`\nT23 自检失败：通过 ${passed} / 5`)
} else {
  console.log(`\nT23 自检通过：通过 ${passed} / 5`)
  console.log(JSON.stringify(analysis, null, 2))
}
