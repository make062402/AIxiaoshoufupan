#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { buildDemoTeamReport, DEMO_ROLE_KEY, loadDemoRole, saveDemoRole } from '../frontend/src/lib/demoRole.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const db = new Database(path.join(backend, 'data/app.db'), { readonly: true })

try {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(loadDemoRole(storage), 'sales')
  saveDemoRole(storage, 'manager')
  assert.equal(values.get(DEMO_ROLE_KEY), 'manager')
  assert.equal(loadDemoRole(storage), 'manager')
  saveDemoRole(storage, 'sales')
  assert.equal(loadDemoRole(storage), 'sales')
  pass('演示角色默认销售，切换销售/主管后可按明确 session 存储口径恢复')

  const customers = db.prepare('select id,name from customers order by id').all().map((row) => ({ ...row }))
  const reviews = db.prepare('select id,customer_id,scores,created_at from reviews order by id').all().map((row) => ({ id: row.id, customerId: row.customer_id, scores: JSON.parse(row.scores), createdAt: new Date(row.created_at * 1000).toISOString() }))
  const report = buildDemoTeamReport(customers, reviews)
  assert.equal(report.accountName, '演示销售账号')
  assert.equal(report.reviewCount, reviews.length)
  assert.equal(report.reviews.length, reviews.length)
  assert.deepEqual(new Set(report.reviews.map((review) => review.id)), new Set(reviews.map((review) => review.id)))
  assert.equal(report.average, 2.2)
  pass('唯一演示账号复盘列表与数据库 reviews 完全一致，汇总由真实分数计算')

  const app = readFileSync(path.join(root, 'frontend/src/App.tsx'), 'utf8')
  assert.match(app, /role === 'manager'.*\/me\/team-reports/)
  assert.match(app, /demoRole === 'manager'.*TeamReportPage.*ManagerRoleRequired/)
  pass('销售角色隐藏团队入口，主管角色显示且稳定页仍有演示角色门禁')

  const page = readFileSync(path.join(root, 'frontend/src/pages/TeamReportPage.tsx'), 'utf8')
  assert.match(page, /getCustomers\(\), getReviews\(\)/)
  assert.doesNotMatch(page, /method:\s*['"]POST|\b(?:create|update|delete)[A-Z]\w*\s*\(/i)
  assert.match(page, /DEMO 单账号口径 · 只读/)
  pass('主管页只读取客户与复盘，明确标注单账号 Demo 且不提供写操作')

  assert.equal(resolveRoute('/me/team-reports').kind, 'page')
  assert.deepEqual(resolveRoute('/me/team-reports/'), resolveRoute('/me/team-reports'))
  report.reviews.forEach((review) => assert.equal(resolveRoute(`/reviews/report/${review.id}`).kind, 'page'))
  pass('团队报告与每条复盘详情均使用可刷新稳定 URL')

  console.log(`\nT49 主管端报告入口专项验证通过：${passed}/5`)
} finally { db.close() }
