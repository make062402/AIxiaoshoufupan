import { Hono } from 'hono'
import {
  getDifyConfigStatus,
  isAuthorizedAdmin,
  persistDifyApiKey,
  validateDifyApiKey,
} from '../configStore.ts'

const config = new Hono()

config.get('/config/dify', (c) => c.json(getDifyConfigStatus()))

config.post('/config/dify', async (c) => {
  if (!process.env.CONFIG_ADMIN_TOKEN) {
    return c.json({ error: '管理员保护尚未配置，请先在后端设置 CONFIG_ADMIN_TOKEN' }, 503)
  }
  if (!isAuthorizedAdmin(c.req.header('x-admin-token'))) {
    return c.json({ error: '管理员令牌无效' }, 401)
  }

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体不是合法 JSON' }, 400) }
  const key = body && typeof body === 'object' && !Array.isArray(body)
    ? validateDifyApiKey((body as Record<string, unknown>).apiKey)
    : null
  if (!key) return c.json({ error: 'API Key 必须是 8–512 位且不能包含空白或控制字符' }, 400)

  try {
    persistDifyApiKey(key)
    return c.json(getDifyConfigStatus())
  } catch {
    return c.json({ error: '配置保存失败，请检查后端环境文件权限' }, 500)
  }
})

export default config
