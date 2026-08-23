/**
 * T12 —— 种子数据脚本
 *
 * 用法：npm run db:seed
 *
 * 【行业口径】《收敛版需求说明》§2.1：行业范围 = 教培 / 装修 / 广告。
 *   products 10 个覆盖三个行业（任务清单 T12 原文）；
 *   customers / reviews / 逐字稿统一落在**装修**，以便前端能拿到
 *   「同一客户第二次拜访」这条核心场景（§2.2）的连续素材。
 *
 * 【本脚本的职责边界】
 *   只负责「把数据摆成能被算出正确结果的样子」，不含任何业务计算：
 *   - S1/S2/S3 不写字段，靠控制每个客户名下 reviews 的条数来造出三种状态；
 *   - 意向分级 A/B/C/D 与 intent_score 是直接给定的档案值，不在这里推导；
 *   - satisfied / need_matched_count 等只是摆好的数据，不做校验或反算。
 *
 * 【严格对齐的需求口径】
 *   §3.1 关注维度只能是 价格 / 质量 / 服务 / 周期 四类的排序；
 *        采购角色只能是 产品使用者 / 成单影响者 / 拍板人。
 *   §3.2 A = 已成单（不是「高意向」）；intent_score 仅 B 类取 1~3，
 *        A / C / D 一律记 0。
 *   §3.5 话术 stage 只能是五段式：开场破冰 / 需求确认 / 方案呈现 /
 *        异议处理 / 下一步锁定；异议类话术必须带开放式追问；
 *        话术中出现的价格必须与产品库一致。
 *
 * 【幂等】
 *   开头按外键顺序清空 8 张表（先子后父），再全量插入。
 *   不 drop table，不改 schema，重复执行条数不变。
 *
 * 【外键】
 *   全部用 .returning().all() 拿到的真实自增 id 串联，无任何硬编码 1/2/3。
 */
import 'dotenv/config'
import { db } from './db/client.ts'
import {
  customers,
  intentLogs,
  visits,
  reviews,
  needs,
  products,
  todos,
  scripts,
} from './db/schema.ts'

/* ============================================================
 * 工具
 * ============================================================ */

/** 逐字稿片段构造器（start / end 单位为秒） */
const S = (start: number, end: number, text: string) =>
  ({ speaker: 'sales' as const, start, end, text })
const C = (start: number, end: number, text: string) =>
  ({ speaker: 'customer' as const, start, end, text })

/** 档案字段名，与 frontend/src/config/scoring.ts 的 PROFILE_FIELDS 一致 */
const F = {
  identity: '称呼与身份',
  phone: '联系方式',
  role: '在采购中的角色',
  budget: '预算区间',
  coreNeed: '核心需求与购买意向',
  priority: '关注维度优先级排序',
  notes: '注意事项',
  deadline: '采购时间点/交付期限',
} as const

/** §3.1 采购角色三选一 */
const ROLE = {
  user: '产品使用者',
  influencer: '成单影响者',
  decider: '拍板人',
} as const

/** §3.5 五段式阶段名 */
const STAGE = {
  open: '开场破冰',
  confirm: '需求确认',
  present: '方案呈现',
  objection: '异议处理',
  lock: '下一步锁定',
} as const

/** 把 'YYYY-MM-DD HH:mm' 转成 Date（timestamp 列运行时要求 Date 实例） */
const at = (s: string) => new Date(s.replace(' ', 'T') + ':00')

/* ============================================================
 * 一、清空：先删子表，再删父表
 *   needs / todos / scripts 引用 reviews；reviews 引用 visits 与 customers；
 *   intent_logs / visits 引用 customers；products 无外键。
 * ============================================================ */
function clearAll() {
  db.delete(needs).run()
  db.delete(todos).run()
  db.delete(scripts).run()
  db.delete(reviews).run()
  db.delete(intentLogs).run()
  db.delete(visits).run()
  db.delete(customers).run()
  db.delete(products).run()
}

/* ============================================================
 * 二、灌数据
 * ============================================================ */
