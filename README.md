# AI 销售复盘助手

响应式单一代码库（手机端 App + 电脑网页端功能等同），前后端分离。
业务计算置于前端，后端为纯数据存取层。详见《技术方案_专业版.md》。

## 改了 schema 必须先迁移，再启动

```bash
cd backend && npm run db:push
```

## 启动（两个终端）

```bash
cd backend && npm run dev      # http://localhost:3000
cd frontend && npm run dev     # http://localhost:5173
```

## 演示前一键重置种子数据

在项目根目录执行：

```bash
cd backend && npm run db:seed
```

该命令会先清空数据库现有的 8 张业务表，再重新写入全部初始种子数据。演示前数据被手工修改、新增或删除过时，运行它即可恢复干净数据。

> 注意：重置会覆盖当前业务数据。“恢复初始状态”指 8 张表的条数和业务内容与初始种子数据一致；SQLite 自增 ID 不会重置，因此 ID 数字可能继续增长，不影响数据关联和演示功能。

## 目录

```
frontend/   Vite + React + TS + Tailwind，含 L1 展示层与 L2 计算层
backend/    Node + Hono + Drizzle + SQLite，L3 接口层与 L4 持久层
```

## 环境变量

复制 `backend/.env.example` 为 `backend/.env` 后填写。`.env` 已在 .gitignore 内。
