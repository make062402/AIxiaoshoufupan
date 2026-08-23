#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { buildHighlightScript, EMPTY_INSIGHT_TEXT, hasEvidenceItems } from '../frontend/src/lib/reviewInsights.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
assert.equal(hasEvidenceItems([]), false)
assert.equal(EMPTY_INSIGHT_TEXT, '本次未检出')
pass('亮点或改进数组为空时使用统一空态，不会读取不存在的元素')

const item = { text: '将卖点落到具体物品', quote: '上层放被褥，下面放行李箱。', start: 258.9 }
const context = { customerId: 1, scene: '一次拜访', recordingSource: '现场录音', language: '普通话', industry: '装修' }
const input = buildHighlightScript(item, context)
assert.deepEqual(input, { stage: '方案呈现', scene: '一次拜访 · 装修 · 复盘亮点', text: item.quote, fromReviewId: null })
pass('入库话术带明确阶段/场景，并在 T40 前保持 from_review_id 为空')

const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const dir = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t38-'))
const dbFile = path.join(dir, 'app.db')
copyFileSync(path.join(backend, 'data/app.db'), dbFile)
const port = 33820 + Math.floor(Math.random() * 100)
const server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: backend, env: { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true' }, stdio: 'ignore' })

try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok) break } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  let db = new Database(dbFile, { readonly: true })
  const before = db.prepare('select count(*) n from scripts').get().n
  db.close()
  const response = await fetch(`http://127.0.0.1:${port}/api/scripts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  assert.equal(response.status, 201)
  const created = await response.json()
  db = new Database(dbFile, { readonly: true })
  const after = db.prepare('select count(*) n from scripts').get().n
  const saved = db.prepare('select stage, scene, text, from_review_id from scripts where id = ?').get(created.id)
  db.close()
  assert.equal(after, before + 1)
  assert.deepEqual(saved, { stage: input.stage, scene: input.scene, text: input.text, from_review_id: null })
  pass('临时数据库经真实 API 恰好多 1 条 scripts，字段完整且无伪造复盘 ID')

  const source = new Database(path.join(backend, 'data/app.db'), { readonly: true })
  assert.equal(source.prepare('select count(*) n from scripts').get().n, before)
  source.close()
  pass('专项写入仅发生在临时数据库，固定 seed 未污染')
  console.log(`\nT38 检查点：通过 ${passed} / 4`)
} finally {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
