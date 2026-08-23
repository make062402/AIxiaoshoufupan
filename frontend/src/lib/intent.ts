import type { IntentLevel } from '../types/types.ts'

export interface IntentSignals {
  hasDealAmount?: boolean
  contractSigned?: boolean
  verbalCommitment?: boolean
  explicitCommitmentTime?: boolean
  decisionAdvanceCount?: number
  priceQuestionCount?: number
  detailQuestionCount?: number
  delayWithoutTime?: boolean
  comparisonWithoutDetail?: boolean
  silentPauseCount?: number
  budgetTimingUncertain?: boolean
  directRejection?: boolean
  continuedWithinTwoTurns?: boolean
  existingSupplierOrCancelledBudget?: boolean
  hasFutureCondition?: boolean
  lostContact?: boolean
}

export interface IntentDecision {
  level: IntentLevel
  score: number
  reason: string
}

export function determineIntent(signals: IntentSignals): IntentDecision {
  if (signals.hasDealAmount || signals.contractSigned || (signals.verbalCommitment && signals.explicitCommitmentTime)) {
    return { level: 'A', score: 0, reason: '检测到成交金额、合同或带明确时间的口头承诺' }
  }

  if ((signals.decisionAdvanceCount ?? 0) >= 1) {
    return { level: 'B', score: 3, reason: '客户主动推进联系方式、报价、合同或流程' }
  }
  if ((signals.priceQuestionCount ?? 0) >= 1) {
    return { level: 'B', score: 2, reason: '客户主动询问价格、优惠、分期或付款方式' }
  }
  if ((signals.detailQuestionCount ?? 0) >= 1) {
    return { level: 'B', score: 1, reason: '客户主动询问参数、售后、质保或交付周期' }
  }

  const shouldBeC = signals.delayWithoutTime
    || signals.comparisonWithoutDetail
    || (signals.silentPauseCount ?? 0) >= 2
    || signals.budgetTimingUncertain
    || (signals.existingSupplierOrCancelledBudget && signals.hasFutureCondition)
  if (shouldBeC) return { level: 'C', score: 0, reason: '检测到拖延、比价、沉默或预算时机未定信号' }

  const shouldBeD = (signals.directRejection && !signals.continuedWithinTwoTurns)
    || (signals.existingSupplierOrCancelledBudget && !signals.hasFutureCondition)
    || signals.lostContact
  if (shouldBeD) return { level: 'D', score: 0, reason: '检测到无后续追问的拒绝、无未来预期或失联' }

  return { level: 'C', score: 0, reason: '尚未检测到明确推进或成交信号，暂按低意向跟进' }
}
