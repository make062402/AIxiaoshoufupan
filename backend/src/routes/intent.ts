import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { customers, intentLogs } from '../db/schema.ts'

const intent = new Hono()
const LEVELS = ['A', 'B', 'C', 'D'] as const
type IntentLevel = typeof LEVELS[number]

function validId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function validSuggestion(value: unknown): value is { level: IntentLevel; score: number } {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  if (!LEVELS.includes(input.level as IntentLevel)) return false
  if (!Number.isInteger(input.score) || Number(input.score) < 0 || Number(input.score) > 3) return false
  return input.level === 'B' ? Number(input.score) >= 1 : Number(input.score) === 0
}

intent.post('/customers/:id/intent/manual', async (c) => {
  const customerId = validId(c.req.param('id'))
  if (customerId === null) return c.json({ error: '客户 ID 必须是正整数' }, 400)

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体不是合法 JSON' }, 400) }
  const raw = body as Record<string, unknown>
  const operator = typeof raw.operator === 'string' ? raw.operator.trim() : ''
  if (!validSuggestion(raw)) return c.json({ error: '意向级别或强度分不合法：B 为 1-3 分，其余级别为 0 分' }, 400)
  const input = raw
  if (!operator) return c.json({ error: '操作人不能为空' }, 400)

  try {
    const result = db.transaction((tx) => {
      const current = tx.select().from(customers).where(eq(customers.id, customerId)).get()
      if (!current) return null
      const updated = tx.update(customers).set({
        intentLevel: input.level,
        intentScore: input.score,
        intentManual: true,
      }).where(eq(customers.id, customerId)).returning().get()
      const log = tx.insert(intentLogs).values({
        customerId,
        fromLevel: current.intentLevel ?? 'C',
        toLevel: input.level,
        operator,
      }).returning().get()
      return { customer: updated, log }
    })
    if (!result) return c.json({ error: '客户不存在' }, 404)
    return c.json(result)
  } catch (error) {
    console.error('[intent] 人工覆盖事务失败：', error)
    return c.json({ error: '意向调整保存失败，客户资料未发生变化' }, 500)
  }
})

intent.post('/customers/:id/intent/auto', async (c) => {
  const customerId = validId(c.req.param('id'))
  if (customerId === null) return c.json({ error: '客户 ID 必须是正整数' }, 400)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体不是合法 JSON' }, 400) }
  if (!validSuggestion(body)) return c.json({ error: '系统建议的级别或强度分不合法' }, 400)

  const suggestion = body
  const current = db.select().from(customers).where(eq(customers.id, customerId)).get()
  if (!current) return c.json({ error: '客户不存在' }, 404)
  if (current.intentManual) return c.json({ applied: false, suggestion, customer: current })

  const updated = db.update(customers).set({
    intentLevel: suggestion.level,
    intentScore: suggestion.score,
  }).where(eq(customers.id, customerId)).returning().get()
  return c.json({ applied: true, suggestion, customer: updated })
})

export default intent
