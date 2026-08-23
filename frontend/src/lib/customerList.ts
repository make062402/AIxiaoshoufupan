import type { CustomerRecord, IntentLevel, ReviewSummaryRecord } from '../types/types.ts'

export type CustomerStage = 'S1' | 'S2' | 'S3'

export interface CustomerListRow extends CustomerRecord {
  intentLevel: IntentLevel
  intentScore: number
  reviewCount: number
  stage: CustomerStage
}

const nameCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
})

export function deriveCustomerStage(reviewCount: number): CustomerStage {
  return reviewCount === 0 ? 'S1' : reviewCount === 1 ? 'S2' : 'S3'
}

export function buildCustomerList(
  customers: CustomerRecord[],
  reviews: ReviewSummaryRecord[],
): CustomerListRow[] {
  const reviewCounts = new Map<number, number>()
  reviews.forEach((review) => {
    reviewCounts.set(review.customerId, (reviewCounts.get(review.customerId) ?? 0) + 1)
  })

  return customers.map((customer) => {
    const reviewCount = reviewCounts.get(customer.id) ?? 0
    return {
      ...customer,
      intentLevel: customer.intentLevel ?? 'D',
      intentScore: Math.max(0, Math.min(3, customer.intentScore ?? 0)),
      reviewCount,
      stage: deriveCustomerStage(reviewCount),
    }
  }).sort((left, right) => nameCollator.compare(left.name, right.name) || left.id - right.id)
}
