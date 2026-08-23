#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0
const pass = (message) => { passed += 1; console.log(`PASS ${message}`) }
const root = path.resolve(import.meta.dirname, '..')
const app = readFileSync(path.join(root, 'frontend/src/App.tsx'), 'utf8')
const battlecard = readFileSync(path.join(root, 'frontend/src/pages/BattlecardPage.tsx'), 'utf8')

assert.match(app, /<aside[^>]*className="[^"]*hidden[^"]*md:flex[^"]*"/)
assert.match(app, /<nav aria-label="主导航" className="[^"]*fixed inset-x-0 bottom-0[^"]*md:hidden[^"]*"/)
pass('宽屏侧栏与窄屏底部导航使用同一 md 断点且显示互斥')

assert.match(app, /<div className="min-h-screen md:pl-64">/)
assert.match(app, /<aside[^>]*className="[^"]*w-64[^"]*"/)
pass('宽屏内容左内边距与固定 64 宽侧栏一致，不会被遮挡')

assert.match(app, /<main[^>]*className="[^"]*max-w-6xl[^"]*px-5[^"]*pb-28[^"]*md:px-10[^"]*"/)
assert.match(battlecard, /<section[^>]*className="mx-auto max-w-4xl"/)
pass('内容区限制全局宽度，作战包另限 max-w-4xl 并居中留白')

assert.match(app, /href="#main-content"[^>]*focus:translate-y-0[^>]*focus-visible:outline-2/)
assert.match(app, /focus-visible:outline-emerald-600/)
pass('跳转主内容与导航交互均有明确键盘焦点样式')

assert.equal(/overflow-x-(?:scroll|auto)/.test(app), false)
pass('应用外壳未引入横向滚动容器')

console.log(`\nT47 宽屏布局专项验证通过：${passed}/5`)
