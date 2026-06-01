# AGENTS.md

本项目（knowflow）是面向企业/机构的 AI 知识库系统，使用 Codeg 协调 Claude Code 与 Codex 协作开发。

**本文件是 Claude Code 和 Codex 的唯一协作规则来源**（CC 经 `CLAUDE.md` 的 `@AGENTS.md` 引用、Codex 经 `.codex/config.toml` 读取，两端读的都是这一份）。不要在 `CLAUDE.md` 或其他文件维护另一套可能冲突的规则。

所有 Agent 必须优先保证：需求清晰、边界明确、代码可维护、权限安全、实现可验证。本文是协作宪法；细粒度技术规范沉淀在 `.trellis/spec/`。

## 1. 项目目标

面向企业/机构场景的 AI 知识库系统，核心能力：账号与权限管理（私有/部门/公开）、知识库增删改、文档上传解析切分向量化、基于知识库的 RAG 问答、对话历史、专家 Agent、文档标签分类、管理后台与操作审计。

不是简单 demo，应尽量接近真实系统，但允许在实现复杂度上做合理简化。

## 2. Agent 分工与边界

| Agent           | 职责                                                                                                    | 可改                                                                                          | 不可越界                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Claude Code** | 需求澄清、PRD、任务拆解、前端实现、API 契约设计、最终审查                                               | 前端代码、UI 组件、页面路由、文档、PRD、Trellis spec、任务文件                                | 不大改后端核心实现（除小范围联调/修明显问题）                |
| **Codex**       | 后端接口、数据库 schema、权限、文档解析、向量检索、RAG、API client/类型、测试、工程配置、性能与安全修复 | 后端代码、迁移、API routes、services、RAG/embedding/retriever、tests、scripts、类型、工程配置 | 不大改正式前端页面与视觉（除修类型错误/接口联调/契约不一致） |
| **Codeg**       | 多 Agent 工作台与任务调度                                                                               | —                                                                                             | —                                                            |
| **Trellis**     | PRD、任务、spec、上下文沉淀中心                                                                         | —                                                                                             | —                                                            |
| **Gemini**      | 默认不启用。如启用：仅前端视觉/交互建议/多模态辅助，不改后端、不定产品边界，产出须经 CC 审查            | —                                                                                             | —                                                            |

CC 是主控与最终审查方，Codex 是工程实现负责人。**不同 Agent 不要同时修改同一个文件；子任务要有明确输入、输出、修改边界。**

## 3. 协作流程

需求涉及新功能、架构变化、多文件修改、复杂设计时，走 Trellis 工作流（`.trellis/workflow.md` 的 Phase 1→2→3），并遵循以下功能开发流程。

**流程按改动大小弹性适用，不必一刀切：**

- **功能/模块级改动**（新功能、跨多文件、影响契约或权限）→ 走完整流程：开分支 → 双方互审 → PR → 用户合并。
- **小改动**（typo、文案、小样式、单文件 bug 修复、注释）→ 不必开分支/PR，可直接在当前分支改、commit；攒批后随其他改动一起 push 即可。
- 拿不准时，倾向轻量；真正需要留痕或影响他人基线的，才升级到完整流程。**别为每个小任务都建分支、PR、push。**

### 3.1 完整流程主线（功能/模块级）

```
1. git checkout -b feat/<功能名>     # 每个功能开独立分支
2. 负责方在分支上写代码               # Codex 写后端 / CC 写前端
3. 对方本地审查 → 负责方改 → 干净     # ← 第一次审：抓 bug 主战场
4. 一个功能/模块完成 → git commit     # ← 提交粒度见 3.3
5. 多个功能/模块攒够 → git push       # ← push 节奏见 3.3
6. gh pr create → 对方在 PR 上审查    # ← 第二次审：留痕 + 把关
7. 用户拍板 → gh pr merge 合入 main   # ← 合并权限见 6
8. git checkout main && git pull      # 切回主干，进下一个功能
```

典型分工序列：CC 澄清需求并写 PRD → Codex 实现后端 → CC 实现前端 → 双方按 3.2 互审 → 用户合并 → 更新 Trellis spec 与任务状态。

