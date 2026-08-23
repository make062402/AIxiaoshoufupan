export function LoadingState({ message = '正在加载…' }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-44 place-items-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
      <div>
        <span aria-hidden="true" className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-700" />
        <p className="mt-4 font-semibold text-slate-700">{message}</p>
        <p className="mt-1 text-sm text-slate-500">请稍候，不需要重复操作</p>
      </div>
    </div>
  )
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="grid min-h-44 place-items-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center">
      <div>
        <span aria-hidden="true" className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-lg font-black text-rose-700">!</span>
        <h3 className="mt-3 font-bold text-rose-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-rose-800">{message}</p>
        <button type="button" onClick={onRetry} className="mt-5 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-600">
          重新加载
        </button>
      </div>
    </div>
  )
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <div>
        <span aria-hidden="true" className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-lg text-slate-400">○</span>
        <h3 className="mt-3 font-bold text-slate-800">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
      </div>
    </div>
  )
}
