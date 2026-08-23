#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { sortTodos } from '../frontend/src/lib/todoSchedule.ts'

let passed = 0; const pass = (m) => { passed += 1; console.log(`PASS ${m}`) }
const root = path.resolve(import.meta.dirname, '..'); const backend = path.join(root, 'backend'); const require = createRequire(path.join(backend, 'package.json')); const Database = require('better-sqlite3'); const dir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t45-')); const dbFile = path.join(dir, 'app.db'); const fixedFile = path.join(backend, 'data/app.db'); copyFileSync(fixedFile, dbFile)
const seed = spawnSync(process.execPath, ['--experimental-strip-types', 'src/seed.ts'], { cwd: backend, env: { ...process.env, DB_FILE: dbFile, USE_MOCK: 'true' }, encoding: 'utf8' }); assert.equal(seed.status, 0)
let db = new Database(dbFile); const customer = db.prepare('select * from customers order by id limit 1').get(); const nullTodo = db.prepare("insert into todos(customer_id,review_id,text,due_date,done) values(?,null,'T45 自动待办无来源日期',null,0) returning *").get(customer.id); const beforeVisits = db.prepare('select count(*) n from visits').get().n; db.close()
const port = 34500 + Math.floor(Math.random() * 100); const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: backend, env: { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''; server.stdout.on('data', c => { output += c }); server.stderr.on('data', c => { output += c }); const api = (p, init) => fetch(`http://127.0.0.1:${port}/api${p}`, init); const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
try {
  let ready = false; for (let i = 0; i < 50; i += 1) { try { if ((await api('/ping')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) } assert.equal(ready, true, output)
  const list = await (await api('/todos')).json(); const loaded = list.find(t => t.id === nullTodo.id); assert.equal(loaded.dueDate, null); assert.equal(loaded.done, false); pass('T40 风格 due_date=null 待办原样读取，不伪造日期')
  let res = await post(`/todos/${nullTodo.id}/update`, { dueDate: '2026-09-15' }); assert.equal(res.status, 200); assert.equal((await res.json()).dueDate, '2026-09-15'); assert.equal((await (await api('/todos')).json()).find(t => t.id === nullTodo.id).dueDate, '2026-09-15'); pass('设置截止日后重新 GET 持久保留')
  res = await post(`/todos/${nullTodo.id}/update`, { done: true }); assert.equal((await res.json()).done, true); res = await post(`/todos/${nullTodo.id}/update`, { done: false }); assert.equal((await res.json()).done, false); pass('待办完成与取消完成往返持久化')
  assert.equal((await post(`/todos/${nullTodo.id}/update`, { dueDate: '明天' })).status, 400); assert.equal((await post(`/todos/${nullTodo.id}/update`, { dueDate: '2026-02-31' })).status, 400); assert.equal((await post(`/todos/${nullTodo.id}/update`, { done: 'yes' })).status, 400); pass('非法截止日、不存在的日历日期与 done 类型返回 400')
  res = await post('/visits/schedule', { customerId: customer.id, scene: '二次拜访', scheduledAt: '2026-09-20T10:00:00.000Z' }); assert.equal(res.status, 201); const existing = await res.json(); assert.equal(existing.visit.customerId, customer.id); assert.equal(existing.visit.scene, '二次拜访'); pass('创建拜访并正确绑定已有客户外键')
  res = await post('/visits/schedule', { newCustomer: { name: 'T45临时新客户', industry: '装修', identity: '业主' }, scene: '一次拜访', scheduledAt: '2026-09-21T11:00:00.000Z' }); assert.equal(res.status, 201); const created = await res.json(); assert.equal(created.customer.name, 'T45临时新客户'); assert.equal(created.visit.customerId, created.customer.id); db = new Database(dbFile, { readonly: true }); assert.equal(db.prepare('select count(*) n from visits').get().n, beforeVisits + 2); assert.equal(db.prepare('select count(*) n from customers where id=?').get(created.customer.id).n, 1); db.close(); pass('新建客户与拜访在同一事务创建并绑定')
  assert.equal((await post('/visits/schedule', { customerId: customer.id, scene: '随便聊', scheduledAt: '2026-09-20' })).status, 400); assert.equal((await post('/visits/schedule', { customerId: customer.id, scene: '一次拜访', scheduledAt: '不是日期' })).status, 400); assert.equal((await post('/visits/schedule', { customerId: 999999, scene: '一次拜访', scheduledAt: '2026-09-20T10:00:00Z' })).status, 404); pass('非法场景、日期与客户均被后端拒绝')
  const sorted = sortTodos([{ id: 3, done: false, dueDate: null }, { id: 2, done: false, dueDate: '2026-09-02' }, { id: 1, done: false, dueDate: '2026-09-02' }, { id: 4, done: true, dueDate: '2026-01-01' }]); assert.deepEqual(sorted.map(x => x.id), [1, 2, 3, 4]); pass('排序稳定为未完成→有日期→null→ID，已完成沉底')
  console.log(`\nT45 待办与日程验证通过：${passed}/8`)
} finally { server.kill('SIGTERM'); if (db?.open) db.close(); rmSync(dir, { recursive: true, force: true }) }
