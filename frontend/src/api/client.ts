import type { AiResult, CustomerRecord, ReviewSummaryRecord, SellingPoint, Transcript } from '../types/types.ts'

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

export function getReviews(): Promise<ReviewSummaryRecord[]> {
  return api<ReviewSummaryRecord[]>('/reviews')
}
