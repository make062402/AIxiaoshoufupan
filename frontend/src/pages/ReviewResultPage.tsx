import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeTranscript, createScript, getProducts, getReviewReport, getReviews, submitReview } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import BackToTop from '../components/BackToTop.tsx'
import { PROFILE_FIELDS } from '../config/scoring.ts'
import { buildReviewAnalysis, METRIC_SOURCES, type ReviewAnalysis } from '../lib/reviewAnalysis.ts'
import { loadCompletedDraft, loadReviewContext } from '../lib/reviewDraft.ts'
import { savePreparedReviewResult } from '../lib/reviewResultStore.ts'
import { formatTranscriptTime, presentMetrics, segmentMatchesEvidence, type MetricKey } from '../lib/metricPresentation.ts'
import { buildHighlightScript, EMPTY_INSIGHT_TEXT, hasEvidenceItems } from '../lib/reviewInsights.ts'
import { commitmentMeta, EMPTY_FOLLOWUP_TEXT, hasReviewItems } from '../lib/reviewFollowups.ts'
import { evaluateMetricChecks } from '../lib/scoring.ts'
import { determineIntent } from '../lib/intent.ts'
import { metricEvidenceA } from '../samples/metricEvidence.ts'
import { transcriptA } from '../samples/transcriptA.ts'
import type { AiResult, Transcript } from '../types/types.ts'

type ResultState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
    status: 'ready'; analysis: ReviewAnalysis; aiResult: AiResult; average: number | null
    source: 'mock' | 'dify' | 'fallback' | 'saved'; transcript: Transcript
    customerId: number; customerName: string | null; industry: string; scene: string
    reviewId: number | null; stage: 'S1' | 'S2' | 'S3' | null; needCount: number; todoCount: number
  }

const dimensions = [
  { key: 'd1', label: 'D1 开场与信任建立' },
  { key: 'd2', label: 'D2 需求挖掘' },
  { key: 'd3', label: 'D3 价值传递' },
  { key: 'd4', label: 'D4 异议处理与推进' },
] as const

const isSampleA = (transcript: Transcript) => transcript.length === transcriptA.length
  && transcript[0]?.start === transcriptA[0]?.start
  && transcript.at(-1)?.end === transcriptA.at(-1)?.end

