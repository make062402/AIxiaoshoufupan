export const TODO_PREVIEW_DELAY_MS = 3000

export type TodoPreviewScenario = 'empty' | 'slow' | 'error' | 'ready'

export interface TodoPreviewItem {
  id: number
  text: string
  time: string
}

const previewItems: TodoPreviewItem[] = [
  { id: 1, text: '确认明天拜访资料', time: '今天 16:00' },
  { id: 2, text: '整理客户沟通重点', time: '今天 18:00' },
]

export function parseTodoPreviewScenario(value: string | null): TodoPreviewScenario {
  return value === 'slow' || value === 'error' || value === 'ready' ? value : 'empty'
}

export async function loadTodoPreview(
  scenario: TodoPreviewScenario,
  attempt: number,
  delayMs = TODO_PREVIEW_DELAY_MS,
): Promise<TodoPreviewItem[]> {
  const waitMs = scenario === 'slow' ? delayMs : Math.min(delayMs, 120)
  await new Promise((resolve) => setTimeout(resolve, waitMs))

  if (scenario === 'error' && attempt === 0) {
    throw new Error('SQLITE_INTERNAL: private stack trace must never reach the page')
  }
  if (scenario === 'empty') return []
  return previewItems.map((item) => ({ ...item }))
}
