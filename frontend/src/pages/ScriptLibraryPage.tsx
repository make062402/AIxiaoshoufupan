import { useCallback, useEffect, useMemo, useState } from 'react'
import { getScripts } from '../api/client.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates.tsx'
import SearchBox from '../components/SearchBox.tsx'
import { groupScripts, invalidScripts } from '../lib/myAssets.ts'
import type { ScriptRecord } from '../types/types.ts'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; scripts: ScriptRecord[] }

export default function ScriptLibraryPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const load = useCallback(() => {
    let active = true
    getScripts()
      .then((scripts) => { if (active) setState({ status: 'ready', scripts }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [])
  useEffect(load, [load, requestKey])

  const keyword = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (state.status !== 'ready' || keyword === '') return state.status === 'ready' ? state.scripts : []
    return state.scripts.filter((script) => [script.text, script.scene, script.stage].filter((value): value is string => Boolean(value)).join(' ').toLowerCase().includes(keyword))
  }, [state, keyword])

  if (state.status === 'loading') return <LoadingState message="正在加载话术库…" />
  if (state.status === 'error') {
    return <ErrorState title="话术库加载失败" message="暂时无法取得话术，请稍后重试。" onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />
  }

  const invalid = invalidScripts(filtered)
  const groupCount = filtered.length
  return (
    <AssetPage title="话术库" eyebrow="个人销售资产" count={keyword === '' ? `共 ${state.scripts.length} 条` : `找到 ${filtered.length} 条`} onBack={() => onNavigate('/me')}>
      <div className="mb-6">
        <SearchBox value={query} onChange={setQuery} placeholder="搜索话术内容、场景或阶段" ariaLabel="搜索话术" inputId="script-search-input" />
      </div>
      {filtered.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="没有匹配的话术" message={`没有找到符合「${query.trim()}」的话术，换个关键词试试。`} />
          <button type="button" onClick={() => setQuery('')} className="mx-auto mt-4 block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">清空搜索</button>
        </div>
      ) : (
      <div className="space-y-6">
        {groupScripts(filtered).map((group) => (
          <section key={group.stage} aria-labelledby={`stage-${group.stage}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 id={`stage-${group.stage}`} className="text-xl font-black">{group.stage}</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{group.scripts.length} 条</span>
            </div>
            {group.scripts.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">这个阶段还没有话术。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {group.scripts.map((script) => (
                  <li key={script.id} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                      <span>{script.scene || '通用场景'}</span>
                      <span>·</span>
                      <span>{script.fromReviewId ? `来自复盘 #${script.fromReviewId}` : '冷启动通用话术'}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-800">{script.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {invalid.length > 0 && (
          <section role="alert" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
            <h2 className="font-black text-amber-950">未归类话术 · {invalid.length} 条</h2>
            <p className="mt-2 text-sm text-amber-900">这些记录的阶段不属于五段式，请在数据源中修正。</p>
          </section>
        )}
      </div>
      )}
      {filtered.length > 0 && groupCount > 0 && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={() => document.getElementById('script-search-input')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">↑ 回到搜索</button>
        </div>
      )}
    </AssetPage>
  )
}

function AssetPage({ title, eyebrow, count, onBack, children }: { title: string; eyebrow: string; count: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <section aria-labelledby="page-title">
      <button onClick={onBack} className="text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">← 返回我的</button>
      <div className="mb-7 mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold tracking-[0.16em] text-emerald-700">{eyebrow}</p><h1 id="page-title" className="mt-2 text-3xl font-black md:text-4xl">{title}</h1></div>
        <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">{count}</span>
      </div>
      {children}
    </section>
  )
}
