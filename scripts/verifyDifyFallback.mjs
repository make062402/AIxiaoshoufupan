#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

process.env.DIFY_API_KEY = 't25-fake-key'
process.env.DIFY_BASE_URL = 'https://t25.invalid/v1'

let interceptedFetchCalls = 0
let fetchImplementation = async () => {
  throw new Error('测试未配置 fetch 返回值')
}

globalThis.fetch = async (...args) => {
  interceptedFetchCalls += 1
  return fetchImplementation(...args)
}

const {
  analyzeTranscript,
  emptyAiResult,
  loadMockResult,
  normalizeAiResult,
  parseAiText,
} = await import('../backend/src/dify.ts')

const mockText = await readFile(
  new URL('../backend/mock/difyResult.json', import.meta.url),
  'utf8',
)
const rawMock = JSON.parse(mockText)
const input = {
  transcript: [
    { speaker: 'sales', start: 0, end: 2, text: '您好，请坐。' },
  ],
}

function difyResponse(outputText) {
  return {
    ok: true,
    json: async () => ({ data: { outputs: { result: outputText } } }),
    text: async () => '',
  }
}

let passed = 0

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

await check('json Markdown 代码围栏可以剥离并解析', () => {
  const parsed = parseAiText(`\`\`\`json\n${mockText}\n\`\`\``)
  assert.deepEqual(parsed, rawMock)
})

await check('缺少 highlights 时补为空数组且不抛异常', () => {
  const { highlights: _omitted, ...withoutHighlights } = rawMock
  const normalized = normalizeAiResult(withoutHighlights)
  assert.deepEqual(normalized.highlights, [])
  assert.deepEqual(normalized.counts, rawMock.counts)
})

await check('正常 mock 与 difyResult.json 契约内容一致且零 fetch', async () => {
  const callsBefore = interceptedFetchCalls
  process.env.USE_MOCK = 'true'
  const outcome = await analyzeTranscript(input)
  assert.equal(outcome.ok, true)
  assert.equal(outcome.source, 'mock')
  assert.deepEqual(outcome.result, normalizeAiResult(rawMock))
  assert.deepEqual(loadMockResult(), normalizeAiResult(rawMock))
  assert.equal(interceptedFetchCalls, callsBefore)
})

await check('首次非 JSON、第二次合法时恰好重试一次并成功', async () => {
  process.env.USE_MOCK = 'false'
  let attempts = 0
  fetchImplementation = async () => {
    attempts += 1
    return difyResponse(attempts === 1 ? '暂时无法完成分析，请稍后再试。' : mockText)
  }

  const outcome = await analyzeTranscript(input)
  assert.equal(attempts, 2)
  assert.equal(outcome.ok, true)
  assert.equal(outcome.source, 'dify')
  assert.deepEqual(outcome.result, normalizeAiResult(rawMock))
})

await check('连续中文道歉时只请求两次并返回完整默认结构', async () => {
  process.env.USE_MOCK = 'false'
  let attempts = 0
  fetchImplementation = async () => {
    attempts += 1
    return difyResponse('抱歉，我现在无法生成 JSON 结果。')
  }

  const outcome = await analyzeTranscript(input)
  assert.equal(attempts, 2)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.source, 'fallback')
  assert.deepEqual(outcome.result, emptyAiResult())
  assert.match(outcome.error ?? '', /JSON/)
})

console.log(`\nT25 检查点：通过 ${passed} / 5`)
console.log(`真实网络调用：0（${interceptedFetchCalls} 次 Dify fetch 均由本地 stub 拦截）`)

if (passed !== 5) process.exitCode = 1
