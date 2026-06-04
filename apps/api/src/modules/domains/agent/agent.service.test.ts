import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agentKnowledgeBases, agents, db, knowledgeBases } from "@knowflow/db";
import { and, eq, type SQL } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AgentService } from "./agent.service.js";

type AgentServiceInternals = {
  buildAgentAccessCondition: (user: AuthenticatedUser) => SQL | undefined;
  buildAgentKnowledgeBaseScopeCondition: (
    agentId: string,
    user: AuthenticatedUser,
  ) => SQL | undefined;
};

const user: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000002",
};

const superAdmin: AuthenticatedUser = {
  ...user,
  id: "00000000-0000-0000-0000-000000000099",
  platformRole: "super_admin",
};

function serviceWithAccessCondition(): AgentServiceInternals {
  return new AgentService(
    {} as ConstructorParameters<typeof AgentService>[0],
    {
      buildAccessCondition: () => eq(knowledgeBases.visibility, "public"),
      canAccess: () => Promise.reject(new Error("canAccess should not be used by SQL helpers")),
    } as unknown as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  ) as unknown as AgentServiceInternals;
}

function serviceWithoutAccessCondition(): AgentServiceInternals {
  return new AgentService(
    {} as ConstructorParameters<typeof AgentService>[0],
    {
      buildAccessCondition: () => undefined,
      canAccess: () => Promise.reject(new Error("canAccess should not be used by SQL helpers")),
    } as unknown as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  ) as unknown as AgentServiceInternals;
}

void describe("AgentService SQL access filters", () => {
  void it("pushes agent visibility and knowledge-base-member access into one EXISTS condition", () => {
    const service = serviceWithAccessCondition();
    const condition = service.buildAgentAccessCondition(user);
    const { sql, params } = db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.status, "published"), condition))
      .toSQL();

    assert.match(sql, /exists \(select/);
    assert.match(sql, /"agent_knowledge_bases"/);
    assert.match(sql, /inner join "knowledge_bases"/);
    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.match(sql, /"knowledge_bases"\."visibility" =/);
    assert.equal(params.includes("active"), true);
    assert.equal(params.includes("knowledge_base_members"), true);
    assert.equal(params.includes("private"), true);
    assert.equal(params.includes("selected_members"), true);
    assert.equal(params.includes(user.id), true);
  });

  void it("keeps archived agent-bound knowledge bases out of runtime scope", () => {
    const service = serviceWithAccessCondition();
    const condition = service.buildAgentKnowledgeBaseScopeCondition("agent-1", user);
    const { sql, params } = db
      .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
      .from(agentKnowledgeBases)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, agentKnowledgeBases.knowledgeBaseId))
      .where(condition)
      .toSQL();

    assert.match(sql, /"agent_knowledge_bases"\."agent_id" =/);
    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.match(sql, /"knowledge_bases"\."visibility" =/);
    assert.equal(params.includes("agent-1"), true);
    assert.equal(params.includes("active"), true);
  });

  void it("still filters inactive agent-bound knowledge bases for super admins", () => {
    const service = serviceWithoutAccessCondition();
    const condition = service.buildAgentKnowledgeBaseScopeCondition("agent-1", superAdmin);
    const { sql, params } = db
      .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
      .from(agentKnowledgeBases)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, agentKnowledgeBases.knowledgeBaseId))
      .where(condition)
      .toSQL();

    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.doesNotMatch(sql, /"knowledge_bases"\."visibility" =/);
    assert.deepEqual(params, ["agent-1", "active"]);
  });
});
