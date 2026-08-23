/**
 * Dify「复盘分析」工作流封装 —— T09
 *
 * 职责边界（技术方案 2.2）：
 *   本文件只负责「把逐字稿发出去、把结构化 JSON 收回来」。
 *   **不做任何阈值判定、不算任何分数**——D1~D4 的 0/1 打分一律在前端 scoring.ts 完成。
 *   因此返回结构中不存在 d1/d2/d3/d4/total/score 之类字段，新增亦不允许。
 *
 * 密钥边界（技术方案 决策三）：
 *   DIFY_API_KEY 只从 process.env 读取，只在本文件内使用。
 *   前端永远只调 POST /api/analyze，拿不到也不需要密钥。
 *
 * 输入 / 输出契约详见 backend/mock/README.md（T27 在 Dify 后台配提示词时照着填）。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/* ============================================================
 * 一、类型（与 frontend/src/types/types.ts 的 AiResult 完全一致）
 *   后端目前不共享前端 types.ts，此处按同一契约本地声明。
 *   两边如需改动，必须同时改，且以 types.ts 为准。
 * ============================================================ */

export type Speaker = 'sales' | 'customer'

export interface TranscriptSegment {
  speaker: Speaker
  /** 单位：秒（浮点） */
  start: number
  /** 单位：秒（浮点） */
  end: number
  text: string
}

export interface SellingPoint {
  tag: string
  script: string
  match_keywords: string[]
}

export type NeedLevel = 'L1' | 'L2'

export interface AiNeed {
  level: NeedLevel
  text: string
  quote: string
  /** 单位：秒 */
  start: number
  satisfied: boolean
}

export interface AiEvidenceItem {
  text: string
  quote?: string
  /** 单位：秒 */
  start?: number
}

export interface AiCommitment {
  text: string
  due?: string
  /** 单位：秒 */
  start?: number
}

export interface AiResult {
  counts: {
    open_question_count: number
    total_question_count: number
    profile_covered_fields: string[]
    param_error_count: number
  }
  needs: AiNeed[]
  highlights: AiEvidenceItem[]
  improvements: AiEvidenceItem[]
  commitments: AiCommitment[]
  missed_points: AiEvidenceItem[]
  next_actions: string[]
}

/** 发给 Dify 的输入。字段名即 Dify 工作流的输入变量名，改名两边要一起改 */
export interface AnalyzeInput {
  /** 逐字稿，秒 + speaker 枚举，格式见 TranscriptSegment */
  transcript: TranscriptSegment[]
  /** 本次拜访涉及的产品卖点，供「需求-卖点对齐」与「漏讲错讲」判断 */
  selling_points?: SellingPoint[]
  /** 8 项客户档案字段名清单，Dify 只能从中挑，不得自造字段名 */
  profile_fields?: string[]
  /** 行业标签：教培 / 装修 / 广告，影响参数错讲的判断口径 */
  industry?: string
}

/** 分析结果外壳：ok=false 表示走完兜底仍未拿到可用结构，前端据此显示「分析失败」 */
export interface AnalyzeOutcome {
  ok: boolean
  /** 数据来源：mock=读本地假数据 / dify=真实调用 / fallback=兜底空结果 */
  source: 'mock' | 'dify' | 'fallback'
  result: AiResult
  /** ok=false 时的失败原因，仅供后端日志与前端提示，不参与任何计算 */
  error?: string
}

/* ============================================================
 * 二、默认值兜底（风险 4.5 第三步）
 *   数组缺失填 []，计数缺失填 0，一律不填 null。
 * ============================================================ */

/** 空结果：整体解析失败时返回它，保证前端拿到的永远是完整结构，不会白屏 */
export function emptyAiResult(): AiResult {
  return {
    counts: {
      open_question_count: 0,
      total_question_count: 0,
      profile_covered_fields: [],
      param_error_count: 0,
    },
    needs: [],
    highlights: [],
    improvements: [],
    commitments: [],
    missed_points: [],
    next_actions: [],
  }
}

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const optNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const optStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/**
 * 逐字段校验 + 缺失填默认值（风险 4.5 第三步）。
 * 只做形状归一，不做业务判断：数值不裁剪、不换算、不比大小。
 */
export function normalizeAiResult(raw: unknown): AiResult {
  const out = emptyAiResult()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>

  const c = (r.counts && typeof r.counts === 'object' ? r.counts : {}) as Record<string, unknown>
  out.counts = {
    open_question_count: num(c.open_question_count),
    total_question_count: num(c.total_question_count),
    profile_covered_fields: arr(c.profile_covered_fields).map(str).filter((s) => s !== ''),
    param_error_count: num(c.param_error_count),
  }

  out.needs = arr(r.needs)
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n) => ({
      level: n.level === 'L1' ? 'L1' : 'L2',
      text: str(n.text),
      quote: str(n.quote),
      start: num(n.start),
      satisfied: n.satisfied === true,
    }))

  const toEvidence = (key: 'highlights' | 'improvements' | 'missed_points'): AiEvidenceItem[] =>
    arr(r[key])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({ text: str(e.text), quote: optStr(e.quote), start: optNum(e.start) }))

  out.highlights = toEvidence('highlights')
  out.improvements = toEvidence('improvements')
  out.missed_points = toEvidence('missed_points')

  out.commitments = arr(r.commitments)
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({ text: str(e.text), due: optStr(e.due), start: optNum(e.start) }))

  out.next_actions = arr(r.next_actions).map(str).filter((s) => s !== '')

  return out
}

