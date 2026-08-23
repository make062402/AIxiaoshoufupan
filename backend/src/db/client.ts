/**
 * T11 —— 数据库连接（better-sqlite3 + Drizzle）
 *
 * 全进程共用一个连接实例。schema 整体传给 drizzle，
 * 使得 mode:'json' / mode:'timestamp' / mode:'boolean' 的读写转换生效。
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.ts'

const dbFile = process.env.DB_FILE ?? './data/app.db'

const sqlite = new Database(dbFile)
// 外键约束默认关闭，这里显式打开：写入非法 customer_id 时要报错而不是静默落库
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
