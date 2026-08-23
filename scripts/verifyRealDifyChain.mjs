#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DB_FILE = './backend/data/app.db'

const { emptyAiResult } = await import('../backend/src/dify.ts')
const { db } = await import('../backend/src/db/client.ts')
const { products } = await import('../backend/src/db/schema.ts')
const { buildReviewAnalysis } = await import(
  '../frontend/src/lib/reviewAnalysis.ts'
)
const { PROFILE_FIELDS } = await import('../frontend/src/config/scoring.ts')
const { metricEvidenceA } = await import(
  '../frontend/src/samples/metricEvidence.ts'
)
const { transcriptA } = await import('../frontend/src/samples/transcriptA.ts')

const nativeFetch = globalThis.fetch
const realPort = 32128
const fallbackPort = 32129
const realRuns = Number(process.env.T28_REAL_RUNS ?? 1)
const realBaseUrl = `http://127.0.0.1:${realPort}`
const fallbackBaseUrl = `http://127.0.0.1:${fallbackPort}`

assert.equal(process.env.USE_MOCK, 'false', '请用 USE_MOCK=false 启动 T28 脚本')
assert.ok(process.env.DIFY_API_KEY, 'backend/.env 尚未配置 DIFY_API_KEY')
assert.ok(Number.isInteger(realRuns) && realRuns >= 1 && realRuns <= 5)

const sellingPoints = (await db.select().from(products))
  .filter((product) => product.industry === '装修')
  .flatMap((product) => product.sellingPoints ?? [])

const payload = {
  transcript: transcriptA,
  selling_points: sellingPoints,
  profile_fields: [...PROFILE_FIELDS],
  industry: '装修',
}

function startBackend({ port, apiKey, baseUrl }) {
  let output = ''
  const server = spawn(
    process.execPath,
    ['--experimental-strip-types', 'src/index.ts'],
    {
      cwd: new URL('../backend/', import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        DB_FILE: './data/app.db',
        USE_MOCK: 'false',
        DIFY_API_KEY: apiKey,
        DIFY_BASE_URL: baseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })
  return { server, getOutput: () => output }
}

async function waitForServer(runtime, baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (runtime.server.exitCode !== null) {
      throw new Error(
        `后端提前退出（${runtime.server.exitCode}）\n${runtime.getOutput()}`,
      )
    }
    try {
      const response = await nativeFetch(`${baseUrl}/api/ping`)
      if (response.ok) return
    } catch {
      // 启动中的连接失败属于预期。
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`等待后端启动超时\n${runtime.getOutput()}`)
}

async function stopServer(runtime) {
  if (runtime.server.exitCode !== null) return
  runtime.server.kill('SIGTERM')
  await new Promise((resolve) => runtime.server.once('exit', resolve))
}

async function analyzeViaApi(baseUrl, body) {
  const response = await nativeFetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { response, json: await response.json() }
}

function assertCompleteResult(result) {
  assert.deepEqual(Object.keys(result).sort(), [
    'commitments',
    'counts',
    'highlights',
    'improvements',
    'missed_points',
    'needs',
    'next_actions',
  ])
  assert.equal(typeof result.counts.open_question_count, 'number')
  assert.equal(typeof result.counts.total_question_count, 'number')
  assert.equal(typeof result.counts.param_error_count, 'number')
  assert.ok(Array.isArray(result.counts.profile_covered_fields))
  for (const key of [
    'needs',
    'highlights',
    'improvements',
    'commitments',
    'missed_points',
    'next_actions',
  ]) assert.ok(Array.isArray(result[key]), `${key} 必须是数组`)
}

async function listTextFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listTextFiles(path))
    else if (['.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.map'].includes(extname(path))) files.push(path)
  }
  return files
}

const realRuntime = startBackend({
  port: realPort,
  apiKey: process.env.DIFY_API_KEY,
  baseUrl: process.env.DIFY_BASE_URL ?? 'https://api.dify.ai/v1',
})

const scoreRows = []

try {
  await waitForServer(realRuntime, realBaseUrl)
  for (let run = 1; run <= realRuns; run += 1) {
    const { response, json } = await analyzeViaApi(realBaseUrl, payload)
    assert.equal(response.status, 200)
    assert.equal(json.ok, true)
    assert.equal(json.source, 'dify')
    assertCompleteResult(json.result)
    assert.equal(json.result.next_actions.length, 3)

    const analysis = buildReviewAnalysis({
      transcript: transcriptA,
      sellingPoints,
      aiResult: json.result,
      evidence: metricEvidenceA,
    })
    assert.ok(
      Math.abs(analysis.scores.total - 1) <= 1,
      `第 ${run} 次真实总分 ${analysis.scores.total}，与 mock 基准 1 相差超过 1`,
    )
    scoreRows.push({
      run,
      d1: analysis.scores.d1,
      d2: analysis.scores.d2,
      d3: analysis.scores.d3,
      d4: analysis.scores.d4,
      total: analysis.scores.total,
      open: json.result.counts.open_question_count,
      questions: json.result.counts.total_question_count,
      profile: json.result.counts.profile_covered_fields.length,
      paramErrors: json.result.counts.param_error_count,
    })
    console.log(`PASS 真实链路第 ${run}/${realRuns} 次：/api/analyze → Dify → 14 项合并评分`)
  }
} finally {
  await stopServer(realRuntime)
}

console.table(scoreRows)

const fallbackRuntime = startBackend({
  port: fallbackPort,
  apiKey: 't28-network-failure-stub',
  baseUrl: 'http://127.0.0.1:1',
})

try {
  await waitForServer(fallbackRuntime, fallbackBaseUrl)
  const { response, json } = await analyzeViaApi(fallbackBaseUrl, {
    transcript: [transcriptA[0]],
  })
  assert.equal(response.status, 200)
  assert.equal(json.ok, false)
  assert.equal(json.source, 'fallback')
  assert.deepEqual(json.result, emptyAiResult())
  assert.equal(typeof json.error, 'string')
  assert.ok(json.error.length > 0)
  assert.equal((await nativeFetch(`${fallbackBaseUrl}/api/ping`)).status, 200)
  console.log('PASS 网络异常：接口返回可读错误和完整默认结构，后端进程仍存活')
} finally {
  await stopServer(fallbackRuntime)
}

const frontendFiles = [
  ...await listTextFiles(fileURLToPath(new URL('../frontend/src/', import.meta.url))),
  ...await listTextFiles(fileURLToPath(new URL('../frontend/dist/', import.meta.url))),
]
for (const file of frontendFiles) {
  const text = await readFile(file, 'utf8')
  assert.doesNotMatch(text, /DIFY_API_KEY|api\.dify\.ai|\/workflows\/run|Authorization:\s*Bearer/i)
}
console.log('PASS 前端源码与构建产物不含 Dify 密钥或直连地址')
console.log(`\nT28 真实 Dify 调用：${realRuns} 次`)
console.log('T28 断网 stub：2 次后端重试，真实 Dify 调用 0 次')
