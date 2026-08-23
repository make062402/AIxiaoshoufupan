import type { CustomerRecord, ReviewSummaryRecord } from '../types/types.ts'

export type DemoRole = 'sales' | 'manager'
export const DEMO_ROLE_KEY = 'sales-review:demo-role'

export interface RoleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadDemoRole(storage: RoleStorage): DemoRole {
  return storage.getItem(DEMO_ROLE_KEY) === 'manager' ? 'manager' : 'sales'
}

export function saveDemoRole(storage: RoleStorage, role: DemoRole) {
  storage.setItem(DEMO_ROLE_KEY, role)
}

export function buildDemoTeamReport(customers: CustomerRecord[], reviews: ReviewSummaryRecord[]) {
  const names = new Map(customers.map((customer) => [customer.id, customer.name]))
  const rows = reviews.map((review) => ({
    id: review.id,
    customerId: review.customerId,
    customerName: names.get(review.customerId) ?? '未知客户',
    total: review.scores?.total ?? null,
    createdAt: review.createdAt ?? null,
  })).sort((left, right) => {
    const byDate = (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
    return byDate || right.id - left.id
  })
  const totals: number[] = rows.flatMap((row) => row.total === null ? [] : [Number(row.total)])
  return {
    accountName: '演示销售账号',
    reviewCount: rows.length,
    customerCount: new Set(rows.map((row) => row.customerId)).size,
    average: totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length * 10) / 10 : null,
    reviews: rows,
  }
}
