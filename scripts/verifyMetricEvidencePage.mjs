#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { D1_THRESHOLDS, D2_THRESHOLDS } from '../frontend/src/config/scoring.ts'
import { formatTranscriptTime, presentMetrics, segmentMatchesEvidence } from '../frontend/src/lib/metricPresentation.ts'
import { buildReviewAnalysis } from '../frontend/src/lib/reviewAnalysis.ts'
import { metricEvidenceA } from '../frontend/src/samples/metricEvidence.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const db = new Database(path.join(backend, 'data/app.db'), { readonly: true })

try {
  const aiResult = JSON.parse(readFileSync(path.join(backend, 'mock/difyResult.json'), 'utf8'))
  const sellingPoints = db.prepare("select selling_points from products where industry = '装修'").all().flatMap((row) => JSON.parse(row.selling_points))
  const analysis = buildReviewAnalysis({ transcript: transcriptA, sellingPoints, aiResult, evidence: metricEvidenceA })
  const metrics = presentMetrics(analysis, transcriptA)
  assert.equal(metrics.length, 14)
  assert.deepEqual(metrics.map((metric) => metric.passed), Object.values(analysis.checks).flatMap(Object.values))
  assert.deepEqual(new Set(metrics.map((metric) => metric.source)), new Set(['code', 'ai']))
  pass('14 项名称/实测/达标/来源均由 ReviewAnalysis 展示模型提供')

  assert.equal(metrics.find((metric) => metric.key === 'icebreak_duration').threshold, `≥ ${D1_THRESHOLDS.icebreak_duration.min} 秒且 ≤ ${D1_THRESHOLDS.icebreak_duration.max} 秒`)
  assert.equal(metrics.find((metric) => metric.key === 'sales_talk_ratio').threshold, `≤ ${D2_THRESHOLDS.sales_talk_ratio.max * 100}%`)
  pass('门槛现场读取 config/scoring.ts，而非另抄评分字面量')

  assert.equal(formatTranscriptTime(512), '第 8 分 32 秒')
  assert.equal(formatTranscriptTime(79.5), '第 1 分 19.5 秒')
  pass('秒数格式化保持秒口径，512 秒显示为第 8 分 32 秒')

  const icebreak = metrics.find((metric) => metric.key === 'icebreak_duration')
  const interrupt = metrics.find((metric) => metric.key === 'interrupt_per_hour')
  assert.equal(transcriptA.find((segment) => segmentMatchesEvidence(segment.start, segment.end, icebreak.evidence)).start, 79.5)
  assert.equal(transcriptA.find((segment) => segmentMatchesEvidence(segment.start, segment.end, interrupt.evidence)).start, 1365)
  assert.equal(segmentMatchesEvidence(79.5, 117.8, interrupt.evidence), false)
  pass('单点证据按精确 start 匹配，切换指标会切换高亮 segment')

  const talkRatio = metrics.find((metric) => metric.key === 'sales_talk_ratio')
  const repeat = metrics.find((metric) => metric.key === 'max_repeat_followup')
  assert.equal(talkRatio.evidence.kind, 'full')
  assert.deepEqual([talkRatio.evidence.start, talkRatio.evidence.end], [0, 1761.2])
  assert.equal(repeat.evidence.kind, 'range')
  assert.ok(transcriptA.filter((segment) => segmentMatchesEvidence(segment.start, segment.end, repeat.evidence)).length > 1)
  pass('比例项明确为全场证据，跨句指标明确为真实区间，不伪造唯一原话')
  console.log(`\nT37 检查点：通过 ${passed} / 5`)
} finally {
  db.close()
}
