import { useEffect, useState } from 'react'

/**
 * 悬浮「回到顶部」按钮：页面滚动到非顶部时才出现，固定在右下角，
 * 不遮挡底部 Tab 与安全区。点击平滑滚回顶部。
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 240)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null
  return (
    <button
      type="button"
      aria-label="回到顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))] right-5 z-40 grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-black text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      ↑
    </button>
  )
}
