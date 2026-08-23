import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { customers, todos, visits } from '../db/schema.ts'

const tasks = new Hono()
const SCENES = ['一次拜访', '二次拜访', '多次拜访'] as const
const positiveId = (value: unknown) => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const validDate = (value: unknown) => {
  if (value === null) return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

tasks.post('/todos/:id/update', async (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return c.json({ error: '待办 ID 必须是正整数' }, 400)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体不是合法 JSON' }, 400) }
  if (!isRecord(body)) return c.json({ error: '请求体必须是对象' }, 400)
  const values: { done?: boolean; dueDate?: string | null } = {}
  if ('done' in body) {
    if (typeof body.done !== 'boolean') return c.json({ error: 'done 必须是布尔值' }, 400)
    values.done = body.done
  }
  if ('dueDate' in body) {
    if (!validDate(body.dueDate)) return c.json({ error: 'dueDate 必须为空或 YYYY-MM-DD' }, 400)
    values.dueDate = body.dueDate as string | null
  }
  if (!Object.keys(values).length) return c.json({ error: '至少提供 done 或 dueDate' }, 400)
  const updated = db.update(todos).set(values).where(eq(todos.id, id)).returning().get()
  return updated ? c.json(updated) : c.json({ error: '待办不存在' }, 404)
})

tasks.post('/visits/schedule', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体不是合法 JSON' }, 400) }
  if (!isRecord(body)) return c.json({ error: '请求体必须是对象' }, 400)
  if (!SCENES.includes(body.scene as typeof SCENES[number])) return c.json({ error: `scene 必须是：${SCENES.join('、')}` }, 400)
  const scheduledAt = new Date(String(body.scheduledAt ?? ''))
  if (Number.isNaN(scheduledAt.getTime())) return c.json({ error: 'scheduledAt 必须是合法日期时间' }, 400)
  const existingId = body.customerId === undefined || body.customerId === null ? null : positiveId(body.customerId)
  const newCustomer = isRecord(body.newCustomer) ? body.newCustomer : null
  if ((existingId ? 1 : 0) + (newCustomer ? 1 : 0) !== 1) return c.json({ error: '必须且只能选择已有客户或新建客户' }, 400)
  if (newCustomer && (typeof newCustomer.name !== 'string' || !newCustomer.name.trim() || typeof newCustomer.industry !== 'string' || !newCustomer.industry.trim())) return c.json({ error: '新客户称呼和行业必填' }, 400)

  try {
    const result = db.transaction((tx) => {
      let customer = existingId ? tx.select().from(customers).where(eq(customers.id, existingId)).get() : null
      if (existingId && !customer) throw new Error('CUSTOMER_NOT_FOUND')
      if (newCustomer) customer = tx.insert(customers).values({
        name: String(newCustomer.name).trim(), industry: String(newCustomer.industry).trim(),
        identity: typeof newCustomer.identity === 'string' ? newCustomer.identity.trim() || null : null,
        coreNeed: typeof newCustomer.coreNeed === 'string' ? newCustomer.coreNeed.trim() || null : null,
        intentManual: false,
      }).returning().get()
      const visit = tx.insert(visits).values({ customerId: customer!.id, scheduledAt, status: '待拜访', scene: body.scene as typeof SCENES[number] }).returning().get()
      return { customer, visit }
    })
    return c.json(result, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'CUSTOMER_NOT_FOUND') return c.json({ error: '客户不存在' }, 404)
    console.error('[visit-schedule] 创建失败：', error)
    return c.json({ error: '拜访日程创建失败' }, 500)
  }
})

export default tasks
