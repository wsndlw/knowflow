# knowflow — 企业 AI 知识库平台

knowflow 是面向企业/机构的 AI 知识库管理平台：让用户与 Agent 都能参与知识的**生产、管理、消费**，实现知识的高效流转与智能服务。

## 一、项目介绍

企业的业务知识分散在文档、对话、反馈中，难以复用。knowflow 通过 AI 把这些知识**自动沉淀为可检索、可问答、可治理的知识库**，核心能力：

- **账号与权限**：超管 / 部门管理员 / 普通用户三级角色；全局部门管理；知识库公开/部门/受限三层可见范围，后端兜底校验。
- **知识库与文档**：建库、上传文档（PDF/DOCX/TXT/MD/CSV/Excel/图片），异步解析 → 父子分段 → 向量化入库，全程处理状态可见。
- **RAG 智能问答**：基于 LangGraph 固定图的检索增强问答——三路召回（向量 + 全文 + 知识条目）→ 真 rerank → 父子分段扩展 → Token Budget → 带引用来源的流式回答 + 可信度分级。
- **知识条目**：面向人阅读的知识卡片/FAQ，含状态机（草稿/待审核/已发布/已下架/已归档）与审核流。
- **知识自动提炼（生产闭环）**：系统从文档、用户反馈（点踩/纠错）、无答案缺口中**自动提炼候选知识**，经人工审核后入库（详见第四节）。
- **专家 Agent**：基于知识库的对话载体；知识使用热度统计与可视化。

## 二、系统架构

**Monorepo（pnpm workspace）**，前后端同语言（TypeScript）：

```
apps/web         Next.js (App Router) 前端
apps/api         NestJS 后端 + BullMQ Worker（独立进程）
packages/shared  共享类型 / DTO / 常量 / Zod schema（前后端契约）
packages/db      Drizzle schema / migrations / db client（api、seed、worker 共用）
docker-compose   仅 PostgreSQL(pgvector) + Redis；前端/后端/Worker 本机 pnpm 跑
```

**技术栈**：Next.js · NestJS · LangGraph.js（Agent 运行时）· BullMQ + Redis（异步任务 / 定时）· PostgreSQL + pgvector（向量）+ Full Text Search（关键词）· Drizzle ORM · 阿里云 MaaS（对话 / Embedding / Rerank，多供应商可在后台切换）。

**关键设计**：

- **异步文档处理**：上传 → 入 BullMQ 队列 → Worker 解析/分段/向量化，状态机 `pending→parsing→chunking→embedding→completed/failed`，SSE 推进度。
- **检索权限前置**：所有召回先按授权知识库范围过滤；禁用/归档内容自动排除（`status=active` / `enabled=true` 正向过滤）。
- **状态语义**：知识库 `active/disabled`（删除＝禁用，可启用）；文档 `enabled`（删除＝归档，可恢复）；知识条目 `archived`（归档，可恢复，区别于"下架 unpublished"）。

## 三、快速开始

### 前置

- Node.js 22+ · pnpm 10+ · Docker（仅跑 PostgreSQL + Redis）

### 步骤

```bash
# 1. 环境变量
cp .env.example .env
# 按需检查：DATABASE_URL / REDIS_URL / SEED_ADMIN_USER / SEED_ADMIN_PASSWORD
#          SESSION_SECRET / MODEL_API_KEY_ENCRYPTION_KEY / 模型 API Key

# 2. 安装依赖
pnpm install

# 3. 起基础设施（仅 PG + Redis）
docker compose up -d postgres redis

# 4. 迁移 + 种子数据（建超管、部门、演示用户、模型供应商与用途映射、演示知识库）
pnpm seed

# 5. 一键启动 api + web + worker（推荐）
pnpm dev:all
```

