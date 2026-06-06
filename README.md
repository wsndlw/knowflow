# knowflow · 企业 AI 知识库管理平台

knowflow 是面向企业/机构内部场景的 AI 知识库系统。它把分散在文档、对话、反馈里的业务知识沉淀为**可检索、可问答、可治理**的知识资产，让员工能快速得到带来源的答案，让管理员能持续维护知识质量，并通过后端权限校验保证知识库严格隔离。

当前代码中已实现这些主要模块：账号与权限、知识库管理、文档上传解析、RAG 问答、对话记忆、专家 Agent、知识自动提炼、统计治理。

```text
技术栈   Next.js · NestJS · LangGraph.js · BullMQ + Redis · PostgreSQL + pgvector · Drizzle ORM · TypeScript
模型     阿里云百炼 DashScope（对话 / Embedding 1024 维 / Rerank / 知识生产 / 视觉 OCR），支持后台多供应商配置
```

详细工程实现见 [TECH.md](TECH.md)，协作规则见 [AGENTS.md](AGENTS.md).

### 演示视频

https://www.bilibili.com/video/BV1Wi7D6aEDb/

---

## 目录

1. [项目能力](#一项目能力)
2. [系统架构与关键实现](#二系统架构与关键实现)
3. [快速开始](#三快速开始)
4. [目录结构](#五目录结构)
5. [常见问题](#七常见问题)
6. [协作说明](#八协作说明)
7. [技术栈一览](#技术栈一览)
8. [开发过程](#开发过程)

---

## 一、项目能力

knowflow 围绕知识的**生产、管理、消费、治理**构建完整闭环。

| 能力         | 说明                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| 账号与权限   | 超级管理员 / 部门管理员 / 普通用户三级角色；知识库支持公开 / 部门 / 受限三层可见范围；权限由后端兜底校验。         |
| 知识库与文档 | 支持建库、上传 PDF / DOCX / TXT / MD / CSV / Excel / **图片**，异步解析、父子分段、向量化入库，处理进度实时可见。  |
| RAG 智能问答 | 基于 LangGraph 固定图执行问答流程，三路召回、真实 Rerank、父子块扩展、Token 预算、流式回答、引用来源与可信度分级。 |
| 对话与记忆   | 多轮对话持久化；最近消息短期窗口 + Worker 异步滚动摘要，让 Agent 能理解上下文。                                    |
| 知识条目     | 面向人工维护的知识卡片 / FAQ，支持草稿、审核、发布、下架、归档、过期等状态。                                       |
| 知识自动提炼 | **从文档、点踩、纠错、无答案缺口中生成候选知识**，经人工审核后入库；AI 只生成候选，不直接写正式库。                |
| 专家 Agent   | 支持全局助手、知识库官方 Agent、个人 Agent，并可**基于知识库一键生成**。                                           |
| 统计与治理   | 提供使用**热度可视化**、检索测试、操作审计、知识关系图等治理能力。                                                 |

---

## 二、系统架构与关键实现

### Monorepo 布局

```text
apps/web          Next.js App Router 前端，负责页面、组件、交互状态与 API 调用
apps/api          NestJS 后端 + BullMQ Worker，负责接口、权限、RAG、文档处理、任务队列
packages/shared   前后端共享类型、DTO、常量、Zod schema
packages/db       Drizzle schema、migrations、db client、seed
docker-compose    仅启动 PostgreSQL(pgvector) + Redis；web/api/worker 本机 pnpm 运行
```

`packages/shared` 是前后端契约的单点来源，`packages/db` 被 API、Worker 和 seed 脚本共同复用。

### 后端领域模块

```text
auth             登录 / Session / 三层权限 / 登录失败锁定 / CSRF
department       部门组织与归属
knowledge-base   知识库 CRUD / 成员 / 可见范围 / 知识条目 / 审核台 / 自动提炼
document         上传 / 解析 / 分段 / 向量化 / 进度回推
retrieval        三路召回 / Rerank / 父子扩展 / Token 预算 / 检索测试
agent            LangGraph 问答运行时 / 对话记忆 / 会话归档
model            模型供应商 / 用途映射 / 加密 Key / 热切换
analytics        使用热度统计
health           健康检查
```

### 关键设计与核心实现

README 只保留总览；完整的「设计意图 -> 实现要点 -> 关键代码位置」见 [TECH.md](TECH.md)。

| 技术支柱       | 核心实现                                                                                                                                         | 深入阅读                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 权限隔离       | 后端 Guard + SQL 前置过滤；私有 / 部门 / 公开知识库严格隔离。                                                                                    | [TECH.md](TECH.md)                                |
| 文档处理链路   | BullMQ Worker + Redis Pub/Sub + SSE 进度回推；`传入队 → 认领解析 → 文本清洗 → 父子分段 → 批量向量化 → 标记完成 → 触发知识提炼`；断连时轮询兜底。 | [TECH.md](TECH.md#一文档处理链路异步摄取)         |
| RAG 检索链路   | 向量 + Full Text Search + 知识条目三路召回 -> 合并去重 -> DashScope Rerank -> 父子扩展 -> Token 预算。                                           | [TECH.md](TECH.md#二rag-检索链路三路召回--rerank) |
| LangGraph 编排 | 12 个固定节点：加载 Agent、校验权限、解析知识范围、加载记忆、检索、构建提示词、流式回答、引用、置信度、trace。                                   | [TECH.md](TECH.md#三langgraph-12-节点-agent-编排) |
| 对话记忆       | 最近 6 条消息同步注入；早期对话由 Worker 异步生成滚动摘要；全部按不可信背景注入，防 Prompt Injection。                                           | [TECH.md](TECH.md#四对话记忆短期窗口--滚动摘要)   |
| 知识生产闭环   | 文档导入、点踩、纠错、无答案信号 -> 候选任务 -> 审核通过 -> 发布知识条目 -> 纳入 RAG。                                                           | [TECH.md](TECH.md#五知识自动提炼闭环)             |
| 模型与向量空间 | `chat` / `embedding` / `rerank` / `knowledge_production` 等用途映射；pgvector 统一 `vector(1024)` 并强校验维度。                                 | [TECH.md](TECH.md#六跨切面模型配置与向量空间)     |

---

## 三、快速开始

### 前置依赖

- Node.js 22+
- pnpm 10+
- Docker（仅用于 PostgreSQL + Redis）
- 阿里云百炼 DashScope API Key（用于对话、Embedding、Rerank、知识生产；图片 OCR 需额外配置 OCR 用途模型）

### 环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

重点检查：

| 变量                           | 用途               | 说明                               |
| ------------------------------ | ------------------ | ---------------------------------- |
| `DATABASE_URL`                 | PostgreSQL 连接    | 需与 docker compose 端口一致。     |
| `REDIS_URL`                    | Redis 连接         | Worker、队列、进度回推依赖 Redis。 |
| `SESSION_SECRET`               | Session 签名       | 本地开发也必须配置。               |
| `MODEL_API_KEY_ENCRYPTION_KEY` | 模型 Key 加密      | 32 字节 base64。                   |
| `ALIYUN_API_KEY`               | 默认模型供应商 Key | seed 会写入默认模型配置。          |
| `SEED_ADMIN_USER`              | 初始超管账号       | 首次登录使用。                     |
| `SEED_ADMIN_PASSWORD`          | 初始超管密码       | 首次登录使用。                     |

### 启动步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施：PostgreSQL(pgvector) + Redis
docker compose up -d postgres redis

# 3. 执行迁移并写入种子数据
pnpm seed

# 4. 启动 api + web + worker
pnpm dev:all
```

启动后访问：

| 服务     | 地址                         |
| -------- | ---------------------------- |
| Web 前端 | http://localhost:3000        |
| API      | http://localhost:4000        |
| 健康检查 | http://localhost:4000/health |

默认登录使用 `.env` 中的 `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD`。seed 还会创建部门管理员、普通用户、默认部门、演示知识库骨架、模型供应商与用途映射。

> 注意：`pnpm dev:all` 会同时启动 api、web、worker。Worker 是文档处理、知识自动提炼、定时扫描、对话摘要的执行进程。只运行 `pnpm dev` 会启动 api + web，但不会启动 worker。

**质量检查**

本地检查命令与 CI 保持一致：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

提交前至少确保 lint、typecheck、build 通过。功能验收还需要真实启动应用，按演示路径走一遍关键流程。

### 常用脚本

| 命令                                 | 作用                                              |
| ------------------------------------ | ------------------------------------------------- |
| `pnpm dev:all`                       | 一键启动 api + web + worker，推荐用于开发和演示。 |
| `pnpm dev`                           | 仅启动 api + web，不包含 worker。                 |
| `pnpm seed`                          | 执行迁移并写入种子数据。                          |
| `pnpm db:migrate`                    | 仅执行数据库迁移。                                |
| `pnpm db:generate`                   | 由 Drizzle schema 生成迁移文件。                  |
| `pnpm --filter @knowflow/api worker` | 单独启动 Worker 进程。                            |

---

## 四、目录结构

```text
apps/web/src/app           前端页面与路由：知识库、文档、条目、Agent、统计、部门后台等
apps/api/src/modules       NestJS 领域模块：auth、knowledge-base、document、retrieval、agent、model 等
apps/api/src/worker.ts     Worker 入口：文档处理、知识提炼、定时扫描、对话摘要
packages/shared/src        前后端共享契约：schemas、constants、types
packages/db/src            Drizzle schema、migrations、seed、db client
```

---

## 五、常见问题

### 文档一直不解析

优先确认 Worker 是否运行。文档解析、分段、向量化、知识自动提炼都依赖 Worker。推荐使用：

```bash
pnpm dev:all
```

或单独启动：

```bash
pnpm --filter @knowflow/api worker
```

### Redis 6379 端口在 Windows 上启动失败

如果 docker 报 `bind: ...forbidden`，可能是 6379 落入 Windows 保留端口段。可以把 `.env` 中的 `REDIS_PORT` / `REDIS_URL` 改到范围外端口，例如 16379，并重新启动 docker compose。

### 图片 OCR 不工作

图片解析依赖模型配置中的 `ocr` 用途模型。seed 默认配置了对话、Embedding、Rerank、知识生产等用途，但 OCR 可能需要在模型配置后台单独启用。

### Rerank 失败是否会导致问答失败

不会。检索服务会尝试调用 DashScope Rerank；如果 Rerank 失败，会兜底使用初排结果，避免整个问答链路中断。

### AI 会不会直接把错误知识写入正式库

不会。知识自动提炼只生成候选，必须由管理员审核通过后才会发布为正式知识条目并进入 RAG 检索。

---

## 六、协作说明

本项目由本人与多 AI Agent 在统一规则下串行协作开发：

| 角色                                                       | 职责                                                                | **边界**                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| 人类负责人                                                 | 把控产品方向、架构决策、需求边界与最终合并。                        | --                                      |
| Claude Code主控                                            | 需求澄清、PRD、任务拆解、API 契约、最终审查。                       | 不作为主要前后端实现方                  |
| Codex后端/Code审查                                         | 后端接口、数据库 schema、权限、RAG、文档处理/检索、测试与工程配置。 | 不大改正式前端页面与视觉                |
| Gemini前端/Claude Code前端<br />Gemini审查/Claude Code审查 | 前端页面、组件、路由、交互状态、前端 API 调用、浏览器端验证。       | 不改后端核心 / schema / 权限 / RAG 逻辑 |
| Trellis                                                    | PRD、任务、spec、上下文沉淀。                                       | --                                      |

完整协作规则、分支策略、审查流程与 Definition of Done 见 [AGENTS.md](AGENTS.md)。长期技术约定见 [CONTEXT.md](CONTEXT.md)。

---

## 技术栈一览

| 层   | 选型                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ |
| 前端 | Next.js（App Router）· React · Radix UI · Tailwind                                               |
| 后端 | NestJS · LangGraph.js（Agent 运行时）                                                            |
| 异步 | BullMQ + Redis（任务队列 / 定时 / Pub-Sub）                                                      |
| 存储 | PostgreSQL + pgvector（向量 1024 维）+ Full Text Search（关键词）· Drizzle ORM · 本地文件存储    |
| 模型 | 阿里云百炼 MaaS（对话 / Embedding 1024 维 / Rerank / 知识生产 / 视觉 OCR），后台多供应商热切换   |
| 工程 | pnpm workspace · TypeScript strict · ESLint + Prettier · husky / lint-staged · GitHub Actions CI |

---

## 开发过程

本项目是本人首次尝试多agent协作开发的项目（之前都是单个agent开发）。使用一个claude code作为主控（cc主控），使用codex作为后端代码的实现以及审核，使用gemini和claude code来进行前端代码的编写和审查。三个agent共用同一份agent，这样在迭代过程中不会发生漂移。同时为了保证代码和审查质量，不允许自写自审。

流程：先让claude code使用grill-with-doc对我进行提问，确定一些边界情况，将得到的内容存进文档，接着再使用trellis的brainstorm 对我进行提问，得到我对项目更细节的描述。接着交由cc主控进行任务拆解和规划。产生handoff文档，并给出对应的prompt。我再交给codex或者gemini进行实现，完成后再交给另一个对话进行审查，每一个都会跑三件套。

目前与后续会继续探索多agent协作更优雅的方式。
