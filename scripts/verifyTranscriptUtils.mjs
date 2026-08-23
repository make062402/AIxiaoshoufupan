#!/usr/bin/env node

import assert from 'node:assert/strict'

import { transcriptA } from '../frontend/src/samples/transcriptA.ts'
import { transcriptB } from '../frontend/src/samples/transcriptB.ts'
import {
  countQuestionMarks,
  filterTranscriptBySpeaker,
  findQuestionSegments,
  getTotalDurationSeconds,
  getTranscriptDurationSeconds,
  sortTranscriptByStart,
} from '../frontend/src/lib/transcript.ts'

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

check('样本 A 的说话时长与整场时长', () => {
  closeTo(getTotalDurationSeconds(transcriptA, 'sales'), 1300.4)
  closeTo(getTotalDurationSeconds(transcriptA, 'customer'), 364.4)
  closeTo(getTranscriptDurationSeconds(transcriptA), 1761.2)
})

check('样本 A 的问号数与含问号片段数', () => {
  assert.equal(countQuestionMarks(transcriptA, 'sales'), 9)
  assert.equal(countQuestionMarks(transcriptA, 'customer'), 13)
  assert.equal(findQuestionSegments(transcriptA, 'customer').length, 11)
})

check('样本 B 的时长与问号数', () => {
  closeTo(getTotalDurationSeconds(transcriptB, 'sales'), 857.5)
  closeTo(getTotalDurationSeconds(transcriptB, 'customer'), 993.1)
  closeTo(getTranscriptDurationSeconds(transcriptB), 1898)
  assert.equal(countQuestionMarks(transcriptB, 'sales'), 14)
  assert.equal(countQuestionMarks(transcriptB, 'customer'), 7)
})

check('排序返回新数组且不修改输入', () => {
  const unordered = [
    { speaker: 'sales', start: 8, end: 9, text: '晚' },
    { speaker: 'customer', start: 2, end: 3, text: '早' },
    { speaker: 'sales', start: 5, end: 6, text: '中' },
  ]
  const originalStarts = unordered.map((segment) => segment.start)
  const sorted = sortTranscriptByStart(unordered)

  assert.deepEqual(sorted.map((segment) => segment.start), [2, 5, 8])
  assert.deepEqual(unordered.map((segment) => segment.start), originalStarts)
  assert.notEqual(sorted, unordered)
})

check('中英文问号均逐个计数', () => {
  const mixed = [
    { speaker: 'customer', start: 0, end: 1, text: '中文？English? 还有吗？' },
  ]
  assert.equal(countQuestionMarks(mixed, 'customer'), 3)
  assert.equal(findQuestionSegments(mixed).length, 1)
})

check('空逐字稿返回 0 或空数组', () => {
  assert.equal(getTotalDurationSeconds([], 'sales'), 0)
  assert.equal(getTranscriptDurationSeconds([]), 0)
  assert.equal(countQuestionMarks([], 'customer'), 0)
  assert.deepEqual(filterTranscriptBySpeaker([], 'sales'), [])
  assert.deepEqual(findQuestionSegments([]), [])
  assert.deepEqual(sortTranscriptByStart([]), [])
})

if (process.exitCode) {
  console.error(`\nT17 自检失败：通过 ${passed} / 6`)
} else {
  console.log(`\nT17 自检通过：通过 ${passed} / 6`)
}