### 3.2 两次审查（都要，顺序固定）

代码必须**先经本地审查、改干净，才能提交**。提 PR 时代码应已是「我方认为 OK」的状态——PR 审是第二道关与留痕，不是第一次发现问题的地方。

|      | 第一次审（本地，提交前）                                   | 第二次审（PR 上，合并前）    |
| ---- | ---------------------------------------------------------- | ---------------------------- |
| 在哪 | 本地工作树看 `git diff`                                    | GitHub PR 看 `gh pr diff`    |
| 目的 | 趁早抓 bug，改起来便宜                                     | 留 review 记录 + 合并前把关  |
| 谁审 | 对方 Agent（Codex 写→CC 审；CC 写→Codex 审）               | 同左                         |
| 工具 | CC 用 `code-review`；Codex 用 `security-best-practices` 等 | `gh pr diff` + 把意见贴到 PR |

审查方的强制职责见第 4 节「完成的定义」——审查不是只看代码好不好看，必须核对 DoD。

### 3.3 commit 与 push 节奏

- **commit 粒度**：一个功能/模块完成就 commit 一次，一个 commit = 一个逻辑完整、可独立描述的改动单元（如「实现文档上传接口」）。不要写几行就提交，也不要把不相关功能堆进一个 commit。message 用中文 + `feat:`/`fix:`/`chore:`/`docs:` 前缀。
- **commit 前必须本地通过 lint + type-check 与关键流程验证。**
- **push 节奏**：commit 频繁且本地，push 成批且远程——可在分支上累积多个功能的 commit，到阶段节点一次性 push，再 `gh pr create`。需远程协作或尽早留痕时可提前 push。

### 3.4 串行交接（单机共享工作树）

CC 与 Codex 共用同一个本地工作树，同一时刻只能 checkout 一个分支，因此默认**串行、不并行**：

- 同一时间只有一个 Agent 在一个分支上干活（如 Codex 写完后端→push→审查→合并 main→CC 再切分支写前端）。
- 切换分支会替换整个工作树文件、打断另一方——不要在对方占用工作树时切分支。
- 确需同时改重叠区域才开 git worktree 真正并行（注意：worktree 文件夹无 `.trellis/.codex/.agents` 脚手架，Trellis 脚本须在主工作树跑）。

## 4. 完成的定义（Definition of Done）

**AI 最常见的失败是做出「看起来完成」的功能**——写了接口但前端没调用、写了组件但没挂页面、用假数据冒充、声称完成却从没运行。一个功能必须**同时**满足以下全部，才算完成；不满足就**不许声称完成、不许报告写「已完成」、不许提 PR 说 ready**：

1. **端到端接通，无孤儿代码**：接口必须有前端真实调用；组件/页面必须挂路由、能从 UI 入口到达；函数必须有真实调用点。「写了但没人用」= 未完成。
2. **真实数据流，不靠 mock 糊弄**：前端连真实接口、后端连真实库、RAG 真检索。除非任务本身就是「先搭 mock」且报告中标注。
3. **实际运行验证过**：真正启动应用、走一遍关键路径（点 UI / 调 API）确认行为正确，不是「应该能跑」。无法运行的须写明原因与剩余风险。
4. **过质量门**：lint / type-check / build 全过（见第 5 节）。
5. **用户视角闭环**：有入口、能操作、有反馈，loading / empty / error 状态完整。
6. **诚实报告**：如实区分哪些验证过、哪些没验证、什么是 mock、什么是 TODO。说清「做到哪、剩什么」远胜假装做完。

**审查方强制职责**：核对上述 6 条，重点查三件——①接口/组件是否真被接入（搜调用点，别信「我写了」）②有无 mock 冒充真实数据流 ③是否真运行验证过。发现孤儿代码、mock 冒充、未验证就声称完成的，一律打回。

## 5. 代码规范与 CI

CC 与 Codex 是两个模型、风格天然不一致；统一工具链让机器仲裁风格、让人和 AI 只审逻辑。

