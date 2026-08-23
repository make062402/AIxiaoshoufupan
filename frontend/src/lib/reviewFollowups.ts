import type { AiCommitment } from '../types/types.ts'
import { formatTranscriptTime } from './metricPresentation.ts'

export const EMPTY_FOLLOWUP_TEXT = '本次未检出'

export function hasReviewItems(items: readonly unknown[]) {
  return items.length > 0
}

export function commitmentMeta(item: AiCommitment): string[] {
  const meta: string[] = []
  if (item.due?.trim()) meta.push(`期限：${item.due.trim()}`)
  if (typeof item.start === 'number') meta.push(formatTranscriptTime(item.start))
  return meta
}
