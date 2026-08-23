#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { PROFILE_FIELDS } from '../frontend/src/config/scoring.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'

const TOP_LEVEL_KEYS = [
  'commitments',
  'counts',
  'highlights',
  'improvements',
  'missed_points',
  'needs',
  'next_actions',
]
const ARRAY_KEYS = [
  'needs',
  'highlights',
  'improvements',
  'commitments',
  'missed_points',
  'next_actions',
]
const BANNED_KEYS = new Set([
  'd1',
  'd2',
  'd3',
  'd4',
  'total',
  'score',
  '等级',
  '评价',
])

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function findEvidenceSegment(item, transcript, speaker) {
  if (item.quote === undefined && item.start === undefined) return true
  if (item.quote !== undefined && typeof item.quote !== 'string') return false
  if (item.start !== undefined && typeof item.start !== 'number') return false

  return transcript.some((segment) =>
    (!speaker || segment.speaker === speaker)
    && (item.start === undefined || segment.start === item.start)
    && (item.quote === undefined || segment.text.includes(item.quote)),
  )
}

export function validateDifyContract(
  result,
  { transcript = [], profileFields = PROFILE_FIELDS, checkEvidence = false } = {},
) {
  const errors = []

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return ['根节点必须是 JSON 对象']
  }

  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(TOP_LEVEL_KEYS)) {
    errors.push('顶层必须且只能包含 T09 的 7 个字段')
  }

  function scan(value) {
    if (value === null) {
      errors.push('契约中不允许出现 null')
      return
    }
    if (Array.isArray(value)) {
      value.forEach(scan)
      return
    }
    if (typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (BANNED_KEYS.has(key)) errors.push(`禁止模型输出评分字段：${key}`)
      scan(child)
    }
  }
  scan(result)

  const counts = result.counts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
    errors.push('counts 必须是对象')
  } else {
    const expectedCountKeys = [
      'open_question_count',
      'param_error_count',
      'profile_covered_fields',
      'total_question_count',
    ]
    if (JSON.stringify(Object.keys(counts).sort()) !== JSON.stringify(expectedCountKeys)) {
      errors.push('counts 必须且只能包含 4 项 AI 计数')
    }
    for (const key of [
      'open_question_count',
      'total_question_count',
      'param_error_count',
    ]) {
      if (!isNonNegativeNumber(counts[key])) errors.push(`${key} 必须是非负数字`)
    }
    if (
      isNonNegativeNumber(counts.open_question_count)
      && isNonNegativeNumber(counts.total_question_count)
      && counts.total_question_count < counts.open_question_count
    ) {
      errors.push('total_question_count 不能小于 open_question_count')
    }
    if (
      !Array.isArray(counts.profile_covered_fields)
      || counts.profile_covered_fields.some((field) => !profileFields.includes(field))
    ) {
      errors.push('profile_covered_fields 只能取自输入字段清单')
    }
  }

  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(result[key])) errors.push(`${key} 必须是数组`)
  }

  if (
    Array.isArray(result.next_actions)
    && (
      result.next_actions.length !== 3
      || result.next_actions.some((action) => typeof action !== 'string' || !action.trim())
    )
  ) {
    errors.push('next_actions 必须正好包含 3 条非空字符串')
  }

  if (Array.isArray(result.needs)) {
    result.needs.forEach((need, index) => {
      if (
        !need
        || !['L1', 'L2'].includes(need.level)
        || typeof need.text !== 'string'
        || typeof need.quote !== 'string'
        || typeof need.start !== 'number'
        || typeof need.satisfied !== 'boolean'
      ) {
        errors.push(`needs[${index}] 结构不合法`)
      } else if (checkEvidence && !findEvidenceSegment(need, transcript, 'customer')) {
        errors.push(`needs[${index}] 的 quote/start 无法定位到客户原话`)
      }
    })
  }

  for (const key of ['highlights', 'improvements', 'missed_points']) {
    if (!Array.isArray(result[key])) continue
    result[key].forEach((item, index) => {
      if (!item || typeof item.text !== 'string') {
        errors.push(`${key}[${index}] 结构不合法`)
      } else if (checkEvidence && !findEvidenceSegment(item, transcript)) {
        errors.push(`${key}[${index}] 的 quote/start 无法定位到逐字稿`)
      }
    })
  }

  if (Array.isArray(result.commitments)) {
    result.commitments.forEach((item, index) => {
      if (
        !item
        || typeof item.text !== 'string'
        || (item.due !== undefined && (typeof item.due !== 'string' || !item.due))
        || (item.start !== undefined && typeof item.start !== 'number')
      ) {
        errors.push(`commitments[${index}] 结构不合法`)
      }
    })
  }

  return [...new Set(errors)]
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

const mockText = await readFile(
  new URL('../backend/mock/difyResult.json', import.meta.url),
  'utf8',
)
const mockResult = JSON.parse(mockText)

check('本地 mock 满足 T09 七字段与类型契约', () => {
  assert.deepEqual(validateDifyContract(mockResult), [])
})

const evidenceSegment = transcriptA.find(
  (segment) => segment.speaker === 'customer' && segment.start === 272.5,
)
assert.ok(evidenceSegment, '样例 A 缺少 272.5 秒的客户甲醛原话')

const evidenceResult = {
  counts: {
    open_question_count: 0,
    total_question_count: 0,
    profile_covered_fields: [],
    param_error_count: 0,
  },
  needs: [{
    level: 'L1',
    text: '客户关注甲醛',
    quote: evidenceSegment.text,
    start: evidenceSegment.start,
    satisfied: false,
  }],
  highlights: [],
  improvements: [],
  commitments: [],
  missed_points: [],
  next_actions: ['补问预算', '补充甲醛检测承诺', '约定下次沟通时间'],
}

check('quote 与片段 start 精确对应时通过', () => {
  assert.deepEqual(validateDifyContract(evidenceResult, {
    transcript: transcriptA,
    checkEvidence: true,
  }), [])
})

check('把片段 end 误当 start 时必须失败', () => {
  const wrongStart = structuredClone(evidenceResult)
  wrongStart.needs[0].start = evidenceSegment.end
  assert.match(
    validateDifyContract(wrongStart, {
      transcript: transcriptA,
      checkEvidence: true,
    }).join('\n'),
    /无法定位/,
  )
})

console.log(`\nT27 本地契约检查：通过 ${passed} / 3`)
console.log('真实网络调用：0')

if (passed !== 3) process.exitCode = 1
