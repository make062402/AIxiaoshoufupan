#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { buildCustomerList } from '../frontend/src/lib/customerList.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'

const require = createRequire(path.join(import.meta.dirname, '../backend/package.json'))
const Database = require('better-sqlite3')
const sqlite = new Database(path.join(import.meta.dirname, '../backend/data/app.db'), { readonly: true })
const rawCustomers = sqlite.prepare('SELECT * FROM customers').all()
const rawReviews = sqlite.prepare('SELECT id, customer_id FROM reviews').all()
sqlite.close()

const customers = rawCustomers.map((row) => ({
  id: row.id,
  name: row.name,
  identity: row.identity,
  phone: row.phone,
  role: row.role,
  budget: row.budget,
  coreNeed: row.core_need,
  priorityOrder: row.priority_order ? JSON.parse(row.priority_order) : null,
  notes: row.notes,
  deadline: row.deadline,
  industry: row.industry,
  intentLevel: row.intent_level,
  intentScore: row.intent_score,
  intentManual: Boolean(row.intent_manual),
  createdAt: String(row.created_at),
}))
const reviews = rawReviews.map((row) => ({ id: row.id, customerId: row.customer_id }))
const rows = buildCustomerList(customers, reviews)

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }

assert.equal(rows.length, 7)
pass('按用户确认口径展示全部 7 个 seed 客户')

assert.deepEqual(rows.map((row) => row.name), ['高建军', '何薇', '刘敏', '马红梅', '苏晓彤', '张国庆', '郑帆'])
pass('客户按姓名拼音稳定排序')

assert.ok(rows.every((row) => ['A', 'B', 'C', 'D'].includes(row.intentLevel)))
assert.ok(rows.every((row) => Number.isInteger(row.intentScore) && row.intentScore >= 0 && row.intentScore <= 3))
pass('每位客户都有合法意向标签和 0-3 意向强度分')

const stages = Object.fromEntries(rows.map((row) => [row.name, row.stage]))
assert.deepEqual(stages, {
  高建军: 'S1', 何薇: 'S3', 刘敏: 'S2', 马红梅: 'S1', 苏晓彤: 'S1', 张国庆: 'S3', 郑帆: 'S2',
})
pass('S1/S2/S3 完全由 reviews 数量派生')

assert.deepEqual(resolveRoute('/me/customers'), { kind: 'page', route: 'me', path: '/me/customers' })
pass('客户库使用可刷新恢复的稳定 URL')

const sameName = buildCustomerList([
  { ...customers[0], id: 22, name: '同名' },
  { ...customers[0], id: 11, name: '同名' },
], [])
assert.deepEqual(sameName.map((row) => row.id), [11, 22])
pass('同名客户用 ID 做确定性排序兜底')

console.log(`\nT31 检查点：通过 ${passed} / 6`)
