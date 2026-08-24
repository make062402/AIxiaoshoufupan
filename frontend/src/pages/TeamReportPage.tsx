import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCustomers, getReviews } from '../api/client.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates.tsx'
import SearchBox from '../components/SearchBox.tsx'
import BackToTop from '../components/BackToTop.tsx'
import { buildDemoTeamReport } from '../lib/demoRole.ts'
import type { CustomerRecord, ReviewSummaryRecord } from '../types/types.ts'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; customers: CustomerRecord[]; reviews: ReviewSummaryRecord[] }

export default function TeamReportPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const load = useCallback(() => {
    let active = true
    Promise.all([getCustomers(), getReviews()])
      .then(([customers, reviews]) => { if (active) setState({ status: 'ready', customers, reviews }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [])
  useEffect(load, [load, requestKey])

  const report = useMemo(() => state.status === 'ready' ? buildDemoTeamReport(state.customers, state.reviews) : null, [state])
  const keyword = query.trim().toLowerCase()
  const filteredReviews = useMemo(() => {
    if (!report || keyword === '') return report?.reviews ?? []
    return report.reviews.filter((review) => `${review.customerName} 报告 #${review.id} ${review.createdAt ?? ''}`.toLowerCase().includes(keyword))
  }, [report, keyword])

  if (state.status === 'loading') return <LoadingState message="正在加载主管只读报告…" />
  if (state.status === 'error') return <ErrorState title="团队报告加载失败" message="暂时无法读取客户和复盘。" onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />
  if (!report) return <LoadingState message="正在加载主管只读报告…" />

  return (
    <section aria-labelledby="page-title">
      <button onClick={() => onNavigate('/me')} className="text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">← 返回我的</button>
      <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <p className="text-xs font-black tracking-[0.16em] text-sky-800">DEMO 单账号口径 · 只读</p>
        <p className="mt-2 text-sm leading-6 text-sky-950">当前数据模型没有销售人员字段。本页把全部复盘归入唯一“演示销售账号”用于演示，不代表真实组织关系，也不提供权限管理。</p>
      </div>
      <div className="mb-7 mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold tracking-[0.16em] text-emerald-700">主管视图</p><h1 id="page-title" className="mt-2 text-3xl font-black md:text-4xl">团队报告</h1></div>
        <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">{keyword === '' ? `${report.reviewCount} 次复盘` : `找到 ${filteredReviews.length} 条`}</span>
      </div>
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-black">{report.accountName}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="复盘数" value={`${report.reviewCount} 次`} />
          <Stat label="涉及客户" value={`${report.customerCount} 位`} />
          <Stat label="平均总分" value={report.average === null ? '暂无' : `${report.average}/4`} />
        </div>
        <div className="mt-7">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索客户名或报告 ID" ariaLabel="搜索团队报告" inputId="team-report-search-input" />
        </div>
        <h3 className="mt-6 text-lg font-black">复盘列表</h3>
        {report.reviews.length === 0 ? <div className="mt-4"><EmptyState title="还没有复盘" message="保存复盘后会出现在这里。" /></div> : filteredReviews.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="没有匹配的报告" message={`没有找到符合「${query.trim()}」的报告，换个关键词试试。`} />
            <button type="button" onClick={() => setQuery('')} className="mx-auto mt-4 block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">清空搜索</button>
          </div>
        ) : (
          <ul aria-label="演示销售账号复盘列表" className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {filteredReviews.map((review) => (
              <li key={review.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div><p className="font-black">{review.customerName}</p><p className="mt-1 text-xs text-slate-500">报告 #{review.id}{review.createdAt ? ` · ${new Date(review.createdAt).toLocaleDateString('zh-CN')}` : ''}</p></div>
                <div className="flex items-center gap-4"><span className="text-sm font-black text-emerald-700">{review.total === null ? '暂无评分' : `${review.total}/4`}</span><a href={`/reviews/report/${review.id}`} onClick={(event) => { event.preventDefault(); onNavigate(`/reviews/report/${review.id}`) }} className="text-sm font-bold text-slate-700 underline decoration-2 underline-offset-4">查看报告</a></div>
              </li>
            ))}
          </ul>
        )}
      </article>
      <BackToTop />
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div> }

export function ManagerRoleRequired({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center"><h1 className="text-2xl font-black">当前是销售演示角色</h1><p className="mt-3 text-sm leading-6 text-amber-950">请返回“我的”切换到主管角色。这个开关只控制 Demo 展示，不是真实权限认证。</p><button onClick={() => onNavigate('/me')} className="mt-5 rounded-xl bg-amber-800 px-5 py-3 text-sm font-black text-white">返回我的</button></section>
}
