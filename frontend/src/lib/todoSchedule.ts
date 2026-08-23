import type { TodoRecord } from '../types/types.ts'

export function sortTodos(items: TodoRecord[]) {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1
    if (left.dueDate === null && right.dueDate !== null) return 1
    if (left.dueDate !== null && right.dueDate === null) return -1
    return (left.dueDate ?? '').localeCompare(right.dueDate ?? '') || left.id - right.id
  })
}
