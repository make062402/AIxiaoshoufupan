#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { buildReviewAnalysis } from '../frontend/src/lib/reviewAnalysis.ts'
import { metricEvidenceA } from '../frontend/src/samples/metricEvidence.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'
import { buildHighlightScript } from '../frontend/src/lib/reviewInsights.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const dir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t40-'))
const dbFile = path.join(dir, 'app.db')
copyFileSync(path.join(backend, 'data/app.db'), dbFile)

let db = new Database(dbFile)
const customer = db.prepare('select c.* from customers c where c.intent_manual=1 and not exists (select 1 from reviews r where r.customer_id=c.id)').get()
assert.ok(customer, '固定 seed 应存在 manual=true 且 reviews=0 的 S1 客户')
const sellingPoints = db.prepare("select selling_points from products where industry='装修'").all().flatMap((row) => JSON.parse(row.selling_points))
const before = Object.fromEntries(['reviews', 'needs', 'todos'].map((table) => [table, db.prepare(`select count(*) n from ${table}`).get().n]))
const aiResult = JSON.parse(readFileSync(path.join(backend, 'mock/difyResult.json'), 'utf8'))
const analysis = buildReviewAnalysis({ transcript: transcriptA, sellingPoints, aiResult, evidence: metricEvidenceA })
const payload = { customerId: customer.id, visitId: null, transcript: transcriptA, metrics: analysis.metrics, scores: analysis.scores, aiResult, intentSuggestion: { level: 'B', score: 2 } }
db.close()

const port = 33920 + Math.floor(Math.random() * 100)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: backend, env: { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] })
let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk })
server.stderr.on('data', (chunk) => { serverOutput += chunk })
const api = (route, init) => fetch(`http://127.0.0.1:${port}/api${route}`, init)

try {
  let ready = false
  for (let i = 0; i < 50; i += 1) {
    try { if ((await api('/ping')).ok) { ready = true; break } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(ready, true, `临时后端未启动\n${serverOutput}`)

  db = new Database(dbFile)
  db.exec("create trigger fail_t40_needs before insert on needs begin select raise(abort, 'T40 rollback'); end")
  db.close()
  const failed = await api('/reviews/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal(failed.status, 500)
  db = new Database(dbFile)
  for (const [table, count] of Object.entries(before)) assert.equal(db.prepare(`select count(*) n from ${table}`).get().n, count)
  db.exec('drop trigger fail_t40_needs')
  db.close()
  pass('needs 写入失败时整个事务回滚，reviews/needs/todos 均无半条数据')

  const createdResponse = await api('/reviews/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal(createdResponse.status, 201)
  const created = await createdResponse.json()
  assert.equal(created.created, true)
  assert.equal(created.stage, 'S2')
  assert.equal(created.reviewCount, 1)
  assert.equal(created.needs.length, aiResult.needs.length)
  assert.equal(created.todos.length, aiResult.next_actions.length)
  assert.ok(created.todos.every((todo) => todo.dueDate === null))
  pass('一次事务写入 review、全部 needs 与 3 条 todos，无明确来源的 due_date 保持空')

  db = new Database(dbFile, { readonly: true })
  assert.equal(db.prepare('select count(*) n from reviews').get().n, before.reviews + 1)
  assert.equal(db.prepare('select count(*) n from needs').get().n, before.needs + aiResult.needs.length)
  assert.equal(db.prepare('select count(*) n from todos').get().n, before.todos + aiResult.next_actions.length)
  assert.equal(db.prepare('select count(*) n from needs where review_id=? and customer_id=?').get(created.review.id, customer.id).n, aiResult.needs.length)
  assert.equal(db.prepare('select count(*) n from todos where review_id=? and customer_id=?').get(created.review.id, customer.id).n, aiResult.next_actions.length)
  const columns = db.prepare('pragma table_info(customers)').all().map((row) => row.name)
  assert.ok(!columns.some((name) => /^(status|stage|s_?level)$/i.test(name)))
  db.close()
  pass('S1 由 reviews=0 自然变 S2，三表外键一致且 customers 仍无状态字段')

  assert.equal(created.intent.applied, false)
  assert.deepEqual(created.intent.suggestion, { level: 'B', score: 2 })
  assert.equal(created.customer.intentManual, true)
  assert.equal(created.customer.intentLevel, customer.intent_level)
  assert.equal(created.customer.intentScore, customer.intent_score)
  pass('manual=true 客户只返回自动 B/2 建议，实际人工意向不被复盘覆盖')

  const duplicateResponse = await api('/reviews/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal(duplicateResponse.status, 200)
  const duplicate = await duplicateResponse.json()
  assert.equal(duplicate.created, false)
  db = new Database(dbFile, { readonly: true })
  assert.equal(db.prepare('select count(*) n from reviews').get().n, before.reviews + 1)
  assert.equal(db.prepare('select count(*) n from needs').get().n, before.needs + aiResult.needs.length)
  assert.equal(db.prepare('select count(*) n from todos').get().n, before.todos + aiResult.next_actions.length)
  db.close()
  pass('完全相同的重复提交返回原报告，不重复写入任何一表')

  const refreshedResponse = await api(`/reviews/report/${created.review.id}`)
  assert.equal(refreshedResponse.status, 200)
  const refreshed = await refreshedResponse.json()
  assert.deepEqual(refreshed.review, duplicate.review)
  assert.deepEqual(refreshed.needs, duplicate.needs)
  assert.deepEqual(refreshed.todos, duplicate.todos)
  assert.equal(refreshed.stage, 'S2')
  pass('稳定报告 GET 可仅凭 review ID 从数据库完整重建，刷新结果一致')

  assert.deepEqual(resolveRoute(`/reviews/report/${created.review.id}`), { kind: 'page', route: 'reviews', path: `/reviews/report/${created.review.id}` })
  assert.equal(buildHighlightScript(aiResult.highlights[0], { scene: '已落库复盘', industry: '装修' }, created.review.id).fromReviewId, created.review.id)
  pass('前端识别稳定报告 URL，已落库报告再存话术会携带真实 review ID')

  const source = new Database(path.join(backend, 'data/app.db'), { readonly: true })
  assert.equal(source.prepare('select count(*) n from reviews').get().n, before.reviews)
  source.close()
  pass('全部写入验收只发生在临时数据库，固定 seed 未污染')
  console.log(`\nT40 检查点：通过 ${passed} / 8`)
} finally {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
