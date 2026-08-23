#!/usr/bin/env node
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { groupScripts, SCRIPT_STAGES } from '../frontend/src/lib/myAssets.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const backend = path.join(root, 'backend')
const require = createRequire(path.join(backend, 'package.json'))
const Database = require('better-sqlite3')
const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'sales-review-t46-'))
const dbFile = path.join(temporaryDirectory, 'app.db')
const envFile = path.join(temporaryDirectory, '.env')
const adminToken = 't46-test-admin-token-not-a-secret'
const replacementKey = 'app-t46-placeholder-not-a-real-secret'
copyFileSync(path.join(backend, 'data/app.db'), dbFile)
writeFileSync(envFile, 'USE_MOCK=true\nDIFY_API_KEY=\n', { mode: 0o600 })

const port = 34600 + Math.floor(Math.random() * 100)
const childEnvironment = { ...process.env, PORT: String(port), DB_FILE: dbFile, USE_MOCK: 'true', CONFIG_ADMIN_TOKEN: adminToken, CONFIG_ENV_FILE: envFile, DOTENV_CONFIG_PATH: envFile }
delete childEnvironment.DIFY_API_KEY
let server

function startServer() {
  let output = ''
  server = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: backend, env: childEnvironment, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  return async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok) return }
      catch {}
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.fail(output || 'T46 临时后端未启动')
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  await exited
}

const api = (route, init) => fetch(`http://127.0.0.1:${port}/api${route}`, init)
const postConfig = (token, apiKey) => api('/config/dify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ apiKey }) })

try {
  await startServer()()
  let response = await api('/config/dify')
  let text = await response.text()
  let status = JSON.parse(text)
  assert.deepEqual(status, { configured: false, masked: null, adminProtected: true })
  assert.equal(text.includes(replacementKey), false)
  pass('配置状态只返回 configured/masked/adminProtected，不返回原始 Key')

  response = await postConfig('wrong-token', replacementKey)
  assert.equal(response.status, 401)
  assert.equal(readFileSync(envFile, 'utf8').includes(replacementKey), false)
  response = await postConfig(adminToken, 'bad key with spaces')
  assert.equal(response.status, 400)
  pass('无效管理员令牌和非法 Key 均被拒绝且不写文件')

  response = await postConfig(adminToken, replacementKey)
  assert.equal(response.status, 200)
  text = await response.text()
  status = JSON.parse(text)
  assert.deepEqual(status, { configured: true, masked: '••••••••', adminProtected: true })
  assert.equal(text.includes(replacementKey), false)
  const persisted = readFileSync(envFile, 'utf8')
  assert.equal(persisted.includes(`DIFY_API_KEY="${replacementKey}"`), true)
  assert.equal(persisted.includes(adminToken), false)
  assert.equal(statSync(envFile).mode & 0o777, 0o600)
  pass('授权写入使用原子后端环境文件，权限 0600，响应和文件均不泄露管理员令牌')

  await stopServer()
  await startServer()()
  status = await (await api('/config/dify')).json()
  assert.equal(status.configured, true)
  assert.equal(status.masked, '••••••••')
  pass('后端重启后从环境文件恢复已配置状态')

  const scripts = await (await api('/scripts')).json()
  assert.equal(scripts.length, 9)
  assert.deepEqual(groupScripts(scripts).map((group) => group.stage), [...SCRIPT_STAGES])
  assert.equal(groupScripts(scripts).flatMap((group) => group.scripts).length, 9)
  const validationDb = new Database(dbFile, { readonly: true })
  const reviewId = validationDb.prepare('select id from reviews order by id limit 1').get().id
  validationDb.close()
  response = await api('/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: '方案呈现', scene: 'T38 复盘亮点', text: 'T46 验证复盘沉淀话术', fromReviewId: reviewId }) })
  assert.equal(response.status, 201)
  const savedScripts = await (await api('/scripts')).json()
  assert.equal(groupScripts(savedScripts).find((group) => group.stage === '方案呈现').scripts.some((script) => script.fromReviewId === reviewId), true)
  pass('9 条 Seed 话术严格按五段式分组，T38 风格复盘来源话术可见')

  const products = await (await api('/products')).json()
  assert.equal(products.length, 10)
  for (const product of products) {
    assert.equal(typeof product.price, 'number')
    assert.equal(Object.keys(product.params ?? {}).length > 0, true)
    assert.equal(product.sellingPoints.length > 0, true)
    assert.equal((product.objections ?? []).length > 0, true)
  }
  pass('10 个产品完整包含 price、params、selling_points 与 objections')

  for (const route of ['/me/scripts', '/me/products', '/me/config']) {
    assert.equal(resolveRoute(route).kind, 'page')
    assert.deepEqual(resolveRoute(`${route}/`), resolveRoute(route))
  }
  const configSource = readFileSync(path.join(root, 'frontend/src/pages/ConfigPage.tsx'), 'utf8')
  assert.equal(/localStorage\s*\.|indexedDB\s*\./i.test(configSource), false)
  pass('三个稳定 URL 支持刷新/尾斜杠，配置页无浏览器持久化调用')

  console.log(`\nT46 我的资产与安全配置验证通过：${passed}/7`)
} finally {
  await stopServer()
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
