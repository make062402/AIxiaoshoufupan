#!/usr/bin/env node

import assert from 'node:assert/strict'
import { transcriptA } from '../frontend/src/samples/transcriptA.ts'
import {
  DEMO_UPLOAD_DURATION_MS,
  REVIEW_DRAFT_STORAGE_KEY,
  clearCompletedDraft,
  formatTranscriptForPaste,
  isAcceptedAudio,
  loadCompletedDraft,
  parsePastedTranscript,
  saveCompletedDraft,
  startDemoUpload,
} from '../frontend/src/lib/reviewDraft.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }

const pasted = formatTranscriptForPaste(transcriptA)
const parsed = parsePastedTranscript(pasted, 'sales')
assert.deepEqual(parsed, transcriptA)
pass('样例 A 可格式化为易懂行格式并无损解析')

assert.throws(() => parsePastedTranscript('销售说了一句话但没有时间', 'sales'), /第 1 行格式不正确/)
assert.throws(() => parsePastedTranscript('[3-2] 销售：时间写反', 'sales'), /时间或说话人不合法/)
assert.equal(parsePastedTranscript('[0-1] 销售：你好\n[1-2] 客户：您好', 'customer')[0].speaker, 'customer')
pass('非法格式有具体行号提示，销售方手动选择可交换角色')

const memory = new Map()
const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) }
storage.setItem(REVIEW_DRAFT_STORAGE_KEY, '{bad json')
assert.equal(loadCompletedDraft(storage), null)
assert.equal(storage.getItem(REVIEW_DRAFT_STORAGE_KEY), null)
saveCompletedDraft(storage, { transcript: parsed, source: 'paste', salesSpeaker: 'sales', createdAt: Date.now() })
assert.equal(loadCompletedDraft(storage)?.transcript.length, transcriptA.length)
clearCompletedDraft(storage)
assert.equal(loadCompletedDraft(storage), null)
pass('只保存完整逐字稿，损坏或清除后的半成品不会继续')

assert.equal(DEMO_UPLOAD_DURATION_MS, 2400)
const progressValues = []
const completed = await new Promise((resolve) => {
  startDemoUpload((value) => progressValues.push(value), resolve)
})
assert.deepEqual(progressValues, [0, 17, 33, 50, 67, 83, 100])
assert.equal(completed.length, transcriptA.length)
pass('模拟上传约 2.4 秒从 0% 到 100%，完成返回预置逐字稿')

let cancelledComplete = false
const cancel = startDemoUpload(() => undefined, () => { cancelledComplete = true }, 120)
cancel()
await new Promise((resolve) => setTimeout(resolve, 180))
assert.equal(cancelledComplete, false)
pass('取消会清理定时器且不产生完整逐字稿')

assert.equal(isAcceptedAudio({ name: 'visit.mp3', type: '' }), true)
assert.equal(isAcceptedAudio({ name: 'notes.txt', type: 'text/plain' }), false)
pass('音频类型/扩展名校验会拒绝普通文本文件')

console.log(`\nT34 检查点：通过 ${passed} / 6`)
