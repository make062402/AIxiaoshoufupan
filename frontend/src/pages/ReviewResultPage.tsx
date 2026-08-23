import { useCallback, useEffect, useState } from 'react'
import { analyzeTranscript, getProducts, getReviews } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'
import { PROFILE_FIELDS } from '../config/scoring.ts'
import { buildReviewAnalysis, type ReviewAnalysis } from '../lib/reviewAnalysis.ts'
import { loadCompletedDraft, loadReviewContext } from '../lib/reviewDraft.ts'
import { savePreparedReviewResult } from '../lib/reviewResultStore.ts'
import { metricEvidenceA } from '../samples/metricEvidence.ts'
import { transcriptA } from '../samples/transcriptA.ts'
import type { AiResult, Transcript } from '../types/types.ts'

type ResultState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; analysis: ReviewAnalysis; aiResult: AiResult; average: number | null; source: 'mock' | 'dify' | 'fallback' }

const dimensions = [
  { key: 'd1', label: 'D1 开场与信任建立' },
  { key: 'd2', label: 'D2 需求挖掘' },
  { key: 'd3', label: 'D3 价值传递' },
  { key: 'd4', label: 'D4 异议处理与推进' },
] as const

const isSampleA = (transcript: Transcript) => transcript.length === transcriptA.length
  && transcript[0]?.start === transcriptA[0]?.start
  && transcript.at(-1)?.end === transcriptA.at(-1)?.end

export default function ReviewResultPage() {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<ResultState>({ status: 'loading' })

  const load = useCallback(() => {
    let active = true
    const draft = loadCompletedDraft(sessionStorage)
    const context = loadReviewContext(sessionStorage)
    if (!draft || !context) {
      Promise.resolve().then(() => { if (active) setState({ status: 'error', message: '分析输入不完整，请返回复盘入口重新准备。' }) })
      return () => { active = false }
    }
    if (!isSampleA(draft.transcript)) {
      Promise.resolve().then(() => { if (active) setState({ status: 'error', message: '当前 Demo 评分锚点仅支持样例 A，请返回并使用“填入样例 A”。' }) })
      return () => { active = false }
    }
    Promise.all([getProducts(), getReviews()]).then(async ([products, reviews]) => {
      if (!active) return
      const sellingPoints = products.filter((product) => product.industry === context.industry).flatMap((product) => product.sellingPoints)
      const response = await analyzeTranscript({
        transcript: draft.transcript,
        selling_points: sellingPoints,
        profile_fields: [...PROFILE_FIELDS],
        industry: context.industry,
      })
      if (!active) return
      const analysis = buildReviewAnalysis({ transcript: draft.transcript, sellingPoints, aiResult: response.result, evidence: metricEvidenceA })
      const totals: number[] = reviews.flatMap((review) => typeof review.scores?.total === 'number' ? [review.scores.total] : [])
      const average = totals.length ? Math.round(totals.reduce((sum, total) => sum + total, 0) / totals.length * 10) / 10 : null
      const prepared = { aiResult: response.result, analysis, historicalAverage: average, source: response.source, analyzedAt: Date.now() }
      savePreparedReviewResult(sessionStorage, prepared)
      setState({ status: 'ready', analysis, aiResult: response.result, average, source: response.source })
    }).catch(() => { if (active) setState({ status: 'error', message: '分析暂时失败，请检查本地后端后重试。' }) })
    return () => { active = false }
  }, [])

  useEffect(load, [load, requestKey])

  if (state.status === 'loading') return <LoadingState message="正在分析样例 A 并计算四维评分…" />
  if (state.status === 'error') return <ErrorState title="复盘分析失败" message={state.message} onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-5xl">
      <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">复盘概览 · {state.source === 'mock' ? '本地 Mock' : state.source}</p>
      <h1 id="page-title" className="mt-2 text-3xl font-black md:text-4xl">本次复盘得分</h1>
      {state.source === 'fallback' && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">AI 分析已使用完整默认结构，页面仍可查看代码计算结果。</p>}
      <div className="mt-6 rounded-[2rem] bg-slate-950 p-7 text-white md:p-9">
        <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-slate-300">本次总分</p><p className="mt-2 text-6xl font-black">{state.analysis.scores.total}<span className="text-2xl text-slate-400">/4</span></p></div><div className="rounded-2xl bg-white/10 px-5 py-4"><p className="text-xs text-slate-300">你的历史平均</p><p className="mt-1 text-2xl font-black">{state.average === null ? '暂无' : `${state.average}/4`}</p></div></div>
        <p className="mt-5 text-xs leading-5 text-slate-400">Demo 口径：当前数据模型没有销售 ID，历史平均暂按单一演示账号的全部 seed 复盘总分计算。</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{dimensions.map((dimension) => <article key={dimension.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{dimension.label}</p><p className="mt-3 text-4xl font-black text-emerald-700">{state.analysis.scores[dimension.key]}<span className="text-lg text-slate-400">/1</span></p></article>)}</div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">{['指标依据与原话回溯（T37）','亮点与改进（T38）','漏讲、承诺与待办（T39）'].map((text) => <div key={text} className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-semibold text-slate-500">{text}</div>)}</div>
    </section>
  )
}
