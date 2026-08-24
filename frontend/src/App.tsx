import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingState } from './components/PageStates.tsx'
import { loadTodoPreview, parseTodoPreviewScenario, type TodoPreviewItem } from './lib/demoPageState.ts'
import { NAV_ITEMS, createNavigationStore, type AppRoute } from './lib/navigation.ts'
import CustomerListPage from './pages/CustomerListPage.tsx'
import CustomerDetailPage from './pages/CustomerDetailPage.tsx'
import BattlecardPage from './pages/BattlecardPage.tsx'
import ReviewIntakePage from './pages/ReviewIntakePage.tsx'
import ReviewDetailsPage from './pages/ReviewDetailsPage.tsx'
import ReviewResultPage from './pages/ReviewResultPage.tsx'
import TodoPage from './pages/TodoPage.tsx'
import VisitCreatePage from './pages/VisitCreatePage.tsx'
import ScriptLibraryPage from './pages/ScriptLibraryPage.tsx'
import ProductLibraryPage from './pages/ProductLibraryPage.tsx'
import ConfigPage from './pages/ConfigPage.tsx'
import TeamReportPage, { ManagerRoleRequired } from './pages/TeamReportPage.tsx'
import { loadDemoRole, saveDemoRole, type DemoRole } from './lib/demoRole.ts'

const routeCopy: Record<AppRoute, { eyebrow: string; description: string }> = {
  todos: { eyebrow: '今天先做重要的事', description: '这里将汇总拜访安排和复盘产生的待办。' },
  new: { eyebrow: '安排下一次客户接触', description: '这里将用于新建拜访日程并绑定客户。' },
  reviews: { eyebrow: '把每次拜访变成进步', description: '这里将用于上传或粘贴逐字稿并完成复盘。' },
  customers: { eyebrow: '一眼看清每个客户', description: '这里汇总客户档案、意向与拜访作战包。' },
  me: { eyebrow: '沉淀你的销售资产', description: '这里将汇总话术库、产品库与个人配置。' },
}

export default function App() {
  const navigation = useMemo(() => createNavigationStore(window), [])
  const [route, setRoute] = useState(() => navigation.getSnapshot())
  const [demoRole, setDemoRole] = useState<DemoRole>(() => loadDemoRole(sessionStorage))

  useEffect(() => navigation.subscribe(setRoute), [navigation])

  const navigate = (path: string) => navigation.navigate(path)
  const activeItem = route.kind === 'page'
    ? NAV_ITEMS.find((item) => item.route === route.route)
    : undefined
  const isBattlecard = route.kind === 'page' && /^\/me\/customers\/[1-9]\d*\/battlecard$/.test(route.path)
  const isCustomerDetail = route.kind === 'page' && /^\/me\/customers\/[1-9]\d*$/.test(route.path)
  const isReviewDetails = route.kind === 'page' && route.path === '/reviews/details'
  const isReviewResult = route.kind === 'page' && route.path === '/reviews/result'
  const isReviewReport = route.kind === 'page' && /^\/reviews\/report\/[1-9]\d*$/.test(route.path)
  const myPageLabels: Record<string, string> = { '/me/customers': '客户库', '/me/scripts': '话术库', '/me/products': '产品库', '/me/config': '配置', '/me/team-reports': '团队报告' }
  const pageLabel = route.kind === 'page' && myPageLabels[route.path]
    ? myPageLabels[route.path]
    : isBattlecard ? '拜访作战包' : isCustomerDetail ? '客户档案' : activeItem?.label

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-950">
      <a href="#main-content" className="fixed left-3 top-3 z-50 -translate-y-20 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
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
        <header className="border-b border-slate-200 bg-white/90 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur md:px-10 md:py-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="md:hidden"><Brand onNavigate={() => navigate('/todos')} compact /></div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-slate-500">工作台</p>
              <p className="mt-1 text-lg font-semibold">{pageLabel ?? '页面未找到'}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Mock 模式</span>
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 pb-28 md:px-10 md:py-14">
          {route.kind === 'page' ? (
            isBattlecard
              ? <BattlecardPage customerId={Number(route.path.split('/').at(-2))} onNavigate={navigate} />
              : isCustomerDetail
              ? <CustomerDetailPage customerId={Number(route.path.split('/').at(-1))} onNavigate={navigate} />
              : isReviewResult || isReviewReport
                ? <ReviewResultPage reviewId={isReviewReport ? Number(route.path.split('/').at(-1)) : undefined} onNavigate={navigate} />
              : isReviewDetails
                ? <ReviewDetailsPage onNavigate={navigate} />
                : route.path === '/reviews'
                  ? <ReviewIntakePage onNavigate={navigate} />
              : route.path === '/todos'
                ? <TodoPage onNavigate={navigate} />
              : route.path === '/new'
                ? <VisitCreatePage onNavigate={navigate} />
              : route.path === '/me/customers'
                ? <CustomerListPage onNavigate={navigate} />
              : route.path === '/me/scripts'
                ? <ScriptLibraryPage onNavigate={navigate} />
              : route.path === '/me/products'
                ? <ProductLibraryPage onNavigate={navigate} />
              : route.path === '/me/config'
                ? <ConfigPage onNavigate={navigate} />
              : route.path === '/me/team-reports'
                ? demoRole === 'manager' ? <TeamReportPage onNavigate={navigate} /> : <ManagerRoleRequired onNavigate={navigate} />
                : <PlaceholderPage route={route.route} label={activeItem?.label ?? ''} onNavigate={navigate} demoRole={demoRole} onRoleChange={(role) => { saveDemoRole(sessionStorage, role); setDemoRole(role) }} />
          ) : (
            <NotFound path={route.path} onNavigate={() => navigate('/todos')} />
          )}
        </main>
      </div>

      <nav aria-label="主导航" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
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

function PlaceholderPage({ route, label, onNavigate, demoRole, onRoleChange }: { route: AppRoute; label: string; onNavigate: (path: string) => void; demoRole: DemoRole; onRoleChange: (role: DemoRole) => void }) {
  const copy = routeCopy[route]
  return (
    <section aria-labelledby="page-title" className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-6 py-10 md:px-12 md:py-16">
        <p className="text-sm font-bold tracking-[0.16em] text-emerald-700">{copy.eyebrow}</p>
        <h1 id="page-title" className="mt-4 text-3xl font-black tracking-tight md:text-5xl">{label}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">{copy.description}</p>
      </div>
      <div className="px-6 py-8 md:px-12">
        {route === 'todos' ? <TodoPreview /> : route === 'me' ? <MeHome onNavigate={onNavigate} role={demoRole} onRoleChange={onRoleChange} /> : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <p className="font-semibold text-slate-700">页面骨架已就绪</p>
            <p className="mt-2 text-sm text-slate-500">业务内容将在对应任务中逐步接入。</p>
          </div>
        )}
      </div>
    </section>
  )
}

