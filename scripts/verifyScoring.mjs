#!/usr/bin/env node

import assert from 'node:assert/strict'

import { evaluateMetricChecks, scoreMetrics } from '../frontend/src/lib/scoring.ts'

const allPassing = {
  icebreak_duration: 60,
  interrupt_per_hour: 3,
  customer_first_speak_at: 180,
  sales_talk_ratio: 0.6,
  customer_question_count: 3,
  profile_covered_count: 4,
  open_question_count: 2,
  total_question_count: 4,
  selling_point_hit_count: 3,
  max_repeat_followup: 2,
  need_matched_count: 3,
  need_total_count: 5,
  param_error_count: 0,
  objection_response_rate: 0.7,
  objection_response_delay: 10,
  next_step_locked: true,
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

check('14 项都压在达标边界时，四维满分', () => {
  assert.deepEqual(scoreMetrics(allPassing), {
    d1: 1,
    d2: 1,
    d3: 1,
    d4: 1,
    total: 4,
  })
  assert.equal(
    Object.values(evaluateMetricChecks(allPassing)).flatMap(Object.values).length,
    14,
  )
})

check('D2 刚好 4 项达标时得 1 分', () => {
  const exactlyFour = {
    ...allPassing,
    open_question_count: 1,
    total_question_count: 4,
  }
  assert.equal(
    Object.values(evaluateMetricChecks(exactlyFour).d2).filter(Boolean).length,
    4,
  )
  assert.equal(scoreMetrics(exactlyFour).d2, 1)
})

check('D2 再坏一项只剩 3 项时得 0 分', () => {
  const exactlyThree = {
    ...allPassing,
    open_question_count: 1,
    total_question_count: 4,
    customer_question_count: 2,
  }
  assert.equal(
    Object.values(evaluateMetricChecks(exactlyThree).d2).filter(Boolean).length,
    3,
  )
  assert.equal(scoreMetrics(exactlyThree).d2, 0)
})

check('比例分母为 0 时按 0 处理，不产生 NaN / Infinity', () => {
  const zeroDenominators = {
    ...allPassing,
    open_question_count: 0,
    total_question_count: 0,
    need_matched_count: 0,
    need_total_count: 0,
  }
  const checks = evaluateMetricChecks(zeroDenominators)
  assert.equal(checks.d2.open_question_rate, false)
  assert.equal(checks.d3.need_match_rate, false)
})

if (process.exitCode) {
  console.error(`\nT22 自检失败：通过 ${passed} / 4`)
} else {
  console.log(`\nT22 自检通过：通过 ${passed} / 4`)
}
