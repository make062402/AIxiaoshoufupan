import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getCustomer, getReviews, overrideCustomerIntent, saveCustomer } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'
import UndoBanner from '../components/UndoBanner.tsx'
import { deriveCustomerStage } from '../lib/customerList.ts'
import {
  customerToProfileForm,
  getProfileItemStatuses,
  mergeProfileIntoCustomer,
  validateProfileForm,
  type CustomerProfileForm,
} from '../lib/customerProfile.ts'
import type { CustomerRecord, IntentLevel } from '../types/types.ts'

type DetailState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; customer: CustomerRecord; form: CustomerProfileForm; reviewCount: number }

export default function CustomerDetailPage({ customerId, onNavigate }: { customerId: number; onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [intentLevel, setIntentLevel] = useState<IntentLevel>('C')
  const [intentScore, setIntentScore] = useState(0)
  const [operator, setOperator] = useState('当前销售')
  const [intentSaving, setIntentSaving] = useState(false)
  const [intentMessage, setIntentMessage] = useState('')
  const [saveUndo, setSaveUndo] = useState<CustomerRecord | null>(null)
  const [intentUndo, setIntentUndo] = useState<{ level: IntentLevel; score: number } | null>(null)

  const load = useCallback(() => {
    let active = true
    Promise.all([getCustomer(customerId), getReviews()])
      .then(([customer, reviews]) => {
        if (active) {
          setState({ status: 'ready', customer, form: customerToProfileForm(customer), reviewCount: reviews.filter((review) => review.customerId === customerId).length })
          setIntentLevel(customer.intentLevel ?? 'C')
          setIntentScore(customer.intentLevel === 'B' ? Math.max(1, customer.intentScore ?? 1) : 0)
        }
      })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [customerId])

  useEffect(load, [load, requestKey])

  const statuses = useMemo(() => state.status === 'ready' ? getProfileItemStatuses(state.form) : [], [state])
  const missingCount = statuses.filter((item) => !item.filled).length
  const errors = state.status === 'ready' ? validateProfileForm(state.form) : {}

  function updateField(field: keyof CustomerProfileForm, value: string) {
    setSaved(false)
    setSaveError('')
    setState((current) => current.status === 'ready'
      ? { ...current, form: { ...current.form, [field]: value } }
      : current)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (state.status !== 'ready' || Object.keys(errors).length > 0) return
    const snapshot = state.customer
    setSaving(true)
    setSaveError('')
    setSaved(false)
    setSaveUndo(null)
    try {
      const updated = await saveCustomer(mergeProfileIntoCustomer(state.customer, state.form))
      setState((current) => current.status === 'ready'
        ? { ...current, customer: updated, form: customerToProfileForm(updated) }
        : current)
      setSaved(true)
      setSaveUndo(snapshot)
    } catch {
      setSaveError('保存失败，请检查后端服务后再试。')
    } finally {
      setSaving(false)
    }
  }

  async function undoProfileSave() {
    if (!saveUndo) return
    const snapshot = saveUndo
    setSaveUndo(null)
    setSaving(true)
    setSaveError('')
    try {
      const restored = await saveCustomer(snapshot)
      setState((current) => current.status === 'ready'
        ? { ...current, customer: restored, form: customerToProfileForm(restored) }
        : current)
      setSaved(true)
    } catch {
      setSaveError('撤销失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  async function saveIntentOverride() {
    if (state.status !== 'ready' || !operator.trim()) return
    const before = { level: state.customer.intentLevel ?? 'C', score: state.customer.intentScore ?? 0 }
    setIntentSaving(true)
    setIntentMessage('')
    setIntentUndo(null)
    try {
      const result = await overrideCustomerIntent(state.customer.id, intentLevel, intentLevel === 'B' ? intentScore : 0, operator.trim())
      setState((current) => current.status === 'ready' ? { ...current, customer: result.customer } : current)
      setIntentMessage(`已由${result.log.operator}把意向从 ${result.log.fromLevel} 调整为 ${result.log.toLevel}，并完成留痕。`)
      setIntentUndo(before)
    } catch {
      setIntentMessage('意向调整失败，客户级别和留痕均未改变。')
    } finally {
      setIntentSaving(false)
    }
  }

  async function undoIntentOverride() {
    if (!intentUndo || state.status !== 'ready') return
    const before = intentUndo
    setIntentUndo(null)
    setIntentSaving(true)
    setIntentMessage('')
    try {
      const result = await overrideCustomerIntent(state.customer.id, before.level, before.score, `${operator.trim()}（撤销）`)
      setState((current) => current.status === 'ready' ? { ...current, customer: result.customer } : current)
      setIntentLevel(before.level)
      setIntentScore(before.score)
      setIntentMessage(`已撤销，意向恢复为 ${result.log.toLevel}，并新增一条反向留痕。`)
    } catch {
      setIntentMessage('撤销失败，意向与留痕均保持当前状态。')
    } finally {
      setIntentSaving(false)
    }
  }

  if (state.status === 'loading') return <LoadingState message="正在加载客户档案…" />
  if (state.status === 'error') return (
    <ErrorState title="客户档案加载失败" message="暂时无法取得客户档案，请稍后再试。" onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />
  )

  const stage = deriveCustomerStage(state.reviewCount)
  return (
    <section aria-labelledby="page-title">
      <button type="button" onClick={() => onNavigate('/me/customers')} className="mb-5 rounded-lg text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">← 返回客户库</button>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">客户档案</p>
          <h1 id="page-title" className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{state.customer.name}</h1>
          <p className="mt-3 text-sm text-slate-500">8 项档案 · {missingCount} 项待确认</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white" aria-label={`客户阶段 ${stage}`}>{stage} · 已复盘 {state.reviewCount} 次</span>
          <a href={`/me/customers/${customerId}/battlecard`} onClick={(event) => { event.preventDefault(); onNavigate(`/me/customers/${customerId}/battlecard`) }} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">查看作战包</a>
        </div>
      </div>

      <nav aria-label="页内目录" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-700">快速跳转</h2>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="rounded-lg text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">↑ 回到顶部</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((number) => (
            <button key={number} type="button" onClick={() => document.getElementById(`profile-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
              {number}. {profileLabels[number]}
            </button>
          ))}
          <button type="button" onClick={() => document.getElementById('intent-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
            人工意向
          </button>
        </div>
      </nav>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <ProfileGroup id="profile-1" number={1} label="称呼与身份" pending={!statuses[0].filled}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="客户称呼" value={state.form.name} onChange={(value) => updateField('name', value)} error={errors.name} required />
            <Field label="身份" value={state.form.identity} onChange={(value) => updateField('identity', value)} />
          </div>
        </ProfileGroup>
        <ProfileGroup id="profile-2" number={2} label="联系方式" pending={!statuses[1].filled}><Field label="电话或微信" value={state.form.phone} onChange={(value) => updateField('phone', value)} /></ProfileGroup>
        <ProfileGroup id="profile-3" number={3} label="在采购中的角色" pending={!statuses[2].filled}><Field label="使用者 / 影响者 / 拍板人" value={state.form.role} onChange={(value) => updateField('role', value)} /></ProfileGroup>
        <ProfileGroup id="profile-4" number={4} label="预算区间" pending={!statuses[3].filled}><Field label="客户预算" value={state.form.budget} onChange={(value) => updateField('budget', value)} /></ProfileGroup>
        <ProfileGroup id="profile-5" number={5} label="核心需求与购买意向" pending={!statuses[4].filled}><Field label="核心需求" value={state.form.coreNeed} onChange={(value) => updateField('coreNeed', value)} multiline /></ProfileGroup>
        <ProfileGroup id="profile-6" number={6} label="关注维度优先级排序" pending={!statuses[5].filled}><Field label="按顺序填写价格、质量、服务、周期" value={state.form.priorityOrderText} onChange={(value) => updateField('priorityOrderText', value)} error={errors.priorityOrderText} /></ProfileGroup>
        <ProfileGroup id="profile-7" number={7} label="注意事项" pending={!statuses[6].filled}><Field label="沟通偏好、风险点或忌讳" value={state.form.notes} onChange={(value) => updateField('notes', value)} multiline /></ProfileGroup>
        <ProfileGroup id="profile-8" number={8} label="采购时间点 / 交付期限" pending={!statuses[7].filled}><Field label="客户原话时间点" value={state.form.deadline} onChange={(value) => updateField('deadline', value)} /></ProfileGroup>

        {saveError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{saveError}</p>}
        {saveUndo && <UndoBanner message="客户档案已保存，可恢复到保存前的内容。" onUndo={() => void undoProfileSave()} onDismiss={() => setSaveUndo(null)} />}
        {saved && !saveUndo && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">已保存，刷新页面仍可看到最新档案。</p>}
        <button type="submit" disabled={saving || Object.keys(errors).length > 0} className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? '保存中…' : '保存客户档案'}
        </button>
      </form>

      <section aria-labelledby="intent-title" id="intent-section" className="mt-6 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-emerald-700">人工覆盖</p>
            <h2 id="intent-title" className="mt-2 text-xl font-black">意向分级</h2>
            <p className="mt-2 text-sm text-slate-500">当前实际级别：{state.customer.intentLevel ?? 'C'} · 强度 {state.customer.intentScore ?? 0}/3{state.customer.intentManual ? ' · 已人工锁定' : ''}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">意向级别
            <select value={intentLevel} onChange={(event) => { const level = event.target.value as IntentLevel; setIntentLevel(level); setIntentScore(level === 'B' ? Math.max(1, intentScore) : 0); setIntentMessage('') }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="A">A 已成单</option><option value="B">B 中意向</option><option value="C">C 低意向</option><option value="D">D 无意向</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">意向强度
            <select value={intentScore} disabled={intentLevel !== 'B'} onChange={(event) => setIntentScore(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 disabled:opacity-50">
              {intentLevel === 'B' ? <><option value={1}>1 功能细节</option><option value={2}>2 价格</option><option value={3}>3 决策推进</option></> : <option value={0}>0</option>}
            </select>
          </label>
          <Field label="操作人" value={operator} onChange={(value) => { setOperator(value); setIntentMessage('') }} required />
        </div>
        {intentUndo && <div className="mt-4"><UndoBanner message="意向已人工调整，可撤销恢复原级别。" onUndo={() => void undoIntentOverride()} onDismiss={() => setIntentUndo(null)} /></div>}
        {intentMessage && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${intentMessage.includes('失败') ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{intentMessage}</p>}
        <button type="button" onClick={saveIntentOverride} disabled={intentSaving || !operator.trim()} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          {intentSaving ? '保存意向中…' : '确认人工调整'}
        </button>
      </section>
    </section>
  )
}

const profileLabels: Record<number, string> = {
  1: '称呼与身份',
  2: '联系方式',
  3: '在采购中的角色',
  4: '预算区间',
  5: '核心需求',
  6: '优先级排序',
  7: '注意事项',
  8: '时间点 / 期限',
}

function ProfileGroup({ id, number, label, pending, children }: { id: string; number: number; label: string; pending: boolean; children: React.ReactNode }) {
  return (
    <fieldset id={id} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <legend className="sr-only">第 {number} 项：{label}</legend>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-black"><span className="mr-2 text-emerald-700">{number}.</span>{label}</h2>
        {pending && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">待确认</span>}
      </div>
      {children}
    </fieldset>
  )
}

function Field({ label, value, onChange, error, required = false, multiline = false }: { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; multiline?: boolean }) {
  const fieldClass = `w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-amber-700/70 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 ${error ? 'border-rose-400' : 'border-slate-200'}`
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}{required && <span className="ml-1 text-rose-600">*</span>}
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="待确认" rows={3} className={`${fieldClass} mt-2 resize-y`} aria-invalid={Boolean(error)} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="待确认" className={`${fieldClass} mt-2`} aria-invalid={Boolean(error)} />
      )}
      {error && <span className="mt-2 block text-xs font-semibold text-rose-700">{error}</span>}
    </label>
  )
}
