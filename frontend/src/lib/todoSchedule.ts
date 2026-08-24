import type { TodoRecord } from '../types/types.ts'

export function sortTodos(items: TodoRecord[]) {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1
    if (left.dueDate === null && right.dueDate !== null) return 1
    if (left.dueDate !== null && right.dueDate === null) return -1
    return (left.dueDate ?? '').localeCompare(right.dueDate ?? '') || left.id - right.id
  })
}

/** 待办时间分组的键。done 统一归入底部「已完成」，其余按截止日相对今天划分。 */
export type TodoGroupKey = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'noDate' | 'done'

export interface TodoGroup {
  key: TodoGroupKey
  label: string
  items: TodoRecord[]
}

/** 把 Date 转成本地时区的 YYYY-MM-DD 字符串，用于和 dueDate 精确比较，避免时区偏移。 */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 按「逾期 / 今天 / 明天 / 本周 / 未设截止日 / 已完成」分组待办。
 * 只做前端派生，不修改原数组；组内沿用 sortTodos 的顺序保证稳定。
 */
export function groupTodos(items: TodoRecord[]): TodoGroup[] {
  const today = new Date()
  const todayKey = toLocalDateKey(today)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const tomorrowKey = toLocalDateKey(tomorrow)

  const buckets: Record<TodoGroupKey, TodoRecord[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    noDate: [],
    done: [],
  }

  for (const todo of sortTodos(items)) {
    if (todo.done) {
      buckets.done.push(todo)
    } else if (todo.dueDate === null) {
      buckets.noDate.push(todo)
    } else if (todo.dueDate < todayKey) {
      buckets.overdue.push(todo)
    } else if (todo.dueDate === todayKey) {
      buckets.today.push(todo)
    } else if (todo.dueDate === tomorrowKey) {
      buckets.tomorrow.push(todo)
    } else {
      // 明天之后（本周剩余及更晚）都归入「本周」，确保任何未来日期都不遗漏。
      buckets.thisWeek.push(todo)
    }
  }

  const labels: Record<TodoGroupKey, string> = {
    overdue: '逾期',
    today: '今天',
    tomorrow: '明天',
    thisWeek: '本周',
    noDate: '未设截止日',
    done: '已完成',
  }
  const order: TodoGroupKey[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'noDate', 'done']

  return order
    .map((key) => ({ key, label: labels[key], items: buckets[key] }))
    .filter((group) => group.items.length > 0)
}
