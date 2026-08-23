import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { customers, needs, products, reviews, scripts, todos, visits } from '../db/schema.ts'

const battlecard = new Hono()

function positiveId(value: string): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function stageFor(reviewCount: number) {
  return reviewCount === 0 ? 'S1' : reviewCount === 1 ? 'S2' : 'S3'
}

/**
 * T41 作战包原始数据聚合。
 *
 * 这里只读取当前数据库并返回页面组装所需的原料；产品推荐、档案缺口排序等
 * 确定性业务规则留给 T42 的前端纯函数，作战包本身不落库。
 */
battlecard.get('/battlecard/:customerId', (c) => {
  const customerId = positiveId(c.req.param('customerId'))
  if (!customerId) return c.json({ error: '客户 ID 必须是正整数' }, 400)

  const customer = db.select().from(customers).where(eq(customers.id, customerId)).get()
  if (!customer) return c.json({ error: '客户不存在' }, 404)

  const customerReviews = db.select().from(reviews)
    .where(eq(reviews.customerId, customerId))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .all()
  const latestReview = customerReviews[0] ?? null
  const latestReviewUnsatisfiedNeeds = latestReview
    ? db.select().from(needs)
      .where(and(eq(needs.reviewId, latestReview.id), eq(needs.satisfied, false)))
      .orderBy(needs.id)
      .all()
    : []

  const industryProducts = customer.industry
    ? db.select().from(products).where(eq(products.industry, customer.industry)).orderBy(products.id).all()
    : []

  return c.json({
    customer,
    reviewCount: customerReviews.length,
    stage: stageFor(customerReviews.length),
    latestReview,
    latestReviewUnsatisfiedNeeds,
    products: industryProducts,
    scripts: db.select().from(scripts).orderBy(scripts.id).all(),
    todos: db.select().from(todos).where(eq(todos.customerId, customerId)).orderBy(todos.id).all(),
    visits: db.select().from(visits).where(eq(visits.customerId, customerId)).orderBy(visits.id).all(),
  })
})

export default battlecard
