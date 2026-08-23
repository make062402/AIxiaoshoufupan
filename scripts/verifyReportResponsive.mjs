#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { presentMetrics, segmentMatchesEvidence } from '../frontend/src/lib/metricPresentation.ts'
import { buildReviewAnalysis } from '../frontend/src/lib/reviewAnalysis.ts'
import { metricEvidenceA } from '../frontend/src/samples/metricEvidence.ts'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'
import { resolveRoute } from '../frontend/src/lib/navigation.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const page = readFileSync(path.join(root, 'frontend/src/pages/ReviewResultPage.tsx'), 'utf8')
const mock = JSON.parse(readFileSync(path.join(root, 'backend/mock/difyResult.json'), 'utf8'))

assert.match(page, /lg:grid-cols-\[minmax\(0,5fr\)_minmax\(0,7fr\)\]/)
assert.match(page, /lg:sticky lg:top-5/)
pass('宽屏使用 5:7 左指标右逐字稿分栏，右栏保持 sticky')

assert.match(page, /max-h-\[70vh\][^\"]*overflow-y-auto/)
assert.match(page, /className="[^"]*lg:hidden">返回当前指标/)
pass('逐字稿使用独立纵向滚动容器，窄屏保留返回当前指标按钮')

const analysis = buildReviewAnalysis({ transcript: transcriptA, sellingPoints: [], aiResult: mock, evidence: metricEvidenceA })
const metrics = presentMetrics(analysis, transcriptA)
assert.equal(metrics.length, 14)
const first = metrics[0]
const last = metrics.at(-1)
const firstMatches = transcriptA.filter((segment) => segmentMatchesEvidence(segment.start, segment.end, first.evidence))
const lastMatches = transcriptA.filter((segment) => segmentMatchesEvidence(segment.start, segment.end, last.evidence))
assert.deepEqual(firstMatches.map((segment) => segment.start), [79.5])
assert.deepEqual(lastMatches.map((segment) => segment.start), [1744])
assert.ok(lastMatches[0].start - firstMatches[0].start > 1600)
pass('第 1 与第 14 指标命中相距超过 1600 秒的唯一精确锚点')

assert.match(page, /setSelectedMetric\(key\)/)
assert.match(page, /transcript-\$\{key\}[^\n]*scrollIntoView/)
assert.match(page, /highlighted \|\| evidenceFocused/)
pass('指标切换后滚动至对应 transcript ID，并只按当前证据计算高亮')

assert.equal(resolveRoute('/reviews/report/315').kind, 'page')
assert.deepEqual(resolveRoute('/reviews/report/315/'), resolveRoute('/reviews/report/315'))
pass('已落库报告 URL 稳定且支持刷新与尾斜杠')

console.log(`\nT48 复盘报告宽屏分栏专项验证通过：${passed}/5`)
