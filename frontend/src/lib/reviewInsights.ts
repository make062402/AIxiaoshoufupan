import type { AiEvidenceItem } from '../types/types.ts'

export const EMPTY_INSIGHT_TEXT = '本次未检出'

export function buildHighlightScript(item: AiEvidenceItem, context: { scene: string; industry: string }, fromReviewId: number | null = null) {
  return {
    stage: '方案呈现',
    scene: `${context.scene} · ${context.industry} · 复盘亮点`,
    text: item.quote?.trim() || item.text.trim(),
    fromReviewId,
  } as const
}

export function hasEvidenceItems(items: readonly AiEvidenceItem[]) {
  return items.length > 0
}
