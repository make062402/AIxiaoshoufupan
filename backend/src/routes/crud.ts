/**
 * T11 —— 通用增删改查接口
 *
 *   GET    /api/:table          列表，返回数组
 *   GET    /api/:table?id=xxx   详情，返回单个对象（找不到 → 404）
 *   POST   /api/:table          body 带 id 更新，不带 id 新增
 *   DELETE /api/:table/:id      按 id 删除
 *
 * 【技术方案 决策二】后端不承载业务语义。
 * 本文件只做表级读写：不算 S1/S2/S3、不算意向分级、不过滤 satisfied、不做任何聚合。
 * 这些属于前端计算层与 T39 作战包接口。
 *
 * 【安全】URL 里的表名永远不拼进 SQL。
 * 下面的 TABLES 映射同时充当白名单与查询入口：
 * 只有映射里的 8 个键能拿到 Drizzle 表对象，其余一律 400。
 */
import { Hono } from 'hono'
import { eq, getTableColumns } from 'drizzle-orm'
import { db } from '../db/client.ts'
import {
  customers,
  intentLogs,
  visits,
  reviews,
  needs,
  products,
  todos,
  scripts,
} from '../db/schema.ts'

/** 表名白名单 + 查询入口：键是 URL 里允许出现的表名，值是 Drizzle 表对象 */
const TABLES = {
  customers,
  intent_logs: intentLogs,
  visits,
  reviews,
  needs,
  products,
  todos,
  scripts,
} as const

type TableName = keyof typeof TABLES
type AnyTable = (typeof TABLES)[TableName]

const ALLOWED = Object.keys(TABLES) as TableName[]

function resolveTable(name: string): AnyTable | null {
  return Object.prototype.hasOwnProperty.call(TABLES, name)
    ? TABLES[name as TableName]
    : null
}

/** id 必须是正整数（8 张表主键都是 integer autoIncrement） */
function parseId(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * 把 JSON body 规整成 Drizzle 能吃的值。
 *
 * 做三件事，其余一律原样透传：
 * 1. 丢弃不属于该表的键 —— 防止前端多传字段直接把 SQL 打挂；
 * 2. mode:'timestamp' 的列在 Drizzle 里 dataType 是 'date'，运行时要求 Date 实例，
 *    而 HTTP 传过来只能是数字或字符串，这里补一次转换（数字按「秒」解释，与建表约定一致）；
 * 3. mode:'boolean' 的列容忍 0/1 与 "true"/"false"。
 *
 * ※ mode:'json' 的列（priority_order / transcript / metrics / scores /
 *    ai_result / params / selling_points / objections）不在这里做任何处理：
 *    Drizzle 自己负责 JSON.stringify / JSON.parse，手工再序列化一次会存成被转义的字符串。
 */
function coerceValues(table: AnyTable, body: Record<string, unknown>) {
  const columns = getTableColumns(table) as Record<string, { dataType: string }>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    const column = columns[key]
    if (!column) continue // 未知字段，静默丢弃

    if (value === null || value === undefined) {
      out[key] = value
      continue
    }

    if (column.dataType === 'date' && !(value instanceof Date)) {
      const ms = typeof value === 'number' ? value * 1000 : Date.parse(String(value))
      if (Number.isNaN(ms)) {
        throw new BadRequest(`字段 ${key} 不是合法时间：期望 Unix 秒或可解析的日期字符串`)
      }
      out[key] = new Date(ms)
      continue
    }

    if (column.dataType === 'boolean' && typeof value !== 'boolean') {
      out[key] = value === 1 || value === '1' || value === 'true'
      continue
    }

    out[key] = value
  }

  return out
}

/** 用于把「可读的用户错误」和「内部异常」区分开 */
class BadRequest extends Error {}

const crud = new Hono()

/** 所有路由共用的表名解析；命中白名单外的表名 → 400 且带上合法表名列表 */
function requireTable(name: string): AnyTable {
  const table = resolveTable(name)
  if (!table) {
    throw new BadRequest(`未知的表名: ${name}`)
  }
  return table
}

/** GET /api/:table  与  GET /api/:table?id=xxx */
crud.get('/:table', (c) => {
  const name = c.req.param('table')
  const table = requireTable(name)
  const idRaw = c.req.query('id')

  if (idRaw !== undefined) {
    const id = parseId(idRaw)
    if (id === null) return c.json({ error: `非法的 id: ${idRaw}` }, 400)

    const rows = db.select().from(table).where(eq(table.id, id)).all()
    if (rows.length === 0) {
      return c.json({ error: `${name} 中不存在 id=${id} 的记录` }, 404)
    }
    return c.json(rows[0])
  }

  return c.json(db.select().from(table).all())
})

/** POST /api/:table —— 带 id 更新，不带 id 新增；均返回落库后的完整记录 */
crud.post('/:table', async (c) => {
  const name = c.req.param('table')
  const table = requireTable(name)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '请求体不是合法 JSON' }, 400)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return c.json({ error: '请求体必须是一个对象' }, 400)
  }

  const raw = body as Record<string, unknown>
  const hasId = raw.id !== undefined && raw.id !== null
  const values = coerceValues(table, raw)
  delete values.id // 主键不参与写入：更新时它是条件，新增时由自增列生成

  if (hasId) {
    const id = parseId(String(raw.id))
    if (id === null) return c.json({ error: `非法的 id: ${String(raw.id)}` }, 400)
    if (Object.keys(values).length === 0) {
      return c.json({ error: '更新请求里没有任何可写字段' }, 400)
    }

    const updated = db.update(table).set(values).where(eq(table.id, id)).returning().all()
    if (updated.length === 0) {
      return c.json({ error: `${name} 中不存在 id=${id} 的记录` }, 404)
    }
    return c.json(updated[0])
  }

  const inserted = db.insert(table).values(values as never).returning().all()
  return c.json(inserted[0], 201)
})

/** DELETE /api/:table/:id */
crud.delete('/:table/:id', (c) => {
  const name = c.req.param('table')
  const table = requireTable(name)

  const id = parseId(c.req.param('id'))
  if (id === null) return c.json({ error: `非法的 id: ${c.req.param('id')}` }, 400)

  const deleted = db.delete(table).where(eq(table.id, id)).returning().all()
  if (deleted.length === 0) {
    return c.json({ error: `${name} 中不存在 id=${id} 的记录` }, 404)
  }
  return c.json({ ok: true, deleted: deleted[0] })
})

/**
 * 兜底错误处理：任何异常都转成可读 JSON，不返回 HTML 错误页、不吐 SQL 原文与堆栈。
 * 原始错误只打到服务端日志，方便自己排查。
 */
crud.onError((err, c) => {
  if (err instanceof BadRequest) {
    return c.json({ error: err.message, allowed: ALLOWED }, 400)
  }
  console.error('[crud] 未预期的错误：', err)
  return c.json({ error: '服务端处理该请求时出错，详情见后端日志' }, 500)
})

export default crud
