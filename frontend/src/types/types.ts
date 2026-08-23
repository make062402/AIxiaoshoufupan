/**
 * 全局类型定义 —— T06 / T07
 *
 * 本文件只做类型定义，不含任何计算逻辑。
 * 对应技术方案 3.2 节「关键 JSON 字段结构」与 2.2 节「指标计算的职责边界」。
 */

/* ============================================================
 * 一、逐字稿 Transcript（T07 定稿）
 * ============================================================ */

/** 说话人枚举：全项目仅这两个取值，不允许 unknown / 第三方 */
export type Speaker = 'sales' | 'customer';

/**
 * 单条逐字稿片段。
 *
 * 【时间单位】start / end 一律为 **秒（浮点数，可含小数）**，
 * 例如 12.5 表示第 12.5 秒。全项目（metrics.ts / 报告回溯定位 / Dify 时间戳）
 * 统一使用该单位，任何毫秒值都必须在入口处转换完毕后才允许进入本结构。
 *
 * ------------------------------------------------------------------
 * 【与腾讯云 ASR 返回字段的对应关系】（已查官方文档，见文末出处）
 *
 * 主要对齐「录音文件识别结果查询 DescribeTaskStatus」的
 * ResultDetail（SentenceDetail）数组，一个 SentenceDetail = 一条 TranscriptSegment：
 *
 *   本项目字段   腾讯云字段            腾讯云原始单位/类型   转换方式
 *   ---------   -------------------   ------------------   ---------------------------
 *   speaker     SpeakerId             Integer（说话人/声道 编号，如 0 / 1）
 *                                                          话者分离结果需映射为枚举：
 *                                                          约定 0 → 'sales'，1 → 'customer'
 *                                                          （双声道通话则按声道号映射）
 *   start       StartMs               Integer，毫秒        start = StartMs / 1000
 *   end         EndMs                 Integer，毫秒        end   = EndMs / 1000
 *   text        FinalSentence         String（该句最终识别结果，无需转换）
 *                                     ※ SliceSentence 是带空格的分词中间结果，不采用
 *
 * 另有 Words（SentenceWords：Word / OffsetStartMs / OffsetEndMs，同样是毫秒）为词级时间戳，
 * 本项目不使用，只取句级。
 *
 * 「一句话识别 SentenceRecognition」接口对应关系（用于短音频，本期不接）：
 *   text  ← Result；词级时间戳在 WordList[].StartTime / EndTime，同样是**毫秒**；
 *   AudioDuration 也是毫秒。该接口不做话者分离，无 speaker 可映射。
 *
 * 【毫秒 → 秒 在哪一步转】
 *   转换发生在「ASR 适配层」——即后端拿到腾讯云响应、写入 reviews.transcript 之前，
 *   一次性把 StartMs / EndMs 除以 1000 并把 SpeakerId 映射成 sales / customer。
 *   落库后的 transcript 字段与前端 metrics.ts 看到的永远是本结构（秒 + 枚举）。
 *   demo 阶段使用预置逐字稿，直接按本结构手写，跳过该适配层，格式完全一致。
 *
 * 出处：
 *   录音文件识别结果查询 https://cloud.tencent.com/document/product/1093/37824
 *     （SentenceDetail：StartMs「单句开始时间（毫秒）」、EndMs「单句结束时间（毫秒）」、
 *       SpeakerId、FinalSentence、SliceSentence、Words、SpeechSpeed、WordsNum）
 *   一句话识别             https://cloud.tencent.com/document/product/1093/35646
 *     （Result、AudioDuration（毫秒）、WordList[].StartTime / EndTime（毫秒））
 * ------------------------------------------------------------------
 */
export interface TranscriptSegment {
  /** 说话人，仅 sales / customer ← 腾讯云 SpeakerId 映射而来 */
  speaker: Speaker;
  /** 该句开始时间，单位：秒（浮点）← 腾讯云 StartMs / 1000 */
  start: number;
  /** 该句结束时间，单位：秒（浮点）← 腾讯云 EndMs / 1000 */
  end: number;
  /** 该句文本 ← 腾讯云 FinalSentence */
  text: string;
}

/** 整份逐字稿 = 片段数组，按 start 升序 */
export type Transcript = TranscriptSegment[];

/* ============================================================
 * 二、结构化卖点 SellingPoint（技术方案 3.2）
 * ============================================================ */

