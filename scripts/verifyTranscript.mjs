#!/usr/bin/env node
/**
 * 逐字稿样本自检脚本 —— T13 / T14 共用
 * ============================================================================
 *
 * 用法（在项目根目录跑）：
 *
 *   node scripts/verifyTranscript.mjs        # 默认校验样本 A
 *   node scripts/verifyTranscript.mjs A
 *   node scripts/verifyTranscript.mjs B      # T14 写完样本 B 后填好下方 EXPECT.B 再跑
 *
 * 退出码：全部通过 0，有失败项 1。
 *
 * ----------------------------------------------------------------------------
 * 这个脚本能验什么、不能验什么 —— 用之前务必先读这段
 * ----------------------------------------------------------------------------
 *
 * 【能验】三类，都是客观事实，换谁实现都一样：
 *   1. T07 硬性格式：字段集合、类型、秒、升序、条数、时长区间。
 *   2. 纯算术指标：说话占比、时间轴重叠（打断）、问句数、片段时长统计。
 *   3. 与产品库的一致性：卖点是否命中 seed.ts 里真实的 sales_keywords、
 *      稿中出现的参数是否与 products.params 对得上。
 *      —— 关键词一律从 backend/src/seed.ts 现场解析，不在本文件里手抄，
 *         否则等于自己给自己判卷，产品库改了也发现不了。
 *
 * 【不能验】需要理解语义才能数出来的那几项，本脚本只做「注释声称值 vs 阈值」
 *   的算术核对，不能证明声称值本身是对的：
 *     · profile_covered_count（关键信息覆盖率）
 *     · open_question_count（开放式提问，总提问数可数，开放与否不可数）
 *     · need_matched_count / need_total_count（需求-卖点对齐率）
 *     · max_repeat_followup（同一话题追问，依赖话题聚类）
 *     · objection_response_rate / delay（依赖异议识别与「实质回应」判定）
 *   这五项要等 T20 / T22 / T27 写出来才算数。在那之前它们是「口径假设下的
 *   预期值」，不是已验证的事实。详见 docs/进度.md 的 P5。
 *
 * 【所以】本脚本通过 ≠ 样本验收通过。任务清单原文写了「T24 整体验证由你自己
 *   做，不能交给 AI」，这条对本脚本同样成立。
 */

import fs from 'node:fs'
import path from 'node:path'

/* ============================================================
 * 一、样本登记表
 *   新增样本时只改这里，下面的校验逻辑不用动。
 * ============================================================ */

