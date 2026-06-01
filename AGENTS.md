# AGENTS.md

本项目是一个 AI 知识库系统，使用 Codeg 协调多个 AI coding agents 协作开发。

所有 Agent 必须优先保证：需求清晰、边界明确、代码可维护、权限安全、实现可验证。

## 1. 项目目标

本项目目标是实现一个面向企业/机构场景的 AI 知识库系统，核心能力包括：

- 用户登录与账号管理
- 管理员创建和管理用户
- 知识库创建、编辑、删除
- 文档上传、解析、切分、向量化
- 基于知识库的智能问答
- 对话历史管理
- 专家 Agent / 专题助手能力
- 文档标签与分类
- 权限控制，例如私有、部门、公开知识库
- 管理后台与操作记录
- 后续可扩展 RAG、权限、文档解析、审计、检索优化等能力

本项目不是简单 demo，应尽量接近真实系统，但允许在实现复杂度上做合理简化。

## 2. 协作工具

本项目使用：

- Codeg：多 Agent 工作台和任务调度
- Claude Code：需求澄清、任务拆解、前端实现、最终审查
- Codex：后端、数据库、RAG、权限、API、测试和工程实现
- Trellis：PRD、任务、spec、项目上下文沉淀

当前不默认使用 Gemini。如后续启用 Gemini，默认只用于前端视觉建议或 UI 方案探索，不直接修改后端代码。

## 3. Agent 分工

### Claude Code

Claude Code 是主负责人，负责：

- 需求澄清
- 产品方案设计
- 任务拆解
- PRD 编写与维护
- 前端页面和交互实现
- 页面信息架构
- API 契约设计
- 最终代码审查
- 检查体验一致性、权限边界和用户流程完整性

Claude Code 可以修改：

- 前端代码
- UI 组件
- 页面路由
- 文档
- PRD
- Trellis spec
- 任务拆解文件
- 项目说明文件

Claude Code 不应随意大改后端核心实现，除非是小范围联调或修复明显问题。

### Codex

Codex 是工程实现负责人，负责：

- 后端接口
- 数据库 schema
- 权限控制
- 文档上传和解析
- 向量检索
- RAG 流程
- API client / 类型定义
- 测试
- 工程配置
- 性能和安全修复

Codex 可以修改：

- 后端代码
- 数据库迁移
- API routes
- services
- RAG / embedding / retriever 相关代码
- tests
- scripts
- 类型定义
- 工程配置

Codex 不应大改正式前端页面和视觉设计，除非是为了修复类型错误、接口联调或前后端契约不一致。

### Gemini

当前默认不启用 Gemini。

如启用 Gemini：

- 只负责前端视觉方案、交互建议、多模态辅助分析
- 不直接修改后端
- 不单独决定产品边界
- 产出必须由 Claude Code 审查后再合并

## 4. 共享上下文读取顺序

每个 Agent 开始工作前，应优先读取：

1. `AGENTS.md`
2. `业务介绍.md`
3. `.trellis/workflow.md`
4. `.trellis/spec/`
5. 当前 `.trellis/tasks/` 下的 active task
6. 相关代码文件
7. 相关测试文件

不要只看当前用户一句话就直接改代码。遇到需求不明确，应先查已有文档和 Trellis 上下文。

## 5. Trellis 使用规则

Trellis 是本项目的任务和上下文中心。

当需求涉及新功能、架构变化、多文件修改、复杂设计时，应优先使用 Trellis 工作流：

- 先明确需求
- 再形成 PRD
- 再拆任务
- 再实现
- 最后检查和更新 spec

`.trellis/spec/` 用于沉淀长期规则。  
`.trellis/tasks/` 用于保存当前任务上下文。  
`.trellis/workspace/` 用于保存项目级工作记忆。

重大设计决策不能只留在聊天记录里，应写入 Trellis 相关文档。

## 6. Codeg 协作规则

使用 Codeg 多 Agent 协作时：

- Claude Code 作为主控 Agent
- Claude Code 负责任务拆解和分派
- Codex 负责被分派的后端/工程任务
- Claude Code 负责最终整合和审查
- 不同 Agent 不要同时修改同一个文件
- 子任务要有明确输入、输出和修改边界
- 每个 Agent 完成后必须说明改了什么、为什么改、如何验证