工具链（**由 Codex 搭建与维护**，属工程配置）：ESLint（抓问题）+ Prettier（统一格式）+ TypeScript strict + husky/lint-staged（commit 前自动 lint）+ GitHub Actions CI（每个 PR 跑 `lint`+`type-check`+`build`）。冲刺期 CI 只做快、必过的检查，Playwright E2E 与覆盖率门槛暂不进 CI、本地手动跑。

硬规则：

- **commit 前必须本地过 lint + type-check。**
- **CI 绿灯才能合并 main**——与「用户拍板」并列的硬条件，红灯一律不合。
- **不许用 `eslint-disable`/`@ts-ignore`/`any` 掩盖问题**；确需豁免须在该行写明原因，审查方重点查。
- 规范配置文件（`.eslintrc`/`.prettierrc`/`tsconfig`/CI workflow）属 Codex 工程范围，CC 不随意改规则集。

## 6. Git 规则

- 开始前查看当前改动；不覆盖他人未提交修改。
- 不随意执行 destructive git 命令；不用 `git reset --hard`（除非用户明确要求）。
- **push：谁写谁 push，只 push 自己的功能分支**（低风险，分支隔离）。
- **合并到 main：必须由用户拍板**——不论分支谁写，AI 都不自行 `gh pr merge`。流程是「对方 Agent 审查 → 结论交用户 → 用户点头 → 才合并」（合并 main 高风险，影响共享主干）。
- 完成后说明 changed files 与验证结果。

## 7. Skill 路由

三套互相隔离的 skill 系统，各 Agent 只能用自己那套：**Trellis skills**（`.agents/skills/trellis-*`，CC 与 Codex 共用，流程控制）、**Claude Code skills**（CC 内置，前端/需求）、**Codex skills**（`~/.codex/skills/`，后端/工程）。下表是「什么场景用哪个」，目的是避免两 Agent 在同类场景各挑各的、导致流程裂开。

流程主线（共用）：需求/拆任务/实现/检查/沉淀走 `.trellis/workflow.md` 的 Phase 1→2→3；下面的领域 skill 在各 Phase 内叠加使用。

**Claude Code（前端/需求）**

| 场景                            | Skill                                          |
| ------------------------------- | ---------------------------------------------- |
| 需求澄清（brainstorm 前置磨刀） | `grill-with-docs`（见裁决①）                   |
| 写前端组件/页面（常驻）         | `react-best-practices` + `next-best-practices` |
| 打磨 UI 质量/视觉               | `impeccable`                                   |
| 前端验收前自查                  | `web-design-guidelines`                        |

**Codex（后端/RAG/测试/安全）**

> 技术栈锚定:本项目**全 TypeScript 起步**(Next.js + LangGraph.js + BullMQ + PostgreSQL/pgvector),实现一律用 TS。Python 仅为 P2 逃生通道。详见 `CONTEXT.md`。

| 场景                          | Skill                                                                   |
| ----------------------------- | ----------------------------------------------------------------------- |
| 写代码前（常驻底座）          | `karpathy-guidelines`（见裁决②）                                        |
| 数据库 schema/查询/迁移       | `supabase-postgres-best-practices`                                      |
| 登录/认证                     | `create-auth`（skill 实名）                                             |
| 账号密码流程                  | `emailAndPassword`                                                      |
| 组织/部门/多租户              | `organization`                                                          |
| 文档解析/切分/向量化/检索/RAG | `langchain-rag`（**仅用于理解 RAG 思路,实现用 TS,勿照搬 Python 代码**） |
| PDF 处理                      | `pdf`                                                                   |
| 接口/端到端测试               | `webapp-testing` + `playwright`                                         |
| 碰权限/安全代码后（必过）     | `security-best-practices`（见裁决③）                                    |

上表是推荐路由，不是硬性清单。**如某 skill 名称在当前平台不可用或显示名不一致，使用最接近的认证/权限/RAG/测试/前端 skill 即可，不要因为名字对不上就卡住或跳过该环节**——重要的是该场景有对应能力的 skill 介入，而非名字精确匹配。