const SAMPLES = {
  A: {
    file: 'frontend/src/samples/transcriptA.ts',
    exportName: 'transcriptA',
    title: 'T13 样本 A —— 打得差的那份',
    /** 文件头注释里声称的值，本脚本逐条与实算结果比对 */
    claim: {
      segmentCount: 96,
      salesSegments: 48,
      customerSegments: 48,
      salesDuration: 1300.4,
      customerDuration: 364.4,
      lastEnd: 1761.2,
      salesTalkRatio: 0.7811,
      interruptCount: 1,
      icebreakDuration: 79.5,
      customerFirstSpeakAt: 272.5,
      salesQuestionCount: 9, // total_question_count
      customerQuestionMarks: 13, // customer_question_count（按问号句）
      sellingPointHitCount: 7,
      paramErrorCount: 1,
      expectedTotalScore: 1,
    },
    /** 目标区间（T13 交接文档规定） */
    range: {
      lastEnd: [1700, 1900],
      salesTalkRatio: [0.75, 0.8],
      icebreakDuration: [40, 90],
      minSegments: 60,
    },
    /** 客户首次主动发言之前，客户只许说纯应答短句 */
    pureAckBefore: { until: 180, maxChars: 12 },
    /** 破冰段内不得出现业务词 */
    icebreakEndsAt: 79.5,
    /** 那处故意说错的参数 */
    paramError: {
      needle: '整体保五年',
      product: '全屋整装 · 悦享款',
      paramKey: '质保',
      why: '产品库是「整体 2 年，隐蔽工程 5 年」，销售把隐蔽工程的 5 年安到了整体上',
    },
    /** 刻意漏讲的卖点（应当命中不了） */
    mustMissSellingPoint: '甲醛可复测',
    /** 结尾不得出现具体时间承诺（next_step_locked = false） */
    expectNextStepLocked: false,
    /**
     * 同一组数字目前手抄在三处：本样本头注释、docs/进度.md、上面的 claim。
     * 三份副本迟早漂移（本项目的 P1b 就是这么来的），所以这里挑一批
     * 辨识度高、不会误命中的数值，要求它们在前两处都出现。
     *
     * ⚠️ 已知盲区，实测确认过：这是**存在性**检查，不是逐处一致性检查。
     *    同一个数值在 docs 的一节里往往出现多次（例如 0.781 同时在
     *    「四个特征」表和「14 项指标」表里）。把其中一处改错、另一处没改，
     *    本检查仍会 PASS。它只能抓住「整体改掉 / 整段删掉 / 标题被改导致
     *    定位失败」这类漂移。逐处核对仍要人来做。
     */
    docSync: {
      file: 'docs/进度.md',
      between: ['### T13 逐字稿样本 A', '### T14 逐字稿样本 B'],
      values: ['1761.2', '1300.4', '364.4', '0.781', '79.5', '272.5', '90.6', '735.5', '1365', '2.04'],
    },
    /** 注释与 docs/进度.md 引用的锚点：时间戳 ↔ 原话必须对得上 */
    anchors: [
      [79.5, '那我就直接进正题了', '破冰结束，进入业务话题'],
      [272.5, '我最担心的不是钱，是甲醛', '客户首次主动发言'],
      [332.1, '板材呢', '甲醛话题追问 1'],
      [378.8, '我问的是甲醛，不是封边', '甲醛话题追问 2'],
      [977.7, '我刚才问的甲醛', '甲醛话题追问 3'],
      [472.8, '人家报价才九万多', '异议 1 价差三万'],
      [577.4, '一分钱一分货', '异议 1 敷衍'],
      [821.0, '是不是先把水分加进去了', '异议 2 一口价掺水'],
      [911.6, '您最担心哪一项被虚报', '异议 2 实质回应'],
      [1141.9, '停工、拖了两三个月的投诉', '异议 3 网上投诉'],
      [1248.3, '带您去看看正在施工的工地', '异议 3 敷衍'],
      [735.5, '整体保五年', '★ 参数说错'],
      [1365.0, '不是不是，您别急', '★ 打断'],
      [659.1, '您对柜子这块有什么想法', '开放式提问 1'],
      [911.6, '您最担心哪一项被虚报', '开放式提问 2'],
      [1094.1, '我妈过来住的时候用得多', 'L2 老人做饭需求'],
      [1527.1, '明年五一前后住进去', 'L1 入住时间'],
      [16.5, '哦，是吗', '早期纯应答'],
      [55.6, '上个月刚拿的钥匙', '早期应答式回答'],
    ],
    /** 稿中提到的参数，必须与产品库逐字对得上（那处故意错的除外） */
    paramChecks: [
      ['悦享款 一口价 128000', '128000', '全屋整装 · 悦享款', (p) => p.price === 128000],
      ['悦享款 适用面积 85~100㎡', '85~100㎡', '全屋整装 · 悦享款', (p) => p.params.适用面积 === '85~100 ㎡'],
      ['悦享款 工期 75 天', '75天', '全屋整装 · 悦享款', (p) => p.params.工期 === '75 天'],
      ['悦享款 主材 东鹏', '东鹏', '全屋整装 · 悦享款', (p) => p.params.主材品牌.includes('东鹏')],
      ['悦享款 主材 九牧', '九牧', '全屋整装 · 悦享款', (p) => p.params.主材品牌.includes('九牧')],
      ['悦享款 主材 立邦', '立邦', '全屋整装 · 悦享款', (p) => p.params.主材品牌.includes('立邦')],
      ['基础包 价格 39800', '39800', '环保基础施工包', (p) => p.price === 39800],
      ['基础包 环保等级 E0', 'E0', '环保基础施工包', (p) => p.params.环保等级.includes('E0')],
      ['基础包 隐蔽工程 5 年', '隐蔽工程我们保五年', '环保基础施工包', (p) => p.params.质保.includes('隐蔽工程 5 年')],
      ['定制柜 价格 26800', '26800', '全屋定制柜 · 一体化设计', (p) => p.price === 26800],
      ['定制柜 板材 爱格', '爱格', '全屋定制柜 · 一体化设计', (p) => p.params.板材.includes('爱格')],
      ['定制柜 激光封边', '激光封边', '全屋定制柜 · 一体化设计', (p) => p.params.封边.includes('激光封边')],
      ['定制柜 五金质保 10 年', '质保10年', '全屋定制柜 · 一体化设计', (p) => p.params.五金.includes('质保 10 年')],
      ['定制柜 投影面积计价', '投影面积', '全屋定制柜 · 一体化设计', (p) => p.params.计价方式.includes('投影面积')],
      ['老房局改 工期 28 天', '28天', '老房局改 · 厨卫翻新', (p) => p.params.工期 === '28 天'],
    ],
  },

  B: {
    file: 'frontend/src/samples/transcriptB.ts',
    exportName: 'transcriptB',
    title: 'T14 样本 B —— 打得好的那份（尚未创建）',
    todo: true,
    // T14 做完后照 A 的样子把 claim / range / anchors / paramChecks 填上。
    // 对照点：销售占比压到 0.6 以下、开放式提问过半、异议当场接住、结尾锁定下一步。
  },
}

