#!/usr/bin/env node

import assert from 'node:assert/strict'
import { NAV_ITEMS, createNavigationStore, resolveRoute } from '../frontend/src/lib/navigation.ts'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }

for (const item of NAV_ITEMS) {
  assert.deepEqual(resolveRoute(item.path), { kind: 'page', route: item.route, path: item.path })
}
pass('四个一级入口都映射到独立稳定路径')

class FakeBrowser {
  listeners = new Set()
  constructor(initialPath) {
    this.stack = [initialPath]
    this.index = 0
    this.location = { pathname: initialPath }
    this.history = { pushState: (_data, _unused, url) => {
      const path = String(url)
      this.stack = this.stack.slice(0, this.index + 1)
      this.stack.push(path)
      this.index += 1
      this.location.pathname = path
    } }
  }
  addEventListener(_type, listener) { this.listeners.add(listener) }
  removeEventListener(_type, listener) { this.listeners.delete(listener) }
  emitPopState() { this.listeners.forEach((listener) => listener()) }
  back() { this.index = Math.max(0, this.index - 1); this.location.pathname = this.stack[this.index]; this.emitPopState() }
  forward() { this.index = Math.min(this.stack.length - 1, this.index + 1); this.location.pathname = this.stack[this.index]; this.emitPopState() }
}

const browser = new FakeBrowser('/todos')
const navigation = createNavigationStore(browser)
const unsubscribe = navigation.subscribe(() => undefined)
navigation.navigate('/reviews')
navigation.navigate('/me')
assert.equal(navigation.getSnapshot().kind === 'page' && navigation.getSnapshot().route, 'me')
browser.back()
assert.equal(navigation.getSnapshot().kind === 'page' && navigation.getSnapshot().route, 'reviews')
browser.forward()
assert.equal(navigation.getSnapshot().kind === 'page' && navigation.getSnapshot().route, 'me')
pass('pushState、浏览器后退和前进会同步当前页面')

const refreshed = createNavigationStore(new FakeBrowser('/reviews'))
assert.equal(refreshed.getSnapshot().kind === 'page' && refreshed.getSnapshot().route, 'reviews')
pass('刷新后可由地址栏路径恢复当前页面')

assert.deepEqual(resolveRoute('/does-not-exist'), { kind: 'not-found', path: '/does-not-exist' })
pass('未知路径进入可读 404 状态')
assert.equal(resolveRoute('/').kind === 'page' && resolveRoute('/').route, 'todos')
assert.equal(resolveRoute('/me/').kind === 'page' && resolveRoute('/me/').route, 'me')
pass('根路径与尾斜杠路径有确定性处理')

unsubscribe()
navigation.dispose()
refreshed.dispose()
console.log(`\nT29 检查点：通过 ${passed} / 5`)
