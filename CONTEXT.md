# CONTEXT.md — knowflow 项目术语与范围约定

> 本文件是 knowflow 的术语表与范围基线,由 grill-with-docs 会话维护。不含实现细节。
>
> **对外文档**：产品需求见 [PRD.md](PRD.md)，项目介绍见 [README.md](README.md)，技术实现见 [TECH.md](TECH.md)。

## 范围分层(执行纪律)

**执行顺序固定为 P0 → P1 → P2,主链路优先、增量扩展**。任何时刻 P0 主链路必须端到端可演示,不允许为做 P1/P2 而让主链路处于跑不通的状态。

- **P0(核心主链路,必须端到端跑通且随时可演示)**
  登录 → 建知识库 → 上传文档(PDF/Markdown/TXT)→ 解析/分段/向量化(父子分段)→ 知识库官方 Agent → 提问 → **检索(三路召回:向量 + FTS + 知识条目;合并去重 + 真 Rerank + 父子扩展 + Token Budget)** → 带引用的流式回答 → 点赞/点踩反馈。
  P0 同时包含:**模型多供应商管理后台 UI**、**知识条目(KnowledgeItem)完整功能**(创建/编辑/发布/下架 + 状态机 + 审核流 + 向量化 + 纳入召回)、完整三层权限。

- **P1(主链路打通后扩展)**
  ✅ **已实现**：一键 AI 生成官方 Agent、知识使用热度统计与可视化（图表展示）、检索测试页、DOCX/CSV/Excel 导入、全局 AI 助手 / 个人 Agent、AI 提炼候选知识、知识关系思维导图（AI 自动生成）、操作审计日志 UI、知识库回收站（软删除）。
  ❌ **未实现**：知识条目的版本历史。

- **P2(有余力再做，本期部分已超额实现)**
  ❌ **未实现**：飞书文档/表格导入、父子分段的人工调整、更深度的多模态图片理解增强。
  ✅ **已超额实现**：知识生产闭环全流程、知识关系图（思维导图）、操作日志审计 UI。

**Why:** 6/4 提交,评审 35% 看 AI 运用与最终效果。完整设计的深度由 PRD.md 与 TECH.md 证明「需求理解与设计 35%」,实现按 P0→P1→P2 增量推进以保住可演示的「最终效果」。
**How to apply:** 任何任务拆解与取舍,先问「这是否让 P0 主链路更接近端到端可演示」;P0 未通前不投入 P1/P2。

## 技术栈(锁定)

**全 TypeScript 起步**,前后端同语言、两个工程:

**Monorepo 布局(pnpm workspace):**

```
apps/web        Next.js 前端(CC)
apps/api        NestJS 后端 + BullMQ Worker(Codex)
packages/shared 共享类型 / DTO / 常量 / Zod schema(前后端契约)
packages/db     Drizzle schema / migrations / db client(api、seed、worker 共用)
```

`packages/db` 独立于 api,schema/client 可被后端、seed、Worker 复用;`packages/shared` 的 Zod schema 同时做前端表单校验与后端 DTO 校验。

