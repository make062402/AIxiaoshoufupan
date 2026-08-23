import type { CustomerRecord } from '../types/types.ts'

export const PRIORITY_OPTIONS = ['价格', '质量', '服务', '周期'] as const

export interface CustomerProfileForm {
  name: string
  identity: string
  phone: string
  role: string
  budget: string
  coreNeed: string
  priorityOrderText: string
  notes: string
  deadline: string
}

export interface ProfileItemStatus {
  key: keyof CustomerProfileForm | 'nameAndIdentity'
  label: string
  filled: boolean
}

const text = (value: string | null) => value ?? ''

export function customerToProfileForm(customer: CustomerRecord): CustomerProfileForm {
  return {
    name: customer.name,
    identity: text(customer.identity),
    phone: text(customer.phone),
    role: text(customer.role),
    budget: text(customer.budget),
    coreNeed: text(customer.coreNeed),
    priorityOrderText: customer.priorityOrder?.join('、') ?? '',
    notes: text(customer.notes),
    deadline: text(customer.deadline),
  }
}

const hasText = (value: string) => value.trim().length > 0

export function getProfileItemStatuses(form: CustomerProfileForm): ProfileItemStatus[] {
  return [
    { key: 'nameAndIdentity', label: '称呼与身份', filled: hasText(form.name) || hasText(form.identity) },
    { key: 'phone', label: '联系方式', filled: hasText(form.phone) },
    { key: 'role', label: '在采购中的角色', filled: hasText(form.role) },
    { key: 'budget', label: '预算区间', filled: hasText(form.budget) },
    { key: 'coreNeed', label: '核心需求与购买意向', filled: hasText(form.coreNeed) },
    { key: 'priorityOrderText', label: '关注维度优先级排序', filled: hasText(form.priorityOrderText) },
    { key: 'notes', label: '注意事项', filled: hasText(form.notes) },
    { key: 'deadline', label: '采购时间点 / 交付期限', filled: hasText(form.deadline) },
  ]
}

export function validateProfileForm(form: CustomerProfileForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!hasText(form.name)) errors.name = '客户称呼不能为空'

  const priorities = parsePriorityOrder(form.priorityOrderText) ?? []
  if (hasText(form.priorityOrderText)) {
    const invalid = priorities.filter((item) => !PRIORITY_OPTIONS.includes(item as typeof PRIORITY_OPTIONS[number]))
    if (invalid.length > 0) errors.priorityOrderText = `只允许填写：${PRIORITY_OPTIONS.join('、')}`
    if (new Set(priorities).size !== priorities.length) errors.priorityOrderText = '关注维度不能重复'
  }
  return errors
}

export function parsePriorityOrder(value: string): string[] | null {
  const items = value.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean)
  return items.length > 0 ? items : null
}

export function mergeProfileIntoCustomer(customer: CustomerRecord, form: CustomerProfileForm): CustomerRecord {
  const nullable = (value: string) => value.trim() || null
  return {
    ...customer,
    name: form.name.trim(),
    identity: nullable(form.identity),
    phone: nullable(form.phone),
    role: nullable(form.role),
    budget: nullable(form.budget),
    coreNeed: nullable(form.coreNeed),
    priorityOrder: parsePriorityOrder(form.priorityOrderText),
    notes: nullable(form.notes),
    deadline: nullable(form.deadline),
  }
}
