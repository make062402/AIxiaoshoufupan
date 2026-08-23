import { useCallback, useEffect, useState } from 'react'
import { getDifyConfig, saveDifyConfig, type DifyConfigStatus } from '../api/client.ts'
import { ErrorState, LoadingState } from '../components/PageStates.tsx'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; config: DifyConfigStatus }

export default function ConfigPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [requestKey, setRequestKey] = useState(0)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [adminToken, setAdminToken] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const load = useCallback(() => {
    let active = true
    getDifyConfig()
      .then((config) => { if (active) setState({ status: 'ready', config }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [])
  useEffect(load, [load, requestKey])

  if (state.status === 'loading') return <LoadingState message="正在读取安全配置状态…" />
  if (state.status === 'error') {
    return <ErrorState title="配置状态加载失败" message="暂时无法读取后端配置。" onRetry={() => { setState({ status: 'loading' }); setRequestKey((key) => key + 1) }} />
  }

  const canSave = state.config.adminProtected && adminToken.length > 0 && apiKey.trim().length >= 8 && !saving
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setSaving(true); setMessage(''); setFailed(false)
    try {
      const config = await saveDifyConfig(apiKey, adminToken)
      setState({ status: 'ready', config })
      setAdminToken(''); setApiKey('')
      setMessage('API Key 已安全保存到后端，当前进程已生效，应用重启后仍会保留。')
    } catch {
      setFailed(true)
      setMessage('保存失败：请检查管理员令牌、Key 格式和后端文件权限。')
    } finally { setSaving(false) }
  }

  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-3xl">
      <button onClick={() => onNavigate('/me')} className="text-sm font-bold text-emerald-700">← 返回我的</button>
      <p className="mt-6 text-sm font-bold tracking-[0.16em] text-emerald-700">后端安全配置</p>
      <h1 id="page-title" className="mt-2 text-3xl font-black md:text-4xl">配置</h1>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-black">Dify API Key</h2><p className="mt-1 text-sm text-slate-500">页面永远不会读取或显示原始 Key。</p></div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-black ${state.config.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{state.config.configured ? `已配置 ${state.config.masked}` : '未配置'}</span>
        </div>
        {!state.config.adminProtected && (
          <div role="alert" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">写入功能已安全锁定。请先在后端环境文件设置 <code className="font-black">CONFIG_ADMIN_TOKEN</code> 并重启后端。</div>
        )}
        <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
          <label className="block text-sm font-black">管理员令牌<input aria-label="管理员令牌" type="password" autoComplete="off" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} disabled={!state.config.adminProtected || saving} className="mt-2 w-full rounded-xl border border-slate-200 p-3 disabled:bg-slate-100" /></label>
          <label className="block text-sm font-black">新的 Dify API Key<input aria-label="新的 Dify API Key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={!state.config.adminProtected || saving} className="mt-2 w-full rounded-xl border border-slate-200 p-3 disabled:bg-slate-100" /></label>
          <button disabled={!canSave} className="w-full rounded-xl bg-emerald-700 p-4 font-black text-white disabled:opacity-40">{saving ? '安全保存中…' : '安全保存到后端'}</button>
        </form>
        {message && <p role={failed ? 'alert' : 'status'} className={`mt-4 rounded-xl p-4 text-sm font-bold ${failed ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{message}</p>}
        <p className="mt-5 text-xs leading-5 text-slate-500">管理员令牌与 API Key 只用于本次请求，不写入 localStorage、IndexedDB 或前端构建文件；服务端响应只返回状态和固定掩码。</p>
      </div>
    </section>
  )
}
