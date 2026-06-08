import { Injectable } from "@nestjs/common";
import {
  db,
  knowledgeBaseAdmins,
  knowledgeBaseMembers,
  knowledgeBases,
} from "@knowflow/db";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { and, eq, exists, isNull, or, type SQL } from "drizzle-orm";

type AccessConditionOptions = {
  includeDeleted?: boolean;
};

function activeKnowledgeBaseCondition(options: AccessConditionOptions): SQL | undefined {
  return options.includeDeleted === true ? undefined : isNull(knowledgeBases.deletedAt);
}

@Injectable()
export class KnowledgeBaseAccessService {
  buildAccessCondition(
    user: AuthenticatedUser,
    options: AccessConditionOptions = {},
  ): SQL | undefined {
    const activeCondition = activeKnowledgeBaseCondition(options);
    if (user.platformRole === "super_admin") {
      return activeCondition;
    }

    if (user.platformRole === "department_admin") {
      return and(activeCondition, eq(knowledgeBases.departmentId, user.departmentId));
    }

    const adminAccess = exists(
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

    return and(
      activeCondition,
      or(
      eq(knowledgeBases.visibility, "public"),
      adminAccess,
      and(
        eq(knowledgeBases.visibility, "department"),
        eq(knowledgeBases.departmentId, user.departmentId),
      ),
      and(eq(knowledgeBases.visibility, "restricted"), memberAccess),
      ),
    );
  }

  buildManageCondition(
    user: AuthenticatedUser,
    options: AccessConditionOptions = {},
  ): SQL | undefined {
    const activeCondition = activeKnowledgeBaseCondition(options);
    if (user.platformRole === "super_admin") {
      return activeCondition;
    }

    if (user.platformRole === "department_admin") {
      return and(activeCondition, eq(knowledgeBases.departmentId, user.departmentId));
    }

    return and(
      activeCondition,
      exists(
        db
          .select({ id: knowledgeBaseAdmins.id })
          .from(knowledgeBaseAdmins)
          .where(
            and(
              eq(knowledgeBaseAdmins.knowledgeBaseId, knowledgeBases.id),
              eq(knowledgeBaseAdmins.userId, user.id),
            ),
          ),
      ),
    );
  }

  async canAccess(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
    options: AccessConditionOptions = {},
  ): Promise<boolean> {
    const condition = this.buildAccessCondition(user, options);
    const [row] = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        condition === undefined
          ? eq(knowledgeBases.id, knowledgeBaseId)
          : and(eq(knowledgeBases.id, knowledgeBaseId), condition),
      )
      .limit(1);

    return row !== undefined;
  }

  async canManage(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
    options: AccessConditionOptions = {},
  ): Promise<boolean> {
    const condition = this.buildManageCondition(user, options);
    const [row] = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        condition === undefined
          ? eq(knowledgeBases.id, knowledgeBaseId)
          : and(eq(knowledgeBases.id, knowledgeBaseId), condition),
      )
      .limit(1);

    return row !== undefined;
  }
}
