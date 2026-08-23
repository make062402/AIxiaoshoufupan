import { useEffect, useMemo, useState } from 'react'
import { NAV_ITEMS, createNavigationStore, type AppRoute } from './lib/navigation.ts'

const routeCopy: Record<AppRoute, { eyebrow: string; description: string }> = {
  todos: { eyebrow: '今天先做重要的事', description: '这里将汇总拜访安排和复盘产生的待办。' },
  new: { eyebrow: '安排下一次客户接触', description: '这里将用于新建拜访日程并绑定客户。' },
  reviews: { eyebrow: '把每次拜访变成进步', description: '这里将用于上传或粘贴逐字稿并完成复盘。' },
  me: { eyebrow: '沉淀你的销售资产', description: '这里将汇总客户库、话术库、产品库与个人配置。' },
}

export default function App() {
  const navigation = useMemo(() => createNavigationStore(window), [])
  const [route, setRoute] = useState(() => navigation.getSnapshot())

  useEffect(() => navigation.subscribe(setRoute), [navigation])

  const navigate = (path: string) => navigation.navigate(path)
  const activeItem = route.kind === 'page'
    ? NAV_ITEMS.find((item) => item.route === route.route)
    : undefined

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-950">
      <a href="#main-content" className="fixed left-3 top-3 z-50 -translate-y-20 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white focus:translate-y-0">
        跳到主要内容
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-7 md:flex">
        <Brand onNavigate={() => navigate('/todos')} />
        <nav aria-label="主导航" className="mt-10 space-y-2">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} item={item} active={activeItem?.route === item.route} onNavigate={navigate} />
          ))}
        </nav>
        <p className="mt-auto rounded-2xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">AI 销售复盘助手 · Demo</p>
      </aside>

      <div className="min-h-screen md:pl-64">
        <header className="border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur md:px-10 md:py-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="md:hidden"><Brand onNavigate={() => navigate('/todos')} compact /></div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-slate-500">工作台</p>
              <p className="mt-1 text-lg font-semibold">{activeItem?.label ?? '页面未找到'}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Mock 模式</span>
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 pb-28 md:px-10 md:py-14">
          {route.kind === 'page' ? (
            <PlaceholderPage route={route.route} label={activeItem?.label ?? ''} />
          ) : (
            <NotFound path={route.path} onNavigate={() => navigate('/todos')} />
          )}
        </main>
      </div>

      <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} item={item} active={activeItem?.route === item.route} onNavigate={navigate} compact />
        ))}
      </nav>
    </div>
  )
}

function Brand({ onNavigate, compact = false }: { onNavigate: () => void; compact?: boolean }) {
  return (
    <a href="/todos" onClick={(event) => { event.preventDefault(); onNavigate() }} className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600" aria-label="AI 销售复盘助手首页">
      <span className={`${compact ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base'} grid place-items-center rounded-xl bg-emerald-700 font-bold text-white`}>复</span>
      <span>
        <span className="block text-sm font-bold tracking-tight">销售复盘助手</span>
        {!compact && <span className="mt-0.5 block text-xs text-slate-500">让每次沟通都有收获</span>}
      </span>
    </a>
  )
}

function NavLink({ item, active, onNavigate, compact = false }: { item: (typeof NAV_ITEMS)[number]; active: boolean; onNavigate: (path: string) => void; compact?: boolean }) {
  return (
    <a
      href={item.path}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => { event.preventDefault(); onNavigate(item.path) }}
      className={compact
        ? `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-600 ${active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`
        : `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${active ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
    >
      <span aria-hidden="true" className={compact ? 'text-lg leading-none' : 'grid h-7 w-7 place-items-center text-lg'}>{item.icon}</span>
      <span>{item.label}</span>
    </a>
  )
}

function PlaceholderPage({ route, label }: { route: AppRoute; label: string }) {
  const copy = routeCopy[route]
  return (
    <section aria-labelledby="page-title" className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-6 py-10 md:px-12 md:py-16">
        <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">{copy.eyebrow}</p>
        <h1 id="page-title" className="mt-4 text-3xl font-black tracking-tight md:text-5xl">{label}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">{copy.description}</p>
      </div>
      <div className="px-6 py-8 md:px-12">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
          <p className="font-semibold text-slate-700">页面骨架已就绪</p>
          <p className="mt-2 text-sm text-slate-500">业务内容将在对应任务中逐步接入。</p>
        </div>
      </div>
    </section>
  )
}

function NotFound({ path, onNavigate }: { path: string; onNavigate: () => void }) {
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm md:px-12">
      <p className="text-sm font-bold tracking-[0.2em] text-amber-700">404</p>
      <h1 id="page-title" className="mt-4 text-3xl font-black">没有找到这个页面</h1>
      <p className="mt-4 break-all text-sm leading-6 text-slate-600">路径“{path}”不存在，可能是链接已经失效。</p>
      <button type="button" onClick={onNavigate} className="mt-8 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
        返回待办首页
      </button>
    </section>
  )
}
