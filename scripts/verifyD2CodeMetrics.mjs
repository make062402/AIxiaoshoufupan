#!/usr/bin/env node

import assert from 'node:assert/strict'

import { D2_THRESHOLDS } from '../frontend/src/config/scoring.ts'
import {
  getCustomerFirstActiveSpeakAtSeconds,
  getCustomerQuestionCount,
  getSalesTalkRatio,
} from '../frontend/src/lib/metrics.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'
import { transcriptB } from '../frontend/src/samples/transcriptB.ts'

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

check('样本 A：首次主动 272.5 秒、销售占比约 0.781、客户 13 问', () => {
  assert.equal(getCustomerFirstActiveSpeakAtSeconds(transcriptA), 272.5)
  closeTo(getSalesTalkRatio(transcriptA), 1300.4 / (1300.4 + 364.4))
  assert.ok(getSalesTalkRatio(transcriptA) > D2_THRESHOLDS.sales_talk_ratio.max)
  assert.equal(getCustomerQuestionCount(transcriptA), 13)
})

check('样本 B：首次主动 85.6 秒、销售占比约 0.463、客户 7 问', () => {
  assert.equal(getCustomerFirstActiveSpeakAtSeconds(transcriptB), 85.6)
  closeTo(getSalesTalkRatio(transcriptB), 857.5 / (857.5 + 993.1))
  assert.ok(getSalesTalkRatio(transcriptB) <= D2_THRESHOLDS.sales_talk_ratio.max)
  assert.equal(getCustomerQuestionCount(transcriptB), 7)
})

check('首次主动发言会跳过短应答，并按时间排序后查找', () => {
  const unordered = [
    { speaker: 'customer', start: 20, end: 22, text: '这是客户自己展开讲的一段完整需求' },
    { speaker: 'customer', start: 3, end: 4, text: '嗯，好的。' },
    { speaker: 'sales', start: 0, end: 2, text: '您好。' },
  ]
  assert.equal(getCustomerFirstActiveSpeakAtSeconds(unordered), 20)
})

check('空数据和零时长不会产生 NaN / Infinity', () => {
  assert.equal(getSalesTalkRatio([]), 0)
  assert.equal(getCustomerQuestionCount([]), 0)
  assert.equal(
    getCustomerFirstActiveSpeakAtSeconds([]),
    Number.MAX_SAFE_INTEGER,
  )
  assert.ok(Number.isFinite(getCustomerFirstActiveSpeakAtSeconds([])))
})

if (process.exitCode) {
  console.error(`\nT19 自检失败：通过 ${passed} / 4`)
} else {
  console.log(`\nT19 自检通过：通过 ${passed} / 4`)
  console.log(
    `样本 A：first=${getCustomerFirstActiveSpeakAtSeconds(transcriptA)}s, ratio=${getSalesTalkRatio(transcriptA).toFixed(3)}, questions=${getCustomerQuestionCount(transcriptA)}`,
  )
  console.log(
    `样本 B：first=${getCustomerFirstActiveSpeakAtSeconds(transcriptB)}s, ratio=${getSalesTalkRatio(transcriptB).toFixed(3)}, questions=${getCustomerQuestionCount(transcriptB)}`,
  )
}