/* ============================================================
 * 二、工具
 * ============================================================ */

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let failures = 0
const C = { ok: '\x1b[32m', no: '\x1b[31m', dim: '\x1b[90m', off: '\x1b[0m' }
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 2 : 1), 0)))

function check(pass, label, detail = '') {
  if (!pass) failures++
  console.log(`  ${pass ? C.ok + 'PASS' : C.no + 'FAIL'}${C.off}  ${pad(label, 40)} ${C.dim}${detail}${C.off}`)
}
function section(t) {
  console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)
}

/** 把逐字稿 .ts 去掉类型语法后交给 JS 引擎求值。
 *  刻意不用正则逐条抽取——正则会静默跳过字段畸形的片段，那正是最该抓的错。 */
function loadTranscript(file, exportName) {
  const raw = read(file)
  const js = raw
    .replace(/^\s*import\s+type\s+.*$/gm, '')
    .replace(new RegExp(`export const ${exportName}\\s*:\\s*Transcript\\s*=`), `const ${exportName} =`)
  return { raw, segs: new Function(`${js}\nreturn ${exportName}`)() }
}

/** 从 seed.ts 现场解析产品库（括号配对，不用正则硬啃） */
function loadProducts() {
  const seed = read('backend/src/seed.ts')
  const open = seed.indexOf('[', seed.indexOf('.values([', seed.indexOf('.insert(products)')))
  let depth = 0
  for (let p = open; p < seed.length; p++) {
    if (seed[p] === '[') depth++
    else if (seed[p] === ']' && --depth === 0) return new Function('return ' + seed.slice(open, p + 1))()
  }
  throw new Error('未能从 backend/src/seed.ts 解析出 products 数组')
}

/* ============================================================
 * 三、主流程
 * ============================================================ */

const key = (process.argv[2] || 'A').toUpperCase()
const cfg = SAMPLES[key]
if (!cfg) {
  console.error(`未知样本「${key}」。可选：${Object.keys(SAMPLES).join(' / ')}`)
  process.exit(2)
}
if (cfg.todo || !fs.existsSync(path.join(ROOT, cfg.file))) {
  console.error(`\n样本 ${key} 还不存在：${cfg.file}\n${cfg.title}\n`)
  console.error('T14 做完后，把本脚本 SAMPLES.B 里的 claim / range / anchors / paramChecks 照 A 填上再跑。\n')
  process.exit(2)
}

console.log(`\n${cfg.title}\n文件：${cfg.file}`)

const { raw, segs } = loadTranscript(cfg.file, cfg.exportName)
const sales = segs.filter((s) => s.speaker === 'sales')
const cust = segs.filter((s) => s.speaker === 'customer')
const sum = (a) => Math.round(a.reduce((x, y) => x + (y.end - y.start), 0) * 10) / 10
const lastEnd = segs.at(-1).end
const cl = cfg.claim
const r = cfg.range

