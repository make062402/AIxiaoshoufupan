#!/usr/bin/env node

import assert from 'node:assert/strict'

import { D1_THRESHOLDS } from '../frontend/src/config/scoring.ts'
import {
  countSalesInterruptions,
  getIcebreakDurationSeconds,
  getSalesInterruptionsPerHour,
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

check('样本 A：破冰 79.5 秒、1 次打断、约 2.044 次/小时', () => {
  closeTo(getIcebreakDurationSeconds(transcriptA, 79.5), 79.5)
  assert.equal(countSalesInterruptions(transcriptA), 1)
  closeTo(getSalesInterruptionsPerHour(transcriptA), 3600 / 1761.2)
})

check('样本 B：破冰 66.5 秒、2 次打断、约 3.793 次/小时', () => {
  closeTo(getIcebreakDurationSeconds(transcriptB, 66.5), 66.5)
  assert.equal(countSalesInterruptions(transcriptB), 2)
  closeTo(getSalesInterruptionsPerHour(transcriptB), 7200 / 1898)
  assert.ok(
    getIcebreakDurationSeconds(transcriptB, 66.5) >=
      D1_THRESHOLDS.icebreak_duration.min,
  )
  assert.ok(
    getIcebreakDurationSeconds(transcriptB, 66.5) <=
      D1_THRESHOLDS.icebreak_duration.max,
  )
})

check('破冰按会话真实起点计算，不假定从 0 秒开始', () => {
  const shifted = [
    { speaker: 'sales', start: 10, end: 15, text: '寒暄' },
    { speaker: 'sales', start: 25, end: 30, text: '业务' },
  ]
  assert.equal(getIcebreakDurationSeconds(shifted, 25), 15)
})

check('边界与空数组不产生 NaN 或 Infinity', () => {
  assert.equal(getIcebreakDurationSeconds([], 10), 0)
  assert.equal(countSalesInterruptions([]), 0)
  assert.equal(getSalesInterruptionsPerHour([]), 0)
  assert.equal(
    getSalesInterruptionsPerHour([
      { speaker: 'sales', start: 5, end: 5, text: '零时长' },
    ]),
    0,
  )
})

if (process.exitCode) {
  console.error(`\nT18 自检失败：通过 ${passed} / 4`)
} else {
  console.log(`\nT18 自检通过：通过 ${passed} / 4`)
  console.log(
    `样本 A：icebreak=79.5s, interruptions=1, perHour=${getSalesInterruptionsPerHour(transcriptA).toFixed(3)}`,
  )
  console.log(
    `样本 B：icebreak=66.5s, interruptions=2, perHour=${getSalesInterruptionsPerHour(transcriptB).toFixed(3)}`,
  )
}
