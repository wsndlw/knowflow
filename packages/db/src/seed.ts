import "dotenv/config";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { closeDb, db } from "./client.js";
import {
  agentKnowledgeBases,
  agents,
  departmentAdmins,
  departments,
  knowledgeBaseAdmins,
  knowledgeBaseMembers,
  knowledgeBases,
  modelCatalog,
  modelProviders,
  modelUsagePolicies,
  users,
} from "./schema.js";

type DepartmentSeed = {
  id: string;
  name: string;
};

type UserSeed = {
  id: string;
  username: string;
};

type ModelSeed = {
  id: string;
  modelName: string;
};

const DEFAULT_PASSWORD = "ChangeMe_123456";

function getRequiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || salt === undefined || hash === undefined) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function ensureDepartment(name: string): Promise<DepartmentSeed> {
  const existing = await db.query.departments.findFirst({
    where: eq(departments.name, name),
    columns: {
      id: true,
      name: true,
    },
  });

  if (existing !== undefined) {
    return existing;
  }

  const [created] = await db.insert(departments).values({ name }).returning({
    id: departments.id,
    name: departments.name,
  });

  if (created === undefined) {
    throw new Error(`Failed to seed department ${name}`);
  }

  return created;
}

async function ensureUser(input: {
  username: string;
  name: string;
  departmentId: string;
  password: string;
  platformRole: "super_admin" | "department_admin" | "user";
}): Promise<UserSeed> {
  const existing = await db.query.users.findFirst({
    where: eq(users.username, input.username),
    columns: {
      id: true,
      username: true,
    },
  });

  if (existing !== undefined) {
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      username: input.username,
      passwordHash: hashPassword(input.password),
      name: input.name,
      departmentId: input.departmentId,
      platformRole: input.platformRole,
    })
    .returning({
      id: users.id,
      username: users.username,
    });

  if (created === undefined) {
    throw new Error(`Failed to seed user ${input.username}`);
  }

  return created;
}

async function ensureDepartmentAdmin(departmentId: string, userId: string): Promise<void> {
  await db
    .insert(departmentAdmins)
    .values({ departmentId, userId })
    .onConflictDoNothing({
      target: [departmentAdmins.departmentId, departmentAdmins.userId],
    });
}

async function ensureKnowledgeBase(input: {
  name: string;
  description: string;
  departmentId: string;
  visibility: "public" | "department" | "restricted";
  creatorId: string;
}): Promise<string> {
  const existing = await db.query.knowledgeBases.findFirst({
    where: eq(knowledgeBases.name, input.name),
    columns: {
      id: true,
    },
  });

  if (existing !== undefined) {
    return existing.id;
  }

  const [created] = await db
    .insert(knowledgeBases)
    .values({
      name: input.name,
      description: input.description,
      departmentId: input.departmentId,
      visibility: input.visibility,
      creatorId: input.creatorId,
    })
    .returning({ id: knowledgeBases.id });

  if (created === undefined) {
    throw new Error(`Failed to seed knowledge base ${input.name}`);
  }

  return created.id;
}

async function ensureKnowledgeBaseAdmin(knowledgeBaseId: string, userId: string): Promise<void> {
  await db
    .insert(knowledgeBaseAdmins)
    .values({ knowledgeBaseId, userId })
    .onConflictDoNothing({
      target: [knowledgeBaseAdmins.knowledgeBaseId, knowledgeBaseAdmins.userId],
    });
}

async function ensureKnowledgeBaseMember(knowledgeBaseId: string, userId: string): Promise<void> {
  await db
    .insert(knowledgeBaseMembers)
    .values({ knowledgeBaseId, userId })
    .onConflictDoNothing({
      target: [knowledgeBaseMembers.knowledgeBaseId, knowledgeBaseMembers.userId],
    });
}

