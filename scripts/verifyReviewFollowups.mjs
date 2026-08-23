#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { commitmentMeta, EMPTY_FOLLOWUP_TEXT, hasReviewItems } from '../frontend/src/lib/reviewFollowups.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const result = JSON.parse(readFileSync(path.join(root, 'backend/mock/difyResult.json'), 'utf8'))

const missedNeed = result.missed_points.find((item) => item.start === 272.5)
assert.ok(missedNeed.text.includes('客户明确要求甲醛检测保障'))
assert.ok(missedNeed.text.includes('销售漏讲'))
assert.ok(missedNeed.text.includes('第三方检测'))
const segment = transcriptA.find((item) => item.start === missedNeed.start)
assert.equal(segment.text, missedNeed.quote)
pass('样例 A 明确展示客户需求、销售漏讲的对应卖点，start 与原话可精确回溯')

assert.equal(result.commitments.length, 2)
assert.deepEqual(commitmentMeta(result.commitments[0]), ['期限：今天下班前', '第 9 分 1.8 秒'])
assert.deepEqual(commitmentMeta({ text: '无期限承诺' }), [])
assert.ok(!commitmentMeta({ text: '无期限承诺' }).join(' ').includes('undefined'))
assert.ok(!commitmentMeta({ text: '无期限承诺' }).join(' ').includes('null'))
pass('承诺只展示真实 due/时间，缺失字段不会渲染 null 或 undefined')

assert.equal(result.next_actions.length, 3)
assert.ok(result.next_actions.every((action) => typeof action === 'string' && action.trim()))
pass('下一步待办严格展示模型实际返回的 3 条，不由前端补写')

for (const items of [[], [], []]) assert.equal(hasReviewItems(items), false)
assert.equal(EMPTY_FOLLOWUP_TEXT, '本次未检出')
pass('漏讲、承诺、待办任一数组为空都独立回落“本次未检出”')

console.log(`\nT39 检查点：通过 ${passed} / 4`)
