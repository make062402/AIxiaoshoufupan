#!/usr/bin/env node

import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  customerToProfileForm,
  getProfileItemStatuses,
  mergeProfileIntoCustomer,
  validateProfileForm,
} from '../frontend/src/lib/customerProfile.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'

const root = path.resolve(import.meta.dirname, '..')
const backendDir = path.join(root, 'backend')
const require = createRequire(path.join(backendDir, 'package.json'))
const Database = require('better-sqlite3')
const sourceDb = path.join(backendDir, 'data/app.db')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t32-'))
const tempDb = path.join(tempDir, 'app.db')
copyFileSync(sourceDb, tempDb)

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const port = 33320 + Math.floor(Math.random() * 200)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], {
  cwd: backendDir,
  env: { ...process.env, PORT: String(port), DB_FILE: tempDb, USE_MOCK: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`临时后端提前退出：${server.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ping`)
      if (response.ok) return
    } catch { /* 等待启动 */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('临时后端启动超时')
}

try {
  await waitForServer()
  const sqlite = new Database(tempDb, { readonly: true })
  const customer = sqlite.prepare(`
    SELECT c.* FROM customers c
    LEFT JOIN reviews r ON r.customer_id = c.id
    GROUP BY c.id HAVING count(r.id) = 0
    ORDER BY c.id LIMIT 1
  `).get()
  const columns = sqlite.prepare('PRAGMA table_info(customers)').all().map((row) => row.name)
  sqlite.close()

  assert.ok(customer)
  assert.ok(!columns.some((name) => ['status', 'stage', 's_level', 'slevel'].includes(name)))
  pass('customers 表没有状态字段，S1 只能按 reviews 数量派生')

  const response = await fetch(`http://127.0.0.1:${port}/api/customers?id=${customer.id}`)
  assert.equal(response.status, 200)
  const record = await response.json()
  const form = customerToProfileForm(record)
  const statuses = getProfileItemStatuses(form)
  assert.equal(statuses.length, 8)
  assert.equal(statuses.filter((item) => !item.filled).length, 5)
  pass('真实 S1 seed 的 8 项档案中 5 项明确待确认')

  assert.ok(Object.hasOwn(validateProfileForm({ ...form, name: '' }), 'name'))
  assert.ok(Object.hasOwn(validateProfileForm({ ...form, priorityOrderText: '价格、速度' }), 'priorityOrderText'))
  pass('必填称呼与关注排序均有前端校验')

  const changedRole = '拍板人（T32 临时验证）'
  const saveResponse = await fetch(`http://127.0.0.1:${port}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mergeProfileIntoCustomer(record, { ...form, role: changedRole })),
  })
  assert.equal(saveResponse.status, 200)
  const saved = await saveResponse.json()
  assert.equal(saved.role, changedRole)

  const refreshed = await fetch(`http://127.0.0.1:${port}/api/customers?id=${customer.id}`).then((result) => result.json())
  assert.equal(refreshed.role, changedRole)
  pass('保存后重新 GET 仍能看到修改')

  assert.deepEqual(resolveRoute(`/me/customers/${customer.id}`), {
    kind: 'page', route: 'customers', path: `/me/customers/${customer.id}`,
  })
  pass('客户详情使用带 ID 的稳定 URL')

  const original = new Database(sourceDb, { readonly: true })
  const originalRole = original.prepare('SELECT role FROM customers WHERE id = ?').get(customer.id).role
  original.close()
  assert.notEqual(originalRole, changedRole)
  pass('专项写入只发生在临时数据库，固定 seed 未被修改')

  console.log(`\nT32 检查点：通过 ${passed} / 6`)
} finally {
  server.kill('SIGTERM')
  rmSync(tempDir, { recursive: true, force: true })
}
