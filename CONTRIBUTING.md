# 贡献指南

感谢你对 AI 销售复盘助手 感兴趣，并愿意参与改进这个项目。

我们欢迎：

- 报告 Bug
- 提交功能建议
- 优化文档
- 改进前后端实现
- 复用或扩展该项目做二次开发

## 参与方式

### 1. 提交 issue

在提交问题前，请先确认：

- 是否已查看 README 和相关技术方案文档
- 是否能复现问题
- 是否有最小复现步骤、截图或日志

建议在 Issue 中提供：

- 复现步骤
- 预期行为
- 实际行为
- 环境信息（操作系统、浏览器、Node 版本等）
- 相关截图或输出

### 2. 提交代码

我们建议使用标准 GitHub 流程：

```bash
git checkout -b feature/your-change
git add .
git commit -m "feat: describe your change"
git push origin feature/your-change
```

然后在 GitHub 上提交 Pull Request。

## 开发约定

### 运行环境

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 启动项目

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

### 数据初始化

如需重置演示数据：

```bash
cd backend && npm run db:seed
```

### 代码要求

- 尽量保持现有的目录结构和命名风格
- 修改前后端逻辑时，优先保持接口契约稳定
- 不要在未说明的情况下修改 AI 评分规则、Schema 或重要业务阈值
- 提交前尽量做最小范围验证

## 文档要求

如果你修改了：

- 业务流程
- API 契约
- 数据结构
- 评分逻辑

建议同步更新：

- README.md
- 相关设计文档
- 交接说明

## 代码审查

PR 需要遵守以下原则：

- 说明问题背景和修复目标
- 对改动范围做简述
- 提供验证步骤
- 避免无关改动

## 行为准则

本项目尊重技术讨论、合作协作和积极反馈。请避免：

- 人身攻击
- 低质量灌水
- 未经许可的敏感信息泄露
- 对他人贡献进行不尊重的评价

## 许可

通过提交代码、文档或问题，你同意该项目采用 Apache License 2.0 进行发布和分发。

如果你有任何疑问，请优先通过 Issue 或邮件讨论。