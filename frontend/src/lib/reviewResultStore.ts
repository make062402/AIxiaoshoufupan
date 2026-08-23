import type { AiResult } from '../types/types.ts'
import type { ReviewAnalysis } from './reviewAnalysis.ts'
import type { StorageLike } from './reviewDraft.ts'

export const REVIEW_RESULT_STORAGE_KEY = 'sales-review:analysis-result'

export interface PreparedReviewResult {
  aiResult: AiResult
  analysis: ReviewAnalysis
  historicalAverage: number | null
  source: 'mock' | 'dify' | 'fallback'
  analyzedAt: number
}

export function savePreparedReviewResult(storage: StorageLike, result: PreparedReviewResult) {
  storage.setItem(REVIEW_RESULT_STORAGE_KEY, JSON.stringify(result))
}

export function loadPreparedReviewResult(storage: StorageLike): PreparedReviewResult | null {
  const raw = storage.getItem(REVIEW_RESULT_STORAGE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as PreparedReviewResult
    return value?.analysis?.scores && value?.aiResult ? value : null
  } catch { return null }
}
