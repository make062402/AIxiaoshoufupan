#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { buildBattlecard } from '../frontend/src/lib/battlecard.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const dir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t42-'))
const dbFile = path.join(dir, 'app.db')
copyFileSync(path.join(backend, 'data/app.db'), dbFile)

const sqlite = new Database(dbFile, { readonly: true })
const s1Id = sqlite.prepare('select c.id from customers c where not exists (select 1 from reviews r where r.customer_id=c.id) order by c.id limit 1').get().id
const s2Id = sqlite.prepare('select c.id from customers c where (select count(*) from reviews r where r.customer_id=c.id)=1 order by c.id limit 1').get().id
sqlite.close()

const port = 34200 + Math.floor(Math.random() * 100)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], {
  cwd: backend,
  env: { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk })
server.stderr.on('data', (chunk) => { serverOutput += chunk })

const api = (route) => fetch(`http://127.0.0.1:${port}/api${route}`)
const point = (tag, keyword) => ({ tag, script: `${tag}标准话术`, match_keywords: [keyword], sales_keywords: [`${tag}销售词`] })
const product = (id, price, keyword, extra = {}) => ({
  id, name: `产品${id}`, price, industry: '装修', params: { 型号: `M${id}` },
  sellingPoints: [point(`卖点${id}`, keyword)], objections: [{ objection: `异议${id}`, answer: `答法${id}` }], ...extra,
})
const need = (id, level, text) => ({ id, reviewId: 1, customerId: 1, level, text, quote: `${text}原话`, timestampSec: id, satisfied: false })

try {
  let ready = false
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await api('/ping')).ok) { ready = true; break } } catch { /* 等待 */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(ready, true, `临时后端未启动\n${serverOutput}`)
  const raw = await (await api(`/battlecard/${s1Id}`)).json()
  const actualS2Raw = await (await api(`/battlecard/${s2Id}`)).json()

  const actualS1 = buildBattlecard(raw)
  assert.deepEqual(actualS1.goals.mustCollect.map((field) => [field.number, field.label]), [
    [3, '在采购中的角色'], [4, '预算区间'], [8, '采购时间点 / 交付期限'],
  ])
  assert.deepEqual(actualS1.recommendations.map((item) => [item.name, item.price]), [
    ['全屋定制柜 · 一体化设计', 26800], ['环保基础施工包', 39800],
  ])
  assert.ok(actualS1.recommendations.every((item) => item.params && item.sellingPoints.length && item.objections?.length))
  pass('真实 T41 S1 payload 得到 3/4/8 缺口和同行业最低价 2 个完整产品')

  const actualS2 = buildBattlecard(actualS2Raw)
  assert.equal(actualS2.recommendations.length, 2)
  console.log('INFO 真实 S2 组装摘要：', {
    customer: actualS2.customer.record.name,
    needs: actualS2.goals.unsatisfiedNeeds.map((item) => `${item.level}:${item.text}`),
    products: actualS2.recommendations.map((item) => `${item.source}:${item.name}`),
  })

  const fixture = (products, needs) => ({ ...raw, stage: 'S2', reviewCount: 1, products, latestReviewUnsatisfiedNeeds: needs })
  const mixed = buildBattlecard(fixture(
    [product(20, 200, '收纳'), product(30, 300, '预算')],
    [need(1, 'L2', '收纳不足'), need(2, 'L2', '还要收纳'), need(3, 'L1', '预算有限')],
  ))
  assert.deepEqual(mixed.recommendations.map((item) => item.id), [30, 20])
  assert.deepEqual(mixed.recommendations.map((item) => item.matchedLevel), ['L1', 'L2'])
  pass('L1 产品严格优先于被提及更多次的 L2 产品')

  const frequency = buildBattlecard(fixture(
    [product(11, 500, '工期'), product(12, 400, '环保')],
    [need(4, 'L1', '工期'), need(5, 'L1', '环保'), need(6, 'L1', '环保')],
  ))
  assert.deepEqual(frequency.recommendations.map((item) => [item.id, item.mentionCount]), [[12, 2], [11, 1]])
  pass('同为 L1 时按匹配需求被提及次数降序')

  const idTie = buildBattlecard(fixture(
    [product(22, 100, '质保'), product(21, 900, '品牌')],
    [need(7, 'L2', '质保'), need(8, 'L2', '品牌')],
  ))
  assert.deepEqual(idTie.recommendations.map((item) => item.id), [21, 22])
  pass('等级和次数并列时按产品 ID 升序，不受价格或输入顺序影响')

  const multiPoint = product(31, 700, '漏水', { sellingPoints: [point('防漏', '漏水'), point('返修保障', '返修')] })
  const deduped = buildBattlecard(fixture(
    [multiPoint, product(32, 800, '无关')],
    [need(9, 'L1', '漏水返修'), need(10, 'L1', '漏水')],
  ))
  assert.equal(deduped.recommendations.filter((item) => item.id === 31).length, 1)
  const kept = deduped.recommendations.find((item) => item.id === 31)
  assert.deepEqual(kept.params, { 型号: 'M31' })
  assert.equal(kept.sellingPoints.length, 2)
  assert.deepEqual(kept.objections, [{ objection: '异议31', answer: '答法31' }])
  pass('同一产品跨需求/关键词命中仍去重，并保留参数、必讲话术和异议答法')

  const fallback = buildBattlecard(fixture(
    [product(42, 200, '乙'), product(41, 100, '甲'), product(43, 300, '丙')],
    [need(11, 'L1', '完全不匹配')],
  ))
  assert.deepEqual(fallback.recommendations.map((item) => [item.id, item.source]), [[41, 'fallback'], [42, 'fallback']])
  pass('无匹配时回退同行业数字价格升序并固定补足 2 个')

  const supplemented = buildBattlecard(fixture(
    [product(52, 200, '命中'), product(51, 100, '无关'), product(53, 300, '也无关')],
    [need(12, 'L1', '命中')],
  ))
  assert.deepEqual(supplemented.recommendations.map((item) => [item.id, item.source]), [[52, 'matched'], [51, 'fallback']])
  assert.equal(new Set(supplemented.recommendations.map((item) => item.id)).size, 2)
  pass('只匹配 1 个时用最低价未选产品补足，不重复已选产品')

  assert.deepEqual(buildBattlecard(raw), buildBattlecard(raw))
  assert.deepEqual(raw.products.map((item) => item.id), [...raw.products].map((item) => item.id))
  pass('相同输入连续组装深度相等且不修改输入')

  console.log(`\nT42 作战包组装验证通过：${passed}/8`)
} finally {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