async function ensureModelProvider(): Promise<string> {
  const providerName = "阿里云百炼";
  const existing = await db.query.modelProviders.findFirst({
    where: eq(modelProviders.name, providerName),
    columns: {
      id: true,
    },
  });

  if (existing !== undefined) {
    return existing.id;
  }

  const [created] = await db
    .insert(modelProviders)
    .values({
      name: providerName,
      providerType: "aliyun",
      baseUrl:
        process.env["ALIYUN_BASE_URL"] ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
      encryptedApiKey:
        process.env["ALIYUN_API_KEY"] === undefined ? null : `seed:${process.env["ALIYUN_API_KEY"]}`,
      remark: "P0 seed default provider; replace encrypted_api_key in production.",
    })
    .returning({ id: modelProviders.id });

  if (created === undefined) {
    throw new Error("Failed to seed model provider");
  }

  return created.id;
}

async function ensureModel(providerId: string, modelName: string, modelType: ModelType): Promise<ModelSeed> {
  const existing = await db.query.modelCatalog.findFirst({
    where: and(eq(modelCatalog.providerId, providerId), eq(modelCatalog.modelName, modelName)),
    columns: {
      id: true,
      modelName: true,
    },
  });

  if (existing !== undefined) {
    return existing;
  }

  const [created] = await db
    .insert(modelCatalog)
    .values({
      providerId,
      modelName,
      modelType,
      supportsStreaming: modelType === "chat",
      contextWindow: modelType === "chat" ? 128000 : null,
    })
    .returning({
      id: modelCatalog.id,
      modelName: modelCatalog.modelName,
    });

  if (created === undefined) {
    throw new Error(`Failed to seed model ${modelName}`);
  }

  return created;
}

type ModelType = "chat" | "embedding" | "rerank" | "ocr" | "vision" | "moderation";