- **前端**:Next.js(App Router),CC 负责。
- **后端**:独立 **NestJS** 服务,Codex 负责。提供 REST API,SSE 用于流式回答。按领域划分 module(auth / knowledge-base / document / agent / retrieval / model 等),用 Guard 承载权限校验。
- **Agent Runtime**:LangGraph.js(TS 版)。**P0 即按 12 节点固定图实现**(load_agent → check_agent_permission → resolve_knowledge_scope → analyze_query → parse_conversation_attachments → retrieve_knowledge → rerank_context → build_prompt → generate_answer_stream → attach_citations → calculate_confidence → record_trace),全程 trace。P1/P2 在图上加节点(工具调用 / MCP / 工具流),不重构核心链路。
- **异步任务**:Redis + BullMQ,Worker 作为独立进程,与后端共享 Redis / PostgreSQL。
- **存储**:PostgreSQL + pgvector(向量)+ PostgreSQL Full Text Search(关键词);对象存储第一期用本地文件系统。
- **本机 vs Docker 边界**:**仅基础有状态服务用 Docker**(PostgreSQL+pgvector、Redis),由 `docker-compose` 起。**前端 / 后端 / Worker 不容器化,本机 `npm run dev` 启动**(热重载快、调试直接)。
- **ORM**:**Drizzle ORM**(drizzle-kit 迁移)。pgvector 用 Drizzle 的 vector 列类型;多路召回(向量 + FTS)在应用层合并去重,复杂检索可写原生 SQL。
- **认证**:服务端 Session + HttpOnly Cookie,token 不入 localStorage,DB 只存 token hash。
- **类型契约**:前后端通过显式共享的 TypeScript 类型对齐;改 API 必须同步类型(对应 AGENTS.md 第 10 节)。

**Python worker = P2 逃生通道,非起步项**:仅当 PDF 版面解析 / OCR / RAG 复杂度确实超出 TS 库能力时,才引入独立 Python worker 处理那一段;主链路不依赖它。

**Why:** LangGraph.js、任务队列(BullMQ)本就假设 TS;前后端分离让边界清晰、后端可独立演进、契约显式化,也契合长耗时异步任务 + 独立 Worker 的架构。NestJS 的 module + Guard 契合多模块强权限。Drizzle 的 SQL 风格让 pgvector/FTS 检索摩擦最小。
**How to apply:** CC 改前端工程,Codex 改后端工程 + Worker;跨工程仍按串行交接。遇到 PDF/OCR 难题先在 TS 内想办法,不轻易开 Python 进程。`langchain-rag` skill 偏 Python,**仅用于理解 RAG 思路**,实现用 TS,勿照搬其代码。

## 文档处理与进度推送(锁定,P0 异步)

P0 即异步处理:上传 → 写对象存储 + DB 记录 `process_status=pending` → 入 BullMQ 队列 → Worker 独立进程跑解析/分段/向量化 → 状态流转(pending → parsing → chunking → embedding → completed/failed)。

**进度推送:SSE 为主,轮询兜底,Redis Pub/Sub 跨进程传递。**

- Worker 每个阶段把进度 `publish` 到 Redis channel(Worker 不直接碰 SSE)。
- NestJS 后端订阅该 channel,通过 SSE 端点把进度实时推给前端。
- 前端优先用 EventSource 连 SSE;断连或不支持时,降级为轮询 `GET /documents/:id` 读 DB 的 `process_status` 兜底。
- 失败任务记录失败阶段与错误原因,支持重试(重新解析/分段/向量化)。

**Why:** 文档处理状态机是设计里反复出现的核心体验(列表/概览/详情都展示 process_status),P0 必须真实异步,否则这些页面失去灵魂;Redis 后续缓存/SSE 也要用,早起不亏。SSE 比纯轮询体验好,Redis Pub/Sub 解决「进度在 Worker 进程、SSE 连接在后端进程」的跨进程问题,且不额外引入基础设施。
**How to apply:** Worker 只 publish 进度到 Redis;后端提供 SSE 端点(订阅转发)+ `GET /documents/:id`(轮询兜底);前端 SSE 优先、轮询降级。

## P0 检索深度(锁定)

P0 的检索做到接近完整的 9 环节,对应 LangGraph 的 `analyze_query` / `retrieve_knowledge` / `rerank_context` 节点:

