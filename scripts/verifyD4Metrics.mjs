#!/usr/bin/env node

import assert from 'node:assert/strict'

import {
  getAverageObjectionResponseDelaySeconds,
  getNextStepElements,
  getObjectionResponseRate,
  isNextStepLocked,
} from '../frontend/src/lib/metrics.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'
import { transcriptB } from '../frontend/src/samples/transcriptB.ts'

const objectionsA = [
  { objectionStartSeconds: 472.8 },
  { objectionStartSeconds: 821, responseStartSeconds: 911.6 },
  { objectionStartSeconds: 1141.9 },
]

const objectionsB = [
  { objectionStartSeconds: 828.3, responseStartSeconds: 835.1 },
  { objectionStartSeconds: 891.2, responseStartSeconds: 897.5 },
  { objectionStartSeconds: 1012.7, responseStartSeconds: 1019.2 },
]

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

check('样本 A：1/3 异议被回应，平均 90.6 秒，下一步不齐全', () => {
  closeTo(getObjectionResponseRate(transcriptA, objectionsA), 1 / 3)
  closeTo(
    getAverageObjectionResponseDelaySeconds(transcriptA, objectionsA),
    90.6,
  )
  assert.equal(isNextStepLocked(transcriptA), false)
  assert.deepEqual(getNextStepElements(transcriptA), {
    hasTime: false,
    hasAction: true,
    hasOwner: true,
  })
})

check('样本 B：3/3 异议被回应，平均约 6.53 秒，下一步三要素齐全', () => {
  closeTo(getObjectionResponseRate(transcriptB, objectionsB), 1)
  closeTo(
    getAverageObjectionResponseDelaySeconds(transcriptB, objectionsB),
    (6.8 + 6.3 + 6.5) / 3,
  )
  assert.equal(isNextStepLocked(transcriptB), true)
  assert.deepEqual(getNextStepElements(transcriptB), {
    hasTime: true,
    hasAction: true,
    hasOwner: true,
  })
})

check('无效锚点不会被当成实质回应', () => {
  const invalid = [
    { objectionStartSeconds: 828.3, responseStartSeconds: 9999 },
    { objectionStartSeconds: 9999, responseStartSeconds: 835.1 },
  ]
  assert.equal(getObjectionResponseRate(transcriptB, invalid), 0)
  assert.equal(
    getAverageObjectionResponseDelaySeconds(transcriptB, invalid),
    Number.MAX_SAFE_INTEGER,
  )
})

check('没有异议时回应率按 1 处理，但无回应时长保持未达标哨兵值', () => {
  assert.equal(getObjectionResponseRate([], []), 1)
  assert.equal(
    getAverageObjectionResponseDelaySeconds([], []),
    Number.MAX_SAFE_INTEGER,
  )
  assert.equal(isNextStepLocked([]), false)
})

if (process.exitCode) {
  console.error(`\nT21 自检失败：通过 ${passed} / 4`)
} else {
  console.log(`\nT21 自检通过：通过 ${passed} / 4`)
  console.log(
    `样本 A：rate=${getObjectionResponseRate(transcriptA, objectionsA).toFixed(3)}, delay=${getAverageObjectionResponseDelaySeconds(transcriptA, objectionsA).toFixed(1)}s, locked=${isNextStepLocked(transcriptA)}`,
  )
  console.log(
    `样本 B：rate=${getObjectionResponseRate(transcriptB, objectionsB).toFixed(3)}, delay=${getAverageObjectionResponseDelaySeconds(transcriptB, objectionsB).toFixed(2)}s, locked=${isNextStepLocked(transcriptB)}`,
  )
}