function seed() {
  clearAll()

  /* ---------- products：10 个，覆盖装修 / 教培 / 广告 ----------
   * 每条卖点带两组关键词，说话人不同，不可混用：
   *
   *   match_keywords  客户侧。>=3 个词，必须是客户真会说出口的口语
   *                   （「放不下」「东西多」，不是「空间利用率」）。
   *                   需求↔卖点映射的唯一依据，下面 needs.text 里的词与之严格对得上。
   *   sales_keywords  销售侧。销售真讲这个卖点时会出现的词，取自 script 原文。
   *                   D3「卖点提及数」的唯一依据 —— 不要用 tag 去数，
   *                   tag 是内部标签名，销售不会照着念，实测零命中。 */
  const productRows = db
    .insert(products)
    .values([
      /* ===== 装修 4 个 ===== */
      {
        name: '全屋整装 · 悦享款',
        price: 128000,
        params: {
          适用面积: '85~100 ㎡',
          包含范围: '设计 + 主材 + 施工 + 软装基础包',
          工期: '75 天',
          主材品牌: '东鹏瓷砖 / 九牧卫浴 / 立邦漆',
          质保: '整体 2 年，隐蔽工程 5 年',
        },
        sellingPoints: [
          {
            tag: '一口价不增项',
            script:
              '合同上写死 12.8 万，除非您自己中途改方案，否则不会再多要一分钱；哪一项如果超了，超出部分我们公司承担。',
            match_keywords: ['加钱', '增项', '预算超', '多要钱', '后期加价'],
            sales_keywords: ['一口价', '写死', '不增项', '超出部分', '再多要一分钱'],
          },
          {
            tag: '工期违约赔付',
            script:
              '75 天交付写进合同，每拖一天按合同额千分之一赔给您，直接从尾款里扣，不用您来催。',
            match_keywords: ['拖工期', '什么时候能住', '赶时间', '多久完工', '拖拖拉拉'],
            sales_keywords: ['75 天', '写进合同', '千分之一', '赔给您', '从尾款里扣'],
          },
          {
            tag: '主材品牌可查',
            script:
              '主材是东鹏、九牧、立邦，都写在合同附件里，进场时您扫码验真，对不上您可以直接拒收。',
            match_keywords: ['材料', '牌子', '杂牌', '以次充好', '偷换材料'],
            sales_keywords: ['东鹏', '九牧', '立邦', '合同附件', '扫码验真', '拒收'],
          },
        ],
        objections: [
          {
            objection: '别家报价才 9 万多，你们贵了三万',
            answer:
              '差价主要在主材和隐蔽工程这两块，我把两边的清单逐项摆开给您看差在哪儿。您方便把那份报价拍给我吗？',
          },
          {
            objection: '一口价是不是把水分先加进去了',
            answer:
              '您可以按项拆开核，每项单价我都能给出市场价对照。您最担心哪一项被虚报，我先从那项开始拆？',
          },
        ],
        industry: '装修',
      },
      {
        name: '环保基础施工包',
        price: 39800,
        params: {
          适用面积: '85~120 ㎡',
          包含范围: '水电 + 防水 + 泥木 + 墙面基层',
          环保等级: '主辅材全 E0 级',
          质保: '隐蔽工程 5 年',
        },
        sellingPoints: [
          {
            tag: '甲醛可复测',
            script:
              '完工后我们出钱请第三方检测，甲醛不达标我们负责整改到达标为止，检测报告直接给您。',
            match_keywords: ['甲醛', '味道', '环保', '小孩', '孕妇', '有味', '检测报告', '不达标'],
            sales_keywords: ['第三方检测', '我们出钱', '整改到达标', '检测报告直接给您'],
          },
          {
            tag: '隐蔽工程 5 年质保',
            script:
              '水电防水这些埋在墙里的，我们保 5 年，这期间漏水、开裂，我们免费拆开重做，工费材料都不收。',
            match_keywords: ['漏水', '开裂', '返修', '水电', '质保', '出问题'],
            sales_keywords: ['隐蔽工程', '保 5 年', '埋在墙里', '免费拆开重做', '工费材料都不收'],
          },
        ],
        objections: [
          {
            objection: 'E0 级是不是就完全没甲醛了',
            answer:
              'E0 是单块板材的限量标准，全屋叠起来仍要控总量，所以我们才做完工复测。您家里是有小孩还是老人要住？我按这个再收一遍板材用量。',
          },
        ],
        industry: '装修',
      },
      {
        name: '全屋定制柜 · 一体化设计',
        price: 26800,
        params: {
          计价方式: '投影面积计价',
          板材: '爱格 E0 级颗粒板',
          封边: '激光封边，无胶线',
          五金: '百隆铰链，质保 10 年',
        },
        sellingPoints: [
          {
            tag: '顶天立地收纳',
            script:
              '柜子做到顶，把梁边和飘窗下这些零碎空间全用上，同样的墙面能比成品柜多放三成东西。',
            match_keywords: ['放不下', '东西多', '空间小', '收纳', '柜子不够', '太挤'],
            sales_keywords: ['做到顶', '顶天立地', '梁边', '飘窗下', '多放三成'],
          },
          {
            tag: '激光封边不开胶',
            script:
              '激光封边没有胶线，南方回南天也不会像普通封边那样鼓包掉皮，边角您可以现场抠一下试试。',
            match_keywords: ['封边', '掉皮', '鼓包', '板材', '开胶'],
            sales_keywords: ['激光封边', '没有胶线', '回南天', '现场抠一下', '爱格'],
          },
        ],
        objections: [
          {
            objection: '定制柜比买成品贵一倍',
            answer:
              '成品柜按件卖，定制按投影面积算，尺寸卡死的地方成品根本放不进去。您家哪几个位置是异形的？我先量一下再比价。',
          },
        ],
        industry: '装修',
      },
      {
        name: '老房局改 · 厨卫翻新',
        price: 45600,
        params: {
          适用: '房龄 10 年以上，厨房 + 卫生间',
          工期: '28 天',
          包含范围: '拆除 + 排水改造 + 防水 + 瓷砖 + 洁具安装',
          特色: '可不搬家分区施工',
        },
        sellingPoints: [
          {
            tag: '不搬家分区施工',
            script:
              '厨卫分开做，先做卫生间再做厨房，中间给您留一个能用的，全程 28 天不用搬出去住。',
            match_keywords: ['搬家', '没地方住', '租房', '住着装', '折腾'],
            sales_keywords: ['分区施工', '厨卫分开做', '先做卫生间', '留一个能用的', '不用搬出去'],
          },
          {
            tag: '老管道整体更换',
            script:
              '老房子返水下水慢，多半是主管道锈死了，我们连立管一起换成 PPR，不是只把面子铺一层。',
            match_keywords: ['漏水', '返水', '下水慢', '老房', '堵'],
            sales_keywords: ['主管道', '锈死', '连立管一起换', 'PPR', '不是只把面子铺一层'],
          },
        ],
        objections: [
          {
            objection: '住着装是不是灰特别大',
            answer:
              '我们做全封闭隔离加每日清运，但灰肯定比空房多一些。家里现在几口人住？我按作息把噪音大的工序排开。',
          },
        ],
        industry: '装修',
      },

      /* ===== 教培 3 个 ===== */
      {
        name: '小学数学思维班 · 春季 32 课时',
        price: 4980,
        params: {
          课时: '32 次 × 90 分钟',
          班型: '8 人小班',
          适用年级: '三至五年级',
          师资: '本地重点小学在职教研背景',
        },
        sellingPoints: [
          {
            tag: '小班当堂答疑',
            script:
              '8 个人一个班，每节课留 15 分钟单独过题，孩子哪道不会当堂就问掉，不会攒到期末。',
            match_keywords: ['跟不上', '听不懂', '没人管', '落下', '不敢问'],
            sales_keywords: ['8 个人一个班', '小班', '留 15 分钟', '单独过题', '当堂就问'],
          },
          {
            tag: '家长周报可见',
            script:
              '每周给您发一份孩子的错题分布和课堂表现，哪块弱一眼能看到，不用您追着问老师。',
            match_keywords: ['学得怎么样', '看不到进度', '心里没底', '不知道效果'],
            sales_keywords: ['每周给您发一份', '错题分布', '课堂表现', '周报'],
          },
        ],
        objections: [
          {
            objection: '孩子已经在别处上课了，再加一门太累',
            answer:
              '那确实不建议叠着上，容易两头都顾不上。孩子现在那门课主要补的是计算还是应用题？我先看看是不是重复了。',
          },
        ],
        industry: '教培',
      },
      {
        name: '中考冲刺一对一 · 60 课时',
        price: 18600,
        params: {
          课时: '60 次 × 60 分钟',
          班型: '一对一',
          科目: '数学 / 物理 / 化学 任选',
          配套: '入学诊断 + 月度阶段测',
        },
        sellingPoints: [
          {
            tag: '阶段测可查提分',
            script:
              '每月一次阶段测，卷子和分数曲线都留档，两个月没有提分您可以随时叫停，剩余课时全退。',
            match_keywords: ['提不了分', '分数上不去', '成绩', '有没有用', '白花钱'],
            sales_keywords: ['阶段测', '分数曲线', '留档', '随时叫停', '剩余课时全退'],
          },
          {
            tag: '时间跟着孩子排',
            script:
              '课表按孩子的作息排，晚自习后、周末上午都能安排，不用您专门腾时间接送。',
            match_keywords: ['没时间', '接送', '太远', '排不开'],
            sales_keywords: ['课表按孩子', '晚自习后', '周末上午', '不用您专门腾时间'],
          },
        ],
        objections: [
          {
            objection: '一对一太贵了，一节三百多',
            answer:
              '一对一贵在全程只盯您孩子一个人的薄弱点。孩子现在数学大概多少分？如果只是某一两个模块塌，小班反而更划算。',
          },
        ],
        industry: '教培',
      },
      {
        name: '成人英语口语陪练营 · 季卡',
        price: 3680,
        params: {
          周期: '3 个月',
          频次: '每周 3 次 × 25 分钟',
          师资: '菲教 + 中教督学',
          时段: '早 6 点至晚 24 点',
        },
        sellingPoints: [
          {
            tag: '真人陪练开口',
            script:
              '每次 25 分钟全程只有您一个人说，中教督学每周给一次发音纠正，专治张不开嘴。',
            match_keywords: ['说不出口', '张不开嘴', '哑巴英语', '不敢说'],
            sales_keywords: ['25 分钟', '只有您一个人说', '中教督学', '发音纠正'],
          },
          {
            tag: '未用课时随时退',
            script:
              '没上的课时随时按原价退，不收手续费，退款三个工作日到账，这条写在协议第四页。',
            match_keywords: ['退费', '万一不上了', '怕跑路', '退钱'],
            sales_keywords: ['按原价退', '不收手续费', '三个工作日到账', '协议第四页'],
          },
        ],
        objections: [
          {
            objection: '我工作忙，肯定坚持不下来',
            answer:
              '所以我们做成 25 分钟一节，早六点到晚十二点都能约。您平时哪个时段最空？我先按那个时段试排一周看看。',
          },
        ],
        industry: '教培',
      },

      /* ===== 广告 3 个 ===== */
      {
        name: '本地生活抖音代运营 · 月度',
        price: 12000,
        params: {
          周期: '按月',
          产出: '每月 12 条短视频 + 4 场直播切片',
          团队: '编导 1 + 拍摄 1 + 剪辑 1',
          数据: '到店核销数据周报',
        },
        sellingPoints: [
          {
            tag: '到店核销可查',
            script:
              '我们按到店核销算效果，不按播放量算。后台您自己能看每一单是哪条视频带来的，不用听我说。',
            match_keywords: ['没效果', '看不到人来', '白花钱', '没水花', '有没有用'],
            sales_keywords: ['到店核销', '不按播放量', '后台您自己能看', '哪条视频带来的'],
          },
          {
            tag: '拍剪全包不用管',
            script:
              '编导拍摄剪辑我们全出人，您只要配合开门拍两小时，剩下的不用您店里任何人操心。',
            match_keywords: ['没人拍', '不会剪', '没素材', '没人管'],
            sales_keywords: ['编导拍摄剪辑', '我们全出人', '配合开门拍两小时', '不用您店里'],
          },
        ],
        objections: [
          {
            objection: '之前找过一家，钱花了一个客人没来',
            answer:
              '那大概率是按播放量结的，播放和到店是两件事。您方便说说上一家当时是怎么跟您算效果的吗？',
          },
        ],
        industry: '广告',
      },
      {
        name: '朋友圈广告精准投放 · 起投包',
        price: 8000,
        params: {
          起投: '8000 元含服务费',
          定向: '门店三公里 + 年龄 + 兴趣标签',
          素材: '含 3 套素材制作',
          结算: '按曝光计费，日报可查',
        },
        sellingPoints: [
          {
            tag: '三公里定向',
            script:
              '只投您门店周边三公里，年龄和兴趣再叠一层，钱不会花在压根不可能来的人身上。',
            match_keywords: ['太远', '周边', '附近', '投给谁'],
            sales_keywords: ['三公里', '门店周边', '年龄和兴趣', '再叠一层'],
          },
          {
            tag: '日报可查不闷投',
            script:
              '每天出一份消耗和点击日报，跑得不好第三天就能停下来换素材，不用等一个月看结果。',
            match_keywords: ['烧钱', '打水漂', '花冤枉钱', '不透明'],
            sales_keywords: ['日报', '消耗和点击', '第三天就能停', '换素材'],
          },
        ],
        objections: [
          {
            objection: '朋友圈广告大家都直接划走了',
            answer:
              '划走的是跟自己没关系的，三公里内带优惠的本地广告点击率要高不少。您店里现在有什么能拿得出手的引流品吗？',
          },
        ],
        industry: '广告',
      },
      {
        name: '品牌视觉升级套装',
        price: 22000,
        params: {
          交付物: 'logo + VI 基础规范 + 门头效果图 + 5 套物料模板',
          周期: '20 个工作日',
          修改: '含 3 轮修改',
          交付: '含全部可编辑源文件',
        },
        sellingPoints: [
          {
            tag: '一次做齐不零散',
            script:
              'logo、门头、菜单、包装、海报一次做齐，风格统一，不会像现在这样各做各的看着乱。',
            match_keywords: ['乱', '不统一', '各做各的', '门头', '没风格'],
            sales_keywords: ['一次做齐', '风格统一', '菜单', '包装', '海报'],
          },
          {
            tag: '源文件全部交付',
            script:
              '所有可编辑源文件都给您，以后换谁做都能接着改，不会被我们卡住。',
            match_keywords: ['源文件', '以后改', '换设计公司', '被卡'],
            sales_keywords: ['可编辑源文件', '都给您', '换谁做都能接着改', '不会被我们卡住'],
          },
        ],
        objections: [
          {
            objection: '两万多做个 logo 太贵了',
            answer:
              '两万二是整套 VI 加门头加五套物料，单做 logo 我们也接，价格另算。您现在最急的是门头还是线上物料？',
          },
        ],
        industry: '广告',
      },
    ])
    .returning()
    .all()

  /* ---------- customers：7 个，全部装修行业 ----------
   * §3.2 口径：A = 已成单；intent_score 仅 B 类取 1~3，A/C/D 一律 0。
   *   A 已成单  ×1（张国庆，已签合同 + 首付款到账）
   *   B 中意向  ×3（何薇 3 分决策推进类 / 刘敏 2 分价格类 / 郑帆 1 分功能细节类）
   *   C 低意向  ×2（苏晓彤 比价型 / 马红梅 预算时机未定型）
   *   D 无意向  ×1（高建军 委婉拒绝，语气坚决且无未来预期）
   *
   * §3.1 口径：priority_order 只能是 价格/质量/服务/周期 四类的排序；
   *            role 只能是 产品使用者/成单影响者/拍板人。
   *
   * S1/S2/S3 由 reviews 条数派生（见下方 reviews）：
   *   S3（>=2 条）：张国庆、何薇
   *   S2（1 条）：刘敏、郑帆
   *   S1（0 条）：苏晓彤、马红梅、高建军 */
  const [cZhang, cHe, cLiu, cZheng, cSu, cMa, cGao] = db
    .insert(customers)
    .values([
      {
        name: '张国庆',
        identity: '金域蓝湾 3 栋业主，本人退休前是水电工',
        phone: '13905317788',
        role: ROLE.decider,
        budget: '12~15 万',
        coreNeed: '89 平三居全屋翻新，最怕做到一半被追着加钱；已签合同付首款',
        priorityOrder: ['质量', '服务', '价格', '周期'],
        notes: '自己懂水电，会盯工地、会问工艺细节；最忌讳含糊其辞和临时增项，说不清楚当场就翻脸',
        deadline: '春节前要住进去',
        industry: '装修',
        intentLevel: 'A',
        intentScore: 0,
        intentManual: true,
        createdAt: at('2026-06-11 09:20'),
      },
      {
        name: '何薇',
        identity: '滨江壹号院业主，二胎妈妈，孩子一个 4 岁一个 8 个月',
        phone: '13605328899',
        role: ROLE.influencer,
        budget: '8~10 万',
        coreNeed: '婚房改成二胎房，甲醛和收纳是死线；已主动要合同模板并问了付款流程',
        priorityOrder: ['质量', '价格', '周期', '服务'],
        notes: '最终要和先生一起定；对甲醛极度敏感，提到孩子会情绪化，别用「达标」这类话糊弄',
        deadline: '9 月底前必须开工',
        industry: '装修',
        intentLevel: 'B',
        intentScore: 3,
        intentManual: false,
        createdAt: at('2026-05-28 09:05'),
      },
      {
        name: '刘敏',
        identity: '老城区自建房业主，开小超市',
        phone: '13805366677',
        role: ROLE.decider,
        budget: '4~6 万',
        coreNeed: '只翻厨房和卫生间，店走不开不能搬家；已主动问过优惠和分期',
        priorityOrder: ['价格', '周期', '质量', '服务'],
        notes: '算账很快，报价里任何一项说不清就会当场砍；白天要看店，只能晚上聊',
        deadline: '10 月中旬前完工',
        industry: '装修',
        intentLevel: 'B',
        intentScore: 2,
        intentManual: false,
        createdAt: at('2026-06-24 14:05'),
      },
      {
        name: '郑帆',
        identity: '中海熙岸业主，程序员',
        phone: '13505399900',
        role: ROLE.user,
        budget: '6~8 万',
        coreNeed: '想做全屋定制解决收纳；已主动问过板材品牌和五金质保',
        priorityOrder: ['质量', '价格', '服务', '周期'],
        notes: '习惯自己查资料，会拿参数来对；不喜欢被推销，讲多了会沉默',
        deadline: '年底交房后开工',
        industry: '装修',
        intentLevel: 'B',
        intentScore: 1,
        intentManual: false,
        createdAt: at('2026-07-02 10:40'),
      },
      {
        name: '苏晓彤',
        identity: '龙湖天街公寓业主',
        phone: '13705311223',
        role: ROLE.decider,
        budget: '未透露',
        coreNeed: '公寓 48 平简装，说要对比几家但没说出对比点（比价型）',
        priorityOrder: ['价格', '周期', '质量', '服务'],
        notes: '三次沟通都停在「我再看看别家」，问不出具体在比什么',
        deadline: '没有明确时间',
        industry: '装修',
        intentLevel: 'C',
        intentScore: 0,
        intentManual: false,
        createdAt: at('2026-07-15 16:30'),
      },
      {
        name: '马红梅',
        identity: '未来城 A 区准业主，房子明年三月交付',
        phone: '13305344455',
        role: ROLE.influencer,
        budget: '待定',
        coreNeed: '房子还没交付，装修预算等年终奖下来再定（预算时机未定型）',
        priorityOrder: ['价格', '质量', '周期', '服务'],
        notes: '有未来时间预期，按 §3.2 边界规则判 C 不判 D；年前不要频繁打扰',
        deadline: '明年三月交房后再说',
        industry: '装修',
        intentLevel: 'C',
        intentScore: 0,
        intentManual: false,
        createdAt: at('2026-07-21 11:15'),
      },
      {
        name: '高建军',
        identity: '城南自建房业主',
        phone: '13205377766',
        role: ROLE.decider,
        budget: '不适用',
        coreNeed: '明确表示自家亲戚就是包工头，房子交给亲戚做，不考虑装修公司',
        priorityOrder: ['价格', '服务', '质量', '周期'],
        notes: '委婉拒绝且语气坚决、完全无未来预期，按 §3.2 判 D；不再安排跟进',
        deadline: '不适用',
        industry: '装修',
        intentLevel: 'D',
        intentScore: 0,
        intentManual: false,
        createdAt: at('2026-08-04 15:50'),
      },
    ])
    .returning()
    .all()

  /* ---------- intent_logs：人工覆盖留痕 ----------
   * 张国庆 intent_manual = true，必须有对应留痕。
   * 第二条即「签了合同，销售手动从 B 提到 A（已成单）」，与 §3.2 的 A 定义对上。 */
  const intentLogRows = db
    .insert(intentLogs)
    .values([
      {
        customerId: cZhang.id,
        fromLevel: null,
        toLevel: 'B',
        operator: '张海涛',
        createdAt: at('2026-06-18 12:20'),
      },
      {
        customerId: cZhang.id,
        fromLevel: 'B',
        toLevel: 'A',
        operator: '张海涛',
        createdAt: at('2026-07-09 17:12'),
      },
    ])
    .returning()
    .all()

  /* ---------- visits：8 条，覆盖「待拜访 / 已完成」 ----------
   * scene 取值与《需求说明》功能 #14 一致：一次 / 二次 / 多次拜访。 */
  const visitRows = db
    .insert(visits)
    .values([
      { customerId: cZhang.id, scheduledAt: at('2026-06-18 10:00'), status: '已完成', scene: '一次拜访' },
      { customerId: cZhang.id, scheduledAt: at('2026-07-09 14:30'), status: '已完成', scene: '二次拜访' },
      { customerId: cHe.id, scheduledAt: at('2026-06-03 10:00'), status: '已完成', scene: '一次拜访' },
      { customerId: cHe.id, scheduledAt: at('2026-07-22 09:00'), status: '已完成', scene: '多次拜访' },
      { customerId: cLiu.id, scheduledAt: at('2026-06-27 19:30'), status: '已完成', scene: '一次拜访' },
      { customerId: cZheng.id, scheduledAt: at('2026-07-06 15:00'), status: '已完成', scene: '一次拜访' },
      { customerId: cSu.id, scheduledAt: at('2026-08-27 10:30'), status: '待拜访', scene: '一次拜访' },
      { customerId: cZheng.id, scheduledAt: at('2026-08-29 14:00'), status: '待拜访', scene: '二次拜访' },
    ])
    .returning()
    .all()

  const [vZhang1, vZhang2, vHe1, vHe2, vLiu1, vZheng1] = visitRows

  /* ---------- reviews：6 条 ----------
   * 分配：张国庆 2、何薇 2（→ S3），刘敏 1、郑帆 1（→ S2），
   *       苏晓彤 / 马红梅 / 高建军 0（→ S1）。
   * scores.total 覆盖 0 / 2 / 3 / 4；d1~d4 的 0/1 组合各不相同。
   * metrics 14 项与 config/scoring.ts 的阈值自洽，total 严格等于 d1+d2+d3+d4。 */
  const reviewRows = db
    .insert(reviews)
    .values([
      /* ===== R1 张国庆 一次拜访：破冰与挖需到位，方案呈现和推进拉胯 → 2 分 ===== */
      {
        customerId: cZhang.id,
        visitId: vZhang1.id,
        transcript: [
          S(0, 6.4, '张叔您好，我是合筑装饰的张海涛，上周电话里约的今天上午，楼下停车位太满绕了一圈，让您久等了。'),
          C(6.8, 11.2, '没事，我这刚下来。你们公司在万达那边是吧，那一片早上就是不好停。'),
          S(11.6, 18.3, '是的，就在万达 B 座。刚才进来看您这户型采光真好，南北通透，这房子当时选得挺讲究。'),
          C(18.9, 30.5, '十年前买的，住到现在了。最头疼的是水电，当年那批 PVC 管现在一到冬天就冒水珠，我自己以前就是干水电的，一看就知道要出事。'),
          S(31.0, 42.6, '您内行，那我就不绕弯子了。十年前的管子确实到年限了，我们进场第一件事就是把水电全拆重做，不做局部修补。'),
          C(43.1, 52.8, '拆重做我认。但我最怕的是干到一半跟我说这个不含那个不含，我邻居去年就是这么被加了四万多。'),
          S(53.2, 61.0, '这个您放心，我们是套餐价，一般不会有太多增项。'),
          C(61.5, 70.2, '一般是多少？我要的是一个数。你们这个套餐到底包哪些，不包哪些，能不能给我列个单子？'),
          S(70.8, 76.4, '单子有的，我回去整理一份发您。'),
          C(77.0, 86.5, '还有工期。我孙子明年春节要回来住，你们能保证春节前弄完吗？'),
          S(87.0, 95.2, '75 天左右吧，正常情况肯定来得及，除非中间遇上什么特殊情况。'),
          C(95.8, 101.3, '行，那你先把清单做出来，做好了微信发我，我看看再说。'),
          S(101.8, 106.0, '好的张叔，那我这两天整理好发您。'),
        ],
        metrics: {
          icebreak_duration: 42,
          interrupt_per_hour: 2,
          customer_first_speak_at: 55,
          sales_talk_ratio: 0.58,
          customer_question_count: 4,
          profile_covered_count: 5,
          open_question_count: 6,
          total_question_count: 10,
          selling_point_hit_count: 2,
          max_repeat_followup: 2,
          need_matched_count: 1,
          need_total_count: 3,
          param_error_count: 1,
          objection_response_rate: 0.5,
          objection_response_delay: 14,
          next_step_locked: false,
        },
        scores: { d1: 1, d2: 1, d3: 0, d4: 0, total: 2 },
        aiResult: {
          counts: {
            open_question_count: 6,
            total_question_count: 10,
            profile_covered_fields: [F.identity, F.phone, F.role, F.coreNeed, F.deadline],
            param_error_count: 1,
          },
          needs: [
            {
              level: 'L1',
              text: '十年老房水电管到年限，冬天冒水珠，怕漏水，要整体重做',
              quote: '当年那批 PVC 管现在一到冬天就冒水珠，我自己以前就是干水电的',
              start: 18.9,
              satisfied: true,
            },
            {
              level: 'L1',
              text: '最怕干到一半增项加钱，邻居被加了四万多',
              quote: '我最怕的是干到一半跟我说这个不含那个不含，我邻居去年就是这么被加了四万多',
              start: 43.1,
              satisfied: false,
            },
            {
              level: 'L2',
              text: '孙子春节回来住，工期不能拖',
              quote: '我孙子明年春节要回来住，你们能保证春节前弄完吗',
              start: 77.0,
              satisfied: false,
            },
          ],
          highlights: [
            {
              text: '识别出客户是水电工出身后立刻切换话术密度，用「不做局部修补」这种同行语言建立专业对等',
              quote: '您内行，那我就不绕弯子了',
              start: 31.0,
            },
          ],
          improvements: [
            {
              text: '客户把「增项」这个最痛的点摆到台面上，销售用「一般不会有太多」搪塞，被客户当场追问「一般是多少」',
              quote: '我们是套餐价，一般不会有太多增项',
              start: 53.2,
            },
            {
              text: '工期同样用「75 天左右」「除非遇上特殊情况」留了活口，对一个盯工地的客户来说等于没承诺',
              quote: '75 天左右吧，正常情况肯定来得及',
              start: 87.0,
            },
          ],
          commitments: [
            { text: '两天内整理出包含范围清单并微信发给客户', due: '两天内', start: 101.8 },
          ],
          missed_points: [
            {
              text: '「一般不会有太多增项」与产品库「一口价不增项、超出部分公司承担」不符，属于把硬承诺讲软了',
              quote: '一般不会有太多增项',
              start: 53.2,
            },
            {
              text: '工期违约赔付（每天千分之一从尾款扣）完全没提，白白丢掉一个能当场压住顾虑的卖点',
              quote: '除非中间遇上什么特殊情况',
              start: 87.0,
            },
          ],
          next_actions: [
            '带一份逐项列明「包含/不包含」的清单上门，把增项焦虑一次性摁死',
            '把工期违约赔付条款单独拎出来讲，并写进合同给客户看',
            '约定下次见面的具体时间，把清单评审锁死，不要停在「发我看看」',
          ],
        },
        createdAt: at('2026-06-18 12:10'),
      },

      /* ===== R2 张国庆 二次拜访：全面改进并当场签约 → 4 分 ===== */
      {
        customerId: cZhang.id,
        visitId: vZhang2.id,
        transcript: [
          S(0, 7.2, '张叔，上次您说的两件事我都落到纸上了，先看这张表，一分钟就能看明白。'),
          C(7.6, 13.4, '你直接说结论，我一会儿还得去接孙子。'),
          S(13.8, 27.5, '结论是：全屋整装悦享款 12.8 万，合同写死，除非您自己改方案，否则不会再多要一分钱；哪一项超了，超出部分我们公司承担。'),
          C(28.0, 38.6, '这话说得好听。白纸黑字在哪儿？我要看条款，不看你说。'),
          S(39.0, 52.4, '在这儿，合同第七条第二款，「除甲方书面变更外，乙方不得增加任何费用」。旁边这份是包含范围清单，一共 46 项，不包含的 5 项我用红字标出来了。'),
          C(53.0, 63.8, '红字这几项是什么？拆旧、空调移机……这些确实得另算，我认。那工期呢？'),
          S(64.2, 78.0, '75 天，合同第九条，每拖一天按合同额千分之一赔给您，从尾款里直接扣，不用您来催。按今天算，春节前有 20 天富余。'),
          C(78.5, 84.2, '千分之一是多少钱一天？'),
          S(84.6, 93.0, '一百二十八块一天。这个数不大，但意思是我们不敢拖，拖了公司要吃罚款，工地经理的绩效直接挂钩。'),
          C(93.5, 104.8, '行。还有一个，主材你们说的东鹏、九牧，到时候进场会不会给我换成别的牌子？我可看得出来。'),
          S(105.2, 116.4, '主材品牌写在合同附件三里，进场时您扫码验真，对不上您直接拒收，验收单我们不签您可以不给钱。'),
          C(116.9, 124.0, '你们这个倒是实在。那定制柜那块，我老伴东西多，主卧那个衣柜她嫌放不下。'),
          S(124.5, 133.2, '定制柜做到顶，把梁边和飘窗下的零碎空间都用上，同样一面墙比成品柜多放三成东西，回头我带板材样品让阿姨摸一下。'),
          C(133.8, 142.5, '可以。那今天就把合同签了吧，我这边不想再拖了，你把首款账户给我。'),
          S(143.0, 150.6, '好，那我们现在过一遍条款，签完我把开工日定在下周一，工地经理姓王，明天我拉个群把他拉进来对接您。'),
        ],
        metrics: {
          icebreak_duration: 38,
          interrupt_per_hour: 1,
          customer_first_speak_at: 41,
          sales_talk_ratio: 0.52,
          customer_question_count: 5,
          profile_covered_count: 7,
          open_question_count: 8,
          total_question_count: 12,
          selling_point_hit_count: 5,
          max_repeat_followup: 1,
          need_matched_count: 3,
          need_total_count: 4,
          param_error_count: 0,
          objection_response_rate: 0.8,
          objection_response_delay: 6,
          next_step_locked: true,
        },
        scores: { d1: 1, d2: 1, d3: 1, d4: 1, total: 4 },
        aiResult: {
          counts: {
            open_question_count: 8,
            total_question_count: 12,
            profile_covered_fields: [
              F.identity,
              F.phone,
              F.role,
              F.budget,
              F.coreNeed,
              F.priority,
              F.deadline,
            ],
            param_error_count: 0,
          },
          needs: [
            {
              level: 'L1',
              text: '不增项要有白纸黑字的条款，不听口头保证',
              quote: '白纸黑字在哪儿？我要看条款，不看你说',
              start: 28.0,
              satisfied: true,
            },
            {
              level: 'L1',
              text: '春节前必须完工，工期要有约束力',
              quote: '那工期呢',
              start: 53.0,
              satisfied: true,
            },
            {
              level: 'L2',
              text: '担心主材进场被偷换牌子',
              quote: '到时候进场会不会给我换成别的牌子？我可看得出来',
              start: 93.5,
              satisfied: true,
            },
            {
              level: 'L2',
              text: '老伴东西多，主卧衣柜放不下，需要更多收纳',
              quote: '我老伴东西多，主卧那个衣柜她嫌放不下',
              start: 116.9,
              satisfied: false,
            },
          ],
          highlights: [
            {
              text: '客户要条款，销售直接翻到合同第七条第二款念原文，用文件而不是形容词回应',
              quote: '合同第七条第二款，「除甲方书面变更外，乙方不得增加任何费用」',
              start: 39.0,
            },
            {
              text: '主动把不包含的 5 项用红字标出来，先自曝短板再谈优势，客户当场说「我认」',
              quote: '不包含的 5 项我用红字标出来了',
              start: 39.0,
            },
            {
              text: '把千分之一换算成「一百二十八块一天」并说明绩效挂钩，让赔付条款从数字变成约束力',
              quote: '拖了公司要吃罚款，工地经理的绩效直接挂钩',
              start: 84.6,
            },
          ],
          improvements: [
            {
              text: '收纳需求出现在成交前最后一分钟，只回了卖点没有当场量尺，样品也推到了「回头」',
              quote: '回头我带板材样品让阿姨摸一下',
              start: 124.5,
            },
          ],
          commitments: [
            { text: '开工日定在下周一', due: '下周一', start: 143.0 },
            { text: '明天拉群把工地经理王师傅拉进来对接', due: '明天', start: 143.0 },
            { text: '带板材样品给客户老伴现场确认', start: 124.5 },
          ],
          missed_points: [],
          next_actions: [
            '明天建群并拉入工地经理，把开工前的交底时间定下来',
            '带定制柜板材样品上门，顺手把主卧衣柜尺寸量了',
            '开工前再走一遍红字标注的 5 项不包含内容，避免开工后翻旧账',
          ],
        },
        createdAt: at('2026-07-09 16:45'),
      },

      /* ===== R3 刘敏 一次拜访：破冰过短、报价含糊，但下一步锁住了 → 2 分 ===== */
      {
        customerId: cLiu.id,
        visitId: vLiu1.id,
        transcript: [
          S(0, 4.5, '刘姐晚上好，我是合筑装饰的李敏，我直接看看厨房和卫生间吧？'),
          C(5.0, 12.8, '看吧。你自己看，我这边还得看着店。这个卫生间你看，一冲水就返上来，臭得不行。'),
          S(13.2, 20.6, '这是主立管锈死了，光换个马桶没用，得连立管一起换。'),
          C(21.0, 32.4, '我上一家来看的说换个地漏就行，八百块搞定。你这一说是不是又要多花钱？'),
          S(32.8, 41.5, '换地漏解决不了返水，最多管两个月。老房子这种情况得把立管换成 PPR。'),
          C(42.0, 50.8, '那你们厨卫一起做多少钱？我先说，超过六万我做不了。'),
          S(51.2, 58.0, '厨卫翻新这个包，一般四万多，具体得量完尺才知道。'),
          C(58.6, 68.2, '四万多是四万几？我这人算账清楚，你给个准数我才好跟我老公说。'),
          S(68.8, 74.0, '大概四万五六吧，我回去核一下报价单给您。'),
          C(74.5, 84.6, '还有个事，我这店走不开，也没地方住，你们能不能别让我搬出去？'),
          S(85.0, 92.4, '这个可以，我们厨卫分开做，先做卫生间再做厨房，中间给您留一个能用的，28 天不用搬出去住。'),
          C(93.0, 103.5, '那还行。这样，你把准确报价单和工期表明天晚上八点前发我微信，我周末跟我老公一起看。'),
          S(104.0, 111.8, '好的刘姐，明天晚上八点前发您，我把分区施工的进度表也一并做出来，标清楚哪几天卫生间不能用。'),
        ],
        metrics: {
          icebreak_duration: 8,
          interrupt_per_hour: 2,
          customer_first_speak_at: 62,
          sales_talk_ratio: 0.55,
          customer_question_count: 3,
          profile_covered_count: 4,
          open_question_count: 5,
          total_question_count: 9,
          selling_point_hit_count: 3,
          max_repeat_followup: 3,
          need_matched_count: 1,
          need_total_count: 3,
          param_error_count: 2,
          objection_response_rate: 0.75,
          objection_response_delay: 9,
          next_step_locked: true,
        },
        scores: { d1: 0, d2: 1, d3: 0, d4: 1, total: 2 },
        aiResult: {
          counts: {
            open_question_count: 5,
            total_question_count: 9,
            profile_covered_fields: [F.identity, F.role, F.coreNeed, F.deadline],
            param_error_count: 2,
          },
          needs: [
            {
              level: 'L1',
              text: '卫生间返水发臭，老房下水管道要整体处理',
              quote: '这个卫生间你看，一冲水就返上来，臭得不行',
              start: 5.0,
              satisfied: true,
            },
            {
              level: 'L2',
              text: '要一个能报给老公的准确数字，超过六万做不了',
              quote: '四万多是四万几？我这人算账清楚，你给个准数我才好跟我老公说',
              start: 58.6,
              satisfied: false,
            },
            {
              level: 'L2',
              text: '店走不开也没地方住，不能搬家',
              quote: '我这店走不开，也没地方住，你们能不能别让我搬出去',
              start: 74.5,
              satisfied: false,
            },
          ],
          highlights: [
            {
              text: '当场戳破上一家「换地漏八百搞定」的方案，用「最多管两个月」把问题拉回真实层面',
              quote: '换地漏解决不了返水，最多管两个月',
              start: 32.8,
            },
            {
              text: '不搬家分区施工的卖点接得准，客户当场从质疑转成「那还行」',
              quote: '先做卫生间再做厨房，中间给您留一个能用的',
              start: 85.0,
            },
          ],
          improvements: [
            {
              text: '开场不到五秒直奔卫生间，客户全程在看店、心不在焉，前一分钟基本是各说各的',
              quote: '我直接看看厨房和卫生间吧',
              start: 0,
            },
            {
              text: '价格被追问三轮才给出模糊数，对一个明说「算账清楚」的客户是致命的',
              quote: '大概四万五六吧，我回去核一下报价单给您',
              start: 68.8,
            },
          ],
          commitments: [
            { text: '明晚八点前发送准确报价单与工期表', due: '明天晚上八点前', start: 104.0 },
            { text: '附一份标注卫生间停用日期的分区施工进度表', due: '明天晚上八点前', start: 104.0 },
          ],
          missed_points: [
            {
              text: '产品库标价 45600，现场说成「一般四万多」「大概四万五六」，属于报价含糊',
              quote: '厨卫翻新这个包，一般四万多',
              start: 51.2,
            },
            {
              text: '工期 28 天是硬参数，第一次提价格时没有一并给出，错过了「总价+工期」一次讲清的时机',
              quote: '具体得量完尺才知道',
              start: 51.2,
            },
          ],
          next_actions: [
            '明晚八点前发出精确到元的报价单，附分区施工进度表',
            '准备一版可直接转发给她老公的简版说明，只讲总价、工期、不搬家三件事',
            '约周末她和老公都在的时间上门量尺',
          ],
        },
        createdAt: at('2026-06-27 21:50'),
      },

      /* ===== R4 郑帆 一次拜访：方案讲得好但独角戏、推进虚 → 2 分 ===== */
      {
        customerId: cZheng.id,
        visitId: vZheng1.id,
        transcript: [
          S(0, 9.4, '郑先生您好，我是合筑装饰的李敏。刚看您朋友圈说刚跑完半马，这个厉害，我跑五公里就得歇。'),
          C(10.0, 16.2, '哈哈，练了两年了。你坐，喝水。'),
          S(16.8, 30.5, '谢谢。听说您那套是年底交房？我们给同小区做过四套，一般会在交房前一个月把方案定下来，交房当天就能进场。'),
          C(31.0, 36.4, '嗯，是年底。'),
          S(37.0, 52.8, '那我先说说我们常做的方案。您这个户型我看过图，主卧和次卧之间那面墙有个梁，成品柜放上去两边会各空十几公分。'),
          S(53.2, 68.5, '我们做定制柜是顶天立地的，把梁边和飘窗下这些零碎空间全用上，同样一面墙能比成品柜多放三成东西。'),
          S(69.0, 82.4, '板材用的是爱格 E0 级颗粒板，激光封边没有胶线，回南天不会像普通封边那样鼓包掉皮，五金是百隆的，质保十年。'),
          C(83.0, 94.6, '爱格我知道，我查过。激光封边这个……你们是自己的厂做还是外发？外发的话质量不好控。'),
          S(95.0, 108.2, '我们是合作的定点工厂，用的就是激光封边线，边角您可以现场抠一下试试，抠不动的。样品间我们摆着，您随时来看。'),
          C(108.8, 118.5, '嗯。价格呢？我看网上说定制柜按投影面积算，容易算出天价。'),
          S(119.0, 128.4, '我们这套全屋定制标价 26800，按投影面积算，柜体、五金、安装全包含在里面，不另收安装费。'),
          C(129.0, 137.6, '行，我知道了。资料你留一份，我再研究研究。'),
          S(138.0, 143.5, '好的，那我把资料留下，您有问题随时联系我。'),
        ],
        metrics: {
          icebreak_duration: 65,
          interrupt_per_hour: 3,
          customer_first_speak_at: 210,
          sales_talk_ratio: 0.72,
          customer_question_count: 3,
          profile_covered_count: 3,
          open_question_count: 2,
          total_question_count: 8,
          selling_point_hit_count: 4,
          max_repeat_followup: 2,
          need_matched_count: 2,
          need_total_count: 3,
          param_error_count: 0,
          objection_response_rate: 0.5,
          objection_response_delay: 12,
          next_step_locked: true,
        },
        scores: { d1: 1, d2: 0, d3: 1, d4: 0, total: 2 },
        aiResult: {
          counts: {
            open_question_count: 2,
            total_question_count: 8,
            profile_covered_fields: [F.identity, F.coreNeed, F.deadline],
            param_error_count: 0,
          },
          needs: [
            {
              level: 'L1',
              text: '户型有梁，成品柜两边空出十几公分，收纳做不满',
              quote: '主卧和次卧之间那面墙有个梁',
              start: 37.0,
              satisfied: true,
            },
            {
              level: 'L1',
              text: '在意板材封边工艺，担心外发工厂质量不好控',
              quote: '你们是自己的厂做还是外发？外发的话质量不好控',
              start: 83.0,
              satisfied: true,
            },
            {
              level: 'L2',
              text: '担心按投影面积计价被算出天价',
              quote: '我看网上说定制柜按投影面积算，容易算出天价',
              start: 108.8,
              satisfied: false,
            },
          ],
          highlights: [
            {
              text: '用半马这个个人爱好破冰，一分钟内让客户从站着变成坐下倒水',
              quote: '刚看您朋友圈说刚跑完半马',
              start: 0,
            },
            {
              text: '封边质疑被「现场抠一下试试」这种可验证的动作接住，比任何形容词都有力',
              quote: '边角您可以现场抠一下试试，抠不动的',
              start: 95.0,
            },
          ],
          improvements: [
            {
              text: '客户「嗯，是年底」之后连续讲了三段共四十五秒，把需求确认的窗口直接讲没了',
              quote: '那我先说说我们常做的方案',
              start: 37.0,
            },
            {
              text: '八个提问里只有两个是开放式，其余都是确认型；客户三分半钟后才有第一次实质发言',
              start: 37.0,
            },
            {
              text: '结尾被「留份资料我再研究研究」带走，只留了资料，没约下一次的时间和人',
              quote: '资料你留一份，我再研究研究',
              start: 129.0,
            },
          ],
          commitments: [{ text: '留下产品资料，随时响应客户问题', start: 138.0 }],
          missed_points: [
            {
              text: '客户是程序员、习惯自己查资料，全程未邀约到样品间实地看板材，白白浪费了最有说服力的一步',
              quote: '样品间我们摆着，您随时来看',
              start: 95.0,
            },
          ],
          next_actions: [
            '把「随时来看」改成约定的样品间时间，定到具体某天某时',
            '补问预算区间与关注维度排序，这两项档案至今空着',
            '按他家实际户型出一版投影面积测算，把「天价」这个顾虑用数字摁死',
          ],
        },
        createdAt: at('2026-07-06 17:20'),
      },

      /* ===== R5 何薇 一次拜访：全维度未达标 → 0 分 ===== */
      {
        customerId: cHe.id,
        visitId: vHe1.id,
        transcript: [
          S(0, 5.2, '何女士您好，我是合筑装饰的张海涛，今天主要想给您介绍一下我们公司。'),
          S(5.6, 22.4, '我们成立于二零零三年，是本地最早一批做整装的公司，在全市有六家门店，去年施工量在同行里排第七，获得过省级示范工地。'),
          C(23.0, 26.8, '嗯。'),
          S(27.2, 45.6, '我们主推的是全屋整装悦享款，12.8 万，包含设计、主材、施工和软装基础包，主材是一线品牌，工期 75 天。'),
          C(46.0, 49.2, '你们用的板材是什么级别的？'),
          S(49.6, 54.0, '都是环保级别的，具体等级我回头查一下告诉您。'),
          S(54.4, 72.8, '然后我们有自己的施工队，不外包，工地上装了摄像头，手机上就能看，很多业主反馈说这个功能特别好用。'),
          C(73.2, 88.5, '我最担心的是甲醛。我家老二才八个月，老大四岁，装完要是有味道我们根本不敢住进去，这个你们怎么保证？'),
          S(89.0, 103.4, '摄像头主要是方便您远程看工地进度。环保这块我们用的材料都是达标的，我们做过的业主基本都没出过问题。'),
          C(104.0, 112.6, '基本都没出过是什么意思？我要的是有没有检测报告，不达标你们怎么办。'),
          S(113.0, 120.2, '这个一般都没问题的，我们材料都是正规渠道进的。'),
          C(120.8, 128.4, '行，资料放这儿吧，我还得去接孩子。'),
          S(128.8, 133.0, '好的何女士，那我先不打扰了，有需要随时联系我。'),
        ],
        metrics: {
          icebreak_duration: 5,
          interrupt_per_hour: 7,
          customer_first_speak_at: 240,
          sales_talk_ratio: 0.78,
          customer_question_count: 2,
          profile_covered_count: 2,
          open_question_count: 1,
          total_question_count: 7,
          selling_point_hit_count: 1,
          max_repeat_followup: 4,
          need_matched_count: 0,
          need_total_count: 2,
          param_error_count: 3,
          objection_response_rate: 0.33,
          objection_response_delay: 22,
          next_step_locked: false,
        },
        scores: { d1: 0, d2: 0, d3: 0, d4: 0, total: 0 },
        aiResult: {
          counts: {
            open_question_count: 1,
            total_question_count: 7,
            profile_covered_fields: [F.identity, F.coreNeed],
            param_error_count: 3,
          },
          needs: [
            {
              level: 'L1',
              text: '两个孩子还小，最担心甲醛和味道，装完不敢住',
              quote: '我家老二才八个月，老大四岁，装完要是有味道我们根本不敢住进去',
              start: 73.2,
              satisfied: false,
            },
            {
              level: 'L2',
              text: '要的是可出示的检测报告和不达标的处理办法',
              quote: '我要的是有没有检测报告，不达标你们怎么办',
              start: 104.0,
              satisfied: false,
            },
          ],
          highlights: [],
          improvements: [
            {
              text: '开场五秒直接进公司介绍，前四十五秒全是资质背书，客户只回了一个「嗯」',
              quote: '我们成立于二零零三年',
              start: 5.6,
            },
            {
              text: '客户抛出「两个孩子、不敢住」这个全场最痛的点，销售把话题拐回了工地摄像头',
              quote: '摄像头主要是方便您远程看工地进度',
              start: 89.0,
            },
            {
              text: '「基本都没出过问题」「一般都没问题」连用两次，客户直接以接孩子为由结束',
              quote: '这个一般都没问题的，我们材料都是正规渠道进的',
              start: 113.0,
            },
          ],
          commitments: [],
          missed_points: [
            { text: '板材环保等级答不上来，只说「都是环保级别的」', quote: '具体等级我回头查一下告诉您', start: 49.6 },
            { text: '环保用「材料都是达标的」代替 E0 级与完工复测承诺', quote: '我们用的材料都是达标的', start: 89.0 },
            { text: '完全没提「甲醛不达标我们负责整改到达标」这条最该讲的承诺', quote: '这个一般都没问题的', start: 113.0 },
          ],
          next_actions: [
            '重新约一次，开场只谈甲醛，不讲公司介绍',
            '带上第三方检测报告样本、E0 级板材检测单和「不达标整改到达标」的书面条款',
            '准备两个同样有小孩的业主案例，用检测数据替代「达标」这种形容词',
          ],
        },
        createdAt: at('2026-06-03 12:05'),
      },

      /* ===== R6 何薇 多次拜访：大幅改进，下一步仍未锁死 → 3 分 ===== */
      {
        customerId: cHe.id,
        visitId: vHe2.id,
        transcript: [
          S(0, 8.6, '何姐，上次是我没准备好，浪费了您二十分钟。这次我只讲一件事：甲醛。'),
          C(9.0, 14.2, '行，你说。上次那两个问题你查清楚了吗？'),
          S(14.6, 28.4, '查清楚了。主辅材全是 E0 级，这是三份板材检测报告；完工后我们出钱请第三方检测，不达标我们负责整改到达标为止，这条可以写进合同。'),
          C(29.0, 41.6, '整改到达标……那要是整改了还不达标呢？我不可能一直等，老二明年就要满地爬了。'),
          S(42.0, 58.8, '合同里可以加一条：两次整改后仍不达标，全额退款并恢复原状费用我们承担。这条我今天带了模板，您可以先拿去看。'),
          C(59.2, 71.4, '这个我确实没想到你们敢写。那施工过程中呢？我听说味道大的是胶和油漆，不是板材。'),
          S(71.8, 84.6, '您说得对，胶才是大头。我们基础包用的是无醛添加的免钉胶和立邦儿童漆，进场时我把每一桶的批次拍给您，您自己核。'),
          C(85.0, 96.2, '这个可以。那这些是不是都要另外加钱？我看你们那个整装套餐好像不含这些。'),
          S(96.6, 108.0, '环保基础施工包是单独的，三万九千八，含水电防水泥木和墙面基层，全 E0 级，隐蔽工程保 5 年。'),
          C(108.6, 120.4, '嗯。还有收纳，我们家老大的玩具和老二的东西太多了，现在这个户型放不下，柜子根本不够用。'),
          S(120.8, 134.2, '定制柜做到顶，梁边和飘窗下都能用上，比成品柜多放三成。不过您家儿童房那面墙有个承重梁，具体能做多深我得上门量了才敢说。'),
          C(134.8, 143.6, '那你什么时候方便来量？我先跟我先生说一下，他也得看看合同那条。'),
          S(144.0, 152.8, '我这周都可以，您跟先生商量好告诉我时间就行，量完当天我把方案和合同一起带过来。'),
          C(153.2, 158.4, '嗯，我问问他，回头微信跟你说。'),
        ],
        metrics: {
          icebreak_duration: 55,
          interrupt_per_hour: 2,
          customer_first_speak_at: 70,
          sales_talk_ratio: 0.6,
          customer_question_count: 4,
          profile_covered_count: 6,
          open_question_count: 4,
          total_question_count: 9,
          selling_point_hit_count: 6,
          max_repeat_followup: 3,
          need_matched_count: 3,
          need_total_count: 5,
          param_error_count: 0,
          objection_response_rate: 0.6,
          objection_response_delay: 11,
          next_step_locked: true,
        },
        scores: { d1: 1, d2: 1, d3: 1, d4: 0, total: 3 },
        aiResult: {
          counts: {
            open_question_count: 4,
            total_question_count: 9,
            profile_covered_fields: [
              F.identity,
              F.phone,
              F.role,
              F.coreNeed,
              F.priority,
              F.deadline,
            ],
            param_error_count: 0,
          },
          needs: [
            {
              level: 'L1',
              text: '甲醛必须有可复测的检测报告，不达标要有兜底',
              quote: '那要是整改了还不达标呢？我不可能一直等',
              start: 29.0,
              satisfied: true,
            },
            {
              level: 'L1',
              text: '担心施工过程中的胶和油漆有味道，不只是板材',
              quote: '我听说味道大的是胶和油漆，不是板材',
              start: 59.2,
              satisfied: true,
            },
            {
              level: 'L1',
              text: '两个孩子东西多，现在户型放不下，柜子不够用',
              quote: '老大的玩具和老二的东西太多了，现在这个户型放不下',
              start: 108.6,
              satisfied: true,
            },
            {
              level: 'L2',
              text: '担心环保这些是不是都要另外加钱',
              quote: '那这些是不是都要另外加钱',
              start: 85.0,
              satisfied: false,
            },
            {
              level: 'L2',
              text: '需要先生一起确认合同条款才能推进',
              quote: '我先跟我先生说一下，他也得看看合同那条',
              start: 134.8,
              satisfied: false,
            },
          ],
          highlights: [
            {
              text: '开场直接为上次准备不足道歉并给出本次唯一议题，把关系从零重建',
              quote: '这次我只讲一件事：甲醛',
              start: 0,
            },
            {
              text: '客户追问「整改了还不达标呢」，销售当场加码到全额退款并带来模板，把兜底做实',
              quote: '两次整改后仍不达标，全额退款并恢复原状费用我们承担',
              start: 42.0,
            },
            {
              text: '客户说「胶才是大头」时先认同再补方案，没有急着辩解',
              quote: '您说得对，胶才是大头',
              start: 71.8,
            },
            {
              text: '承重梁能做多深不硬答，明确说要量了才敢讲',
              quote: '具体能做多深我得上门量了才敢说',
              start: 120.8,
            },
          ],
          improvements: [
            {
              text: '客户就甲醛兜底这一条追问了三轮才拿到全额退款方案，第一轮的「整改到达标」本可以一次说满',
              quote: '不达标我们负责整改到达标为止',
              start: 14.6,
            },
            {
              text: '结尾把量尺时间交给了客户「问问先生再说」，只锁了动作没锁时间，主动权交了出去',
              quote: '您跟先生商量好告诉我时间就行',
              start: 144.0,
            },
          ],
          commitments: [
            { text: '带走一份不达标全额退款的合同条款模板给客户先看', start: 42.0 },
            { text: '进场时逐桶拍摄胶与油漆批次号发给客户核对', start: 71.8 },
            { text: '上门量尺当天带方案与合同一起过来', start: 144.0 },
          ],
          missed_points: [],
          next_actions: [
            '主动给出两个量尺时间让客户二选一，不要停在「您告诉我时间」',
            '争取约到先生在场的那一次，合同条款当面过',
            '量尺时带儿童房承重梁的两版柜体方案，现场就能定',
          ],
        },
        createdAt: at('2026-07-22 11:30'),
      },
    ])
    .returning()
    .all()

  const [r1, r2, r3, r4, r5, r6] = reviewRows

  /* ---------- needs：21 条 ----------
   * level 覆盖 L1 / L2 / L3（L3 = 本次无具体场景需求，§1 功能 #5）；
   * satisfied 同时有 true 与 false；
   * 每条 review 的 L1+L2 条数 = 该 review 的 need_total_count，
   * 其中 satisfied = true 的条数 = need_matched_count；
   * text 中的词与 products.selling_points[].match_keywords 对得上。 */
  db.insert(needs)
    .values([
      /* R1 张国庆一次拜访：3 条（1 满足 2 未满足），对齐 need_total_count = 3 */
      { reviewId: r1.id, customerId: cZhang.id, level: 'L1', text: '十年老房水电到年限，冬天冒水珠，怕漏水要整体重做', quote: '当年那批 PVC 管现在一到冬天就冒水珠', timestampSec: 18.9, satisfied: true },
      { reviewId: r1.id, customerId: cZhang.id, level: 'L1', text: '最怕干到一半增项加钱，邻居被加了四万多', quote: '我最怕的是干到一半跟我说这个不含那个不含', timestampSec: 43.1, satisfied: false },
      { reviewId: r1.id, customerId: cZhang.id, level: 'L2', text: '孙子春节回来住，不能拖工期', quote: '我孙子明年春节要回来住，你们能保证春节前弄完吗', timestampSec: 77.0, satisfied: false },

      /* R2 张国庆二次拜访：4 条（3 满足 1 未满足），对齐 need_total_count = 4 */
      { reviewId: r2.id, customerId: cZhang.id, level: 'L1', text: '不增项要有白纸黑字条款，不听口头保证', quote: '白纸黑字在哪儿？我要看条款，不看你说', timestampSec: 28.0, satisfied: true },
      { reviewId: r2.id, customerId: cZhang.id, level: 'L1', text: '春节前必须完工，工期要有约束力，不能拖拖拉拉', quote: '那工期呢', timestampSec: 53.0, satisfied: true },
      { reviewId: r2.id, customerId: cZhang.id, level: 'L2', text: '担心主材进场被以次充好换牌子', quote: '到时候进场会不会给我换成别的牌子？我可看得出来', timestampSec: 93.5, satisfied: true },
      { reviewId: r2.id, customerId: cZhang.id, level: 'L2', text: '老伴东西多，主卧衣柜放不下，收纳不够', quote: '我老伴东西多，主卧那个衣柜她嫌放不下', timestampSec: 116.9, satisfied: false },

      /* R3 刘敏：3 条（1 满足 2 未满足），对齐 need_total_count = 3 */
      { reviewId: r3.id, customerId: cLiu.id, level: 'L1', text: '卫生间返水发臭，老房下水慢，管道要整体换', quote: '一冲水就返上来，臭得不行', timestampSec: 5.0, satisfied: true },
      { reviewId: r3.id, customerId: cLiu.id, level: 'L2', text: '要能报给老公的准数，超过六万做不了', quote: '四万多是四万几？你给个准数我才好跟我老公说', timestampSec: 58.6, satisfied: false },
      { reviewId: r3.id, customerId: cLiu.id, level: 'L2', text: '店走不开也没地方住，不能搬家', quote: '我这店走不开，也没地方住，你们能不能别让我搬出去', timestampSec: 74.5, satisfied: false },

      /* R4 郑帆：3 条（2 满足 1 未满足），对齐 need_total_count = 3
       * ※ 有意为之：郑帆唯一未满足的需求是「计价天价」这个价格异议，
       *   在 products.selling_points 里**没有**对应卖点（它对应的是 objections）。
       *   因此他的「应讲未讲」清单为空，会触发 §3.4「清单为空 → 回退 S1 规则」分支。
       *   另一个 S2 客户刘敏的清单非空（不搬家分区施工），两条分支各覆盖一个，
       *   请勿为了「让清单都非空」而改掉这条。 */
      { reviewId: r4.id, customerId: cZheng.id, level: 'L1', text: '户型有梁，成品柜两边空出十几公分，东西多放不下', quote: '主卧和次卧之间那面墙有个梁', timestampSec: 37.0, satisfied: true },
      { reviewId: r4.id, customerId: cZheng.id, level: 'L1', text: '在意板材封边工艺，怕外发工厂做出来掉皮鼓包', quote: '你们是自己的厂做还是外发？外发的话质量不好控', timestampSec: 83.0, satisfied: true },
      { reviewId: r4.id, customerId: cZheng.id, level: 'L2', text: '担心按投影面积计价被算出天价', quote: '我看网上说定制柜按投影面积算，容易算出天价', timestampSec: 108.8, satisfied: false },

      /* R5 何薇一次拜访：2 条计入 need_total_count（均未满足）+ 1 条 L3 无需求 */
      { reviewId: r5.id, customerId: cHe.id, level: 'L1', text: '两个孩子小，最担心甲醛和味道，装完不敢住', quote: '装完要是有味道我们根本不敢住进去', timestampSec: 73.2, satisfied: false },
      { reviewId: r5.id, customerId: cHe.id, level: 'L2', text: '要可出示的检测报告和不达标的处理办法', quote: '我要的是有没有检测报告，不达标你们怎么办', timestampSec: 104.0, satisfied: false },
      { reviewId: r5.id, customerId: cHe.id, level: 'L3', text: '本次未就收纳、工期、预算表达任何具体场景需求（全程销售单向输出）', quote: '行，资料放这儿吧，我还得去接孩子', timestampSec: 120.8, satisfied: false },

      /* R6 何薇多次拜访：5 条（3 满足 2 未满足），对齐 need_total_count = 5 */
      { reviewId: r6.id, customerId: cHe.id, level: 'L1', text: '甲醛要有可复测报告，不达标要有兜底', quote: '那要是整改了还不达标呢？我不可能一直等', timestampSec: 29.0, satisfied: true },
      { reviewId: r6.id, customerId: cHe.id, level: 'L1', text: '担心施工用的胶和油漆有味道，不只是板材', quote: '我听说味道大的是胶和油漆，不是板材', timestampSec: 59.2, satisfied: true },
      { reviewId: r6.id, customerId: cHe.id, level: 'L1', text: '两个孩子东西多，现在户型放不下，柜子不够', quote: '老大的玩具和老二的东西太多了，现在这个户型放不下', timestampSec: 108.6, satisfied: true },
      { reviewId: r6.id, customerId: cHe.id, level: 'L2', text: '担心环保这些要另外加钱，怕预算超', quote: '那这些是不是都要另外加钱', timestampSec: 85.0, satisfied: false },
      { reviewId: r6.id, customerId: cHe.id, level: 'L2', text: '需要先生一起确认合同条款才能推进', quote: '我先跟我先生说一下，他也得看看合同那条', timestampSec: 134.8, satisfied: false },
    ])
    .returning()
    .all()

  /* ---------- todos：10 条，done 兼有 true / false，due_date 为 'YYYY-MM-DD' ---------- */
  db.insert(todos)
    .values([
      { customerId: cZhang.id, reviewId: r1.id, text: '做一份逐项列明「包含/不包含」的清单，不包含项用红字标出', dueDate: '2026-06-20', done: true },
      { customerId: cZhang.id, reviewId: r1.id, text: '把工期违约赔付条款单独整理成一页，带合同原文', dueDate: '2026-06-25', done: true },
      { customerId: cZhang.id, reviewId: r2.id, text: '建微信群并拉入工地经理王师傅，定开工交底时间', dueDate: '2026-07-10', done: true },
      { customerId: cZhang.id, reviewId: r2.id, text: '带定制柜板材样品上门，顺手量主卧衣柜尺寸', dueDate: '2026-07-16', done: false },
      { customerId: cLiu.id, reviewId: r3.id, text: '发送精确到元的厨卫翻新报价单 + 分区施工进度表', dueDate: '2026-06-28', done: true },
      { customerId: cLiu.id, reviewId: r3.id, text: '做一版只讲总价/工期/不搬家的简版说明，供转发她老公', dueDate: '2026-07-03', done: false },
      { customerId: cZheng.id, reviewId: r4.id, text: '约郑帆到样品间看激光封边，定到具体某天某时', dueDate: '2026-07-11', done: false },
      { customerId: cHe.id, reviewId: r5.id, text: '取三份 E0 级板材检测报告与第三方检测流程说明', dueDate: '2026-06-10', done: true },
      { customerId: cHe.id, reviewId: r6.id, text: '给出两个量尺时间让何薇二选一，争取先生在场', dueDate: '2026-08-28', done: false },
      { customerId: cSu.id, reviewId: null, text: '首次上门前先电话问出她到底在跟哪几家比、比什么', dueDate: '2026-08-26', done: false },
    ])
    .returning()
    .all()

  /* ---------- scripts：9 条 ----------
   * §3.5：stage 只能是五段式；单条 <=30 秒；异议类必须带开放式追问；
   * 话术中的价格与 products 一致（12.8 万 / 45600 / 26800 / 39800）。 */
  db.insert(scripts)
    .values([
      { stage: STAGE.open, scene: '首次上门，客户朋友圈有明显个人爱好', text: '刚看您朋友圈说跑完半马，这个厉害，我跑五公里就得歇。您练多久了？', fromReviewId: r4.id },
      { stage: STAGE.open, scene: '上次拜访表现不佳，二次登门', text: '上次是我没准备好，浪费了您二十分钟。这次我只讲一件事：甲醛。', fromReviewId: r6.id },
      { stage: STAGE.confirm, scene: '客户只回一个字，需要撬开话题', text: '这套是自住还是出租？家里几口人住、有没有老人小孩，我按这个来排空间，不然方案做了也是白做。', fromReviewId: null },
      { stage: STAGE.confirm, scene: '客户说预算有限但不肯说具体数', text: '我不问您总数，就问一句：超过多少您就得再找人商量？我按那个数往下做，省得来回改。', fromReviewId: r3.id },
      { stage: STAGE.present, scene: '客户担心中途被增项加钱', text: '合同写死 12.8 万，除非您自己改方案，否则不多要一分钱；哪项超了，超出部分我们公司承担。', fromReviewId: r2.id },
      { stage: STAGE.present, scene: '客户在意工期且有硬性入住时间', text: '75 天写进合同，每拖一天按合同额千分之一赔给您，一百二十八块一天，从尾款直接扣，不用您催。', fromReviewId: r2.id },
      { stage: STAGE.objection, scene: '客户怀疑环保只是嘴上说说', text: '完工我们出钱请第三方检测，不达标整改到达标，两次还不达标全额退款。您最担心的是板材还是胶？', fromReviewId: r6.id },
      { stage: STAGE.objection, scene: '客户说别家便宜三万', text: '差价基本都在主材和隐蔽工程，我把两边清单逐项摆开给您看。您方便把那份报价拍给我吗？', fromReviewId: null },
      { stage: STAGE.lock, scene: '客户说「资料留下我再研究研究」', text: '资料我留下。这周三下午或者周六上午，您挑一个，我带样品上门量尺，量完当天出方案。', fromReviewId: r4.id },
    ])
    .returning()
    .all()

  /* ---------- 汇总输出（条数由实际查询统计，不写死） ---------- */
  const needRows = db.select().from(needs).all()
  const todoRows = db.select().from(todos).all()
  const scriptRows = db.select().from(scripts).all()
  const customerRows = db.select().from(customers).all()

  console.log('[seed] 完成，各表条数：')
  const counts: [string, number][] = [
    ['customers', customerRows.length],
    ['intent_logs', intentLogRows.length],
    ['visits', visitRows.length],
    ['reviews', reviewRows.length],
    ['needs', needRows.length],
    ['products', productRows.length],
    ['todos', todoRows.length],
    ['scripts', scriptRows.length],
  ]
  for (const [table, n] of counts) {
    console.log(`  ${table.padEnd(12)} ${n}`)
  }

  console.log(
    `[seed] 派生状态：S3 = ${cZhang.name} / ${cHe.name}（各 2 条复盘），` +
      `S2 = ${cLiu.name} / ${cZheng.name}（各 1 条），` +
      `S1 = ${cSu.name} / ${cMa.name} / ${cGao.name}（0 条）`,
  )
  console.log(
    `[seed] 意向：A 已成单 ${cZhang.name}；` +
      `B 中意向 ${cHe.name}(3) / ${cLiu.name}(2) / ${cZheng.name}(1)；` +
      `C 低意向 ${cSu.name} / ${cMa.name}；D 无意向 ${cGao.name}`,
  )
  console.log(
    `[seed] 产品库 ${productRows.length} 个：装修 ${productRows.filter((p) => p.industry === '装修').length} / ` +
      `教培 ${productRows.filter((p) => p.industry === '教培').length} / ` +
      `广告 ${productRows.filter((p) => p.industry === '广告').length}`,
  )
}

seed()