async function ensureUsagePolicy(input: {
  usageType:
    | "chat"
    | "query_understanding"
    | "document_processing"
    | "embedding"
    | "rerank"
    | "ocr"
    | "vision"
    | "knowledge_production"
    | "agent_generation";
  modelId: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<void> {
  await db
    .insert(modelUsagePolicies)
    .values({
      usageType: input.usageType,
      defaultModelId: input.modelId,
      temperature: input.temperature ?? 70,
      maxOutputTokens: input.maxOutputTokens ?? null,
    })
    .onConflictDoNothing({
      target: modelUsagePolicies.usageType,
    });
}

async function ensureDefaultAgent(input: {
  name: string;
  description: string;
  createdBy: string;
  knowledgeBaseId: string;
}): Promise<void> {
  const existing = await db.query.agents.findFirst({
    where: eq(agents.name, input.name),
    columns: {
      id: true,
    },
  });

  const agentId =
    existing?.id ??
    (
      await db
        .insert(agents)
        .values({
          name: input.name,
          description: input.description,
          type: "official",
          visibility: "knowledge_base_members",
          status: "published",
          isDefault: true,
          forceCitation: true,
          createdBy: input.createdBy,
          publishedAt: new Date(),
          openingMessage: "你好，我可以基于当前知识库资料回答问题。",
          systemPrompt: "你是企业知识库专家 Agent。必须基于授权知识回答，并展示引用来源。",
        })
        .returning({ id: agents.id })
    )[0]?.id;

  if (agentId === undefined) {
    throw new Error(`Failed to seed agent ${input.name}`);
  }

  await db
    .insert(agentKnowledgeBases)
    .values({
      agentId,
      knowledgeBaseId: input.knowledgeBaseId,
    })
    .onConflictDoNothing({
      target: [agentKnowledgeBases.agentId, agentKnowledgeBases.knowledgeBaseId],
    });
}

async function runSeed(): Promise<void> {
  const defaultDepartment = await ensureDepartment("默认部门");
  const hr = await ensureDepartment("人事部");
  const finance = await ensureDepartment("财务部");
  const research = await ensureDepartment("研发部");

  const admin = await ensureUser({
    username: getRequiredEnv("SEED_ADMIN_USER", "admin"),
    password: getRequiredEnv("SEED_ADMIN_PASSWORD", DEFAULT_PASSWORD),
    name: getRequiredEnv("SEED_ADMIN_NAME", "System Administrator"),
    departmentId: defaultDepartment.id,
    platformRole: "super_admin",
  });

  const hrAdmin = await ensureUser({
    username: "hr.admin",
    password: DEFAULT_PASSWORD,
    name: "人事管理员",
    departmentId: hr.id,
    platformRole: "department_admin",
  });
  const financeAdmin = await ensureUser({
    username: "finance.admin",
    password: DEFAULT_PASSWORD,
    name: "财务管理员",
    departmentId: finance.id,
    platformRole: "department_admin",
  });
  const rdUser = await ensureUser({
    username: "rd.user",
    password: DEFAULT_PASSWORD,
    name: "研发成员",
    departmentId: research.id,
    platformRole: "user",
  });

  await ensureDepartmentAdmin(hr.id, hrAdmin.id);
  await ensureDepartmentAdmin(finance.id, financeAdmin.id);

  const publicKb = await ensureKnowledgeBase({
    name: "公司制度知识库",
    description: "面向全员公开的制度、流程和常见问题。",
    departmentId: hr.id,
    visibility: "public",
    creatorId: admin.id,
  });
  const departmentKb = await ensureKnowledgeBase({
    name: "财务报销知识库",
    description: "财务部维护的报销流程、票据规则和审批要求。",
    departmentId: finance.id,
    visibility: "department",
    creatorId: financeAdmin.id,
  });
  const restrictedKb = await ensureKnowledgeBase({
    name: "研发规范知识库",
    description: "研发团队内部规范，受限成员可访问。",
    departmentId: research.id,
    visibility: "restricted",
    creatorId: admin.id,
  });

  await Promise.all([
    ensureKnowledgeBaseAdmin(publicKb, admin.id),
    ensureKnowledgeBaseAdmin(departmentKb, financeAdmin.id),
    ensureKnowledgeBaseAdmin(restrictedKb, admin.id),
    ensureKnowledgeBaseMember(restrictedKb, rdUser.id),
  ]);

  await ensureDefaultAgent({
    name: "公司制度助手",
    description: "公司制度知识库默认官方 Agent。",
    createdBy: admin.id,
    knowledgeBaseId: publicKb,
  });

  const providerId = await ensureModelProvider();
  const qwenPlus = await ensureModel(providerId, "qwen-plus", "chat");
  const qwenTurbo = await ensureModel(providerId, "qwen-turbo", "chat");
  const embedding = await ensureModel(providerId, "text-embedding-v4", "embedding");
  const rerank = await ensureModel(providerId, "gte-rerank-v2", "rerank");

  await Promise.all([
    ensureUsagePolicy({ usageType: "chat", modelId: qwenPlus.id, maxOutputTokens: 4096 }),
    ensureUsagePolicy({ usageType: "query_understanding", modelId: qwenTurbo.id, maxOutputTokens: 1024 }),
    ensureUsagePolicy({ usageType: "document_processing", modelId: qwenPlus.id, maxOutputTokens: 2048 }),
    ensureUsagePolicy({ usageType: "embedding", modelId: embedding.id, temperature: 0 }),
    ensureUsagePolicy({ usageType: "rerank", modelId: rerank.id, temperature: 0 }),
    ensureUsagePolicy({ usageType: "knowledge_production", modelId: qwenPlus.id, maxOutputTokens: 2048 }),
    ensureUsagePolicy({ usageType: "agent_generation", modelId: qwenPlus.id, maxOutputTokens: 2048 }),
  ]);

  console.log(
    JSON.stringify(
      {
        admin: admin.username,
        departments: [defaultDepartment.name, hr.name, finance.name, research.name],
        knowledgeBases: [publicKb, departmentKb, restrictedKb],
        provider: "阿里云百炼",
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  try {
    await runSeed();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause instanceof Error) {
      console.error(error.cause.message);
    }
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
