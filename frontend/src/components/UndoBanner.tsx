import { useEffect, useRef } from 'react'

/** 可逆操作成功后的撤销提示条。撤销必须真实调用后端恢复数据，不做假撤销。 */
export default function UndoBanner({ message, undoLabel = '撤销', onUndo, onDismiss }: {
  message: string
  undoLabel?: string
  onUndo: () => void
  onDismiss: () => void
}) {
  const undoRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { undoRef.current?.focus() }, [])
  return (
    <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">{message}</p>
      <div className="flex gap-2">
        <button ref={undoRef} type="button" onClick={onUndo} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">{undoLabel}</button>
        <button type="button" onClick={onDismiss} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">知道了</button>
      </div>
    </div>
  )
}