export default function ReviewResultPage({ reviewId, onNavigate }: { reviewId?: number; onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<ResultState>({ status: 'loading' })
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('icebreak_duration')
  const [savingHighlight, setSavingHighlight] = useState<number | null>(null)
  const [savedHighlights, setSavedHighlights] = useState<Set<number>>(() => new Set())
  const [saveError, setSaveError] = useState('')
  const [focusedEvidenceStart, setFocusedEvidenceStart] = useState<number | null>(null)
  const savingHighlightsRef = useRef(new Set<number>())
  const savedHighlightsRef = useRef(new Set<number>())
  const [savingReview, setSavingReview] = useState(false)
  const [reviewSaveError, setReviewSaveError] = useState('')
  const [confirmingSave, setConfirmingSave] = useState(false)
  const savingReviewRef = useRef(false)

  const load = useCallback(() => {
    let active = true
    if (reviewId) {
      getReviewReport(reviewId).then((report) => {
        if (!active) return
        const analysis: ReviewAnalysis = {
          metrics: report.review.metrics,
          checks: evaluateMetricChecks(report.review.metrics),
          scores: report.review.scores,
          sources: METRIC_SOURCES,
        }
        setState({
          status: 'ready', analysis, aiResult: report.review.aiResult, average: report.historicalAverage,
          source: 'saved', transcript: report.review.transcript, customerId: report.customer.id,
          customerName: report.customer.name, industry: report.customer.industry ?? '未标注行业', scene: '已落库复盘',
          reviewId: report.review.id, stage: report.stage, needCount: report.needs.length, todoCount: report.todos.length,
        })
      }).catch(() => { if (active) setState({ status: 'error', message: '报告读取失败，请确认复盘 ID 存在并检查本地后端。' }) })
      return () => { active = false }
    }
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
      setState({
        status: 'ready', analysis, aiResult: response.result, average, source: response.source,
        transcript: draft.transcript, customerId: context.customerId, customerName: null,
        industry: context.industry, scene: context.scene, reviewId: null, stage: null, needCount: 0, todoCount: 0,
      })
    }).catch(() => { if (active) setState({ status: 'error', message: '分析暂时失败，请检查本地后端后重试。' }) })
    return () => { active = false }
  }, [reviewId])

  useEffect(load, [load, requestKey])

  if (state.status === 'loading') return <LoadingState message="正在分析样例 A 并计算四维评分…" />
  if (state.status === 'error') return <ErrorState title="复盘分析失败" message={state.message} onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />

  const metrics = presentMetrics(state.analysis, state.transcript)
  const selected = metrics.find((metric) => metric.key === selectedMetric) ?? metrics[0]
  const anchorStart = state.transcript.find((segment) => segmentMatchesEvidence(segment.start, segment.end, selected.evidence))?.start

  const selectMetric = (key: MetricKey) => {
    setFocusedEvidenceStart(null)
    setSelectedMetric(key)
    window.requestAnimationFrame(() => document.getElementById(`transcript-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }


  const locateEvidence = (start: number) => {
    setFocusedEvidenceStart(start)
    window.requestAnimationFrame(() => document.querySelector(`[data-transcript-start="${start}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const saveHighlight = async (index: number) => {
    if (savingHighlightsRef.current.has(index) || savedHighlightsRef.current.has(index)) return
    savingHighlightsRef.current.add(index)
    setSavingHighlight(index)
    setSaveError('')
    try {
      await createScript(buildHighlightScript(state.aiResult.highlights[index], { scene: state.scene, industry: state.industry }, state.reviewId))
      savedHighlightsRef.current.add(index)
      setSavedHighlights(new Set(savedHighlightsRef.current))
    } catch {
      setSaveError('话术保存失败，请检查本地后端后重试。')
    } finally {
      savingHighlightsRef.current.delete(index)
      setSavingHighlight(null)
    }
  }

  const saveReview = async () => {
    if (savingReviewRef.current || state.reviewId) return
    setConfirmingSave(false)
    savingReviewRef.current = true
    setSavingReview(true)
    setReviewSaveError('')
    const priceQuestionCount = state.transcript.filter((segment) => segment.speaker === 'customer' && /(价格|价差|报价|优惠|分期|付款|多少钱)/.test(segment.text)).length
    const suggestion = determineIntent({ priceQuestionCount })
    try {
      const report = await submitReview({
        customerId: state.customerId, visitId: null, transcript: state.transcript,
        metrics: state.analysis.metrics, scores: state.analysis.scores, aiResult: state.aiResult,
        intentSuggestion: { level: suggestion.level, score: suggestion.score },
      })
      onNavigate(`/reviews/report/${report.review.id}`)
    } catch {
      setReviewSaveError('复盘保存失败，三张业务表均未写入，请检查后端后重试。')
    } finally {
      savingReviewRef.current = false
      setSavingReview(false)
    }
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-5xl">
      <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">复盘概览 · {state.source === 'mock' ? '本地 Mock' : state.source === 'saved' ? '已落库报告' : state.source}</p>
      <h1 id="page-title" className="mt-2 text-3xl font-black md:text-4xl">本次复盘得分</h1>
      {state.source === 'fallback' && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">AI 分析已使用完整默认结构，页面仍可查看代码计算结果。</p>}
      <div className="mt-6 rounded-[2rem] bg-slate-950 p-7 text-white md:p-9">
        <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-slate-300">本次总分</p><p className="mt-2 text-6xl font-black">{state.analysis.scores.total}<span className="text-2xl text-slate-400">/4</span></p></div><div className="rounded-2xl bg-white/10 px-5 py-4"><p className="text-xs text-slate-300">你的历史平均</p><p className="mt-1 text-2xl font-black">{state.average === null ? '暂无' : `${state.average}/4`}</p></div></div>
        <p className="mt-5 text-xs leading-5 text-slate-400">Demo 口径：当前数据模型没有销售 ID，历史平均暂按单一演示账号的全部 seed 复盘总分计算。</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{dimensions.map((dimension) => <article key={dimension.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">{dimension.label}</p><p className="mt-3 text-4xl font-black text-emerald-700">{state.analysis.scores[dimension.key]}<span className="text-lg text-slate-400">/1</span></p></article>)}</div>
      {reviewSaveError && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">{reviewSaveError}</p>}
      {state.reviewId ? <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="font-black text-emerald-900">报告 #{state.reviewId} 已保存 · {state.customerName} · {state.stage}</p><p className="mt-2 text-sm text-emerald-800">数据库已恢复 {state.needCount} 条需求和 {state.todoCount} 条待办；刷新当前 URL 仍可查看完整报告。</p></div> : <button type="button" disabled={savingReview} onClick={() => setConfirmingSave(true)} className="mt-5 w-full rounded-2xl bg-emerald-700 px-6 py-4 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-emerald-300">{savingReview ? '正在原子保存…' : '保存复盘报告'}</button>}
      <nav aria-label="页内目录" className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-700">快速跳转</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { id: 'evidence-section', label: '指标依据与回溯' },
            { id: 'insights-section', label: '亮点与改进点' },
            { id: 'followup-section', label: '漏讲、承诺与待办' },
          ].map((section) => (
            <button key={section.id} type="button" onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
              {section.label}
            </button>
          ))}
        </div>
      </nav>
      <section aria-labelledby="evidence-title" id="evidence-section" className="mt-8 scroll-mt-28">
        <div><p className="text-sm font-bold text-emerald-700">评分不是黑盒</p><h2 id="evidence-title" className="mt-1 text-2xl font-black">指标依据与原话回溯</h2></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div className="space-y-4">
            {dimensions.map((dimension) => <details key={dimension.key} open className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer font-black">{dimension.label} · {state.analysis.scores[dimension.key]}/1 · 查看依据</summary>
              <div className="mt-3 space-y-2">{metrics.filter((metric) => metric.dimension === dimension.key).map((metric) => <button id={`metric-${metric.key}`} key={metric.key} type="button" onClick={() => selectMetric(metric.key)} className={`w-full rounded-xl border p-3 text-left transition ${selectedMetric === metric.key ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'}`}>
                <span className="flex items-start justify-between gap-3"><span className="font-bold">{metric.name}</span><span className={`rounded-full px-2 py-1 text-xs font-black ${metric.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{metric.passed ? '达标' : '未达标'}</span></span>
                <span className="mt-2 block text-sm text-slate-600">实测：{metric.value}</span><span className="block text-sm text-slate-600">门槛：{metric.threshold}</span><span className="mt-1 block text-xs font-bold uppercase tracking-wide text-slate-400">来源：{metric.source}</span>
              </button>)}</div>
            </details>)}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5">
            <div className="border-b border-slate-200 pb-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">当前指标 · {selected.name}</p><p className="mt-2 text-sm text-slate-600">{selected.evidence.explanation}</p><p className="mt-1 text-xs text-slate-400">证据范围：{formatTranscriptTime(selected.evidence.start)}{selected.evidence.kind !== 'point' ? ` 至 ${formatTranscriptTime(selected.evidence.end)}` : ''}</p></div>
            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1" aria-label="逐字稿原话">
              {state.transcript.map((segment) => {
                const highlighted = segmentMatchesEvidence(segment.start, segment.end, selected.evidence)
                const evidenceFocused = segment.start === focusedEvidenceStart
                return <article data-transcript-start={segment.start} id={highlighted && segment.start === anchorStart ? `transcript-${selected.key}` : undefined} key={`${segment.start}-${segment.speaker}`} className={`scroll-mt-24 rounded-xl border p-3 ${highlighted || evidenceFocused ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200' : 'border-transparent bg-slate-50'}`}>
                  <p className="text-xs font-bold text-slate-500">{formatTranscriptTime(segment.start)} · {segment.speaker === 'sales' ? '销售' : '客户'}</p><p className="mt-1 text-sm leading-6 text-slate-800">{segment.text}</p>
                </article>
              })}
            </div>
            <button type="button" onClick={() => document.getElementById(`metric-${selected.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold lg:hidden">返回当前指标</button>
          </div>
        </div>
      </section>
      <section aria-labelledby="insights-title" id="insights-section" className="mt-8 scroll-mt-28">
        <p className="text-sm font-bold text-emerald-700">把有效经验留下来</p><h2 id="insights-title" className="mt-1 text-2xl font-black">亮点与改进点</h2>
        {saveError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{saveError}</p>}
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"><h3 className="text-lg font-black text-emerald-900">本次亮点</h3>
            {!hasEvidenceItems(state.aiResult.highlights) ? <p className="mt-4 text-sm text-slate-500">{EMPTY_INSIGHT_TEXT}</p> : <div className="mt-4 space-y-3">{state.aiResult.highlights.map((item, index) => <article key={`${item.start}-${item.text}`} className="rounded-xl bg-white p-4 shadow-sm"><p className="font-bold text-slate-900">{item.text}</p>{item.quote && <blockquote className="mt-2 border-l-4 border-emerald-300 pl-3 text-sm leading-6 text-slate-600">“{item.quote}”</blockquote>}{typeof item.start === 'number' && <p className="mt-2 text-xs font-bold text-emerald-700">{formatTranscriptTime(item.start)}</p>}<button type="button" disabled={savingHighlight === index || savedHighlights.has(index)} onClick={() => void saveHighlight(index)} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-emerald-300">{savedHighlights.has(index) ? '已保存' : savingHighlight === index ? '保存中…' : '存入话术库'}</button></article>)}</div>}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5"><h3 className="text-lg font-black text-amber-950">改进点</h3>
            {!hasEvidenceItems(state.aiResult.improvements) ? <p className="mt-4 text-sm text-slate-500">{EMPTY_INSIGHT_TEXT}</p> : <div className="mt-4 space-y-3">{state.aiResult.improvements.map((item) => <article key={`${item.start}-${item.text}`} className="rounded-xl bg-white p-4 shadow-sm"><p className="font-bold text-slate-900">{item.text}</p>{item.quote && <blockquote className="mt-2 border-l-4 border-amber-300 pl-3 text-sm leading-6 text-slate-600">“{item.quote}”</blockquote>}{typeof item.start === 'number' && <p className="mt-2 text-xs font-bold text-amber-800">{formatTranscriptTime(item.start)}</p>}</article>)}</div>}
          </div>
        </div>
      </section>
      <section aria-labelledby="followup-title" id="followup-section" className="mt-8 scroll-mt-28">
        <p className="text-sm font-bold text-emerald-700">把风险和行动说清楚</p><h2 id="followup-title" className="mt-1 text-2xl font-black">漏讲错讲、承诺与待办</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5"><h3 className="text-lg font-black text-rose-950">漏讲错讲</h3>
            {!hasReviewItems(state.aiResult.missed_points) ? <p className="mt-4 text-sm text-slate-500">{EMPTY_FOLLOWUP_TEXT}</p> : <div className="mt-4 space-y-3">{state.aiResult.missed_points.map((item) => <article key={`${item.start}-${item.text}`} className="rounded-xl bg-white p-4 shadow-sm"><p className="font-bold">{item.text}</p>{item.quote && <blockquote className="mt-2 border-l-4 border-rose-300 pl-3 text-sm leading-6 text-slate-600">“{item.quote}”</blockquote>}{typeof item.start === 'number' && <button type="button" onClick={() => locateEvidence(item.start as number)} className="mt-3 text-sm font-bold text-rose-700 underline decoration-2 underline-offset-4">回溯原话 · {formatTranscriptTime(item.start)}</button>}</article>)}</div>}
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5"><h3 className="text-lg font-black text-sky-950">承诺清单</h3>
            {!hasReviewItems(state.aiResult.commitments) ? <p className="mt-4 text-sm text-slate-500">{EMPTY_FOLLOWUP_TEXT}</p> : <div className="mt-4 space-y-3">{state.aiResult.commitments.map((item) => <article key={`${item.start}-${item.text}`} className="rounded-xl bg-white p-4 shadow-sm"><p className="font-bold">{item.text}</p>{commitmentMeta(item).map((meta) => <p key={meta} className="mt-2 text-xs font-bold text-sky-700">{meta}</p>)}</article>)}</div>}
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5"><h3 className="text-lg font-black text-violet-950">下一步待办草稿</h3><p className="mt-1 text-xs text-violet-700">尚未写入待办，统一在保存复盘时落库。</p>
            {!hasReviewItems(state.aiResult.next_actions) ? <p className="mt-4 text-sm text-slate-500">{EMPTY_FOLLOWUP_TEXT}</p> : <ol className="mt-4 space-y-3">{state.aiResult.next_actions.map((action, index) => <li key={action} className="flex gap-3 rounded-xl bg-white p-4 shadow-sm"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-black text-violet-800">{index + 1}</span><span className="text-sm font-semibold leading-6">{action}</span></li>)}</ol>}
          </div>
        </div>
      </section>
      <ConfirmDialog
        open={confirmingSave}
        title="确认保存复盘报告"
        description={`将把本次复盘连同 ${state.aiResult.needs.length} 条需求、${state.aiResult.next_actions.length} 条待办原子写入数据库。保存后页面会跳转到稳定报告地址，保存过程不可撤销；如需改动，请重新提交复盘。`}
        confirmLabel="确认保存"
        onConfirm={() => void saveReview()}
        onCancel={() => setConfirmingSave(false)}
      />
      <BackToTop />
    </section>
  )
}
