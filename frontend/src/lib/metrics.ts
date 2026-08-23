import type { Transcript } from '../types/types.ts'
import { getTranscriptDurationSeconds } from './transcript.ts'

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
