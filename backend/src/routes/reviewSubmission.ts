import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { customers, needs, reviews, todos, visits } from '../db/schema.ts'

const reviewSubmission = new Hono()
const LEVELS = ['A', 'B', 'C', 'D'] as const
const NUMERIC_METRICS = [
  'icebreak_duration', 'interrupt_per_hour', 'customer_first_speak_at', 'sales_talk_ratio',
  'customer_question_count', 'profile_covered_count', 'open_question_count', 'total_question_count',
  'selling_point_hit_count', 'max_repeat_followup', 'need_matched_count', 'need_total_count',
  'param_error_count', 'objection_response_rate', 'objection_response_delay',
] as const

class SubmissionError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function positiveId(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validTranscript(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every((segment) => isRecord(segment)
    && (segment.speaker === 'sales' || segment.speaker === 'customer')
    && typeof segment.start === 'number' && Number.isFinite(segment.start)
    && typeof segment.end === 'number' && segment.end > segment.start
    && typeof segment.text === 'string' && segment.text.trim())
}

function validMetrics(value: unknown) {
  return isRecord(value) && NUMERIC_METRICS.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
    && typeof value.next_step_locked === 'boolean'
}

function validScores(value: unknown) {
  if (!isRecord(value)) return false
  const dimensions = ['d1', 'd2', 'd3', 'd4'] as const
  if (!dimensions.every((key) => value[key] === 0 || value[key] === 1)) return false
  return value.total === dimensions.reduce((sum, key) => sum + Number(value[key]), 0)
}

function validAiResult(value: unknown) {
  if (!isRecord(value) || !isRecord(value.counts)) return false
  if (!Array.isArray(value.needs) || !Array.isArray(value.highlights) || !Array.isArray(value.improvements)
    || !Array.isArray(value.commitments) || !Array.isArray(value.missed_points) || !Array.isArray(value.next_actions)) return false
  return value.needs.every((need) => isRecord(need) && (need.level === 'L1' || need.level === 'L2')
    && typeof need.text === 'string' && typeof need.quote === 'string' && typeof need.start === 'number' && typeof need.satisfied === 'boolean')
    && value.next_actions.every((action) => typeof action === 'string' && action.trim())
}

function validSuggestion(value: unknown): value is { level: typeof LEVELS[number]; score: number } {
  if (!isRecord(value) || !LEVELS.includes(value.level as typeof LEVELS[number]) || !Number.isInteger(value.score)) return false
  const score = Number(value.score)
  return value.level === 'B' ? score >= 1 && score <= 3 : score === 0
}

function stageFor(count: number) {
  return count === 0 ? 'S1' : count === 1 ? 'S2' : 'S3'
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function reportFor(reviewId: number) {
  const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get()
  if (!review) return null
  const customer = db.select().from(customers).where(eq(customers.id, review.customerId)).get()
  if (!customer) return null
  const reportNeeds = db.select().from(needs).where(eq(needs.reviewId, reviewId)).all()
  const reportTodos = db.select().from(todos).where(eq(todos.reviewId, reviewId)).all()
  const customerReviews = db.select().from(reviews).where(eq(reviews.customerId, review.customerId)).all()
  const allReviews = db.select().from(reviews).all()
  const totals: number[] = allReviews.flatMap((row) => typeof row.scores?.total === 'number' ? [row.scores.total] : [])
  const historicalAverage = totals.length ? Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length * 10) / 10 : null
  return { review, customer, needs: reportNeeds, todos: reportTodos, reviewCount: customerReviews.length, stage: stageFor(customerReviews.length), historicalAverage }
}

reviewSubmission.post('/reviews/submit', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体不是合法 JSON' }, 400) }
  if (!isRecord(body)) return c.json({ error: '请求体必须是对象' }, 400)
  const customerId = positiveId(body.customerId)
  const visitId = body.visitId === null || body.visitId === undefined ? null : positiveId(body.visitId)
  if (!customerId) return c.json({ error: 'customerId 必须是正整数' }, 400)
  if (body.visitId !== null && body.visitId !== undefined && !visitId) return c.json({ error: 'visitId 必须为空或正整数' }, 400)
  if (!validTranscript(body.transcript)) return c.json({ error: 'transcript 必须是合法的非空逐字稿' }, 400)
  if (!validMetrics(body.metrics)) return c.json({ error: 'metrics 缺少完整的代码计算字段' }, 400)
  if (!validScores(body.scores)) return c.json({ error: 'scores 必须是自洽的 D1-D4 与总分' }, 400)
  if (!validAiResult(body.aiResult)) return c.json({ error: 'aiResult 结构不完整' }, 400)
  if (body.intentSuggestion !== undefined && !validSuggestion(body.intentSuggestion)) return c.json({ error: 'intentSuggestion 不合法' }, 400)

  try {
    const outcome = db.transaction((tx) => {
      const customer = tx.select().from(customers).where(eq(customers.id, customerId)).get()
      if (!customer) throw new SubmissionError('客户不存在', 404)
      if (visitId) {
        const visit = tx.select().from(visits).where(and(eq(visits.id, visitId), eq(visits.customerId, customerId))).get()
        if (!visit) throw new SubmissionError('拜访不存在或不属于该客户')
      }

      const existing = tx.select().from(reviews).where(eq(reviews.customerId, customerId)).all().find((row) =>
        sameJson(row.transcript, body.transcript) && sameJson(row.metrics, body.metrics)
        && sameJson(row.scores, body.scores) && sameJson(row.aiResult, body.aiResult))
      if (existing) return { reviewId: existing.id, created: false, intentApplied: false }

      const review = tx.insert(reviews).values({
        customerId, visitId, transcript: body.transcript as never, metrics: body.metrics as never,
        scores: body.scores as never, aiResult: body.aiResult as never,
      }).returning().get()
      const aiResult = body.aiResult as { needs: Array<{ level: 'L1' | 'L2'; text: string; quote: string; start: number; satisfied: boolean }>; next_actions: string[] }
      if (aiResult.needs.length) tx.insert(needs).values(aiResult.needs.map((need) => ({
        reviewId: review.id, customerId, level: need.level, text: need.text, quote: need.quote,
        timestampSec: need.start, satisfied: need.satisfied,
      }))).run()
      if (aiResult.next_actions.length) tx.insert(todos).values(aiResult.next_actions.map((text) => ({
        reviewId: review.id, customerId, text, dueDate: null, done: false,
      }))).run()

      let intentApplied = false
      if (body.intentSuggestion && validSuggestion(body.intentSuggestion) && !customer.intentManual) {
        tx.update(customers).set({ intentLevel: body.intentSuggestion.level, intentScore: body.intentSuggestion.score }).where(eq(customers.id, customerId)).run()
        intentApplied = true
      }
      return { reviewId: review.id, created: true, intentApplied }
    })
    const report = reportFor(outcome.reviewId)
    return c.json({ ...report, created: outcome.created, intent: body.intentSuggestion ? { applied: outcome.intentApplied, suggestion: body.intentSuggestion } : null }, outcome.created ? 201 : 200)
  } catch (error) {
    if (error instanceof SubmissionError) return c.json({ error: error.message }, error.status as 400 | 404)
    console.error('[review-submit] 原子落库失败：', error)
    return c.json({ error: '复盘保存失败，reviews、needs、todos 均未写入' }, 500)
  }
})

reviewSubmission.get('/reviews/report/:id', (c) => {
  const id = positiveId(c.req.param('id'))
  if (!id) return c.json({ error: '复盘 ID 必须是正整数' }, 400)
  const report = reportFor(id)
  return report ? c.json(report) : c.json({ error: '复盘报告不存在' }, 404)
})

export default reviewSubmission
