import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

// 连通性探针：T04 / T05 的验收依据，业务接口后续在 src/routes 下追加
app.get('/api/ping', (c) => c.json({ ok: true, service: 'sales-review-backend' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`后端已启动: http://localhost:${port}/api/ping`)
})