/* ---------- 1. T07 硬性格式 ---------- */
section('一、T07 硬性格式（交接文档 5 条）')

const FIELDS = ['speaker', 'start', 'end', 'text']
const shapeErr = []
segs.forEach((s, i) => {
  const k = Object.keys(s)
  if (k.length !== 4 || !FIELDS.every((f) => k.includes(f))) shapeErr.push(`#${i} 字段=${k.join(',')}`)
  if (s.speaker !== 'sales' && s.speaker !== 'customer') shapeErr.push(`#${i} speaker=${s.speaker}`)
  if (typeof s.start !== 'number' || typeof s.end !== 'number') shapeErr.push(`#${i} start/end 非 number`)
  if (typeof s.text !== 'string' || !s.text.trim()) shapeErr.push(`#${i} text 为空`)
  if (s.end <= s.start) shapeErr.push(`#${i} end <= start`)
})
check(shapeErr.length === 0, '① 每条恰好 4 字段且类型正确', shapeErr.length ? shapeErr.join(' | ') : `${segs.length} 条全部通过`)
check(segs.every((s, i) => !i || s.start >= segs[i - 1].start), '② 数组按 start 升序', 'start 单位为秒（浮点）')
check(lastEnd >= r.lastEnd[0] && lastEnd <= r.lastEnd[1], `③ 末条 end ∈ [${r.lastEnd.join(',')}]`, lastEnd)
check(segs.length >= r.minSegments, `④ 片段数 ≥ ${r.minSegments}`, segs.length)
check(!segs.some((s) => /test\d|aaa|xxx|lorem|占位|TODO/i.test(s.text)), '⑤ 无占位符文本', '无')

/* ---------- 2. 纯算术指标 ---------- */
section('二、纯算术指标（实现无关，换谁写都是这个数）')

const sD = sum(sales)
const cD = sum(cust)
const ratio = sD / (sD + cD)
const interrupts = sales.filter((s) => cust.some((c) => s.start >= c.start && s.start < c.end))
const reverse = cust.filter((c) => sales.some((s) => c.start >= s.start && c.start < s.end))
let overlaps = 0
for (let i = 1; i < segs.length; i++) if (segs[i].start < segs[i - 1].end) overlaps++
const iph = interrupts.length / (lastEnd / 3600)
const qm = (a) => a.reduce((x, y) => x + (y.text.match(/？/g) || []).length, 0)

check(segs.length === cl.segmentCount, '片段总数', `实算 ${segs.length} / 声称 ${cl.segmentCount}`)
check(sales.length === cl.salesSegments && cust.length === cl.customerSegments, '销售 / 客户条数', `实算 ${sales.length} / ${cust.length}`)
check(sD === cl.salesDuration && cD === cl.customerDuration, '销售 / 客户总时长（秒）', `实算 ${sD} / ${cD}`)
check(lastEnd === cl.lastEnd, '总时长', `${lastEnd} 秒 ≈ ${(lastEnd / 60).toFixed(1)} 分钟`)
check(
  ratio > r.salesTalkRatio[0] && ratio < r.salesTalkRatio[1],
  `sales_talk_ratio ∈ (${r.salesTalkRatio.join(',')})`,
  `实算 ${ratio.toFixed(4)} / 声称 ${cl.salesTalkRatio}`
)
check(interrupts.length === cl.interruptCount, '打断次数（销售起话落在客户区间内）', `实算 ${interrupts.length} @ start=${interrupts.map((x) => x.start).join(',') || '无'}`)
check(reverse.length === 0, '无「客户压销售」的反向重叠', reverse.length)
check(overlaps === cl.interruptCount, '全篇时间轴重叠处数 = 打断次数', `${overlaps}（其余片段首尾相接）`)
check(iph <= 3, 'interrupt_per_hour ≤ 3（D1 阈值）', iph.toFixed(3))
check(qm(sales) === cl.salesQuestionCount, 'total_question_count（销售问号句）', `实算 ${qm(sales)} / 声称 ${cl.salesQuestionCount}`)
check(qm(cust) === cl.customerQuestionMarks, 'customer_question_count（客户问号句）', `实算 ${qm(cust)}，分布在 ${cust.filter((s) => s.text.includes('？')).length} 条`)

