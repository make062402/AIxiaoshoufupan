import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getCustomer, getReviews, saveCustomer } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'
import { deriveCustomerStage } from '../lib/customerList.ts'
import {
  customerToProfileForm,
  getProfileItemStatuses,
  mergeProfileIntoCustomer,
  validateProfileForm,
  type CustomerProfileForm,
} from '../lib/customerProfile.ts'
import type { CustomerRecord } from '../types/types.ts'

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

  const load = useCallback(() => {
    let active = true
    Promise.all([getCustomer(customerId), getReviews()])
      .then(([customer, reviews]) => {
        if (active) setState({
          status: 'ready',
          customer,
          form: customerToProfileForm(customer),
          reviewCount: reviews.filter((review) => review.customerId === customerId).length,
        })
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
    setSaving(true)
    setSaveError('')
    setSaved(false)
    try {
      const updated = await saveCustomer(mergeProfileIntoCustomer(state.customer, state.form))
      setState((current) => current.status === 'ready'
        ? { ...current, customer: updated, form: customerToProfileForm(updated) }
        : current)
      setSaved(true)
    } catch {
      setSaveError('保存失败，请检查后端服务后再试。')
    } finally {
      setSaving(false)
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
        <span className="rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white" aria-label={`客户阶段 ${stage}`}>{stage} · 已复盘 {state.reviewCount} 次</span>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <ProfileGroup number={1} label="称呼与身份" pending={!statuses[0].filled}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="客户称呼" value={state.form.name} onChange={(value) => updateField('name', value)} error={errors.name} required />
            <Field label="身份" value={state.form.identity} onChange={(value) => updateField('identity', value)} />
          </div>
        </ProfileGroup>
        <ProfileGroup number={2} label="联系方式" pending={!statuses[1].filled}><Field label="电话或微信" value={state.form.phone} onChange={(value) => updateField('phone', value)} /></ProfileGroup>
        <ProfileGroup number={3} label="在采购中的角色" pending={!statuses[2].filled}><Field label="使用者 / 影响者 / 拍板人" value={state.form.role} onChange={(value) => updateField('role', value)} /></ProfileGroup>
        <ProfileGroup number={4} label="预算区间" pending={!statuses[3].filled}><Field label="客户预算" value={state.form.budget} onChange={(value) => updateField('budget', value)} /></ProfileGroup>
        <ProfileGroup number={5} label="核心需求与购买意向" pending={!statuses[4].filled}><Field label="核心需求" value={state.form.coreNeed} onChange={(value) => updateField('coreNeed', value)} multiline /></ProfileGroup>
        <ProfileGroup number={6} label="关注维度优先级排序" pending={!statuses[5].filled}><Field label="按顺序填写价格、质量、服务、周期" value={state.form.priorityOrderText} onChange={(value) => updateField('priorityOrderText', value)} error={errors.priorityOrderText} /></ProfileGroup>
        <ProfileGroup number={7} label="注意事项" pending={!statuses[6].filled}><Field label="沟通偏好、风险点或忌讳" value={state.form.notes} onChange={(value) => updateField('notes', value)} multiline /></ProfileGroup>
        <ProfileGroup number={8} label="采购时间点 / 交付期限" pending={!statuses[7].filled}><Field label="客户原话时间点" value={state.form.deadline} onChange={(value) => updateField('deadline', value)} /></ProfileGroup>

        {saveError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{saveError}</p>}
        {saved && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">已保存，刷新页面仍可看到最新档案。</p>}
        <button type="submit" disabled={saving || Object.keys(errors).length > 0} className="w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? '保存中…' : '保存客户档案'}
        </button>
      </form>
    </section>
  )
}

function ProfileGroup({ number, label, pending, children }: { number: number; label: string; pending: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
