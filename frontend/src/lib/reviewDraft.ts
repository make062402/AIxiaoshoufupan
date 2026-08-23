import { transcriptA } from '../samples/transcriptA.ts'
import type { Speaker, Transcript } from '../types/types.ts'

export const REVIEW_DRAFT_STORAGE_KEY = 'sales-review:completed-transcript'
export const REVIEW_CONTEXT_STORAGE_KEY = 'sales-review:analysis-context'
export const DEMO_UPLOAD_DURATION_MS = 2400

export interface ReviewTranscriptDraft {
  transcript: Transcript
  source: 'paste' | 'upload-demo'
  salesSpeaker: Speaker
  createdAt: number
}

export interface ReviewContext {
  customerId: number
  scene: '一次拜访' | '二次拜访' | '多次拜访'
  recordingSource: '现场录音' | '电话录音' | '其他'
  language: '普通话' | '中英混杂'
  industry: '装修' | '教培' | '广告'
}

export function missingReviewContext(context: Partial<ReviewContext>): string[] {
  const missing: string[] = []
  if (!Number.isInteger(context.customerId) || Number(context.customerId) <= 0) missing.push('客户')
  if (!context.scene) missing.push('场景标签')
  if (!context.recordingSource) missing.push('录音来源')
  if (!context.language) missing.push('语言')
  if (!context.industry) missing.push('行业')
  return missing
}

export function saveReviewContext(storage: StorageLike, context: ReviewContext) {
  if (missingReviewContext(context).length) throw new Error('复盘补充信息不完整')
  storage.setItem(REVIEW_CONTEXT_STORAGE_KEY, JSON.stringify(context))
}

export function loadReviewContext(storage: StorageLike): ReviewContext | null {
  const raw = storage.getItem(REVIEW_CONTEXT_STORAGE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<ReviewContext>
    return missingReviewContext(value).length === 0 ? value as ReviewContext : null
  } catch { return null }
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const speakerOf = (value: string): Speaker | null => value === '销售' || value === 'sales'
  ? 'sales' : value === '客户' || value === 'customer' ? 'customer' : null

export function formatTranscriptForPaste(transcript: Transcript): string {
  return transcript.map((segment) => `[${segment.start}-${segment.end}] ${segment.speaker === 'sales' ? '销售' : '客户'}：${segment.text}`).join('\n')
}

export function parsePastedTranscript(value: string, salesSpeaker: Speaker): Transcript {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('请先粘贴逐字稿')
  const parsed = lines.map((line, index) => {
    const match = line.match(/^\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]\s*(销售|客户|sales|customer)\s*[：:]\s*(.+)$/)
    if (!match) throw new Error(`第 ${index + 1} 行格式不正确，请使用：[开始秒-结束秒] 销售：内容`)
    const start = Number(match[1])
    const end = Number(match[2])
    const rawSpeaker = speakerOf(match[3])
    if (!rawSpeaker || end <= start) throw new Error(`第 ${index + 1} 行时间或说话人不合法`)
    const speaker = salesSpeaker === 'sales' ? rawSpeaker : rawSpeaker === 'sales' ? 'customer' : 'sales'
    return { speaker, start, end, text: match[4].trim() }
  })
  if (parsed.some((segment, index) => index > 0 && segment.start < parsed[index - 1].start)) {
    throw new Error('逐字稿必须按开始时间从小到大排列')
  }
  return parsed
}

export function isValidDraft(value: unknown): value is ReviewTranscriptDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as ReviewTranscriptDraft
  return (draft.source === 'paste' || draft.source === 'upload-demo')
    && (draft.salesSpeaker === 'sales' || draft.salesSpeaker === 'customer')
    && Number.isFinite(draft.createdAt)
    && Array.isArray(draft.transcript) && draft.transcript.length > 0
    && draft.transcript.every((segment) => (segment.speaker === 'sales' || segment.speaker === 'customer')
      && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start
      && typeof segment.text === 'string' && segment.text.trim().length > 0)
}

export function saveCompletedDraft(storage: StorageLike, draft: ReviewTranscriptDraft) {
  if (!isValidDraft(draft)) throw new Error('不能保存不完整的逐字稿')
  storage.setItem(REVIEW_DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function loadCompletedDraft(storage: StorageLike): ReviewTranscriptDraft | null {
  const raw = storage.getItem(REVIEW_DRAFT_STORAGE_KEY)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (isValidDraft(value)) return value
  } catch { /* 清除损坏上下文 */ }
  storage.removeItem(REVIEW_DRAFT_STORAGE_KEY)
  return null
}

export function clearCompletedDraft(storage: StorageLike) {
  storage.removeItem(REVIEW_DRAFT_STORAGE_KEY)
}

export function startDemoUpload(
  onProgress: (progress: number) => void,
  onComplete: (transcript: Transcript) => void,
  durationMs = DEMO_UPLOAD_DURATION_MS,
) {
  let cancelled = false
  let step = 0
  const steps = 6
  onProgress(0)
  const timer = globalThis.setInterval(() => {
    if (cancelled) return
    step += 1
    const progress = Math.min(100, Math.round(step / steps * 100))
    onProgress(progress)
    if (step >= steps) {
      globalThis.clearInterval(timer)
      onComplete(transcriptA.map((segment) => ({ ...segment })))
    }
  }, durationMs / steps)
  return () => { cancelled = true; globalThis.clearInterval(timer) }
}

export function isAcceptedAudio(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name)
}
