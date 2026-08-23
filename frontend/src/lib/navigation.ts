export type AppRoute = 'todos' | 'new' | 'reviews' | 'me'

export const NAV_ITEMS = [
  { route: 'todos', path: '/todos', label: '待办', icon: '✓' },
  { route: 'new', path: '/new', label: '新建', icon: '＋' },
  { route: 'reviews', path: '/reviews', label: '复盘', icon: '↗' },
  { route: 'me', path: '/me', label: '我的', icon: '○' },
] as const satisfies ReadonlyArray<{ route: AppRoute; path: string; label: string; icon: string }>

export type RouteSnapshot =
  | { kind: 'page'; route: AppRoute; path: string }
  | { kind: 'not-found'; path: string }

export interface NavigationEnvironment {
  location: { pathname: string }
  history: { pushState(data: unknown, unused: string, url?: string | URL | null): void }
  addEventListener(type: 'popstate', listener: () => void): void
  removeEventListener(type: 'popstate', listener: () => void): void
}

export function resolveRoute(pathname: string): RouteSnapshot {
  const cleanPath = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const effectivePath = cleanPath === '/' ? '/todos' : cleanPath
  if (effectivePath === '/me/customers') {
    return { kind: 'page', route: 'me', path: effectivePath }
  }
  if (/^\/me\/customers\/[1-9]\d*$/.test(effectivePath)) {
    return { kind: 'page', route: 'me', path: effectivePath }
  }
  if (effectivePath === '/reviews/details') {
    return { kind: 'page', route: 'reviews', path: effectivePath }
  }
  const item = NAV_ITEMS.find((candidate) => candidate.path === effectivePath)
  return item ? { kind: 'page', route: item.route, path: effectivePath } : { kind: 'not-found', path: cleanPath }
}

export function createNavigationStore(environment: NavigationEnvironment) {
  let snapshot = resolveRoute(environment.location.pathname)
  const listeners = new Set<(next: RouteSnapshot) => void>()
  const publish = () => {
    snapshot = resolveRoute(environment.location.pathname)
    listeners.forEach((listener) => listener(snapshot))
  }
  return {
    getSnapshot: () => snapshot,
    navigate(path: string) {
      if (environment.location.pathname !== path) environment.history.pushState(null, '', path)
      publish()
    },
    subscribe(listener: (next: RouteSnapshot) => void) {
      listeners.add(listener)
      if (listeners.size === 1) environment.addEventListener('popstate', publish)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) environment.removeEventListener('popstate', publish)
      }
    },
    dispose() {
      environment.removeEventListener('popstate', publish)
      listeners.clear()
    },
  }
}
