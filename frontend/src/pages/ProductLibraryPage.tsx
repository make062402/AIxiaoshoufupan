import { useCallback, useEffect, useState } from 'react'
import { getProducts } from '../api/client.ts'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates.tsx'
import type { ProductRecord } from '../types/types.ts'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; products: ProductRecord[] }

export default function ProductLibraryPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })
  const load = useCallback(() => {
    let active = true
    getProducts()
      .then((products) => { if (active) setState({ status: 'ready', products }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [])
  useEffect(load, [load, requestKey])

  if (state.status === 'loading') return <LoadingState message="正在加载产品库…" />
  if (state.status === 'error') {
    return <ErrorState title="产品库加载失败" message="暂时无法取得产品，请稍后重试。" onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />
  }

  return (
    <section aria-labelledby="page-title">
      <button onClick={() => onNavigate('/me')} className="text-sm font-bold text-emerald-700">← 返回我的</button>
      <div className="mb-7 mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold tracking-[0.16em] text-emerald-700">产品资产</p><h1 id="page-title" className="mt-2 text-3xl font-black md:text-4xl">产品库</h1></div>
        <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">共 {state.products.length} 个</span>
      </div>
      {state.products.length === 0 ? <EmptyState title="还没有产品" message="导入产品后会出现在这里。" /> : (
        <ul aria-label="产品列表" className="grid gap-5 lg:grid-cols-2">
          {state.products.map((product) => <ProductCard key={product.id} product={product} />)}
        </ul>
      )}
    </section>
  )
}

function ProductCard({ product }: { product: ProductRecord }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold text-emerald-700">{product.industry || '行业待确认'}</p><h2 className="mt-1 text-xl font-black">{product.name}</h2></div>
        <span className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">{product.price === null ? '价格待确认' : `¥${product.price.toLocaleString('zh-CN')}`}</span>
      </div>
      <Detail title="关键参数">
        {Object.entries(product.params ?? {}).length === 0 ? <EmptyLine /> : <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(product.params ?? {}).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">{key}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl>}
      </Detail>
      <Detail title="卖点话术">
        {product.sellingPoints.length === 0 ? <EmptyLine /> : <ul className="space-y-2">{product.sellingPoints.map((point) => <li key={point.tag} className="rounded-lg bg-emerald-50 p-3"><p className="text-xs font-black text-emerald-800">{point.tag}</p><p className="mt-1 text-sm leading-6">{point.script}</p></li>)}</ul>}
      </Detail>
      <Detail title="常见异议与答法">
        {(product.objections ?? []).length === 0 ? <EmptyLine /> : <ul className="space-y-2">{(product.objections ?? []).map((item, index) => <li key={`${item.objection}-${index}`} className="rounded-lg bg-amber-50 p-3 text-sm"><p className="font-black">异议：{item.objection}</p><p className="mt-1 leading-6 text-slate-700">答法：{item.answer}</p></li>)}</ul>}
      </Detail>
    </li>
  )
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-5"><h3 className="mb-2 text-sm font-black text-slate-700">{title}</h3>{children}</section> }
function EmptyLine() { return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无数据</p> }