- **查询理解(`analyze_query`)**:P0 做关键词提取 + 轻量查询改写(1 条);意图识别、元数据条件识别留 P1。原始 query 始终参与检索。
- **三路召回(`retrieve_knowledge`)**:向量召回(pgvector)+ 关键词召回(PostgreSQL FTS)+ 知识条目召回(已发布 KnowledgeItem 的向量)。全部前置权限过滤。
- **合并去重**:多通道命中合并,按 parent chunk 去重,记录每条结果来自哪些通道。
- **Rerank(`rerank_context`)**:P0 接**真实 rerank 模型**(阿里 gte-rerank 系列),对候选 TopN 重排。
- **父子分段扩展**:child 命中 → 扩展 parent chunk 作为上下文,引用仍定位到 child / 原文位置。
- **Token Budget**:控制最终上下文 token 数与单文档占比,优先保留高分 / 已验证内容。

**Why:** 用户希望 P0 尽量完整,不留到后面补。三路召回 + 真 Rerank + 父子分段让 P0 的 RAG 深度达到企业级,是「AI 运用 35%」的核心展示点。
**How to apply:** LangGraph 12 节点全部真实实现(P0 不留空壳节点);唯意图识别 / 元数据条件识别等查询理解子能力可 P1 增强。

## 初始化与 Seed(锁定,P0)

系统不开放注册,账号由超管创建 → 第一个超管必须靠 seed。P0 用一个 seed 脚本(`npm run seed`)一次性建好:

- **引导超管**(必须):用户名/密码从环境变量读(如 `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD`),密码哈希入库;同时建一个默认部门(用户必属部门,超管也不例外)。
- **模型供应商**:seed 阿里云一家(见模型小节),开箱即用。
- **演示数据**:几个部门(人事/财务/研发)、不同角色用户(部门管理员 + 普通用户各若干)、2-3 个不同可见范围的知识库骨架(公开/部门/受限)。
- **文档不 seed 内容**:演示时现场上传 1-2 个文档,真实走解析/分段/向量化,展示完整 process_status 处理链路。

**Why:** 不开放注册导致"第一个超管"鸡生蛋问题,只能 seed;演示数据让登录后非空白,答辩流畅;文档靠现场上传以保住处理状态机的真实性。
**How to apply:** seed 脚本与 README 同步说明;超管密码走环境变量不硬编码。

## 模型与 Embedding(锁定)

**多供应商管理后台是正式功能,UI 进 P0,不降级为配置文件。** 超管可在 UI 增删供应商、配置 Base URL / 加密 API Key / 用途映射 / 启用停用。本项目持有多家 key:国产几家 + OpenAI + OpenAI-compatible 中转站。多数供应商走 OpenAI-compatible 接口,代码层用统一 `LLMProvider` 抽象 + OpenAI-compatible 适配器接入。

- 模型按用途分层(对话生成 / 查询理解 / 文档处理 / Embedding / Rerank / 图片理解 / 知识生产 / Agent 生成),非全场景共用一个模型。
- API Key 加密存储,前端不明文展示;普通用户不能配置 key 或接入外部模型。

**P0 用途 → 默认模型映射(seed,开箱即用,后台可随时切换):**

| 用途                                 | LangGraph 节点         | P0 默认模型(阿里云)       |
| ------------------------------------ | ---------------------- | ------------------------- |
| 对话生成                             | generate_answer_stream | `qwen-plus`(流式)         |
| 查询理解                             | analyze_query          | `qwen-turbo`              |
| Embedding                            | retrieve_knowledge     | `text-embedding-v4`(1024) |
| Rerank                               | rerank_context         | `gte-rerank-v2`           |
| 文档处理(摘要/关键词/可能问题)       | Worker 异步            | `qwen-plus`               |
| Agent 生成 / 知识生产 / 思维导图生成 | P1 已实现              | `qwen-plus`               |

- **开箱默认全部走阿里云**(embedding 已在阿里,同家鉴权最省)。**对话生成等用途可在配置后台运行时切换**到其他国产模型或 OpenAI-compatible 中转站。
- **P0 seed 预置阿里云一家**(保证开箱即用);其他国产 + OpenAI 中转站在配置后台手动添加——后台「增删供应商 + 切换」本身就是答辩可演示的功能点。