/* ---------- 3. 两个口径坑的防护 ---------- */
section('三、两个口径坑的防护（让 T18 / T19 怎么实现都落在同一个数上）')

const early = cust.filter((c) => c.start < cfg.pureAckBefore.until)
const tooLong = early.filter((c) => [...c.text].length > cfg.pureAckBefore.maxChars)
check(
  tooLong.length === 0,
  `前 ${cfg.pureAckBefore.until} 秒客户只有纯应答`,
  tooLong.length
    ? tooLong.map((x) => `${x.start}:${x.text}`).join(' | ')
    : `${early.length} 条，最长 ${Math.max(...early.map((x) => [...x.text].length))} 字 → 长度法与语义法都会判到 ${cl.customerFirstSpeakAt}`
)

const BIZ = ['整装', '悦享', '一口价', '报价', '工期', '质保', '甲醛', 'E0', '合同', '定制柜', '万']
const leak = segs.filter((s) => s.start < cfg.icebreakEndsAt && BIZ.some((w) => s.text.includes(w)))
check(
  leak.length === 0,
  `破冰段 0~${cfg.icebreakEndsAt} 秒无业务词泄漏`,
  leak.length ? leak.map((x) => `${x.start}:${x.text.slice(0, 18)}`).join(' | ') : `${segs.filter((s) => s.start < cfg.icebreakEndsAt).length} 条纯寒暄，边界干净`
)
check(
  cl.icebreakDuration >= r.icebreakDuration[0] && cl.icebreakDuration <= r.icebreakDuration[1],
  `icebreak_duration ∈ [${r.icebreakDuration.join(',')}]`,
  `${cl.icebreakDuration}（D1 阈值 15~120）`
)

/* ---------- 4. 与产品库对照 ---------- */
section('四、与产品库对照（关键词现场解析自 backend/src/seed.ts，未手抄）')

const products = loadProducts()
const deco = products.filter((p) => p.industry === '装修')
console.log(`  ${C.dim}产品库解析成功：共 ${products.length} 个，装修 ${deco.length} 个${C.off}`)

const flat = sales.map((s) => s.text).join('\n').replace(/\s/g, '')
const norm = (s) => s.replace(/\s/g, '')

const hits = []
for (const p of products)
  for (const sp of p.sellingPoints) {
    const m = sp.sales_keywords.filter((k) => flat.includes(norm(k)))
    if (m.length) hits.push([sp.tag, m])
  }
hits.forEach(([tag, m]) => console.log(`  ${C.dim}命中 ${pad(tag, 20)} ← ${m.join('、')}${C.off}`))
check(hits.length === cl.sellingPointHitCount, 'selling_point_hit_count', `实算 ${hits.length} / 声称 ${cl.sellingPointHitCount}（D3 阈值 ≥ 3）`)

if (cfg.mustMissSellingPoint) {
  const miss = products.flatMap((p) => p.sellingPoints).find((s) => s.tag === cfg.mustMissSellingPoint)
  check(
    miss && !miss.sales_keywords.some((k) => flat.includes(norm(k))),
    `「${cfg.mustMissSellingPoint}」刻意未命中`,
    '销售全程没讲 ' + miss.sales_keywords.join('/')
  )
}

const cn = flat
  .replace(/十二万八/g, '128000')
  .replace(/两万六千八/g, '26800')
  .replace(/三万九千八/g, '39800')
  .replace(/七十五天/g, '75天')
  .replace(/二十八天/g, '28天')
  .replace(/八十五到一百平/g, '85~100㎡')
  .replace(/质保十年/g, '质保10年')

for (const [label, needle, prodName, libOk] of cfg.paramChecks) {
  const p = products.find((x) => x.name === prodName)
  const inScript = cn.includes(needle)
  check(inScript && p && libOk(p), label, inScript ? '稿中出现且与产品库一致' : '稿中未提及该参数')
}

/* ---------- 5. 那处故意说错的 ---------- */
section('五、故意说错的那一处（param_error_count）')