推荐流程：

1. Claude Code 澄清需求
2. Claude Code 写 PRD / 任务拆解
3. Codex 实现后端和工程部分
4. Claude Code 实现前端
5. Codex 反向检查前端调用 API 和类型一致性
6. Claude Code 做最终审查
7. 更新 Trellis spec 和任务状态

## 7. 修改边界

### 前端

前端应关注：

- 页面结构清晰
- 信息密度合理
- 表格、表单、导航、筛选、搜索可用
- loading / empty / error 状态完整
- 权限不可见或不可操作状态明确
- 移动端基本可用
- 不做营销页式大 hero
- 不使用过度装饰性视觉
- 企业后台应克制、稳定、清晰

### 后端

后端应关注：

- API 契约清晰
- 输入校验完整
- 权限校验不能只放在前端
- 数据库 schema 可扩展
- 查询性能和索引
- 错误处理一致
- 日志和审计可追踪
- 文件上传安全
- RAG 数据不可越权泄露

### RAG / 知识库

RAG 实现应关注：

- 文档解析质量
- chunk 策略
- embedding 模型和维度
- 向量库结构
- metadata 保存
- 权限过滤
- 检索召回和 rerank
- 答案引用来源
- Prompt Injection 防护
- 私有/部门/公开知识库隔离

## 8. 权限和安全

本项目必须默认重视权限安全。

任何涉及这些内容的代码都必须谨慎：

- 登录
- session
- 用户角色
- 组织/部门
- 知识库可见范围
- 文档下载
- 文档检索
- RAG 问答
- 管理后台
- 操作记录
- 文件上传

权限判断不能只靠前端隐藏按钮。  
后端必须做最终权限校验。  
RAG 检索必须在权限过滤后进行，不能把无权限文档送进上下文。


## 9. Skill 路由

本项目有三套互相隔离的 skill 系统，各 Agent 只能用属于自己那套的 skill：

- **Trellis skills**（`.agents/skills/trellis-*`）：流程控制，CC 与 Codex 共用。
- **Claude Code skills**（CC 内置）：前端与需求，仅 CC 可用。
- **Codex skills**（`~/.codex/skills/`）：后端与工程，仅 Codex 可用。

CC 用不了 Codex 的 skill，Codex 也用不了 CC 的 skill。下表是「什么场景用哪个 skill」的路由，不是限制自由，而是避免两个 Agent 在同类场景下各挑各的、导致流程裂开。

### 9.1 流程主线（CC 与 Codex 共用 Trellis）

需求 / 拆任务 / 实现 / 检查 / 沉淀，一律走 `.trellis/workflow.md` 定义的 Phase 1→2→3。Trellis 是流程骨架，下面的领域 skill 是在各 Phase 内部叠加使用的「工具」。

### 9.2 Claude Code skill 链（前端 / 需求）

| 场景 | Skill | 说明 |
|---|---|---|
| 需求澄清（Phase 1.1 之前的磨刀） | `grill-with-docs` | 拷问计划、对齐术语、沉淀 `CONTEXT.md`。**见 9.4 缺口①：必须最终落到 `prd.md`** |
| 写前端组件 / 页面 | `react-best-practices` + `next-best-practices` | 架构与 RSC 边界合规，写代码时常驻 |
| 打磨 UI 质量 / 视觉 | `impeccable` | 信息架构、视觉层级、交互细节 |
| 前端验收前自查 | `web-design-guidelines` | 可访问性 / UX / 设计规范审查 |

CC 是 Codex 的需求方与最终审查方：CC 写的 `prd.md` 是 Codex 的开工依据，CC 的最终审查覆盖体验一致性与权限边界。

### 9.3 Codex skill 链（后端 / RAG / 测试 / 安全）

