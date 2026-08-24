import { useEffect, useState } from 'react'
import { createCustomer, getCustomers } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'
import { loadCompletedDraft, missingReviewContext, saveReviewContext, type ReviewContext } from '../lib/reviewDraft.ts'
import type { CustomerRecord } from '../types/types.ts'

export default function ReviewDetailsPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const draft = loadCompletedDraft(sessionStorage)
  const [customers, setCustomers] = useState<CustomerRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [context, setContext] = useState<Partial<ReviewContext>>({})
  const [newName, setNewName] = useState('')
  const [newIdentity, setNewIdentity] = useState('')
  const [newNeed, setNewNeed] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    getCustomers().then((rows) => { if (active) { setCustomers(rows); setLoadError(false) } }).catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [reload])

  if (!draft) return <section className="rounded-2xl bg-amber-50 p-6 text-center"><h1 className="text-2xl font-black">逐字稿还没有准备好</h1><button onClick={() => onNavigate('/reviews')} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-white">返回添加逐字稿</button></section>
  if (loadError) return <ErrorState title="客户加载失败" message="暂时无法取得客户列表。" onRetry={() => { setLoadError(false); setReload((v) => v + 1) }} />
  if (!customers) return <LoadingState message="正在准备复盘信息…" />

  const missing = missingReviewContext(context)
  async function addCustomer() {
    if (!newName.trim() || !context.industry) return
    setCreating(true); setMessage('')
    try {
      const customer = await createCustomer({ name: newName.trim(), identity: newIdentity.trim() || null, coreNeed: newNeed.trim() || null, industry: context.industry })
      setCustomers((rows) => [...(rows ?? []), customer])
      setContext((current) => ({ ...current, customerId: customer.id }))
      setMode('existing'); setMessage(`已新建并自动选中客户：${customer.name}`)
    } catch { setMessage('新建客户失败，请重试。') } finally { setCreating(false) }
  }

  function proceed() {
    if (missing.length) return
    saveReviewContext(sessionStorage, context as ReviewContext)
    onNavigate('/reviews/result')
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-3xl">
      <p className="text-sm font-bold text-emerald-700">逐字稿已准备 · {draft.transcript.length} 段</p><h1 id="page-title" className="mt-2 text-3xl font-black">补充复盘信息</h1>
      <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => setMode('existing')} className={`rounded-xl p-3 font-bold ${mode === 'existing' ? 'bg-emerald-700 text-white' : 'bg-white'}`}>选择已有客户</button><button onClick={() => setMode('new')} className={`rounded-xl p-3 font-bold ${mode === 'new' ? 'bg-emerald-700 text-white' : 'bg-white'}`}>当场新建客户</button></div>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        {mode === 'existing' ? <label className="block font-semibold">客户<select aria-label="客户" value={context.customerId ?? ''} onChange={(e) => setContext({ ...context, customerId: Number(e.target.value) })} className="mt-2 w-full rounded-xl border p-3"><option value="">请选择客户</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <div className="space-y-3"><label className="block font-semibold">客户称呼<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：张国庆" className="mt-2 w-full rounded-xl border p-3 placeholder:text-slate-400" /></label><label className="block font-semibold">身份<input value={newIdentity} onChange={(e) => setNewIdentity(e.target.value)} placeholder="如：业主 / 拍板人" className="mt-2 w-full rounded-xl border p-3 placeholder:text-slate-400" /></label><label className="block font-semibold">核心需求<textarea value={newNeed} onChange={(e) => setNewNeed(e.target.value)} placeholder="如：全屋翻新，担心中途加价" className="mt-2 w-full rounded-xl border p-3 placeholder:text-slate-400" /></label><button disabled={creating || !newName.trim() || !context.industry} onClick={addCustomer} className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-40">{creating ? '新建中…' : '新建并选中'}</button></div>}
      </div>
      <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <Select label="场景标签" value={context.scene} options={['一次拜访','二次拜访','多次拜访']} onChange={(v) => setContext({ ...context, scene: v as ReviewContext['scene'] })} />
        <Select label="录音来源" value={context.recordingSource} options={['现场录音','电话录音','其他']} onChange={(v) => setContext({ ...context, recordingSource: v as ReviewContext['recordingSource'] })} />
        <Select label="语言" value={context.language} options={['普通话','中英混杂']} onChange={(v) => setContext({ ...context, language: v as ReviewContext['language'] })} />
        <Select label="行业" value={context.industry} options={['装修','教培','广告']} onChange={(v) => setContext({ ...context, industry: v as ReviewContext['industry'] })} />
      </div>
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold">{message}</p>}
      <p className="mt-4 text-sm text-amber-800">待补充：{missing.length ? missing.join('、') : '已完整，可以继续'}</p>
      <button disabled={missing.length > 0} onClick={proceed} className="mt-4 w-full rounded-xl bg-emerald-700 p-4 font-black text-white disabled:opacity-40">开始分析</button>
    </section>
  )
}

function Select({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
  return <label className="font-semibold">{label}<select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">请选择</option>{options.map((o) => <option key={o}>{o}</option>)}</select></label>
}