const pe = cfg.paramError
const wrongSegs = sales.filter((s) => s.text.includes(pe.needle))
const prod = products.find((p) => p.name === pe.product)
console.log(`  ${C.dim}产品库《${pe.product}》params.${pe.paramKey} = 「${prod.params[pe.paramKey]}」${C.off}`)
console.log(`  ${C.dim}稿中 ${wrongSegs.map((s) => s.start).join(',')} 秒 = 「${pe.needle}」 —— ${pe.why}${C.off}`)
check(wrongSegs.length === cl.paramErrorCount, `param_error_count = ${cl.paramErrorCount}（只此一处）`, `匹配到 ${wrongSegs.length} 条`)

/* ---------- 6. 结尾三要素 ---------- */
section('六、结尾（next_step_locked）')

const tail = segs.slice(-4)
tail.forEach((s) => console.log(`  ${C.dim}${pad(s.speaker, 9)}${s.start}~${s.end}  ${s.text}${C.off}`))
const hasTime = /周[一二三四五六日]|明天|后天|下午|上午|点半|号前|日前|之前|这周|下周|今晚/.test(tail.map((s) => s.text).join(''))
check(hasTime === cfg.expectNextStepLocked, `结尾${cfg.expectNextStepLocked ? '含' : '无'}具体时间承诺`, `next_step_locked = ${cfg.expectNextStepLocked}`)

/* ---------- 7. 锚点 ---------- */
section('七、锚点核对（注释与 docs/进度.md 引用的时间戳 ↔ 原话）')

const byStart = Object.fromEntries(segs.map((s) => [s.start, s]))
for (const [t, needle, label] of cfg.anchors) {
  const s = byStart[t]
  check(!!s && s.text.includes(needle), `${String(t).padStart(7)}  ${label}`, s ? `「${s.text.slice(0, 22)}…」` : '该 start 不存在')
}

/* ---------- 8. 三处副本同步 ---------- */
if (cfg.docSync) {
  section(`八、数值副本同步（样本头注释 ↔ ${cfg.docSync.file}）
${C.dim}   注意：这是存在性检查。同一数值在文档里出现多次时，只改错其中一处本节抓不到。${C.off}`)
  const header = raw.slice(0, raw.indexOf('import type'))
  const doc = read(cfg.docSync.file)
  const from = doc.indexOf(cfg.docSync.between[0])
  const to = doc.indexOf(cfg.docSync.between[1])
  const slice = from >= 0 && to > from ? doc.slice(from, to) : ''
  check(slice.length > 0, `在 ${cfg.docSync.file} 中定位到本任务小节`, slice ? `${slice.split('\n').length} 行` : '未找到，检查 between 标题是否被改过')
  for (const v of cfg.docSync.values) {
    const inHeader = header.includes(v)
    const inDoc = slice.includes(v)
    check(inHeader && inDoc, `数值 ${v}`, `头注释=${inHeader ? '✓' : '✗'}  ${cfg.docSync.file}=${inDoc ? '✓' : '✗'}`)
  }
}

/* ---------- 9. 提醒 ---------- */
section('九、本脚本证不了的（要等 T20 / T22 / T27）')
console.log(`  ${C.dim}profile_covered_count、open_question_count（开放与否）、need_matched/total、
  max_repeat_followup、objection_response_rate / delay —— 这五类需要理解语义，
  目前只有注释里的声称值，没有实现来兜底。见 docs/进度.md 的 P5。

  推论的可靠度分两档：
    · D1 = 1、D2 = 0 由上面的纯算术指标锁死，与实现无关。
    · D3 = 0、D4 = 0 依赖上述语义判定，理论上可能被宽松的实现翻成 1 分。
  所以「总分 ${cl.expectedTotalScore} 分」是预期值，不是已验证的事实。${C.off}`)

/* ---------- 汇总 ---------- */
console.log(`\n${'═'.repeat(78)}`)
if (failures === 0) console.log(`${C.ok}✓ 全部通过${C.off}   —— 但这不等于验收通过，语义类指标请自己看原文`)
else console.log(`${C.no}✗ ${failures} 项未通过${C.off}`)
console.log(`${'═'.repeat(78)}\n`)
process.exit(failures === 0 ? 0 : 1)
