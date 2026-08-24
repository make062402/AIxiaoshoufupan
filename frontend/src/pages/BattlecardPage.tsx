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

      <nav aria-label="页内目录" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-700">快速跳转</h2>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="rounded-lg text-sm font-bold text-emerald-700 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">↑ 回到顶部</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { id: 'customer-info-title', label: '01 客户信息' },
            { id: 'goals-title', label: '02 本次目标' },
            { id: 'review-context-title', label: '03 上次复盘' },
            { id: 'talk-title', label: '04 谈判五段式' },
            { id: 'products-title', label: '05 产品推荐' },
          ].map((section) => (
            <button key={section.id} type="button" onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
              {section.label}
            </button>
          ))}
        </div>
      </nav>

      <section aria-labelledby="customer-info-title" className="mt-6 scroll-mt-28 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
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

      <section aria-labelledby="goals-title" className="mt-6 scroll-mt-28 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
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

      <section aria-labelledby="review-context-title" className="mt-6 scroll-mt-28 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-black tracking-[0.16em] text-emerald-700">03 · 上次复盘</p>
        <h2 id="review-context-title" className="mt-2 text-2xl font-black">先接住上次没接住的事</h2>
        {customer.stage === 'S1' ? (
          <div className="mt-5"><EmptyState title="这是首次接触" message="目前没有历史复盘，本次先完成档案关键信息确认。" /></div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <ContextList title="未满足需求" empty="上次没有未满足需求" items={goals.unsatisfiedNeeds.map((need) => ({ key: `need-${need.id}`, badge: need.level ?? '待定', text: need.text ?? '需求内容待确认', detail: need.quote ? `客户原话：${need.quote}` : undefined }))} />
            <ContextList title="改进与漏讲" empty="上次没有检出改进或漏讲" items={[
              ...goals.improvements.map((item, index) => ({ key: `improvement-${index}`, badge: '改进', text: item.text, detail: item.quote ? `原话：${item.quote}` : undefined })),
              ...goals.missedPoints.map((item, index) => ({ key: `missed-${index}`, badge: '漏讲/错讲', text: item.text, detail: item.quote ? `原话：${item.quote}` : undefined })),
            ]} />
            <div className="lg:col-span-2"><ContextList title="下次动作" empty="上次没有生成下一步动作" items={goals.nextActions.map((text, index) => ({ key: `action-${index}`, badge: `${index + 1}`, text }))} /></div>
          </div>
        )}
      </section>

      <section aria-labelledby="talk-title" className="mt-6 scroll-mt-28 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-black tracking-[0.16em] text-emerald-700">04 · 谈判五段式</p>
        <h2 id="talk-title" className="mt-2 text-2xl font-black">照着场景开口，不临场硬编</h2>
        <div className="mt-6 space-y-4">
          {state.model.negotiation.stages.map((group, index) => (
            <section key={group.stage} aria-labelledby={`talk-stage-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">{index + 1}</span>
                <h3 id={`talk-stage-${index}`} className="text-lg font-black">{group.stage}</h3>
              </div>
              {group.scripts.length === 0 ? <p className="mt-4 text-sm text-slate-500">当前阶段暂无可用话术</p> : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {group.scripts.map((script) => (
                    <article key={script.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-black text-emerald-700">使用场景：{script.scene ?? '待补充'}</p>
                      <p className="mt-3 text-sm font-semibold leading-7 text-slate-900">{script.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
        {state.model.negotiation.invalidScripts.length > 0 && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-900">检测到 {state.model.negotiation.invalidScripts.length} 条非五段式话术，请到话术库修正阶段。</p>}
      </section>

      <section aria-labelledby="products-title" className="mt-6 scroll-mt-28 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-black tracking-[0.16em] text-emerald-700">05 · 产品推荐</p>
        <h2 id="products-title" className="mt-2 text-2xl font-black">本次只带这 2 个方案</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">优先承接上次未满足需求；不足两个时才用同行业低价方案补足。</p>
        {state.model.recommendations.length === 0 ? <div className="mt-5"><EmptyState title="暂无同行业产品" message="请先在产品库补充该行业方案。" /></div> : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2" aria-label="推荐产品列表">
            {state.model.recommendations.map((product, index) => (
              <article key={product.id} data-product-id={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="border-b border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-xs font-black text-emerald-700">推荐 {index + 1} · {product.source === 'matched' ? `${product.matchedLevel} 需求命中` : '低价补足'}</p><h3 className="mt-2 text-xl font-black">{product.name}</h3></div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-black text-emerald-900">{formatPrice(product.price)}</span>
                  </div>
                </div>
                <div className="space-y-5 p-5">
                  <ProductSection title="关键参数">
                    {product.params && Object.keys(product.params).length ? <dl className="grid gap-2 text-sm">{Object.entries(product.params).map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-b border-slate-200 pb-2"><dt className="text-slate-500">{key}</dt><dd className="text-right font-bold">{value}</dd></div>)}</dl> : <p className="text-sm text-slate-500">待补充</p>}
                  </ProductSection>
                  <ProductSection title="本次必讲卖点">
                    {product.sellingPoints.length ? <div className="space-y-3">{product.sellingPoints.map((point) => <article key={`${point.tag}-${point.script}`} className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-black text-emerald-700">{point.tag}</p><p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">{point.script}</p></article>)}</div> : <p className="text-sm text-slate-500">暂无匹配卖点</p>}
                  </ProductSection>
                  <ProductSection title="常见异议与答法">
                    {product.objections?.length ? <div className="space-y-3">{product.objections.map((item) => <article key={`${item.objection}-${item.answer}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-black text-amber-950">客户：{item.objection}</p><p className="mt-2 text-sm leading-6 text-amber-900">回应：{item.answer}</p></article>)}</div> : <p className="text-sm text-slate-500">暂无异议答法</p>}
                  </ProductSection>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function ContextList({ title, items, empty }: { title: string; items: Array<{ key: string; badge: string; text: string; detail?: string }>; empty: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-lg font-black">{title}</h3>
      {items.length === 0 ? <p className="mt-3 text-sm text-slate-500">{empty}</p> : <ul className="mt-4 space-y-3">{items.map((item) => <li key={item.key} className="rounded-xl bg-white p-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{item.badge}</span><p className="mt-3 text-sm font-bold leading-6">{item.text}</p>{item.detail && <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>}</li>)}</ul>}
    </section>
  )
}

function ProductSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h4 className="mb-3 text-sm font-black text-slate-900">{title}</h4>{children}</section>
}

function formatPrice(price: number | null) {
  return price === null ? '价格待确认' : `¥${new Intl.NumberFormat('zh-CN').format(price)}`
}
