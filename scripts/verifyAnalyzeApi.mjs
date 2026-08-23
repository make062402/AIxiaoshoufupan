#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = 32126
const baseUrl = `http://127.0.0.1:${port}`
const nativeFetch = globalThis.fetch
let serverOutput = ''
let frontendAnalyzeCalls = 0
let passed = 0

const server = spawn(
  process.execPath,
  ['--experimental-strip-types', 'src/index.ts'],
  {
    cwd: new URL('../backend/', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      USE_MOCK: 'true',
      DIFY_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

async function check(name, assertion) {
  try {
    await assertion()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`后端提前退出（${server.exitCode}）\n${serverOutput}`)
    }
    try {
      const response = await nativeFetch(`${baseUrl}/api/ping`)
      if (response.ok) return
    } catch {
      // 启动中的连接失败属于预期，继续短暂轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`等待后端启动超时\n${serverOutput}`)
}

async function jsonRequest(body) {
  const response = await nativeFetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { response, json: await response.json() }
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

try {
  await waitForServer()

  await check('合法 transcript 返回 mock 的完整结果', async () => {
    const { response, json } = await jsonRequest({
      transcript: [
        { speaker: 'sales', start: 0, end: 2, text: '您好，请坐。' },
      ],
    })
    assert.equal(response.status, 200)
    assert.equal(json.ok, true)
    assert.equal(json.source, 'mock')
    assert.deepEqual(Object.keys(json.result).sort(), [
      'commitments',
      'counts',
      'highlights',
      'improvements',
      'missed_points',
      'needs',
      'next_actions',
    ])
  })

  await check('缺少或传入空 transcript 均返回 400 可读错误', async () => {
    for (const body of [{}, { transcript: [] }]) {
      const { response, json } = await jsonRequest(body)
      assert.equal(response.status, 400)
      assert.equal(json.ok, false)
      assert.match(json.error, /transcript.*非空数组/)
    }
  })

  await check('非法 JSON 返回 400，随后健康检查仍成功', async () => {
    const response = await nativeFetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"transcript":',
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /合法 JSON/)
    assert.equal((await nativeFetch(`${baseUrl}/api/ping`)).status, 200)
  })

  await check('前端类型安全函数通过 /api/analyze 拿到结果', async () => {
    globalThis.fetch = (path, init) => {
      assert.equal(path, '/api/analyze')
      frontendAnalyzeCalls += 1
      return nativeFetch(`${baseUrl}${path}`, init)
    }
    const { analyzeTranscript } = await import('../frontend/src/api/client.ts')
    const outcome = await analyzeTranscript({
      transcript: [
        { speaker: 'sales', start: 0, end: 2, text: '您好，请坐。' },
      ],
    })
    assert.equal(frontendAnalyzeCalls, 1)
    assert.equal(outcome.ok, true)
    assert.equal(outcome.source, 'mock')
  })

  await check('前端源码与构建产物不含 Dify 密钥或直连地址', async () => {
    const roots = [
      fileURLToPath(new URL('../frontend/src/', import.meta.url)),
      fileURLToPath(new URL('../frontend/dist/', import.meta.url)),
    ]
    const forbidden = [
      /DIFY_API_KEY/,
      /Authorization\s*:\s*[`'"]?Bearer/i,
      /api\.dify\.ai/i,
      /\/workflows\/run/,
    ]
    for (const root of roots) {
      for (const file of await listTextFiles(root)) {
        const content = await readFile(file, 'utf8')
        for (const pattern of forbidden) {
          assert.doesNotMatch(content, pattern, `${file} 命中 ${pattern}`)
        }
      }
    }
  })

  await check('服务全程使用 mock，没有真实 Dify 请求', () => {
    assert.match(serverOutput, /USE_MOCK=true/)
    assert.doesNotMatch(serverOutput, /api\.dify\.ai|Dify HTTP/)
  })
} finally {
  globalThis.fetch = nativeFetch
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

console.log(`\nT26 检查点：通过 ${passed} / 6`)
console.log(`前端 /api/analyze 调用：${frontendAnalyzeCalls} 次；真实 Dify 调用：0`)
if (passed !== 6) process.exitCode = 1