> **`pnpm dev:all` 会同时起三个进程：api（:4000）、web（:3000）、worker。**
> ⚠️ **Worker 是知识自动提炼与文档异步处理的执行进程，必须运行**。`pnpm dev` 只起 api+web、**不含 worker**，会导致"文档不自动提炼、定时扫描不跑"。演示/开发请用 `pnpm dev:all`，或单独再起 `pnpm --filter @knowflow/api worker`。

访问：Web `http://localhost:3000`，API 健康检查 `http://localhost:4000/health`。
默认登录：`.env` 的 `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD`（超管）；seed 另建有部门管理员、普通用户演示账号。

### 质量检查（与 CI 一致）

```bash
pnpm lint && pnpm typecheck && pnpm build
```

## 四、知识自动提炼（生产闭环）

系统**自动**从使用过程中发现并提炼候选知识，经人工审核后入库——AI 只生成候选，不直接写入正式库（防幻觉）。

### 触发来源

由 Worker 进程驱动（**必须运行 worker**）：

| 来源                           | 触发时机                             | 提炼素材                                 |
| ------------------------------ | ------------------------------------ | ---------------------------------------- |
| **文档导入**                   | 文档处理完成后**自动**入队提炼       | 文档父分段内容 → 多条原子知识条目        |
| **用户点踩**                   | 答案被标记 `not_useful`              | 该问答 + 命中内容（提示需改进/补充）     |
| **用户纠错**                   | 反馈为 `correction` 且填写了正确内容 | **用户提供的正确内容**（质量最高的来源） |
| **知识条目反馈**               | 条目级反馈                           | 相关反馈                                 |
| **无答案 / 低可信 / 知识缺口** | 问答 `noAnswerType` 命中             | 问题本身（作为知识缺口信号）             |

- **定时扫描**：Worker 每小时（BullMQ `repeat: "0 * * * *"`）扫描上述反馈与无答案信号，生成候选改进任务。
- **手动触发**：管理者也可在审核台手动触发生成（`POST /knowledge-bases/:id/improvement-tasks/generate`）。

### 审核与入库

所有自动提炼产出的是**候选**，进入知识库「审核台」：管理员逐条**通过并发布 / 驳回 / 编辑后通过**。通过后生成正式知识条目，纳入 RAG 检索，并记录来源（文档 / 反馈 / 纠错）可追溯。

### 前置条件

1. **Worker 进程在跑**（`pnpm dev:all` 或 `pnpm --filter @knowflow/api worker`）。
2. **配置"知识生产"模型**：seed 已预置 `knowledge_production` 用途映射（默认阿里云 qwen-plus）；如未配置，提炼会提示"请先在模型配置中配置知识生产模型"。

## 五、目录结构

```
apps/web/src/app          页面与路由（知识库/文档/条目/Agent/统计/部门管理后台等）
apps/api/src/modules      NestJS 领域模块（auth/knowledge-base/document/retrieval/agent/department/model…）
apps/api/src/worker.ts    Worker 入口（文档处理 + 知识提炼 + 每小时定时扫描）
packages/shared/src       前后端共享契约（schemas/constants/types）
packages/db/src           Drizzle schema / migrations / seed
```

## 六、团队分工（多 Agent 协作）

本项目由多 AI Agent 在统一规则（`AGENTS.md`）下串行协作开发，人类把控架构与质量：

- **Claude Code（CC，主控）**：需求澄清、PRD、任务拆解、API 契约设计、最终审查与验收。
- **Codex（后端）**：后端接口、数据库 schema、权限、RAG/检索、文档处理、测试与工程配置。
- **Gemini（前端）**：前端页面、组件、交互、前端 API 调用、浏览器端验证。
- **Trellis**：PRD / 任务 / 规范（spec）/ 上下文沉淀中心（`.trellis/`）。

协作纪律：功能分支开发 → 指定审查方本地审查 → PR（CI 跑 lint+typecheck+build）→ 人类拍板合并 main。两次审查（本地 + PR），实现与审查分离。详见 `AGENTS.md`。
