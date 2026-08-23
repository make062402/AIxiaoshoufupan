#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const dir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t41-'))
const dbFile = path.join(dir, 'app.db')
copyFileSync(path.join(backend, 'data/app.db'), dbFile)

const seed = spawnSync(process.execPath, ['--experimental-strip-types', 'src/seed.ts'], {
  cwd: backend,
  env: { ...process.env, DB_FILE: dbFile, USE_MOCK: 'true' },
  encoding: 'utf8',
})
assert.equal(seed.status, 0, `临时数据库 seed 失败\n${seed.stdout}\n${seed.stderr}`)

let sqlite = new Database(dbFile)
const s1 = sqlite.prepare("select c.* from customers c where not exists (select 1 from reviews r where r.customer_id=c.id) order by c.id limit 1").get()
const s2 = sqlite.prepare("select c.* from customers c where (select count(*) from reviews r where r.customer_id=c.id)=1 order by c.id limit 1").get()
assert.ok(s1 && s2)

// 构造同 created_at 的最新复盘边界，并给旧、新复盘分别放一条未满足需求。
const oldLatest = sqlite.prepare('select * from reviews where customer_id=? order by created_at desc,id desc limit 1').get(s2.id)
const boundaryReview = sqlite.prepare('insert into reviews(customer_id,transcript,metrics,scores,ai_result,created_at) values(?,?,?,?,?,?) returning *')
  .get(s2.id, '[]', '{}', '{}', '{}', oldLatest.created_at)
sqlite.prepare("insert into needs(review_id,customer_id,level,text,quote,timestamp_sec,satisfied) values(?,?,?,?,?,?,0)")
  .run(boundaryReview.id, s2.id, 'L1', 'T41 最新复盘需求', '最新原话', 1)
sqlite.prepare("insert into needs(review_id,customer_id,level,text,quote,timestamp_sec,satisfied) values(?,?,?,?,?,?,0)")
  .run(oldLatest.id, s2.id, 'L2', 'T41 历史需求不得串入', '历史原话', 2)
sqlite.close()

const port = 34100 + Math.floor(Math.random() * 100)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], {
  cwd: backend,
  env: { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk })
server.stderr.on('data', (chunk) => { serverOutput += chunk })
const api = (route) => fetch(`http://127.0.0.1:${port}/api${route}`)

try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await api('/ping')).ok) { ready = true; break } } catch { /* 等待 */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(ready, true, `临时后端未启动\n${serverOutput}`)

  const s1Response = await api(`/battlecard/${s1.id}`)
  assert.equal(s1Response.status, 200)
  const s1Body = await s1Response.json()
  assert.equal(s1Body.stage, 'S1')
  assert.equal(s1Body.reviewCount, 0)
  assert.equal(s1Body.latestReview, null)
  assert.deepEqual(s1Body.latestReviewUnsatisfiedNeeds, [])
  assert.ok(Array.isArray(s1Body.products) && Array.isArray(s1Body.scripts))
  assert.ok(Array.isArray(s1Body.todos) && Array.isArray(s1Body.visits))
  pass('S1 返回完整原料、空复盘与空未满足需求，不报错')

  const s2Response = await api(`/battlecard/${s2.id}`)
  assert.equal(s2Response.status, 200)
  const s2Body = await s2Response.json()
  assert.equal(s2Body.reviewCount, 2)
  assert.equal(s2Body.stage, 'S3')
  assert.equal(s2Body.latestReview.id, boundaryReview.id)
  assert.deepEqual(s2Body.latestReviewUnsatisfiedNeeds.map((need) => need.text), ['T41 最新复盘需求'])
  assert.ok(s2Body.products.every((product) => product.industry === s2.industry))
  pass('created_at 并列时按更大 id 取最新复盘，且历史 needs 不串入')

  sqlite = new Database(dbFile)
  sqlite.prepare('delete from needs where review_id=?').run(boundaryReview.id)
  sqlite.prepare('delete from reviews where id=?').run(boundaryReview.id)
  sqlite.close()
  const refreshed = await (await api(`/battlecard/${s2.id}`)).json()
  assert.equal(refreshed.reviewCount, 1)
  assert.equal(refreshed.stage, 'S2')
  assert.equal(refreshed.latestReview.id, oldLatest.id)
  assert.ok(refreshed.latestReviewUnsatisfiedNeeds.some((need) => need.text === 'T41 历史需求不得串入'))
  pass('每次请求实时读取 reviews 数量并派生 S 阶段，不缓存作战包')

  const missing = await api('/battlecard/999999999')
  assert.equal(missing.status, 404)
  assert.match((await missing.json()).error, /客户不存在/)
  const invalid = await api('/battlecard/not-an-id')
  assert.equal(invalid.status, 400)
  pass('非法 ID 与不存在客户分别返回可读的 400/404')

  const routeResponse = await api(`/battlecard/${s1.id}`)
  assert.equal(routeResponse.status, 200)
  assert.equal((await routeResponse.json()).customer.id, s1.id)
  pass('专用 /battlecard/:customerId 路由优先于通用 CRUD')

  sqlite = new Database(dbFile, { readonly: true })
  assert.equal(sqlite.prepare("select count(*) n from sqlite_master where type='table' and name like 'battle%'").get().n, 0)
  sqlite.close()
  pass('仍为原定 8 张表，没有新增作战包表')

  console.log(`\nT41 作战包接口验证通过：${passed}/6`)
} finally {
  server.kill('SIGTERM')
  if (sqlite?.open) sqlite.close()
  rmSync(dir, { recursive: true, force: true })
}
