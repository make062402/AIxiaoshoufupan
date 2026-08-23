import { loadCompletedDraft } from '../lib/reviewDraft.ts'

export default function ReviewDetailsPlaceholder({ onNavigate }: { onNavigate: (path: string) => void }) {
  const draft = loadCompletedDraft(sessionStorage)
  if (!draft) return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center" aria-labelledby="page-title">
      <h1 id="page-title" className="text-2xl font-black">逐字稿还没有准备好</h1>
      <p className="mt-3 text-sm text-amber-900">请先完成粘贴解析或模拟上传，未完成的半成品不会被继续使用。</p>
      <button type="button" onClick={() => onNavigate('/reviews')} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">返回添加逐字稿</button>
    </section>
  )
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-emerald-700">逐字稿已准备</p>
      <h1 id="page-title" className="mt-2 text-2xl font-black">进入复盘补充信息</h1>
      <p className="mt-3 text-sm text-slate-600">已保留 {draft.transcript.length} 段完整记录，来源：{draft.source === 'paste' ? '粘贴文字' : 'Demo 模拟上传'}。</p>
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">补充信息表单将在 T35 接入。</p>
      <button type="button" onClick={() => onNavigate('/reviews')} className="mt-5 rounded-lg text-sm font-bold text-emerald-700">← 返回修改逐字稿</button>
    </section>
  )
}