function MeHome({ onNavigate, role, onRoleChange }: { onNavigate: (path: string) => void; role: DemoRole; onRoleChange: (role: DemoRole) => void }) {
  const assets = [
    { path: '/me/customers', eyebrow: '客户资产', title: '客户库', description: '查看客户意向和跟进阶段' },
    { path: '/me/scripts', eyebrow: '个人资产', title: '话术库', description: '按谈判五段式查阅通用与复盘沉淀话术' },
    { path: '/me/products', eyebrow: '产品资产', title: '产品库', description: '查阅价格、参数、卖点和常见异议答法' },
    { path: '/me/config', eyebrow: '安全设置', title: '配置', description: '通过受保护的后端接口管理 Dify 配置' },
    ...(role === 'manager' ? [{ path: '/me/team-reports', eyebrow: '主管只读', title: '团队报告', description: '查看单一演示销售账号及其全部复盘' }] : []),
  ]
  return (
    <div>
      <section aria-labelledby="demo-role-title" className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <p className="text-xs font-black tracking-[0.14em] text-sky-800">仅用于 DEMO 展示，不是身份认证</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4"><div><h2 id="demo-role-title" className="font-black">查看角色</h2><p className="mt-1 text-sm text-sky-950">当前：{role === 'sales' ? '销售' : '主管'}</p></div><div role="group" aria-label="演示角色" className="grid grid-cols-2 rounded-xl bg-white p-1"><button onClick={() => onRoleChange('sales')} aria-pressed={role === 'sales'} className={`rounded-lg px-4 py-2 text-sm font-black ${role === 'sales' ? 'bg-sky-700 text-white' : 'text-slate-600'}`}>销售</button><button onClick={() => onRoleChange('manager')} aria-pressed={role === 'manager'} className={`rounded-lg px-4 py-2 text-sm font-black ${role === 'manager' ? 'bg-sky-700 text-white' : 'text-slate-600'}`}>主管</button></div></div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {assets.map((asset) => (
          <a key={asset.path} href={asset.path} onClick={(event) => { event.preventDefault(); onNavigate(asset.path) }} className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
            <span className="text-xs font-bold tracking-[0.14em] text-emerald-700">{asset.eyebrow}</span>
            <h2 className="mt-2 text-xl font-bold">{asset.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{asset.description}</p>
            <span className="mt-5 inline-block text-sm font-bold text-emerald-700 group-hover:translate-x-1">进入{asset.title} →</span>
          </a>
        ))}
      </div>
    </div>
  )
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: TodoPreviewItem[] }

function TodoPreview() {
  const scenario = parseTodoPreviewScenario(new URLSearchParams(window.location.search).get('demo'))
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    loadTodoPreview(scenario, attempt)
      .then((items) => { if (active) setState({ status: 'ready', items }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [attempt, scenario])

  return (
    <section aria-labelledby="todo-preview-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">页面状态示范</p>
          <h2 id="todo-preview-title" className="mt-2 text-xl font-bold">今日待办预览</h2>
        </div>
        <span className="text-xs text-slate-400">数据接入前占位</span>
      </div>

      {state.status === 'loading' && <LoadingState message="正在加载今日待办…" />}
      {state.status === 'error' && (
        <ErrorState
          title="待办加载失败"
          message="暂时无法取得今日待办，请检查连接后再试。"
          onRetry={() => {
            setState({ status: 'loading' })
            setAttempt((current) => current + 1)
          }}
        />
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title="今天还没有待办" message="新的拜访安排和复盘动作会出现在这里。" />
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="space-y-3" aria-label="今日待办">
          {state.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <span className="font-semibold text-slate-800">{item.text}</span>
              <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">{item.time}</span>
            </li>
          ))}
        </ul>
      )}
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