| 场景 | Skill | 说明 |
|---|---|---|
| **任何写代码之前（常驻底座）** | `karpathy-guidelines` | 小步改、先读后写、不过度抽象。**见 9.4 缺口②：每次编码前都加载，与 `trellis-before-dev` 并列** |
| 数据库 schema / 查询 / 迁移 | `supabase-postgres-best-practices` | Postgres / Supabase 规范 |
| 登录 / 认证 | `create-auth` | better-auth 集成（注意：skill 实名是 `create-auth`） |
| 账号密码流程 | `emailAndPassword` | 邮箱密码注册 / 登录最佳实践 |
| 组织 / 部门 / 多租户 | `organization` | 多租户与组织权限模型 |
| 文档解析 / 切分 / 向量化 / 检索 / RAG | `langchain-rag` | RAG 全流程 |
| PDF 文档处理 | `pdf` | 解析、抽取、OCR |
| 接口 / 端到端测试 | `webapp-testing` + `playwright` | 关键流程自动化验证 |
| **碰权限 / 安全代码后（必过）** | `security-best-practices` | **见 9.4 缺口③：触及登录/session/权限/文件上传/RAG 检索后必须过一遍** |

### 9.4 三个必须遵守的裁决

**① grill 必须落到 prd.md。** `grill-with-docs` 产出的是 `CONTEXT.md`（术语表），而 Codex 接活只读 `prd.md`。所以 grill 只是 `trellis-brainstorm` 的前置磨刀——把术语和边界磨锋利之后，**需求最终一定要写进 `prd.md`**，否则 Codex 接手时读不到需求。grill 是磨刀，prd.md 才是交接物。

**② karpathy-guidelines 是 Codex 常驻底座。** 它不是「出问题才用」，而是 Codex 每次写代码前都加载的行为准则，和 `trellis-before-dev` 并列，不是二选一。

**③ security-best-practices 是权限代码的强制关卡。** 凡是触及登录、session、用户角色、组织/部门、知识库可见范围、文档下载、文档检索、RAG 问答、管理后台、文件上传的改动（即第 8 节列出的内容），Codex 改完后**必须**过一遍 `security-best-practices`，不能等出事才补。

### 9.5 Gemini

当前不启用（见第 3 节）。如启用，仅做前端视觉建议，不绑定上述任何 skill 链。


## 10. 编码原则

所有 Agent 编码时必须遵守：

- 先读代码，再改代码
- 小步修改
- 不做无关重构
- 不随意删除用户已有内容
- 不重复造已有工具函数
- 不引入没有必要的抽象
- 不把临时 demo 当正式代码
- 不把测试写成只为通过当前实现
- 修改后尽量运行对应检查

## 11. 前后端契约

前后端协作必须通过明确契约：

- API path
- request body
- response body
- error format
- auth requirement
- permission behavior
- TypeScript types
- loading / empty / error 状态

Codex 修改 API 后，应同步类型和说明。  
Claude Code 修改前端调用后，应确认契约未被破坏。

## 12. 测试和验证

根据修改范围选择验证方式：

- 类型检查
- lint
- 单元测试
- API 测试
- Playwright / webapp-testing
- 手动浏览器检查
- 权限场景测试

关键流程至少应覆盖：

- 登录
- 创建知识库
- 上传文档
- 文档解析
- 发起问答
- 查看历史对话
- 权限隔离
- 管理员操作

如果无法运行测试，必须说明原因和剩余风险。

## 13. 文档更新

当发生这些变化时，应更新文档或 Trellis spec：

- 新增核心模块
- 修改权限模型
- 修改数据库结构
- 修改 API 契约
- 修改 RAG 流程
- 修改目录结构
- 修改 Agent 分工
- 修改重要技术选型

不要让代码和文档长期不一致。

## 14. Git 规则

多个 Agent 协作时必须重视 Git 状态：

- 开始前查看当前改动
- 不覆盖他人未提交修改
- 不随意执行 destructive git 命令
- 不使用 `git reset --hard`，除非用户明确要求
- 大任务建议分支或 worktree
- 完成后说明 changed files 和验证结果

## 15. 输出要求

每个 Agent 完成任务后，应简洁说明：

- 做了什么
- 改了哪些文件
- 怎么验证
- 还有什么风险
- 是否需要另一个 Agent 接手

不要只说“完成了”。必须让下一个 Agent 能接上工作。

## 16. 默认分工总结

默认使用以下分工：

- Claude Code：需求、PRD、任务拆解、前端、最终审查
- Codex：后端、数据库、权限、RAG、API、测试、工程修复
- Gemini：默认不启用
- Codeg：多 Agent 调度
- Trellis：任务和上下文中心

如用户有明确指令，以用户最新指令为准。