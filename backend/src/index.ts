import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { analyzeTranscript, isMockEnabled, type AnalyzeInput } from './dify.ts'
import crud from './routes/crud.ts'
import intent from './routes/intent.ts'
import reviewSubmission from './routes/reviewSubmission.ts'

const app = new Hono()

// 连通性探针：T04 / T05 的验收依据，业务接口后续在 src/routes 下追加
app.get('/api/ping', (c) => c.json({ ok: true, service: 'sales-review-backend' }))

/**
 * POST /api/analyze —— 复盘分析（T09）
 *
 * 前端只调这里，密钥留在后端环境变量里（技术方案 决策三）。
 * 请求体见 mock/README.md「发给 Dify 的输入」；
 * 响应体 { ok, source, result, error? }，其中 result 恒为完整 AiResult 结构，
 * 即使分析失败也会返回空壳而非报错，避免前端白屏（风险 4.5）。
 */
app.post('/api/analyze', async (c) => {
  let body: Partial<AnalyzeInput>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: '请求体不是合法 JSON' }, 400)
  }

  if (!Array.isArray(body?.transcript) || body.transcript.length === 0) {
    return c.json({ ok: false, error: 'transcript 必填，且必须是非空数组' }, 400)
  }

  const outcome = await analyzeTranscript({
    transcript: body.transcript,
    selling_points: body.selling_points ?? [],
    profile_fields: body.profile_fields ?? [],
    industry: body.industry ?? '',
  })

  return c.json(outcome)
})

/**
 * 通用增删改查（T11）—— 挂在 /api 下，实现见 src/routes/crud.ts。
 * 必须挂在 /api/ping、/api/analyze 之后：Hono 按注册顺序匹配，
 * intent 与复盘原子提交等专用接口先注册，剩下的 /api/:table 才落到通用 CRUD。
 */
app.route('/api', intent)
app.route('/api', reviewSubmission)
app.route('/api', crud)

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`后端已启动: http://localhost:${port}/api/ping`)
  console.log(`Dify 开关: USE_MOCK=${process.env.USE_MOCK ?? '(未设置)'} → ${isMockEnabled() ? '走本地 mock，不发网络请求' : '走真实 Dify 调用，消耗额度'}`)
})
