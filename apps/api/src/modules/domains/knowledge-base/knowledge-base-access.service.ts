import { Injectable } from "@nestjs/common";
import {
  db,
  knowledgeBaseAdmins,
  knowledgeBaseMembers,
  knowledgeBases,
} from "@knowflow/db";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { and, eq, exists, or, type SQL } from "drizzle-orm";

@Injectable()
export class KnowledgeBaseAccessService {
  buildAccessCondition(user: AuthenticatedUser): SQL | undefined {
    if (user.platformRole === "super_admin") {
      return undefined;
    }

    if (user.platformRole === "department_admin") {
      return eq(knowledgeBases.departmentId, user.departmentId);
    }

    const memberAccess = exists(
      db
        .select({ id: knowledgeBaseMembers.id })
        .from(knowledgeBaseMembers)
        .where(
          and(
            eq(knowledgeBaseMembers.knowledgeBaseId, knowledgeBases.id),
            eq(knowledgeBaseMembers.userId, user.id),
          ),
        ),
    );

    return or(
      eq(knowledgeBases.visibility, "public"),
      and(
        eq(knowledgeBases.visibility, "department"),
        eq(knowledgeBases.departmentId, user.departmentId),
      ),
      and(eq(knowledgeBases.visibility, "restricted"), memberAccess),
    );
  }

  buildManageCondition(user: AuthenticatedUser): SQL | undefined {
    if (user.platformRole === "super_admin") {
      return undefined;
    }

    if (user.platformRole === "department_admin") {
      return eq(knowledgeBases.departmentId, user.departmentId);
    }

    return exists(
      db
        .select({ id: knowledgeBaseAdmins.id })
        .from(knowledgeBaseAdmins)
        .where(
          and(
            eq(knowledgeBaseAdmins.knowledgeBaseId, knowledgeBases.id),
            eq(knowledgeBaseAdmins.userId, user.id),
          ),
        ),
    );
  }

  async canAccess(knowledgeBaseId: string, user: AuthenticatedUser): Promise<boolean> {
    const condition = this.buildAccessCondition(user);
    const row = await db.query.knowledgeBases.findFirst({
      where:
        condition === undefined
          ? eq(knowledgeBases.id, knowledgeBaseId)
          : and(eq(knowledgeBases.id, knowledgeBaseId), condition),
      columns: {
        id: true,
      },
    });

    return row !== undefined;
  }

  async canManage(knowledgeBaseId: string, user: AuthenticatedUser): Promise<boolean> {
    const condition = this.buildManageCondition(user);
    const row = await db.query.knowledgeBases.findFirst({
      where:
        condition === undefined
          ? eq(knowledgeBases.id, knowledgeBaseId)
          : and(eq(knowledgeBases.id, knowledgeBaseId), condition),
      columns: {
        id: true,
      },
    });

    return row !== undefined;
  }
}