/**
 * 产品卖点。卖点不得存储为非结构化文本。
 *
 * ------------------------------------------------------------------
 * 【两组关键词，说话人不同，用途不同，不可混用】
 *
 *   match_keywords   客户侧。客户会说出口的诉求原话，用来把「客户需求」映射到「卖点」。
 *                    服务于 D3 需求-卖点对齐率与漏讲错讲检测。
 *   sales_keywords   销售侧。销售真正讲这个卖点时会出现的词，用来数「卖点提及数」。
 *
 * 早先版本只有 match_keywords，并约定「卖点提及数按 tag 在逐字稿中命中计数」。
 * 实测该口径不成立：tag 是「一口价不增项」「激光封边不开胶」这类内部标签名，
 * 销售不会照着念，全部样本里零命中。而拿客户侧的 match_keywords 去数销售发言，
 * 说话人对不上，同样不成立。因此单列 sales_keywords 承担 D3 卖点提及数。
 * ------------------------------------------------------------------
 */
export interface SellingPoint {
  /** 卖点标签，如「收纳能力」。仅作展示与归类用，**不参与任何计数** */
  tag: string;
  /** 标准话术原文 */
  script: string;
  /** 客户需求侧的匹配关键词，如 ["空间小","东西多","放不下","收纳"] */
  match_keywords: string[];
  /**
   * 销售侧的话术关键词，如 ["顶天立地","做到顶","投影面积"]。
   * D3「卖点提及数」= 销售发言中命中了 sales_keywords 的**卖点个数**（同一卖点命中多次只算一个）。
   */
  sales_keywords: string[];
}

/* ============================================================
 * 三、14 项客观指标 Metrics（技术方案 2.2）
 *   来源标注：[代码自算] 10 项，直接从 transcript 计时计数；
 *             [AI 计数]  4 项，取自 Dify 返回的计数，代码只做相除与阈值判定。
 *   Dify 只返回计数，绝不返回分数。
 * ============================================================ */

/** D1 开场破冰 —— 2 项 */
export interface MetricsD1 {
  /** [代码自算] 破冰时长：进入业务话题前的累计秒数（单位：秒） */
  icebreak_duration: number;
  /** [代码自算] 销售打断次数 / 小时：客户发言区间内销售起话次数，按时长归一 */
  interrupt_per_hour: number;
}

/** D2 需求挖掘 —— 5 项 */
export interface MetricsD2 {
  /** [代码自算] 客户首次主动发言时点：首个非应答性发言的起始秒（单位：秒） */
  customer_first_speak_at: number;
  /** [代码自算] 销售说话占比：销售发言总时长 ÷ 双方发言总时长，取值 0-1 */
  sales_talk_ratio: number;
  /** [代码自算] 客户提问数：客户发言中的问句数量 */
  customer_question_count: number;
  /** [AI 计数] 关键信息覆盖率：8 项档案字段中问出了哪几项（命中数），分母见 config/scoring.ts */
  profile_covered_count: number;
  /** [AI 计数] 开放式提问占比 —— 分子：开放式提问数 */
  open_question_count: number;
  /** [AI 计数] 开放式提问占比 —— 分母：总提问数 */
  total_question_count: number;
}

/** D3 价值传递 —— 4 项 */
export interface MetricsD3 {
  /** [代码自算] 卖点提及数：销售发言中命中 products.selling_points[].sales_keywords 的卖点个数 */
  selling_point_hit_count: number;
  /** [代码自算] 客户话题反馈数：同一话题下客户追问的最大次数（超过两次为扣分信号） */
  max_repeat_followup: number;
  /** [AI 计数] 需求-卖点对齐率 —— 分子：被对应卖点回应的 L1/L2 需求条数 */
  need_matched_count: number;
  /** [AI 计数] 需求-卖点对齐率 —— 分母：L1/L2 需求总条数 */
  need_total_count: number;
  /** [AI 计数] 参数准确率：讲错或含糊带过的参数条数，达标线 = 0 */
  param_error_count: number;
}

/** D4 异议处理与推进 —— 3 项 */
export interface MetricsD4 {
  /** [代码自算] 异议正面回应率：被实质回应的异议数 ÷ 全部异议数，取值 0-1 */
  objection_response_rate: number;
  /** [代码自算] 异议平均回应时长：异议提出至销售实质回应的间隔均值（单位：秒） */
  objection_response_delay: number;
  /** [代码自算] 下一步锁定率：结尾段是否含「时间 + 动作 + 责任人」三要素 */
  next_step_locked: boolean;
}

/** 14 项指标汇总（D1 2 项 + D2 5 项 + D3 4 项 + D4 3 项） */
export interface Metrics extends MetricsD1, MetricsD2, MetricsD3, MetricsD4 {}

/* ============================================================
 * 四、四维度评分 Scores
 *   scoring.ts 读取 config/scoring.ts 阈值，把 14 项指标折成 D1~D4 各 0/1
 * ============================================================ */

/** 单维度得分：0 或 1，无中间档 */
export type DimensionScore = 0 | 1;

