#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { buildReviewAnalysis } from '../frontend/src/lib/reviewAnalysis.ts'
import { loadPreparedReviewResult, savePreparedReviewResult } from '../frontend/src/lib/reviewResultStore.ts'
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
  const products = db.prepare("select selling_points from products where industry = '装修'").all()
  const sellingPoints = products.flatMap((row) => JSON.parse(row.selling_points))
  const analysis = buildReviewAnalysis({ transcript: transcriptA, sellingPoints, aiResult, evidence: metricEvidenceA })
  assert.deepEqual(analysis.scores, { d1: 1, d2: 0, d3: 0, d4: 0, total: 1 })
  pass('样例 A 通过既有计算层得到 1/0/0/0、总分 1')

  const totals = db.prepare('select scores from reviews').all().map((row) => JSON.parse(row.scores).total)
  const average = Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length * 10) / 10
  assert.equal(average, 2.2)
  pass('demo 单账号口径的 6 场历史平均为 2.2/4')

  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const prepared = { aiResult, analysis, historicalAverage: average, source: 'mock', analyzedAt: 123 }
  savePreparedReviewResult(storage, prepared)
  assert.deepEqual(loadPreparedReviewResult(storage), prepared)
  pass('完整分析结果可写入并恢复，供后续详情任务使用')

  assert.equal(loadPreparedReviewResult({ ...storage, getItem: () => '{坏数据' }), null)
  pass('损坏缓存安全回落，不会让结果页白屏')
  console.log(`\nT36 检查点：通过 ${passed} / 4`)
} finally {
  db.close()
}
