#!/usr/bin/env node

import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { determineIntent } from '../frontend/src/lib/intent.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }

assert.deepEqual(determineIntent({ directRejection: true, hasDealAmount: true }), { level: 'A', score: 0, reason: '检测到成交金额、合同或带明确时间的口头承诺' })
assert.equal(determineIntent({ verbalCommitment: true, explicitCommitmentTime: false }).level, 'C')
pass('A 级要求成交信号，口头承诺必须同时有明确时间；高级覆盖低级')

assert.equal(determineIntent({ decisionAdvanceCount: 1, priceQuestionCount: 2, detailQuestionCount: 3 }).score, 3)
assert.deepEqual(determineIntent({ priceQuestionCount: 1 }), { level: 'B', score: 2, reason: '客户主动询问价格、优惠、分期或付款方式' })
assert.equal(determineIntent({ detailQuestionCount: 1 }).score, 1)
pass('B 同时命中时严格取决策推进 3 > 价格 2 > 功能细节 1')

assert.equal(determineIntent({ existingSupplierOrCancelledBudget: true, hasFutureCondition: true }).level, 'C')
assert.equal(determineIntent({ existingSupplierOrCancelledBudget: true, hasFutureCondition: false }).level, 'D')
assert.equal(determineIntent({ directRejection: true, continuedWithinTwoTurns: true }).level, 'C')
assert.equal(determineIntent({ directRejection: true, continuedWithinTwoTurns: false }).level, 'D')
pass('C/D 的未来条件与拒绝后两轮边界已落实')

const root = path.resolve(import.meta.dirname, '..')
const backendDir = path.join(root, 'backend')
const require = createRequire(path.join(backendDir, 'package.json'))
const Database = require('better-sqlite3')
const sourceDb = path.join(backendDir, 'data/app.db')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t33-'))
const tempDb = path.join(tempDir, 'app.db')
copyFileSync(sourceDb, tempDb)
const port = 33530 + Math.floor(Math.random() * 150)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], {
  cwd: backendDir,
  env: { ...process.env, PORT: String(port), DB_FILE: tempDb, USE_MOCK: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`临时后端提前退出：${server.exitCode}`)
    try { if ((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok) return } catch { /* 等待 */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('临时后端启动超时')
}

const post = (pathName, body) => fetch(`http://127.0.0.1:${port}/api${pathName}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

try {
  await waitForServer()
  let sqlite = new Database(tempDb)
  const target = sqlite.prepare("SELECT * FROM customers WHERE intent_level = 'C' AND intent_manual = 0 ORDER BY id LIMIT 1").get()
  const logCountBefore = sqlite.prepare('SELECT count(*) AS n FROM intent_logs').get().n
  assert.ok(target)

  sqlite.exec(`CREATE TRIGGER fail_intent_log BEFORE INSERT ON intent_logs BEGIN SELECT RAISE(ABORT, 'forced log failure'); END`)
  const failed = await post(`/customers/${target.id}/intent/manual`, { level: 'B', score: 2, operator: '事务负例' })
  assert.equal(failed.status, 500)
  const afterFailure = sqlite.prepare('SELECT * FROM customers WHERE id = ?').get(target.id)
  assert.equal(afterFailure.intent_level, 'C')
  assert.equal(afterFailure.intent_manual, 0)
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM intent_logs').get().n, logCountBefore)
  sqlite.exec('DROP TRIGGER fail_intent_log')
  pass('日志插入失败时客户更新整体回滚，没有半成功')

  const manual = await post(`/customers/${target.id}/intent/manual`, { level: 'B', score: 2, operator: '测试销售' })
  assert.equal(manual.status, 200)
  const manualBody = await manual.json()
  assert.equal(manualBody.customer.intentLevel, 'B')
  assert.equal(manualBody.customer.intentScore, 2)
  assert.equal(manualBody.customer.intentManual, true)
  assert.equal(manualBody.log.fromLevel, 'C')
  assert.equal(manualBody.log.toLevel, 'B')
  assert.equal(manualBody.log.operator, '测试销售')
  assert.ok(manualBody.log.createdAt)
  pass('C 人工改 B 后客户与含操作人/时间的日志在同一事务写入')

  const protectedResponse = await post(`/customers/${target.id}/intent/auto`, { level: 'C', score: 0 })
  const protectedBody = await protectedResponse.json()
  assert.equal(protectedBody.applied, false)
  assert.deepEqual(protectedBody.suggestion, { level: 'C', score: 0 })
  assert.equal(protectedBody.customer.intentLevel, 'B')
  assert.equal(protectedBody.customer.intentScore, 2)
  pass('intent_manual=true 时自动建议 C 只返回建议，不覆盖人工 B')

  const automaticTarget = sqlite.prepare("SELECT * FROM customers WHERE intent_manual = 0 AND id != ? ORDER BY id LIMIT 1").get(target.id)
  const appliedResponse = await post(`/customers/${automaticTarget.id}/intent/auto`, { level: 'B', score: 3 })
  const appliedBody = await appliedResponse.json()
  assert.equal(appliedBody.applied, true)
  assert.equal(appliedBody.customer.intentLevel, 'B')
  assert.equal(appliedBody.customer.intentScore, 3)
  pass('intent_manual=false 时自动判定可以更新实际级别与强度')

  sqlite.close()
  sqlite = new Database(sourceDb, { readonly: true })
  assert.equal(sqlite.prepare('SELECT intent_level FROM customers WHERE id = ?').get(target.id).intent_level, 'C')
  sqlite.close()
  pass('全部写入只发生在临时数据库，固定 seed 未污染')

  console.log(`\nT33 检查点：通过 ${passed} / 8`)
} finally {
  server.kill('SIGTERM')
  rmSync(tempDir, { recursive: true, force: true })
}