export interface Scores {
  /** D1 开场破冰：2 项全达标 → 1 */
  d1: DimensionScore;
  /** D2 需求挖掘：5 项满足 4 项 → 1 */
  d2: DimensionScore;
  /** D3 价值传递：4 项满足 3 项 → 1 */
  d3: DimensionScore;
  /** D4 异议处理与推进：3 项满足 2 项 → 1 */
  d4: DimensionScore;
  /** 总分 = d1+d2+d3+d4，取值 0-4 */
  total: 0 | 1 | 2 | 3 | 4;
}

/* ============================================================
 * 五、Dify 复盘分析返回 AiResult
 *   硬约束：只返回计数与文本，不返回任何分数。
 * ============================================================ */

/** 需求层级：L1 明确需求 / L2 潜在需求 */
export type NeedLevel = 'L1' | 'L2';

/** 一条被识别出的客户需求，含原话与时间戳，用于评分举证与回溯定位 */
export interface AiNeed {
  level: NeedLevel;
  /** 需求描述 */
  text: string;
  /** 客户原话 */
  quote: string;
  /** 原话在逐字稿中的起始时间，单位：秒（与 TranscriptSegment.start 同口径） */
  start: number;
  /** 是否已被对应卖点回应，供 D3 需求-卖点对齐率使用 */
  satisfied: boolean;
}

/** 带原话与时间戳的文本条目（亮点 / 改进点 / 漏讲错讲） */
export interface AiEvidenceItem {
  text: string;
  quote?: string;
  /** 单位：秒 */
  start?: number;
}

/** 销售在通话中做出的承诺 */
export interface AiCommitment {
  text: string;
  /** 承诺的时间点原文，如「本周五前」，未提及则为空 */
  due?: string;
  /** 单位：秒 */
  start?: number;
}

/** Dify「复盘分析」工作流的完整返回结构（mock/difyResult.json 与之对齐） */
export interface AiResult {
  /** 4 项 AI 计数指标，字段含义见 Metrics 中同名项 */
  counts: {
    /** 开放式提问数 */
    open_question_count: number;
    /** 总提问数 */
    total_question_count: number;
    /** 8 项档案字段中问出了哪几项（字段名数组，长度即 profile_covered_count） */
    profile_covered_fields: string[];
    /** 参数讲错或含糊带过的条数 */
    param_error_count: number;
  };
  /** 需求 L1/L2 标记，含原话与时间戳；need_matched_count / need_total_count 由此派生 */
  needs: AiNeed[];
  /** 话术亮点 */
  highlights: AiEvidenceItem[];
  /** 改进点 */
  improvements: AiEvidenceItem[];
  /** 承诺清单 */
  commitments: AiCommitment[];
  /** 漏讲错讲检出 */
  missed_points: AiEvidenceItem[];
  /** 下次见面三件事 */
  next_actions: string[];
}

/* ============================================================
 * 六、通用 CRUD 页面记录
 * ============================================================ */

export type IntentLevel = 'A' | 'B' | 'C' | 'D';

export interface CustomerRecord {
  id: number;
  name: string;
  identity: string | null;
  phone: string | null;
  role: string | null;
  budget: string | null;
  coreNeed: string | null;
  priorityOrder: string[] | null;
  notes: string | null;
  deadline: string | null;
  industry: string | null;
  intentLevel: IntentLevel | null;
  intentScore: number | null;
  intentManual: boolean;
  createdAt: string;
}

export interface ReviewSummaryRecord {
  id: number;
  customerId: number;
  scores?: Scores;
}

export interface ReviewRecord {
  id: number;
  customerId: number;
  visitId: number | null;
  transcript: Transcript;
  metrics: Metrics;
  scores: Scores;
  aiResult: AiResult;
  createdAt: string;
}

export interface NeedRecord {
  id: number;
  reviewId: number;
  customerId: number;
  level: 'L1' | 'L2' | 'L3' | null;
  text: string | null;
  quote: string | null;
  timestampSec: number | null;
  satisfied: boolean;
}

export interface TodoRecord {
  id: number;
  customerId: number;
  reviewId: number | null;
  text: string;
  dueDate: string | null;
  done: boolean;
}

export interface ReviewReportRecord {
  review: ReviewRecord;
  customer: CustomerRecord;
  needs: NeedRecord[];
  todos: TodoRecord[];
  reviewCount: number;
  stage: 'S1' | 'S2' | 'S3';
  historicalAverage: number | null;
  created?: boolean;
  intent?: { applied: boolean; suggestion: { level: IntentLevel; score: number } } | null;
}

export interface ProductRecord {
  id: number;
  name: string;
  industry: string;
  sellingPoints: SellingPoint[];
}

export interface ScriptRecord {
  id: number;
  stage: string | null;
  scene: string | null;
  text: string;
  fromReviewId: number | null;
}

export interface IntentLogRecord {
  id: number;
  customerId: number;
  fromLevel: string;
  toLevel: string;
  operator: string;
  createdAt: string;
}
