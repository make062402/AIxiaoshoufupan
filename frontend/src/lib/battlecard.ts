import type { BattlecardAggregate, NeedRecord, ProductRecord, SellingPoint } from '../types/types.ts'

export const BATTLECARD_SCRIPT_STAGES = ['开场破冰', '需求确认', '方案呈现', '异议处理', '下一步锁定'] as const
export type BattlecardScriptStage = typeof BATTLECARD_SCRIPT_STAGES[number]

interface ProfileDefinition {
  number: number
  label: string
  priority: 'high' | 'medium'
  value: (input: BattlecardAggregate) => string | string[] | null
}

const PROFILE_DEFINITIONS: ProfileDefinition[] = [
  { number: 1, label: '称呼与身份', priority: 'high', value: ({ customer }) => [customer.name, customer.identity].filter(Boolean).join(' · ') || null },
  { number: 2, label: '联系方式', priority: 'high', value: ({ customer }) => customer.phone },
  { number: 3, label: '在采购中的角色', priority: 'high', value: ({ customer }) => customer.role },
  { number: 4, label: '预算区间', priority: 'high', value: ({ customer }) => customer.budget },
  { number: 5, label: '核心需求与购买意向', priority: 'high', value: ({ customer }) => customer.coreNeed },
  { number: 6, label: '关注维度优先级排序', priority: 'medium', value: ({ customer }) => customer.priorityOrder },
  { number: 7, label: '注意事项', priority: 'medium', value: ({ customer }) => customer.notes },
  { number: 8, label: '采购时间点 / 交付期限', priority: 'high', value: ({ customer }) => customer.deadline },
]

const hasValue = (value: string | string[] | null) => Array.isArray(value) ? value.length > 0 : Boolean(value?.trim())
const cheapestFirst = (left: ProductRecord, right: ProductRecord) =>
  (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY) || left.id - right.id

function matchedSellingPoints(product: ProductRecord, need: NeedRecord): SellingPoint[] {
  const haystack = `${need.text ?? ''} ${need.quote ?? ''}`.toLocaleLowerCase('zh-CN')
  return product.sellingPoints.filter((point) => point.match_keywords.some((keyword) =>
    keyword.trim() && haystack.includes(keyword.trim().toLocaleLowerCase('zh-CN'))))
}

interface RankedProduct {
  product: ProductRecord
  matchedNeeds: NeedRecord[]
  sellingPoints: SellingPoint[]
  bestLevel: 'L1' | 'L2'
  mentionCount: number
}

function rankMatchedProducts(products: ProductRecord[], needs: NeedRecord[]): RankedProduct[] {
  const ranked: RankedProduct[] = []
  for (const product of products) {
    const matches = needs.flatMap((need) => {
      const points = matchedSellingPoints(product, need)
      return points.length && (need.level === 'L1' || need.level === 'L2') ? [{ need, points }] : []
    })
    if (!matches.length) continue
    const bestLevel = matches.some(({ need }) => need.level === 'L1') ? 'L1' : 'L2'
    const bestMatches = matches.filter(({ need }) => need.level === bestLevel)
    ranked.push({
      product,
      matchedNeeds: matches.map(({ need }) => need),
      sellingPoints: [...new Map(matches.flatMap(({ points }) => points).map((point) => [`${point.tag}\u0000${point.script}`, point])).values()],
      bestLevel,
      mentionCount: bestMatches.length,
    })
  }
  return ranked.sort((left, right) =>
    (left.bestLevel === right.bestLevel ? 0 : left.bestLevel === 'L1' ? -1 : 1)
    || right.mentionCount - left.mentionCount
    || left.product.id - right.product.id)
}

export function buildBattlecard(input: BattlecardAggregate) {
  const profileFields = PROFILE_DEFINITIONS.map((definition) => {
    const value = definition.value(input)
    return { ...definition, value, missing: !hasValue(value) }
  })
  const mustCollect = profileFields
    .filter((field) => field.missing)
    .sort((left, right) => (left.priority === right.priority ? left.number - right.number : left.priority === 'high' ? -1 : 1))
    .slice(0, 3)

  const scriptsByStage = BATTLECARD_SCRIPT_STAGES.map((stage) => ({
    stage,
    scripts: input.scripts.filter((script) => script.stage === stage).sort((left, right) => left.id - right.id),
  }))
  const invalidScripts = input.scripts.filter((script) => !BATTLECARD_SCRIPT_STAGES.includes(script.stage as BattlecardScriptStage))

  const lowPriceProducts = [...input.products].sort(cheapestFirst)
  const ranked = input.stage === 'S1' ? [] : rankMatchedProducts(input.products, input.latestReviewUnsatisfiedNeeds)
  const selected: Array<RankedProduct & { source: 'matched' | 'fallback' }> = ranked
    .slice(0, 2)
    .map((item) => ({ ...item, source: 'matched' }))
  for (const product of lowPriceProducts) {
    if (selected.length >= 2) break
    if (selected.some((item) => item.product.id === product.id)) continue
    selected.push({
      product,
      matchedNeeds: [],
      sellingPoints: product.sellingPoints,
      bestLevel: 'L2',
      mentionCount: 0,
      source: 'fallback' as const,
    })
  }

  const aiResult = input.latestReview?.aiResult
  return {
    customer: {
      record: input.customer,
      stage: input.stage,
      reviewCount: input.reviewCount,
      profileFields,
      riskNote: input.customer.notes,
    },
    goals: {
      mustCollect,
      unsatisfiedNeeds: input.latestReviewUnsatisfiedNeeds,
      nextActions: aiResult?.next_actions ?? [],
      improvements: aiResult?.improvements ?? [],
      missedPoints: aiResult?.missed_points ?? [],
      todos: input.todos,
      visits: input.visits,
    },
    negotiation: { stages: scriptsByStage, invalidScripts },
    recommendations: selected.map(({ product, matchedNeeds, sellingPoints, bestLevel, mentionCount, source }) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      params: product.params,
      sellingPoints,
      objections: product.objections,
      matchedNeeds,
      matchedLevel: source === 'matched' ? bestLevel : null,
      mentionCount,
      source,
    })),
  }
}

export type BattlecardViewModel = ReturnType<typeof buildBattlecard>
