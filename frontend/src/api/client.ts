// 前端唯一的后端出口。后续所有请求都从这里走，便于统一加载态与错误处理（T30）。
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`)
  return res.json() as Promise<T>
}