> **Playwright 浏览器验证(Windows)**：环境已就绪、无需再装；skill 是 bash 写的，**必须走 bash 跑**（别在 PowerShell 执行 `$PWCLI`/`export`），也**别手连 CDP**（wrapper 自管浏览器）。细节见 `.trellis/spec/guides/playwright-windows.md`。
> **浏览器端到端验证由 CC 负责**：Codex 进程的 bash 环境通常访问不到 Windows 的 npx / wrapper 路径，跑不通 Playwright，这是环境隔离不是错误。Codex 用 `build` + HTTP 接口验证（curl/cookie jar）+ 后端脚本替代即可，并在报告中如实标注「浏览器验收留给 CC」；CC 在本地审查阶段用 Playwright 补浏览器端到端验证。

**三个必守裁决：**

1. **grill 必须落到 prd.md**：`grill-with-docs` 产出 `CONTEXT.md`（术语表），而 Codex 接活只读 `prd.md`。grill 只是 `trellis-brainstorm` 的前置磨刀，需求最终一定要写进 `prd.md`，否则 Codex 读不到。
2. **karpathy-guidelines 是 Codex 常驻底座**：每次写代码前都加载，与 `trellis-before-dev` 并列，不是二选一。
3. **security-best-practices 是权限代码强制关卡**：凡触及第 8 节列出的内容，Codex 改完后必须过一遍，不能等出事才补。

## 8. 安全与权限

权限安全是默认底线。涉及以下内容的代码都必须谨慎：登录、session、用户角色、组织/部门、知识库可见范围、文档下载/检索、RAG 问答、管理后台、操作记录、文件上传。

铁律：

- **权限判断不能只靠前端隐藏按钮，后端必须做最终校验。**
- **RAG 检索必须在权限过滤后进行**，不能把无权限文档送进上下文；私有/部门/公开知识库严格隔离。
- 输入校验完整、错误处理一致、文件上传安全、操作可审计；防 Prompt Injection。

## 9. 修改关注点与上下文

**每个 Agent 开工前优先读取**：`AGENTS.md` → `业务介绍.md` → `.trellis/workflow.md` → `.trellis/spec/` → 当前 active task → 相关代码与测试。不要只凭用户一句话就改代码；需求不明先查文档与 Trellis 上下文。

**前端关注**：结构清晰、信息密度合理、表格/表单/导航/筛选/搜索可用、loading/empty/error 完整、权限态明确、移动端基本可用；克制稳定，不做营销页大 hero、不过度装饰。

**后端关注**：API 契约清晰、输入校验完整、schema 可扩展、查询性能与索引、错误处理一致、日志审计可追踪。

**RAG 关注**：解析质量、chunk 策略、embedding 模型与维度、向量库结构、metadata、权限过滤、召回与 rerank、答案引用来源、Prompt Injection 防护、知识库隔离。

**Trellis 沉淀**：`.trellis/spec/` 存长期规则、`.trellis/tasks/` 存任务上下文、`.trellis/workspace/` 存工作记忆。重大设计决策不能只留聊天记录，须写入 Trellis。

**编码原则**：先读后改、小步修改、不做无关重构、不删用户已有内容、不重复造已有工具、不引入无谓抽象、不把临时 demo 当正式代码、不把测试写成只为通过当前实现。

## 10. 前后端契约

前后端协作必须通过明确契约：API path、request/response body、error format、auth requirement、permission behavior、TypeScript types、loading/empty/error 状态。

Codex 改 API 后同步类型与说明；CC 改前端调用后确认契约未破坏。

**触发文档/spec 更新的变化**：新增核心模块、改权限模型、改数据库结构、改 API 契约、改 RAG 流程、改目录结构、改 Agent 分工、改重要技术选型。不要让代码和文档长期不一致。

## 11. 输出要求

每个 Agent 完成任务后简洁说明：做了什么、改了哪些文件、怎么验证、还有什么风险、是否需要另一个 Agent 接手。

不要只说「完成了」——必须让下一个 Agent 能接上工作（并符合第 4 节完成的定义）。如用户有明确指令，以用户最新指令为准。
