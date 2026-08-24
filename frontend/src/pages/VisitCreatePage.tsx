import { useEffect, useState } from 'react'
import { getCustomers, scheduleVisit } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'
import { defaultVisitTime, quickDateOptions, toDateTimeLocalValue } from '../lib/dateQuick.ts'
import type { CustomerRecord } from '../types/types.ts'

export default function VisitCreatePage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [customers, setCustomers] = useState<CustomerRecord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [customerId, setCustomerId] = useState('')
  const [name, setName] = useState('')
  const [identity, setIdentity] = useState('')
  const [need, setNeed] = useState('')
  const [industry, setIndustry] = useState('装修')
  const [scene, setScene] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocalValue(defaultVisitTime()))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = () => {
    setFailed(false)
    setCustomers(null)
    getCustomers().then(setCustomers).catch(() => setFailed(true))
  }

  useEffect(() => {
    let active = true
    getCustomers()
      .then((rows) => { if (active) setCustomers(rows) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])

  if (failed) {
    return <ErrorState title="客户加载失败" message="暂时无法创建日程。" onRetry={load} />
  }
  if (!customers) return <LoadingState message="正在准备拜访日程…" />

  const parsedDate = Date.parse(scheduledAt)
  const valid = Boolean(
    scene
      && Number.isFinite(parsedDate)
      && (mode === 'existing' ? customerId : name.trim() && industry),
  )
  const preview = Number.isFinite(parsedDate)
    ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(parsedDate))
    : ''

  async function submit() {
    if (!valid) return
    setSaving(true)
    setMessage('')
    try {
      const result = await scheduleVisit({
        ...(mode === 'existing'
          ? { customerId: Number(customerId) }
          : { newCustomer: { name, identity, coreNeed: need, industry } }),
        scene,
        scheduledAt: new Date(parsedDate).toISOString(),
      })
      setMessage(`已创建${result.customer.name}的${result.visit.scene}，刷新后仍在数据库中。`)
    } catch {
      setMessage('创建失败，请检查日期、场景和客户。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-3xl">
      <button onClick={() => onNavigate('/todos')} className="text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
        ← 返回待办
      </button>
      <p className="mt-6 text-sm font-bold text-emerald-700">拜访安排</p>
      <h1 id="page-title" className="mt-2 text-3xl font-black">创建拜访日程</h1>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode('existing')}
          className={`rounded-xl p-3 font-bold ${mode === 'existing' ? 'bg-emerald-700 text-white' : 'bg-white'}`}
        >
          选择已有客户
        </button>
        <button
          onClick={() => setMode('new')}
          className={`rounded-xl p-3 font-bold ${mode === 'new' ? 'bg-emerald-700 text-white' : 'bg-white'}`}
        >
          新建客户并绑定
        </button>
      </div>

      <div className="mt-5 space-y-4 rounded-2xl border bg-white p-5">
        {mode === 'existing' ? (
          <label className="block font-bold">
            客户
            <select
              aria-label="客户"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="mt-2 w-full rounded-xl border p-3"
            >
              <option value="">请选择</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <Field label="客户称呼" value={name} set={setName} />
            <Field label="身份" value={identity} set={setIdentity} />
            <Field label="核心需求" value={need} set={setNeed} />
            <label className="block font-bold">
              行业
              <select
                aria-label="行业"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                className="mt-2 w-full rounded-xl border p-3"
              >
                <option>装修</option>
                <option>教培</option>
                <option>广告</option>
              </select>
            </label>
          </>
        )}

        <label className="block font-bold">
          场景
          <select
            aria-label="场景"
            value={scene}
            onChange={(event) => setScene(event.target.value)}
            className="mt-2 w-full rounded-xl border p-3"
          >
            <option value="">请选择</option>
            <option>一次拜访</option>
            <option>二次拜访</option>
            <option>多次拜访</option>
          </select>
        </label>
        <div>
          <label className="block font-bold" htmlFor="visit-time">拜访时间
            <input
              id="visit-time"
              type="datetime-local"
              aria-label="拜访时间"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="mt-2 w-full rounded-xl border p-3"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickDateOptions().map((option) => {
              const current = new Date(parsedDate)
              const hour = Number.isFinite(parsedDate) ? current.getHours() : 9
              const minute = Number.isFinite(parsedDate) ? current.getMinutes() : 0
              const quickValue = new Date(option.value)
              quickValue.setHours(hour, minute, 0, 0)
              return (
                <button key={option.key} type="button" onClick={() => setScheduledAt(toDateTimeLocalValue(quickValue))} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
        {scheduledAt && !Number.isFinite(parsedDate) && (
          <p role="alert" className="text-sm font-bold text-rose-700">请选择有效的拜访时间。</p>
        )}
        {preview && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">将于 {preview} 拜访，请确认。</p>
        )}
        <button
          disabled={!valid || saving}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-emerald-700 p-4 font-black text-white disabled:opacity-40"
        >
          {saving ? '创建中…' : '创建并绑定'}
        </button>
        {message && (
          <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm font-bold">{message}</p>
        )}
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  set,
  placeholder,
}: {
  label: string
  value: string
  set: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block font-bold">
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => set(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border p-3"
      />
    </label>
  )
}
