import type { ReviewMetricEvidence } from '../lib/reviewAnalysis.ts'

/** 样本 A 的语义边界锚点；每个时间戳均可回查 transcriptA。 */
export const metricEvidenceA: ReviewMetricEvidence = {
  businessTopicStartSeconds: 79.5,
  topics: [
    {
      topic: '甲醛',
      initialStartSeconds: 272.5,
      followupStartsSeconds: [332.1, 378.8, 977.7],
    },
    {
      topic: '价差',
      initialStartSeconds: 472.8,
      followupStartsSeconds: [567.9],
    },
  ],
  objections: [
    { objectionStartSeconds: 472.8 },
    { objectionStartSeconds: 821, responseStartSeconds: 911.6 },
    { objectionStartSeconds: 1141.9 },
  ],
}

/** 样本 B 的语义边界锚点；T24 整体验证复用。 */
export const metricEvidenceB: ReviewMetricEvidence = {
  businessTopicStartSeconds: 66.5,
  topics: [
    {
      topic: '甲醛',
      initialStartSeconds: 85.6,
      followupStartsSeconds: [139.9, 183.6],
    },
  ],
  objections: [
    { objectionStartSeconds: 828.3, responseStartSeconds: 835.1 },
    { objectionStartSeconds: 891.2, responseStartSeconds: 897.5 },
    { objectionStartSeconds: 1012.7, responseStartSeconds: 1019.2 },
  ],
}
