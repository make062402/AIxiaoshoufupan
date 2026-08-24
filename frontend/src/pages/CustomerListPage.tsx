import { useCallback, useEffect, useState } from 'react'
import { getCustomers, getReviews } from '../api/client.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates.tsx'
import { buildCustomerList, type CustomerListRow } from '../lib/customerList.ts'

type PageState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: CustomerListRow[] }

const intentStyles = {
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-sky-100 text-sky-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-slate-200 text-slate-700',
} as const

const intentNames = { A: '已成单', B: '中意向', C: '低意向', D: '无意向' } as const

export default function CustomerListPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<PageState>({ status: 'loading' })

  const load = useCallback(() => {
    let active = true
    Promise.all([getCustomers(), getReviews()])
      .then(([customers, reviews]) => { if (active) setState({ status: 'ready', rows: buildCustomerList(customers, reviews) }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [])

  useEffect(load, [load, requestKey])

  return (
    <section aria-labelledby="page-title">
      <button type="button" onClick={() => onNavigate('/me')} className="mb-5 rounded-lg text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
        ← 返回我的
      </button>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">客户资产</p>
          <h1 id="page-title" className="mt-2 text-3xl font-black tracking-tight md:text-4xl">客户库</h1>
          <details className="mt-3 text-sm text-slate-500"><summary className="inline-flex cursor-pointer items-center gap-1 font-semibold text-slate-500 hover:text-slate-700">说明</summary><p className="mt-2 leading-6">按姓名拼音排序，跟进阶段根据复盘次数实时计算。</p></details>
        </div>
        {state.status === 'ready' && <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">共 {state.rows.length} 位客户</span>}
      </div>

      {state.status === 'loading' && <LoadingState message="正在加载客户资料…" />}
      {state.status === 'error' && (
        <ErrorState
          title="客户库加载失败"
          message="暂时无法取得客户资料，请检查后端服务后再试。"
          onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }}
        />
      )}
      {state.status === 'ready' && state.rows.length === 0 && <EmptyState title="还没有客户" message="新建客户后会出现在这里。" />}
      {state.status === 'ready' && state.rows.length > 0 && (
        <ul aria-label="客户列表" className="grid gap-4 lg:grid-cols-2">
          {state.rows.map((customer) => (
            <li key={customer.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">{customer.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{customer.identity || '身份待确认'}</p>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white" aria-label={`跟进阶段 ${customer.stage}`}>{customer.stage}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${intentStyles[customer.intentLevel]}`}>
                  意向 {customer.intentLevel} · {intentNames[customer.intentLevel]}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">意向强度 {customer.intentScore}/3</span>
                <span className="text-xs text-slate-400">已复盘 {customer.reviewCount} 次</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-4">
                <a
                  href={`/me/customers/${customer.id}`}
                  onClick={(event) => { event.preventDefault(); onNavigate(`/me/customers/${customer.id}`) }}
                  className="rounded-lg text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
                  aria-label={`查看${customer.name}的客户档案`}
                >
                  查看客户档案 →
                </a>
                <a
                  href={`/me/customers/${customer.id}/battlecard`}
                  onClick={(event) => { event.preventDefault(); onNavigate(`/me/customers/${customer.id}/battlecard`) }}
                  className="rounded-lg text-sm font-bold text-slate-700 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
                  aria-label={`查看${customer.name}的拜访作战包`}
                >
                  查看作战包 →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
