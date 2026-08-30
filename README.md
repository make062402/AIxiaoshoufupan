# AI 销售复盘助手

一个面向销售复盘场景的 Demo / 原型项目，聚焦于“逐字稿 → 结构化分析 → 复盘评分 → 待办跟进”的完整闭环。

它以“AI 助力销售复盘”为核心，用前端交互演示客户档案、拜访计划、逐字稿分析、复盘评分、话术库与团队报告等典型工作流，帮助用户理解如何把销售过程中的关键事实转化为可执行的复盘资产。

## 项目定位

这个项目不是单纯的聊天机器人，而是一个偏业务系统的销售支持工具：

- 录入或粘贴逐字稿
- 提取关键销售/客户信息
- 计算 14 项复盘指标与四维度评分
- 归纳亮点、改进点、承诺与待办
- 提供客户档案、产品库、话术库和团队概览
- 支持 Web / 移动端演示，适合产品演示、方案说明和功能验证

详细设计与需求说明请参考：

- [收敛版需求说明.md](收敛版需求说明.md)
- [技术方案_专业版.md](技术方案_专业版.md)
- [AI销售复盘助手_开发任务清单_v2.md](AI销售复盘助手_开发任务清单_v2.md)

## 功能概览

- 客户管理：客户档案、意向状态、拜访记录
- 复盘流程：逐字稿输入、AI 分析、分数与证据回溯
- 评分能力：对 D1～D4 四维度和总分进行统一判定
- 智能建议：漏讲 / 错讲检测、待办清单、承诺清单
- 资产沉淀：话术库、产品库、配置管理
- 主管视角：团队复盘概览与汇总
- 多端适配：Web 端 + 移动端壳（Capacitor）

## 技术栈

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Node.js + Hono + Drizzle ORM + SQLite
- AI 接口: Dify
- Mobile shell: Capacitor
- Deployment scripts: Linux server / Nginx / HTTPS tooling in ops/

## 架构

```text
frontend/   Web/Mobile 端展示与业务计算层
backend/    API 层与持久化层
ops/        生产环境部署与 HTTPS / Nginx 脚本
scripts/    项目验证脚本
docs/       设计、交接和部署文档
```

> 这个项目的设计目标是“前端承接业务计算，后端主要负责数据与接口”，部署和业务说明也已在文档目录中整理。更多细节可见技术方案文档。

## 快速开始

### 1) 安装依赖

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) 配置环境变量

复制后端示例环境变量：

```bash
cd backend
cp .env.example .env
```

然后按实际情况填写：

```env
PORT=3000
DB_FILE=./data/app.db
DIFY_API_KEY=
DIFY_BASE_URL=https://api.dify.ai/v1
CONFIG_ADMIN_TOKEN=
USE_MOCK=true
```

> `.env` 已被 Git 忽略，不会被提交到仓库。生产环境中请勿把密钥或令牌写在前端代码中。

### 3) 初始化数据库

如果是首次启动，或刚修改了 schema：

```bash
cd backend && npm run db:push
```

### 4) 启动服务

推荐两个终端分别启动：

```bash
cd backend && npm run dev      # http://localhost:3000
cd frontend && npm run dev     # http://localhost:5173
```

### 5) 重置演示数据（可选）

如果需要恢复到干净样例数据：

```bash
cd backend && npm run db:seed
```

这个命令会清空现有业务表并重写种子数据，适合在演示前进行恢复。

## 项目结构

```text
.
├── backend/            # Node + Hono + SQLite 服务
├── frontend/           # React + Vite + Tailwind 前端
├── docs/               # 交接、部署与说明文档
├── ops/                # 生产环境脚本
├── scripts/            # 验证脚本
├── LICENSE             # Apache 2.0
├── README.md           # 项目入口说明
├── 收敛版需求说明.md
├── 技术方案_专业版.md
├── 技术方案_讲解版.md
├── AI销售复盘助手_开发任务清单_v2.md
└── .gitignore
```

## 公开 GitHub 前的说明

这个仓库适合作为技术展示、方案评审和内部原型的公开代码仓库，便于他人查看实现方式、复盘流程和前后端协作设计。它仍属于“演示型/原型型”项目，适合用于：

- 方案展示
- 技术评审
- 代码学习
- 产品迭代讨论

如果你要真正上线商用，还需要补齐：

- 统一的认证与权限体系
- 更完善的 API 校验和审计日志
- 真实生产环境部署配置
- 数据隔离与备份策略
- Dify / AI 接口访问控制和成本监控

## 贡献方式

欢迎提交问题与改进建议。

- 提交 Bug：优先使用 GitHub Issues 提交清晰复现步骤
- 提交功能建议：说明需求背景、用户价值和预期行为
- 参与开发：更新代码后建议附带最小可验证步骤

详细贡献说明请见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全

如果你发现安全问题，请勿直接公开在 Issue 中。请参考 [SECURITY.md](SECURITY.md) 中的方式私下提交。

## 许可证

本项目采用 Apache License 2.0。详情见 [LICENSE](LICENSE)。

## 备注

当前代码库适合展示 AI 销售复盘助手的整体实现思路，并已包含本地 mock 与演示数据。为了便于公开展示，建议在 GitHub 上补充仓库描述、标签、截图和 Demo 地址（如果已部署）。
