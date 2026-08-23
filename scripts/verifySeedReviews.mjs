#!/usr/bin/env node
/**
 * seed.ts 客户档案与历史复盘自检 —— T15 追加
 *
 * 用法（项目根目录）：
 *   node scripts/verifySeedReviews.mjs
 *
 * 退出码：全通过 0，有失败项 1。
 *
 * ------------------------------------------------------------------
 * 【为什么新建这个脚本，而不是改 scripts/verifyTranscript.mjs】
 *   verifyTranscript.mjs 是 T13 / T14 两份样本的验收基准，在 T15 的禁改名单里。
 *   它验的是 frontend/src/samples/ 下的两个 TS 模块（默认导出一个数组），
 *   而这里要验的是 backend/src/seed.ts 里 6 条 review 对象的字段联动，
 *   两者输入形态完全不同，塞进同一个脚本只会把它改坏。
 *
 * 【和那个脚本共享的三条原则】
 *   1. **真求值，不正则抽取**：把 seed.ts 用 tsx 载入求值后逐条断言。
 *      正则会静默跳过字段畸形的片段，那恰恰是最该抓的错。
 *   2. **关键词现场解析，不手抄**：卖点命中数从 seed.ts 自己的 products
 *      现场读 sales_keywords，否则等于自己给自己判卷。
 *   3. **阈值现场读 config/scoring.ts**：scores 由阈值反推，不在本脚本里抄一份。
 *
 * 【验什么】
 *   A 档案稀疏度 —— 7 个客户各填了 §3.1 八项里的几项，对上 S1=3 / S2=6 / S3=8。
 *   B 客户状态派生 —— reviews 条数 → S1/S2/S3，与 A 的期望一致。
 *   C 剧情主线 —— 何薇两条 d4 均为 0；张国庆 R1 < R2（改进主线）。
 *   D 逐字稿格式 —— 四字段、speaker 枚举、start<end、按 start 升序。
 *   E 引文对齐 —— aiResult 里每个 {quote,start}、**以及 needs 表每行的
 *      {quote,timestampSec}**，都能在对应 review 的 transcript 中逐字命中。
 *   F metrics ↔ transcript 实算比对 —— 说话占比、时间轴重叠（打断）、
 *      客户问句数、卖点命中数。**这几项目前预期会 FAIL**，因为 P1 尚未执行；
 *      脚本会把实算值与存值并排打出来，T15-b/c/d 扩写完应全部转 PASS。
 *   G scores 自洽 —— 按 config/scoring.ts 的阈值与「几项中几项」规则反推 d1~d4，
 *      并校验 total === d1+d2+d3+d4。
 *
 * 【F/G 为什么允许暂时 FAIL】
 *   T15 拆成了四轮：本轮（T15-a）只做档案稀疏，逐字稿扩写留给后三轮。
 *   脚本用 `--strict` 控制：不带该参数时 F/G 的失败只记为 ⚠️ PENDING 不影响退出码；
 *   带 `--strict` 时按 FAIL 计。P1 全部做完后应当能 `--strict` 通过。
 * ------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const STRICT = process.argv.includes('--strict')

let pass = 0
let fail = 0
let pending = 0

const ok = (msg) => { pass++; console.log(`  ✅ ${msg}`) }
const bad = (msg) => { fail++; console.log(`  ❌ ${msg}`) }
/** 未到执行时机的检查项：不带 --strict 时不计入退出码 */
const soft = (msg) => {
  if (STRICT) { fail++; console.log(`  ❌ ${msg}`) }
  else { pending++; console.log(`  ⚠️  PENDING ${msg}`) }
}
const head = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`)

/* ============================================================
 * 载入数据
 *
 * seed.ts 里的 customers / reviews 写在 seed() 函数内的
 * db.insert(...).values([...]) 里，且引用了 S/C/F/ROLE/at 等局部助手，
 * 单独把数组切出来求值会因为缺少这些标识符而失败。
 *
 * 所以这里**直接读 backend/data/app.db**——读回来的是真正入库的样子，
 * 写法上任何一处失误（列名拼错、JSON 没序列化、null 写成了 'null'）都会暴露。
 * 前置条件：先跑过 `cd backend && npm run db:seed`。
 *
 * 用 better-sqlite3 裸 SQL，不经 Drizzle：绕开 TS 加载，也顺带验证
 * JSON 列在库里确实是合法 JSON 而不是被 Drizzle 掩盖的怪东西。
 * ============================================================ */
const require = createRequire(path.join(ROOT, 'backend/package.json'))

function loadFromDb() {
  const Database = require('better-sqlite3')
  const file = path.join(ROOT, 'backend/data/app.db')
  const sqlite = new Database(file, { readonly: true, fileMustExist: true })
  const J = (v) => (v === null || v === undefined ? null : JSON.parse(v))
  const customers = sqlite.prepare('SELECT * FROM customers ORDER BY id').all()
    .map((c) => ({
      id: c.id, name: c.name, identity: c.identity, phone: c.phone, role: c.role,
      budget: c.budget, coreNeed: c.core_need, priorityOrder: J(c.priority_order),
      notes: c.notes, deadline: c.deadline, intentLevel: c.intent_level,
    }))
  const reviews = sqlite.prepare('SELECT * FROM reviews ORDER BY id').all()
    .map((r) => ({
      id: r.id, customerId: r.customer_id, transcript: J(r.transcript),
      metrics: J(r.metrics), scores: J(r.scores), aiResult: J(r.ai_result),
    }))
  const needRows = sqlite.prepare('SELECT * FROM needs ORDER BY id').all()
    .map((n) => ({ id: n.id, reviewId: n.review_id, level: n.level, quote: n.quote, timestampSec: n.timestamp_sec }))
  const products = sqlite.prepare('SELECT * FROM products ORDER BY id').all()
    .map((p) => ({ id: p.id, name: p.name, industry: p.industry, sellingPoints: J(p.selling_points) }))
  sqlite.close()
  return { customers, reviews, products, needRows }
}

/** 把 config/scoring.ts 的类型语法剥掉后交给 JS 引擎求值——阈值不在本脚本里抄第二份 */
function loadThresholds() {
  const js = readFileSync(path.join(ROOT, 'frontend/src/config/scoring.ts'), 'utf8')
    .replace(/^export interface [\s\S]*?^}/gm, '')
    .replace(/^export type .*$/gm, '')
    .replace(/\bas const\b/g, '')
    .replace(/export const (\w+)\s*:[^=]+=/g, 'const $1 =')
    .replace(/^export const /gm, 'const ')
  const names = ['D1_THRESHOLDS', 'D2_THRESHOLDS', 'D3_THRESHOLDS', 'D4_THRESHOLDS',
    'DIMENSION_RULES', 'COVERAGE_DENOMINATOR', 'COVERAGE_THRESHOLD', 'COVERAGE_ROUNDING']
  return new Function(`${js}\nreturn { ${names.join(', ')} }`)()
}

/* ---------- §3.1 八项档案的判定：一项只要有任意一列非空即算已填 ---------- */
const PROFILE_ITEMS = [
  { no: 1, name: '称呼与身份', cols: ['name', 'identity'] },
  { no: 2, name: '联系方式', cols: ['phone'] },
  { no: 3, name: '在采购中的角色', cols: ['role'] },
  { no: 4, name: '预算区间', cols: ['budget'] },
  { no: 5, name: '核心需求与购买意向', cols: ['coreNeed'] },
  { no: 6, name: '关注维度优先级排序', cols: ['priorityOrder'] },
  { no: 7, name: '注意事项', cols: ['notes'] },
  { no: 8, name: '采购时间点/交付期限', cols: ['deadline'] },
]

const isFilled = (v) => {
  if (v === null || v === undefined) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') return v.trim() !== ''
  return true
}

const filledItems = (c) =>
  PROFILE_ITEMS.filter((it) => it.cols.some((col) => isFilled(c[col])))

/* ---------- 期望表（T15 交接文档定死的） ---------- */
const EXPECT = {
  张国庆: { state: 'S3', items: 8, reviews: 2 },
  何薇: { state: 'S3', items: 8, reviews: 2 },
  刘敏: { state: 'S2', items: 6, reviews: 1 },
  郑帆: { state: 'S2', items: 6, reviews: 1 },
  苏晓彤: { state: 'S1', items: 3, reviews: 0 },
  马红梅: { state: 'S1', items: 3, reviews: 0 },
  高建军: { state: 'S1', items: 3, reviews: 0 },
}

const stateOf = (n) => (n === 0 ? 'S1' : n === 1 ? 'S2' : 'S3')

/* ============================================================ */
function main() {
  const { customers, reviews, products, needRows } = loadFromDb()

  /* ---------- A 档案稀疏度 ---------- */
  head('A. 客户档案稀疏度（§3.1 八项口径，P2b）')
  for (const [name, exp] of Object.entries(EXPECT)) {
    const c = customers.find((x) => x.name === name)
    if (!c) { bad(`${name}：库里找不到这个客户`); continue }
    const filled = filledItems(c)
    const blank = PROFILE_ITEMS.filter((it) => !filled.includes(it))
    const detail = `已填 ${filled.map((i) => i.no).join(' ')}｜留空 ${blank.map((i) => i.no).join(' ') || '—'}`
    if (filled.length === exp.items) ok(`${name} ${exp.state} 填 ${filled.length}/8 项　${detail}`)
    else bad(`${name} 期望填 ${exp.items} 项，实为 ${filled.length} 项　${detail}`)
  }

  /* ---------- B 状态派生 ---------- */
  head('B. S1/S2/S3 由 reviews 条数派生（不落字段）')
  for (const [name, exp] of Object.entries(EXPECT)) {
    const c = customers.find((x) => x.name === name)
    if (!c) continue
    const n = reviews.filter((r) => r.customerId === c.id).length
    const s = stateOf(n)
    if (n === exp.reviews && s === exp.state) ok(`${name}：${n} 条复盘 → ${s}`)
    else bad(`${name}：期望 ${exp.reviews} 条(${exp.state})，实为 ${n} 条(${s})`)
  }
  const hasStatusCol = customers.some((c) =>
    Object.keys(c).some((k) => /^(status|stage|s_?level)$/i.test(k)))
  hasStatusCol ? bad('customers 表出现了状态字段，违反技术方案 3.4 决策 1')
    : ok('customers 表无 S1/S2/S3 字段，状态确为派生值')

  /* ---------- C 剧情主线 ---------- */
  head('C. 两条剧情主线')
  const byName = (n) => {
    const c = customers.find((x) => x.name === n)
    return reviews.filter((r) => r.customerId === c?.id).sort((a, b) => a.id - b.id)
  }
  const he = byName('何薇')
  if (he.length === 2 && he.every((r) => r.scores?.d4 === 0))
    ok(`何薇两条复盘的 d4 均为 0（total ${he.map((r) => r.scores.total).join(' / ')}）—— 验收第 3 条的落点`)
  else bad(`何薇两条的 d4 应均为 0，实为 ${he.map((r) => r.scores?.d4).join(' / ')}`)

  const zh = byName('张国庆')
  if (zh.length === 2 && zh[1].scores?.total > zh[0].scores?.total)
    ok(`张国庆改进主线成立：${zh[0].scores.total} 分 → ${zh[1].scores.total} 分`)
  else bad(`张国庆两条应体现改进（后一条总分更高），实为 ${zh.map((r) => r.scores?.total).join(' / ')}`)

  /* ---------- D 逐字稿格式（T07） ---------- */
  head('D. 6 条逐字稿的 T07 硬性格式')
  const FIELDS = ['speaker', 'start', 'end', 'text']
  reviews.forEach((r, i) => {
    const t = r.transcript
    const errs = []
    if (!Array.isArray(t) || t.length === 0) errs.push('transcript 不是非空数组')
    else t.forEach((seg, j) => {
      const keys = Object.keys(seg).sort().join(',')
      if (keys !== FIELDS.slice().sort().join(',')) errs.push(`#${j} 字段=${keys}`)
      if (seg.speaker !== 'sales' && seg.speaker !== 'customer') errs.push(`#${j} speaker=${seg.speaker}`)
      if (typeof seg.start !== 'number' || typeof seg.end !== 'number') errs.push(`#${j} 时间非数字`)
      else if (seg.end <= seg.start) errs.push(`#${j} end<=start`)
      if (j > 0 && seg.start < t[j - 1].start) errs.push(`#${j} 未按 start 升序`)
    })
    errs.length ? bad(`R${i + 1}：${errs.slice(0, 4).join('；')}`)
      : ok(`R${i + 1}：${t.length} 条，${t[t.length - 1].end.toFixed(1)} 秒，格式全部合规`)
  })

  /* ---------- E 引文对齐（坑一） ----------
   * 两个来源都要查，缺一个就有静默失配的盲区：
   *   ① reviews.ai_result 里的 needs/highlights/... —— 键名是 start
   *   ② needs 这张表本身 —— 键名是 timestamp_sec，语义完全相同，同样是 T37 的定位依据
   * ② 是 T15-b 补进来的：在那之前 E 节只查 ①，结果 P1b 那次修复只改了 aiResult、
   * 漏掉了 needs 表里的同一句，脚本却一路绿灯。补上当天就抓到了那一行。
   */
  head('E. 引文与逐字稿逐字一致（T37 的唯一定位依据）')
  /** 逐条比对 {quote, 时间点} 是否能在 transcript 里逐字命中 */
  const checkQuotes = (t, items, key) => {
    const errs = []
    for (const q of items) {
      const at = q[key]
      const seg = t.find((s) => Math.abs(s.start - at) < 1e-9)
      if (!seg) { errs.push(`${key}=${at} 没有对应片段`); continue }
      if (q.quote && !seg.text.includes(q.quote)) errs.push(`${key}=${at} 引文不在原文中：「${q.quote.slice(0, 18)}…」`)
    }
    return errs
  }
  reviews.forEach((r, i) => {
    const t = r.transcript ?? []
    const a = r.aiResult ?? {}
    const quoted = [
      ...(a.needs ?? []), ...(a.highlights ?? []), ...(a.improvements ?? []),
      ...(a.commitments ?? []), ...(a.missed_points ?? []), ...(a.next_actions ?? []),
    ].filter((x) => x && typeof x.start === 'number')
    const errs = checkQuotes(t, quoted, 'start')
    errs.length ? bad(`R${i + 1} aiResult：${errs.join('；')}`)
      : ok(`R${i + 1} aiResult：${quoted.length} 处引用全部命中原文`)

    const mine = needRows.filter((n) => n.reviewId === r.id && typeof n.timestampSec === 'number')
    const nErrs = checkQuotes(t, mine, 'timestampSec')
    nErrs.length ? bad(`R${i + 1} needs 表：${nErrs.join('；')}`)
      : ok(`R${i + 1} needs 表：${mine.length} 行引文全部命中原文`)
  })

  /* ---------- F metrics 实算比对（P1 未做完时预期 PENDING） ---------- */
  head('F. metrics ↔ transcript 实算比对（P1 做完前预期 PENDING）')
  const salesKeywords = products.flatMap((p) =>
    (p.sellingPoints ?? []).map((sp) => ({ product: p.name, tag: sp.tag, words: sp.sales_keywords ?? [] })))

  reviews.forEach((r, i) => {
    const t = r.transcript ?? []
    const m = r.metrics ?? {}
    const dur = (sp) => t.filter((s) => s.speaker === sp).reduce((n, s) => n + (s.end - s.start), 0)
    const total = t.length ? t[t.length - 1].end : 0
    const ratio = +(dur('sales') / (dur('sales') + dur('customer'))).toFixed(3)
    // 打断 = 销售发言的 start 落在前一条客户发言的 [start, end) 内
    let overlaps = 0
    for (let j = 1; j < t.length; j++)
      if (t[j].speaker === 'sales' && t[j - 1].speaker === 'customer'
        && t[j].start >= t[j - 1].start && t[j].start < t[j - 1].end) overlaps++
    const iph = total ? +(overlaps / (total / 3600)).toFixed(2) : 0
    const cq = t.filter((s) => s.speaker === 'customer' && /[？?]/.test(s.text)).length
    const salesText = t.filter((s) => s.speaker === 'sales').map((s) => s.text).join('\n')
    const hits = salesKeywords.filter((sp) => sp.words.some((w) => salesText.includes(w)))

    const rows = [
      ['sales_talk_ratio', ratio, m.sales_talk_ratio, 0.005],
      ['interrupt_per_hour', iph, m.interrupt_per_hour, 0.05],
      ['customer_question_count', cq, m.customer_question_count, 0],
      ['selling_point_hit_count', hits.length, m.selling_point_hit_count, 0],
    ]
    const diffs = rows.filter(([, real, stored, tol]) => Math.abs(real - stored) > tol)
    const firstSpeakOk = (m.customer_first_speak_at ?? 0) <= total
    if (!firstSpeakOk) diffs.push(['customer_first_speak_at', `≤${total.toFixed(1)}`, m.customer_first_speak_at, 0])

    if (!diffs.length) ok(`R${i + 1}：4 项实算值与存值一致（ratio ${ratio}、iph ${iph}、客户问句 ${cq}、卖点 ${hits.length}）`)
    else soft(`R${i + 1}：${diffs.map(([k, real, stored]) => `${k} 实算 ${real} ≠ 存 ${stored}`).join('；')}`)

    // 跨行业卖点误命中提醒（坑二）
    const cross = hits.filter((h) => products.find((p) => p.name === h.product)?.industry !== '装修')
    if (cross.length) console.log(`      ↳ ⚠️ 跨行业命中：${cross.map((c) => `${c.product}/${c.tag}`).join('、')}`)
  })

  /* ---------- G scores 由阈值反推 ---------- */
  head('G. scores 由 config/scoring.ts 的阈值反推')
  const sc = loadThresholds()
  const { D1_THRESHOLDS: T1, D2_THRESHOLDS: T2, D3_THRESHOLDS: T3, D4_THRESHOLDS: T4,
    DIMENSION_RULES: RULES, COVERAGE_DENOMINATOR: DEN, COVERAGE_THRESHOLD: CTH,
    COVERAGE_ROUNDING: CRD } = sc
  const needCovered = Math[CRD](DEN * CTH)

  reviews.forEach((r, i) => {
    const m = r.metrics ?? {}
    const d1 = [
      m.icebreak_duration >= T1.icebreak_duration.min && m.icebreak_duration <= T1.icebreak_duration.max,
      m.interrupt_per_hour <= T1.interrupt_per_hour.max,
    ]
    const d2 = [
      m.customer_first_speak_at <= T2.customer_first_speak_at.max,
      m.sales_talk_ratio <= T2.sales_talk_ratio.max,
      m.profile_covered_count >= needCovered,
      m.total_question_count > 0 && m.open_question_count / m.total_question_count >= T2.open_question_rate.min,
      m.customer_question_count >= T2.customer_question_count.min,
    ]
    const d3 = [
      m.selling_point_hit_count >= T3.selling_point_hit_count.min,
      m.need_total_count > 0 && m.need_matched_count / m.need_total_count >= T3.need_match_rate.min,
      m.param_error_count <= T3.param_error_count.max,
      m.max_repeat_followup <= T3.max_repeat_followup.max,
    ]
    const d4 = [
      m.objection_response_rate >= T4.objection_response_rate.min,
      m.objection_response_delay <= T4.objection_response_delay.max,
      m.next_step_locked === T4.next_step_locked.required,
    ]
    const score = (arr, key) => (arr.filter(Boolean).length >= RULES[key].required ? 1 : 0)
    const calc = { d1: score(d1, 'd1'), d2: score(d2, 'd2'), d3: score(d3, 'd3'), d4: score(d4, 'd4') }
    calc.total = calc.d1 + calc.d2 + calc.d3 + calc.d4
    const s = r.scores ?? {}
    const same = ['d1', 'd2', 'd3', 'd4', 'total'].every((k) => calc[k] === s[k])
    const fmt = (o) => `d1=${o.d1} d2=${o.d2} d3=${o.d3} d4=${o.d4} total=${o.total}`
    if (!same) bad(`R${i + 1}：反推 ${fmt(calc)}，存的 ${fmt(s)}`)
    else if (s.total !== s.d1 + s.d2 + s.d3 + s.d4) bad(`R${i + 1}：total ≠ d1+d2+d3+d4`)
    else ok(`R${i + 1}：${fmt(calc)}　（达标项 ${d1.filter(Boolean).length}/2 ${d2.filter(Boolean).length}/5 ${d3.filter(Boolean).length}/4 ${d4.filter(Boolean).length}/3）`)
  })

  /* ---------- 汇总 ---------- */
  head('汇总')
  console.log(`  通过 ${pass}　失败 ${fail}　待办(P1 未做完) ${pending}`)
  if (!STRICT && pending) console.log('  ⚠️  PENDING 项要等 T15-b/c/d 扩写完逐字稿后跑 --strict 复验。')
  console.log(`\n  ⚠️ 脚本通过 ≠ 验收通过。清单原文的四条仍需人工按 docs/进度.md 的口径核对。`)
  process.exit(fail ? 1 : 0)
}

try {
  main()
} catch (e) {
  console.error('脚本自身出错：', e)
  process.exit(1)
}
