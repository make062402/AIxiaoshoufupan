import { loadCompletedDraft, loadReviewContext } from '../lib/reviewDraft.ts'
export default function ReviewResultPlaceholder() {
  const draft = loadCompletedDraft(sessionStorage); const context = loadReviewContext(sessionStorage)
  return <section className="rounded-2xl bg-white p-6"><h1 className="text-2xl font-black">分析输入已准备</h1><p className="mt-3 text-slate-600">客户 ID：{context?.customerId ?? '缺失'} · 逐字稿：{draft?.transcript.length ?? 0} 段</p><p className="mt-3 text-sm text-slate-500">T36 才会调用分析接口并展示评分，本任务尚未落 reviews。</p></section>
}