**Embedding 锁定阿里云(维度固定,改则需重新向量化):**

- 文本:`text-embedding-v4`,**dimension 1024**。
- 多模态:`qwen3-vl-embedding`,**dimension 1024**。
- 两者同为 1024 维 → pgvector 用统一 `vector(1024)` 列,文本与多模态向量落在同一向量空间,可同库检索。

**关键约束:同一知识库所有 chunk 必须用同一 embedding 模型。** Chat 模型可多供应商随时切换(不影响存储);Embedding 一旦选定维度即写入 schema,换模型必须对受影响内容重新向量化。多模态图片 embedding 属增强能力(P1/P2),但维度已与文本对齐,不阻塞 schema 设计。

**Why:** 用户目标是较完善的企业级产品,多供应商 + 用途分层是「AI 运用 35%」的核心展示点。text-embedding-v4 支持 MRL 可变维度,选 1024 与多模态对齐,简化向量空间。
**How to apply:** schema 向量列固定 `vector(1024)`;按知识库记录所用 embedding 模型,为换模型重向量化预留字段。

## 权限模型(锁定,P0 完整三层)

P0 即实现完整三层权限:

- **平台角色**:超级管理员 / 部门管理员 / 普通用户。
- **部门归属**:用户必属一个部门;知识库必属一个部门(公开库也要归属,用于确定维护责任)。
- **知识库可见范围**:公开(全员)/ 部门(归属部门成员)/ 受限(归属部门 + 手动添加成员)。
- **知识库管理员**:创建者默认成为管理员;部门管理员、超管可指定;每库至少保留一名管理员。

铁律(贯穿所有模块,不可只靠前端):

- 权限校验后端兜底,前端隐藏按钮不算数。
- **RAG 检索必须在权限过滤后进行**,无权限内容不得进入候选、上下文或引用。
- Agent 权限两层判断:① 能否看到该 Agent ② 使用时能检索哪些知识库;知识库权限永远是最终边界。

**Why:** 权限是渗透性最强的地基,`departments` 等结构性表后加需回改所有查询;部门组织维度也是完善度与「需求理解」的体现。
**How to apply:** 所有列表/检索/图查询都带权限过滤;新增任何"读知识"的 API 都先问"是否做了权限前置过滤"。

## 术语表(Glossary)

> 统一中英文与含义,CC/Codex/文档/代码保持一致。

- **知识库(KnowledgeBase)**:知识资产的组织单元,有业务状态(启用/停用/归档)与索引状态(未构建/构建中/可用/部分失败/失败),归属一个部门,有可见范围。
- **文档(Document)**:上传的原始资料(PDF/DOCX/TXT/MD 等),经解析→分段→向量化进入检索。有处理状态(待处理/解析中/分段中/向量化中/完成/失败)。
- **知识条目(KnowledgeItem)**:面向人阅读的知识卡片/FAQ/规则摘要,从文档、问答对、反馈等整理而来,有状态(草稿/待审核/已发布/已下架/已过期)。**区别于 chunk:知识条目面向人,chunk 面向检索系统。**
- **Parent Chunk / Child Chunk**:父子分段。Child 用于检索命中,Parent 用于补充上下文;引用最终定位到 child 或原文位置。
- **Agent / 专家 Agent**:统一的对话载体,知识库是其知识来源。三类:全局 AI 助手(global)、知识库官方 Agent(official)、个人 Agent(personal)。
- **对话附件(ConversationAttachment)**:用户在对话中临时上传的资料,仅上传者本人当前对话可见,不进知识库;可"申请入库"经管理员审核后转为正式文档。
- **可信度(Confidence)**:分级而非百分比——依据充分 / 依据一般 / 依据不足 / 未找到依据。
- **知识生产闭环**:从使用过程(无答案/点踩/纠错/低命中等)自动发现并 AI 提炼候选知识 → 管理员审核 → 发布。**AI 只生成候选,不直接写入正式知识库。**
