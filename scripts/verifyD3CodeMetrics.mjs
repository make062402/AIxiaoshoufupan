#!/usr/bin/env node

import assert from 'node:assert/strict'

process.env.DB_FILE = './backend/data/app.db'

const { db } = await import('../backend/src/db/client.ts')
const { products } = await import('../backend/src/db/schema.ts')
const {
  getMaxRepeatFollowup,
  getSellingPointHitCount,
} = await import('../frontend/src/lib/metrics.ts')
const { transcriptA } = await import('../frontend/src/samples/transcriptA.ts')
const { transcriptB } = await import('../frontend/src/samples/transcriptB.ts')

const decorationProducts = (await db.select().from(products)).filter(
  (product) => product.industry === '装修',
)
const sellingPoints = decorationProducts.flatMap(
  (product) => product.sellingPoints ?? [],
)

const topicsA = [
  {
    topic: '甲醛',
    initialStartSeconds: 272.5,
    followupStartsSeconds: [332.1, 378.8, 977.7],
  },
  {
    topic: '价差',
    initialStartSeconds: 472.8,
    followupStartsSeconds: [567.9],
  },
]

const topicsB = [
  {
    topic: '甲醛',
    initialStartSeconds: 85.6,
    followupStartsSeconds: [139.9, 183.6],
  },
]

let passed = 0

function check(name, assertion) {
  try {
    assertion()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

check('读取真实装修产品库卖点', () => {
  assert.equal(decorationProducts.length, 4)
  assert.equal(sellingPoints.length, 9)
  assert.ok(sellingPoints.every((point) => point.sales_keywords.length > 0))
})

check('样本 A：命中 7 个卖点，最大追问 3 次', () => {
  assert.equal(getSellingPointHitCount(transcriptA, sellingPoints), 7)
  assert.equal(getMaxRepeatFollowup(transcriptA, topicsA), 3)
})

check('样本 B：命中 6 个卖点（≥3），最大追问 2 次', () => {
  assert.equal(getSellingPointHitCount(transcriptB, sellingPoints), 6)
  assert.equal(getMaxRepeatFollowup(transcriptB, topicsB), 2)
})

check('样本 B 手工加一句未命中卖点关键词后，命中数恰好 +1', () => {
  const withOneMoreSellingPoint = [
    ...transcriptB,
    {
      speaker: 'sales',
      start: 1899,
      end: 1904,
      text: '老房的主管道锈死了，我们会连立管一起换成 PPR。',
    },
  ]
  assert.equal(
    getSellingPointHitCount(withOneMoreSellingPoint, sellingPoints),
    getSellingPointHitCount(transcriptB, sellingPoints) + 1,
  )
})

check('追问只计有效客户问句时间戳，并自动去重', () => {
  const noisyEvidence = [
    {
      topic: '测试',
      initialStartSeconds: 85.6,
      followupStartsSeconds: [139.9, 139.9, 115.4, 9999],
    },
  ]
  assert.equal(getMaxRepeatFollowup(transcriptB, noisyEvidence), 1)
  assert.equal(
    getMaxRepeatFollowup(transcriptB, [
      { ...noisyEvidence[0], initialStartSeconds: 9999 },
    ]),
    0,
  )
  assert.equal(getMaxRepeatFollowup([], noisyEvidence), 0)
})

if (process.exitCode) {
  console.error(`\nT20 自检失败：通过 ${passed} / 5`)
} else {
  console.log(`\nT20 自检通过：通过 ${passed} / 5`)
  console.log(
    `样本 A：sellingPoints=${getSellingPointHitCount(transcriptA, sellingPoints)}, maxFollowup=${getMaxRepeatFollowup(transcriptA, topicsA)}`,
  )
  console.log(
    `样本 B：sellingPoints=${getSellingPointHitCount(transcriptB, sellingPoints)}, maxFollowup=${getMaxRepeatFollowup(transcriptB, topicsB)}`,
  )
}
