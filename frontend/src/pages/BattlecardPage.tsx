import { useCallback, useEffect, useState } from 'react'
import { getBattlecard } from '../api/client.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates.tsx'
import { buildBattlecard, type BattlecardViewModel } from '../lib/battlecard.ts'

type PageState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; model: BattlecardViewModel }

export default function BattlecardPage({ customerId, onNavigate }: { customerId: number; onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<PageState>({ status: 'loading' })

  const load = useCallback(() => {
    let active = true
    getBattlecard(customerId)
      .then((raw) => { if (active) setState({ status: 'ready', model: buildBattlecard(raw) }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [customerId])

  useEffect(load, [load, requestKey])

  if (state.status === 'loading') return <LoadingState message="正在现拼拜访作战包…" />
  if (state.status === 'error') return (
    <ErrorState title="作战包加载失败" message="暂时无法取得客户与复盘资料，请检查后端服务后再试。" onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />
  )
  if (state.model.customer.profileFields.length === 0) return <EmptyState title="暂无可用客户信息" message="请先返回客户档案补充基础信息。" />

  const { customer, goals } = state.model
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap gap-4 text-sm font-bold">
        <button type="button" onClick={() => onNavigate('/me/customers')} className="rounded-lg text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">← 返回客户库</button>
        <button type="button" onClick={() => onNavigate(`/me/customers/${customer.record.id}`)} className="rounded-lg text-slate-600 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">查看客户档案</button>
      </div>

      <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 px-6 py-8 text-white md:px-10 md:py-10">
          <p className="text-xs font-black tracking-[0.18em] text-emerald-100">出门前快速扫读 · 实时现拼</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 id="page-title" className="text-3xl font-black tracking-tight md:text-4xl">{customer.record.name}的拜访作战包</h1>
              <p className="mt-3 text-sm text-emerald-50">{customer.record.industry ?? '行业待确认'} · {customer.stage} · 已复盘 {customer.reviewCount} 次</p>
            </div>
            <span className="rounded-full border border-white/30 bg-white/15 px-4 py-2 text-sm font-black">本次先拿回关键信息</span>
          </div>
        </div>
      </header>

      <section aria-labelledby="customer-info-title" className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-emerald-700">01 · 客户信息</p>
          <h2 id="customer-info-title" className="mt-2 text-2xl font-black">进门前，先把这个人想清楚</h2>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {customer.profileFields.map((field) => (
            <div key={field.number} data-profile-number={field.number} className={`rounded-2xl border p-4 ${field.missing ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'}`}>
              <dt className="flex items-center justify-between gap-3 text-xs font-black text-slate-500">
                <span>{field.number}. {field.label}</span>
                {field.missing && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">待确认</span>}
              </dt>
              <dd className={`mt-2 text-sm font-semibold leading-6 ${field.missing ? 'text-amber-900' : 'text-slate-900'}`}>
                {field.missing ? '待确认' : Array.isArray(field.value) ? field.value.join(' → ') : field.value}
              </dd>
            </div>
          ))}
        </dl>

        <aside aria-label="沟通忌讳与风险敏感点" className={`mt-5 rounded-2xl border-2 p-5 ${customer.riskNote ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-black ${customer.riskNote ? 'bg-rose-700 text-white' : 'bg-amber-200 text-amber-900'}`}>{customer.riskNote ? '!' : '?'}</span>
            <div>
              <h3 className={`font-black ${customer.riskNote ? 'text-rose-950' : 'text-amber-950'}`}>沟通忌讳与风险敏感点</h3>
              <p className={`mt-2 text-sm font-semibold leading-6 ${customer.riskNote ? 'text-rose-900' : 'text-amber-900'}`}>{customer.riskNote ?? '待确认'}</p>
            </div>
          </div>
        </aside>
      </section>

      <section aria-labelledby="goals-title" className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-black tracking-[0.16em] text-emerald-700">02 · 本次目标</p>
        <h2 id="goals-title" className="mt-2 text-2xl font-black">这次必须拿回的 3 件信息</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">从客户当前缺失档案中按业务优先级自动选出，不靠临场记忆。</p>
        {goals.mustCollect.length === 0 ? (
          <div className="mt-5"><EmptyState title="客户档案已完整" message="本次可把重点放在未满足需求和下一步推进上。" /></div>
        ) : (
          <ol className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="本次必拿回的信息">
            {goals.mustCollect.map((field, index) => (
              <li key={field.number} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-700 text-sm font-black text-white">{index + 1}</span>
                <p className="mt-4 text-xs font-bold text-emerald-700">档案第 {field.number} 项</p>
                <p className="mt-1 font-black leading-6 text-emerald-950">{field.label}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="后续作战内容" className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
        谈判五段式话术和产品推荐将在下一项 T44 接入；当前页面只验收客户信息与本次目标。
      </section>
    </section>
  )
}
