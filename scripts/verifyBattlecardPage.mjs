#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildBattlecard } from '../frontend/src/lib/battlecard.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const pageSource = readFileSync(path.join(root, 'frontend/src/pages/BattlecardPage.tsx'), 'utf8')
const appSource = readFileSync(path.join(root, 'frontend/src/App.tsx'), 'utf8')
const listSource = readFileSync(path.join(root, 'frontend/src/pages/CustomerListPage.tsx'), 'utf8')
const detailSource = readFileSync(path.join(root, 'frontend/src/pages/CustomerDetailPage.tsx'), 'utf8')

assert.deepEqual(resolveRoute('/me/customers/123/battlecard'), { kind: 'page', route: 'me', path: '/me/customers/123/battlecard' })
assert.deepEqual(resolveRoute('/me/customers/123/battlecard/'), { kind: 'page', route: 'me', path: '/me/customers/123/battlecard' })
assert.equal(resolveRoute('/me/customers/not-id/battlecard').kind, 'not-found')
assert.match(appSource, /<BattlecardPage customerId=/)
pass('稳定作战包 URL、尾斜杠刷新恢复和非法 ID 404 路由均明确')

assert.match(listSource, /查看作战包/)
assert.match(detailSource, /查看作战包/)
assert.match(listSource, /\/battlecard/)
assert.match(detailSource, /\/battlecard/)
pass('客户列表和客户详情都有客户上下文内的作战包入口')

assert.match(pageSource, /getBattlecard\(customerId\)/)
assert.match(pageSource, /buildBattlecard\(raw\)/)
assert.doesNotMatch(pageSource, /match_keywords|sort\(|price\s*[<>-]/)
pass('页面只调用 T41 + T42，不在组件重写缺口或产品排序')

for (const state of ['LoadingState', 'ErrorState', 'EmptyState']) assert.match(pageSource, new RegExp(state))
assert.match(pageSource, /onRetry=/)
pass('页面接入统一 Loading、Error、Empty 与重试能力')

const customer = {
  id: 1, name: '测试客户', identity: '业主', phone: '1', role: null, budget: null,
  coreNeed: '装修', priorityOrder: null, notes: null, deadline: null, industry: '装修',
  intentLevel: 'C', intentScore: 0, intentManual: false, createdAt: '2026-01-01T00:00:00.000Z',
}
const model = buildBattlecard({ customer, reviewCount: 0, stage: 'S1', latestReview: null, latestReviewUnsatisfiedNeeds: [], products: [], scripts: [], todos: [], visits: [] })
assert.equal(model.customer.profileFields.length, 8)
assert.deepEqual(model.goals.mustCollect.map((field) => field.number), [3, 4, 8])
assert.equal(model.customer.riskNote, null)
assert.match(pageSource, /customer\.riskNote \? '!' : '\?'/)
assert.match(pageSource, /customer\.riskNote \?\? '待确认'/)
pass('S1 真实口径展示 8 项、必拿回 3/4/8，空 notes 如实显示待确认')

assert.match(pageSource, /aria-label="沟通忌讳与风险敏感点"/)
assert.match(pageSource, /border-rose-300 bg-rose-50/)
assert.match(pageSource, /bg-rose-700 text-white/)
assert.match(pageSource, /沟通忌讳与风险敏感点/)
pass('notes 非空时使用文字、图标与双线边框提示，不只依赖颜色')

console.log(`\nT43 作战包客户信息页验证通过：${passed}/6`)
