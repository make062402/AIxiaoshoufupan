import type {
  Speaker,
  Transcript,
  TranscriptSegment,
} from '../types/types.ts'

/** 按开始时间升序返回副本，不修改传入的逐字稿。 */
export function sortTranscriptByStart(transcript: Transcript): Transcript {
  return [...transcript].sort((left, right) => left.start - right.start)
}

/** 返回指定说话人的全部片段，保持原输入顺序。 */
export function filterTranscriptBySpeaker(
  transcript: Transcript,
  speaker: Speaker,
): Transcript {
  return transcript.filter((segment) => segment.speaker === speaker)
}

/** 指定说话人的实际发言总时长，单位：秒。 */
export function getTotalDurationSeconds(
  transcript: Transcript,
  speaker: Speaker,
): number {
  return filterTranscriptBySpeaker(transcript, speaker).reduce(
    (total, segment) => total + (segment.end - segment.start),
    0,
  )
}

/** 整场会话从最早开始到最晚结束的跨度，单位：秒。 */
export function getTranscriptDurationSeconds(transcript: Transcript): number {
  if (transcript.length === 0) return 0

  let earliestStart = transcript[0].start
  let latestEnd = transcript[0].end

  for (const segment of transcript.slice(1)) {
    earliestStart = Math.min(earliestStart, segment.start)
    latestEnd = Math.max(latestEnd, segment.end)
  }

  return latestEnd - earliestStart
}

/** 找出文本中含中文或英文问号的片段。 */
export function findQuestionSegments(
  transcript: Transcript,
  speaker?: Speaker,
): TranscriptSegment[] {
  return transcript.filter(
    (segment) =>
      (speaker === undefined || segment.speaker === speaker) &&
      /[？?]/u.test(segment.text),
  )
}

/** 统计指定说话人文本中的中英文问号总数；一条里多个问号分别计数。 */
export function countQuestionMarks(
  transcript: Transcript,
  speaker: Speaker,
): number {
  return filterTranscriptBySpeaker(transcript, speaker).reduce(
    (total, segment) => total + (segment.text.match(/[？?]/gu)?.length ?? 0),
    0,
  )
}