/* ============================================================
 * 三、代码块剥离与解析（风险 4.5 第一、二步）
 * ============================================================ */

/** 剥离 ```json ... ``` 之类的 Markdown 代码块标记；无标记时原样返回 */
export function stripCodeFence(text: string): string {
  const s = text.trim()
  const fenced = s.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenced) return fenced[1].trim()
  // 模型偶尔在 JSON 前后夹自然语言，退一步截取最外层花括号
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) return s.slice(first, last + 1).trim()
  return s
}

/** 剥离 → JSON.parse。失败返回 null，绝不抛异常 */
export function parseAiText(text: string): unknown | null {
  try {
    return JSON.parse(stripCodeFence(text))
  } catch {
    return null
  }
}

/* ============================================================
 * 四、mock 分支
 * ============================================================ */

const MOCK_PATH = join(dirname(fileURLToPath(import.meta.url)), '../mock/difyResult.json')

let mockCache: AiResult | null = null

/** 读取 mock/difyResult.json 并按同一套兜底逻辑归一 */
export function loadMockResult(): AiResult {
  if (mockCache) return mockCache
  const raw = readFileSync(MOCK_PATH, 'utf-8')
  mockCache = normalizeAiResult(parseAiText(raw))
  return mockCache
}

/** 开关判定：USE_MOCK 为字符串 'true' 时走 mock */
export function isMockEnabled(): boolean {
  return process.env.USE_MOCK === 'true'
}

/* ============================================================
 * 五、真实调用
 * ============================================================ */

/** 从 Dify 各类响应形状里把那段文本抠出来（blocking 模式） */
function pickOutputText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  const p = payload as Record<string, any>
  // workflow: { data: { outputs: { result / text } } }
  const outputs = p?.data?.outputs
  if (outputs && typeof outputs === 'object') {
    for (const k of ['result', 'text', 'output', 'json']) {
      const v = outputs[k]
      if (typeof v === 'string' && v.trim() !== '') return v
      if (v && typeof v === 'object') return JSON.stringify(v)
    }
    return JSON.stringify(outputs)
  }
  // chat/completion: { answer: "..." }
  if (typeof p.answer === 'string') return p.answer
  return JSON.stringify(payload)
}

/** 发一次 HTTP，返回原始文本；任何异常都抛给上层的重试逻辑处理 */
async function callDifyOnce(input: AnalyzeInput): Promise<string> {
  const apiKey = process.env.DIFY_API_KEY ?? ''
  const baseUrl = (process.env.DIFY_BASE_URL ?? 'https://api.dify.ai/v1').replace(/\/$/, '')
  if (!apiKey) throw new Error('DIFY_API_KEY 未配置')

  const res = await fetch(`${baseUrl}/workflows/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // 输入变量名与 mock/README.md 中「发给 Dify 的输入」一节一一对应
      inputs: {
        transcript: JSON.stringify(input.transcript),
        selling_points: JSON.stringify(input.selling_points ?? []),
        profile_fields: JSON.stringify(input.profile_fields ?? []),
        industry: input.industry ?? '',
      },
      response_mode: 'blocking',
      user: 'sales-review-backend',
    }),
  })

  if (!res.ok) {
    throw new Error(`Dify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return pickOutputText(await res.json())
}

/* ============================================================
 * 六、对外唯一入口
 * ============================================================ */

/**
 * 复盘分析。
 *
 * USE_MOCK=true  → 直接返回 mock/difyResult.json，**函数在此 return，
 *                  下面的 fetch 一行都不执行，不产生任何网络请求**。
 * USE_MOCK≠true  → 真实调用，并执行风险 4.5 的四步兜底：
 *                  剥离代码块 → JSON.parse → 逐字段校验填默认值 →
 *                  整体失败重试一次，再失败返回 ok:false 的空结果，绝不抛异常。
 */
export async function analyzeTranscript(input: AnalyzeInput): Promise<AnalyzeOutcome> {
  if (isMockEnabled()) {
    console.log('[dify] USE_MOCK=true，返回本地 mock，未发起任何网络请求')
    return { ok: true, source: 'mock', result: loadMockResult() }
  }

  let lastError = ''
  // 第一次 + 重试一次，共两次
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await callDifyOnce(input)
      const parsed = parseAiText(text)
      if (parsed === null) {
        lastError = '返回内容不是可解析的 JSON'
        console.warn(`[dify] 第 ${attempt} 次解析失败：${lastError}`)
        continue
      }
      return { ok: true, source: 'dify', result: normalizeAiResult(parsed) }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.warn(`[dify] 第 ${attempt} 次调用失败：${lastError}`)
    }
  }

  console.error(`[dify] 重试后仍失败，标记为分析失败：${lastError}`)
  return { ok: false, source: 'fallback', result: emptyAiResult(), error: lastError }
}
