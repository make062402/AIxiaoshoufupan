import type { SellingPoint, Transcript } from '../types/types.ts'
import {
  countQuestionMarks,
  getTotalDurationSeconds,
  getTranscriptDurationSeconds,
  sortTranscriptByStart,
} from './transcript.ts'

/** 样本约定：去掉标点和空白后超过 12 字，视为非“嗯/哦/是”式短应答。 */
export const ACTIVE_CUSTOMER_SPEECH_MIN_CHARACTERS = 13

/**
 * 进入业务话题前的时间跨度，单位：秒。
 * `businessTopicStartSeconds` 是已标注的首句业务话起点；本函数只负责确定性计时。
 */
export function getIcebreakDurationSeconds(
  transcript: Transcript,
  businessTopicStartSeconds: number,
): number {
  if (transcript.length === 0) return 0

  const transcriptStartSeconds = Math.min(
    ...transcript.map((segment) => segment.start),
  )

  return Math.max(0, businessTopicStartSeconds - transcriptStartSeconds)
}

/** 销售起话点落在任一客户发言的 [start, end) 内，即记为一次销售打断。 */
export function countSalesInterruptions(transcript: Transcript): number {
  const customerSegments = transcript.filter(
    (segment) => segment.speaker === 'customer',
  )

  return transcript.filter(
    (segment) =>
      segment.speaker === 'sales' &&
      customerSegments.some(
        (customer) =>
          segment.start >= customer.start && segment.start < customer.end,
      ),
  ).length
}

/** 销售打断次数按整场会话时长折算为每小时次数。 */
export function getSalesInterruptionsPerHour(transcript: Transcript): number {
  const transcriptDurationSeconds = getTranscriptDurationSeconds(transcript)
  if (transcriptDurationSeconds <= 0) return 0

  return countSalesInterruptions(transcript) / (transcriptDurationSeconds / 3600)
}

/** 客户首个非短应答发言的起始时点，单位：秒；找不到时返回最大安全整数。 */
export function getCustomerFirstActiveSpeakAtSeconds(
  transcript: Transcript,
): number {
  const firstActiveSegment = sortTranscriptByStart(transcript).find((segment) => {
    if (segment.speaker !== 'customer') return false

    const contentCharacters = Array.from(
      segment.text.replace(/[^\p{L}\p{N}]/gu, ''),
    ).length
    return contentCharacters >= ACTIVE_CUSTOMER_SPEECH_MIN_CHARACTERS
  })

  return firstActiveSegment?.start ?? Number.MAX_SAFE_INTEGER
}

/** 销售发言时长占双方实际发言总时长的比例。 */
export function getSalesTalkRatio(transcript: Transcript): number {
  const salesDurationSeconds = getTotalDurationSeconds(transcript, 'sales')
  const customerDurationSeconds = getTotalDurationSeconds(transcript, 'customer')
  const speakingDurationSeconds = salesDurationSeconds + customerDurationSeconds

  return speakingDurationSeconds > 0
    ? salesDurationSeconds / speakingDurationSeconds
    : 0
}

/** 客户发言中中英文问号的总数。 */
export function getCustomerQuestionCount(transcript: Transcript): number {
  return countQuestionMarks(transcript, 'customer')
}

/** 销售发言中命中的不同卖点数；同一卖点出现多次仍只计 1。 */
export function getSellingPointHitCount(
  transcript: Transcript,
  sellingPoints: readonly SellingPoint[],
): number {
  const salesText = transcript
    .filter((segment) => segment.speaker === 'sales')
    .map((segment) => segment.text)
    .join('\n')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase()

  return sellingPoints.filter((sellingPoint) =>
    sellingPoint.sales_keywords.some((keyword) => {
      const normalizedKeyword = keyword
        .replace(/\s+/gu, '')
        .toLocaleLowerCase()
      return normalizedKeyword.length > 0 && salesText.includes(normalizedKeyword)
    }),
  ).length
}

/**
 * 一条客户话题的可回溯标注。首次提出不算追问，followup 中每个时间戳算一次追问。
 */
export interface CustomerTopicEvidence {
  topic: string
  initialStartSeconds: number
  followupStartsSeconds: readonly number[]
}

/**
 * 返回所有话题中最大的客户追问次数。
 * 只接受能在逐字稿中定位到客户问句的追问时间戳，避免重复或无证据计数。
 */
export function getMaxRepeatFollowup(
  transcript: Transcript,
  topics: readonly CustomerTopicEvidence[],
): number {
  const customerStarts = new Set(
    transcript
      .filter((segment) => segment.speaker === 'customer')
      .map((segment) => segment.start),
  )
  const customerQuestionStarts = new Set(
    transcript
      .filter(
        (segment) =>
          segment.speaker === 'customer' && /[？?]/u.test(segment.text),
      )
      .map((segment) => segment.start),
  )

  return topics.reduce((maximum, topic) => {
    if (!customerStarts.has(topic.initialStartSeconds)) return maximum

    const validFollowups = new Set(
      topic.followupStartsSeconds.filter(
        (start) =>
          start > topic.initialStartSeconds && customerQuestionStarts.has(start),
      ),
    )
    return Math.max(maximum, validFollowups.size)
  }, 0)
}
