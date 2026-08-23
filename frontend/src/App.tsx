import { useState } from 'react'
import { api } from './api/client'

export default function App() {
  const [result, setResult] = useState<string>('')

  async function ping() {
    try {
      const data = await api<{ ok: boolean }>('/ping')
      setResult(`后端连通：ok = ${data.ok}`)
    } catch (e) {
      setResult(`后端未连通：${(e as Error).message}`)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50 text-slate-900">
      <h1 className="text-2xl font-bold">AI 销售复盘助手</h1>
      <button
        onClick={ping}
        className="rounded-lg bg-red-500 px-5 py-2.5 text-white hover:bg-red-600"
      >
        测试后端连通
      </button>
      <p className="text-sm text-slate-600">{result || '脚手架就绪，尚未实现业务功能'}</p>
    </main>
  )
}
