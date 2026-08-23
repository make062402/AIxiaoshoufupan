#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { buildReviewAnalysis } from '../frontend/src/lib/reviewAnalysis.ts'
import { buildBattlecard, BATTLECARD_SCRIPT_STAGES } from '../frontend/src/lib/battlecard.ts'
import { metricEvidenceA } from '../frontend/src/samples/metricEvidence.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const dir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t44-'))
const dbFile = path.join(dir, 'app.db')
const fixedFile = path.join(backend, 'data/app.db')
copyFileSync(fixedFile, dbFile)

const fixed = new Database(fixedFile, { readonly: true })
const fixedCounts = Object.fromEntries(['customers', 'reviews', 'needs', 'todos', 'scripts'].map((table) => [table, fixed.prepare(`select count(*) n from ${table}`).get().n]))
fixed.close()
const seed = spawnSync(process.execPath, ['--experimental-strip-types', 'src/seed.ts'], { cwd: backend, env: { ...process.env, DB_FILE: dbFile, USE_MOCK: 'true' }, encoding: 'utf8' })
assert.equal(seed.status, 0, `临时数据库 seed 失败\n${seed.stdout}\n${seed.stderr}`)

let sqlite = new Database(dbFile)
const target = sqlite.prepare('select c.* from customers c where (select count(*) from reviews r where r.customer_id=c.id)=1 order by c.id limit 1').get()
const sellingPoints = sqlite.prepare("select selling_points from products where industry='装修'").all().flatMap((row) => JSON.parse(row.selling_points))
const aiResult = JSON.parse(readFileSync(path.join(backend, 'mock/difyResult.json'), 'utf8'))
const analysis = buildReviewAnalysis({ transcript: transcriptA, sellingPoints, aiResult, evidence: metricEvidenceA })
sqlite.close()

const port = 34400 + Math.floor(Math.random() * 100)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], {
  cwd: backend,
  env: { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stdout.on('data', (chunk) => { output += chunk })
server.stderr.on('data', (chunk) => { output += chunk })
const api = (route, init) => fetch(`http://127.0.0.1:${port}/api${route}`, init)

try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await api('/ping')).ok) { ready = true; break } } catch { /* 等待 */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(ready, true, `临时后端未启动\n${output}`)

  const beforeRaw = await (await api(`/battlecard/${target.id}`)).json()
  const before = buildBattlecard(beforeRaw)
  assert.equal(before.customer.stage, 'S2')
  assert.ok(before.goals.unsatisfiedNeeds.length > 0)
  assert.ok(before.goals.improvements.length > 0 && before.goals.missedPoints.length > 0 && before.goals.nextActions.length > 0)
  pass('S2 页面模型带出上次未满足需求、改进/漏讲与下一步动作')

  assert.deepEqual(before.negotiation.stages.map((group) => group.stage), [...BATTLECARD_SCRIPT_STAGES])
  assert.equal(before.negotiation.stages.reduce((sum, group) => sum + group.scripts.length, 0), 9)
  assert.equal(before.negotiation.invalidScripts.length, 0)
  const objectionScripts = before.negotiation.stages.find((group) => group.stage === '异议处理').scripts
  assert.ok(objectionScripts.length > 0)
  assert.ok(objectionScripts.every((script) => /[？?]/.test(script.text) && !/(是否|是不是|能不能|方便.*吗|还是)/.test(script.text)))
  pass('9 条 Seed 话术严格分入五段式，异议处理均带开放式追问')

  assert.equal(before.recommendations.length, 2)
  assert.ok(before.recommendations.every((product) => product.price !== null && product.params && Object.keys(product.params).length
    && product.sellingPoints.length && product.objections?.length))
  pass('固定 2 个推荐产品均保留价格、参数、必讲话术和异议答法')

  const response = await api('/reviews/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId: target.id, visitId: null, transcript: transcriptA, metrics: analysis.metrics, scores: analysis.scores, aiResult, intentSuggestion: { level: 'B', score: 2 } }),
  })
  assert.equal(response.status, 201)
  const submitted = await response.json()
  const afterRaw = await (await api(`/battlecard/${target.id}`)).json()
  const after = buildBattlecard(afterRaw)
  assert.equal(after.customer.reviewCount, before.customer.reviewCount + 1)
  assert.equal(after.customer.stage, 'S3')
  assert.equal(afterRaw.latestReview.id, submitted.review.id)
  assert.notDeepEqual(after.goals.unsatisfiedNeeds, before.goals.unsatisfiedNeeds)
  assert.notDeepEqual(after.goals.nextActions, before.goals.nextActions)
  pass('同一客户再保存一次复盘后，同一作战包读取到新 latest review、needs、动作和 S3 阶段')

  const refreshedRaw = await (await api(`/battlecard/${target.id}`)).json()
  assert.equal(refreshedRaw.latestReview.id, submitted.review.id)
  assert.equal(refreshedRaw.reviewCount, 2)
  pass('再次 GET 同一稳定 URL 仍从数据库重建新作战包，不依赖内存缓存')

  sqlite = new Database(dbFile, { readonly: true })
  assert.equal(sqlite.prepare("select count(*) n from sqlite_master where type='table' and name like 'battle%'").get().n, 0)
  sqlite.close()
  const fixedAfter = new Database(fixedFile, { readonly: true })
  for (const [table, count] of Object.entries(fixedCounts)) assert.equal(fixedAfter.prepare(`select count(*) n from ${table}`).get().n, count)
  fixedAfter.close()
  pass('闭环只写临时库、固定库零污染，且仍没有作战包表')

  console.log(`\nT44 作战包闭环验证通过：${passed}/6`)
} finally {
  server.kill('SIGTERM')
  if (sqlite?.open) sqlite.close()
  rmSync(dir, { recursive: true, force: true })
}
