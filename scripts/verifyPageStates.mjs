#!/usr/bin/env node

import assert from 'node:assert/strict'
import { TODO_PREVIEW_DELAY_MS, loadTodoPreview, parseTodoPreviewScenario } from '../frontend/src/lib/demoPageState.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }

assert.equal(TODO_PREVIEW_DELAY_MS, 3000)
const startedAt = Date.now()
const slowItems = await loadTodoPreview('slow', 0)
assert.ok(Date.now() - startedAt >= 2900)
assert.equal(slowItems.length, 2)
pass('慢接口固定等待 3 秒，完成后返回新数据')

await assert.rejects(loadTodoPreview('error', 0, 0), /SQLITE_INTERNAL/)
const recovered = await loadTodoPreview('error', 1, 0)
assert.equal(recovered.length, 2)
pass('错误 stub 首次失败，重试后可恢复')

const empty = await loadTodoPreview('empty', 0, 0)
assert.deepEqual(empty, [])
pass('空数组被保留为正常空数据')

assert.equal(parseTodoPreviewScenario('unknown'), 'empty')
assert.equal(parseTodoPreviewScenario('error'), 'error')
pass('未知 stub 参数安全回落为空态')

console.log(`\nT30 检查点：通过 ${passed} / 4`)
