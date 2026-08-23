import type { AiResult, BattlecardAggregate, CustomerRecord, IntentLevel, IntentLogRecord, Metrics, ProductRecord, ReviewReportRecord, ReviewSummaryRecord, Scores, ScriptRecord, SellingPoint, TodoRecord, Transcript, VisitRecord } from '../types/types.ts'

// 前端唯一的后端出口。后续所有请求都从这里走，便于统一加载态与错误处理（T30）。
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export interface AnalyzeRequest {
  transcript: Transcript
  selling_points?: SellingPoint[]
  profile_fields?: string[]
  industry?: string
}

export interface AnalyzeResponse {
  ok: boolean
  source: 'mock' | 'dify' | 'fallback'
  result: AiResult
  error?: string
}

/** 业务分析只请求自己的后端；Dify 地址与密钥永远不会进入浏览器。 */
export function analyzeTranscript(
  input: AnalyzeRequest,
): Promise<AnalyzeResponse> {
  return api<AnalyzeResponse>('/analyze', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getCustomers(): Promise<CustomerRecord[]> {
  return api<CustomerRecord[]>('/customers')
}

export function getCustomer(id: number): Promise<CustomerRecord> {
  return api<CustomerRecord>(`/customers?id=${id}`)
}

export function createCustomer(input: { name: string; identity?: string | null; coreNeed?: string | null; industry: string }): Promise<CustomerRecord> {
  return api<CustomerRecord>('/customers', { method: 'POST', body: JSON.stringify(input) })
}

export function saveCustomer(customer: CustomerRecord): Promise<CustomerRecord> {
  return api<CustomerRecord>('/customers', {
    method: 'POST',
    body: JSON.stringify(customer),
  })
}

export function overrideCustomerIntent(id: number, level: IntentLevel, score: number, operator: string): Promise<{ customer: CustomerRecord; log: IntentLogRecord }> {
  return api(`/customers/${id}/intent/manual`, {
    method: 'POST',
    body: JSON.stringify({ level, score, operator }),
  })
}

export function applyAutomaticIntent(id: number, level: IntentLevel, score: number): Promise<{ applied: boolean; suggestion: { level: IntentLevel; score: number }; customer: CustomerRecord }> {
  return api(`/customers/${id}/intent/auto`, {
    method: 'POST',
    body: JSON.stringify({ level, score }),
  })
}

export function getReviews(): Promise<ReviewSummaryRecord[]> {
  return api<ReviewSummaryRecord[]>('/reviews')
}

export function getProducts(): Promise<ProductRecord[]> {
  return api<ProductRecord[]>('/products')
}

export function createScript(input: { stage: string; scene: string; text: string; fromReviewId: number | null }): Promise<ScriptRecord> {
  return api<ScriptRecord>('/scripts', { method: 'POST', body: JSON.stringify(input) })
}

export interface SubmitReviewInput {
  customerId: number
  visitId: number | null
  transcript: Transcript
  metrics: Metrics
  scores: Scores
  aiResult: AiResult
  intentSuggestion: { level: IntentLevel; score: number }
}

export function submitReview(input: SubmitReviewInput): Promise<ReviewReportRecord> {
  return api<ReviewReportRecord>('/reviews/submit', { method: 'POST', body: JSON.stringify(input) })
}

export function getReviewReport(id: number): Promise<ReviewReportRecord> {
  return api<ReviewReportRecord>(`/reviews/report/${id}`)
}

export function getBattlecard(customerId: number): Promise<BattlecardAggregate> {
  return api<BattlecardAggregate>(`/battlecard/${customerId}`)
}

export function getTodos(): Promise<TodoRecord[]> { return api<TodoRecord[]>('/todos') }
export function updateTodo(id: number, values: { done?: boolean; dueDate?: string | null }): Promise<TodoRecord> {
  return api<TodoRecord>(`/todos/${id}/update`, { method: 'POST', body: JSON.stringify(values) })
}
export function scheduleVisit(input: { customerId?: number; newCustomer?: { name: string; identity?: string; coreNeed?: string; industry: string }; scene: string; scheduledAt: string }): Promise<{ customer: CustomerRecord; visit: VisitRecord }> {
  return api('/visits/schedule', { method: 'POST', body: JSON.stringify(input) })
}
