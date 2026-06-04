import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { db, documentTags, documents, knowledgeItemTags, knowledgeItems, tags } from "@knowflow/db";
import type {
  CreateTagRequest,
  KnowledgeTag,
  ReplaceTagsRequest,
  TagListResponse,
  UpdateTagRequest,
} from "@knowflow/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";

type TagRow = {
  id: string;
  knowledgeBaseId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TagService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
  ) {}

  async list(knowledgeBaseId: string, user: AuthenticatedUser): Promise<TagListResponse> {
    await this.ensureCanAccess(knowledgeBaseId, user);
    const rows = await db
      .select(this.selection())
      .from(tags)
      .where(eq(tags.knowledgeBaseId, knowledgeBaseId))
      .orderBy(asc(tags.name));

    return { items: rows.map((row) => this.toTag(row)) };
  }

  async create(
    knowledgeBaseId: string,
    input: CreateTagRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeTag> {
    await this.ensureCanManage(knowledgeBaseId, user);
    await this.ensureNameAvailable(knowledgeBaseId, input.name);

    const [created] = await db
      .insert(tags)
      .values({
        knowledgeBaseId,
        name: input.name,
        color: input.color,
      })
      .returning(this.selection());
    if (created === undefined) {
      throw new BadRequestException("Failed to create tag");
    }

    return this.toTag(created);
  }

  async update(
    tagId: string,
    input: UpdateTagRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeTag> {
    const tag = await this.findTag(tagId);
    if (tag === undefined) {
      throw new NotFoundException("Tag not found");
    }
    await this.ensureCanManage(tag.knowledgeBaseId, user);
    if (input.name !== undefined && input.name !== tag.name) {
      await this.ensureNameAvailable(tag.knowledgeBaseId, input.name);
    }

    const [updated] = await db
      .update(tags)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.color === undefined ? {} : { color: input.color }),
        updatedAt: new Date(),
      })
      .where(eq(tags.id, tagId))
      .returning(this.selection());
    if (updated === undefined) {
      throw new NotFoundException("Tag not found");
    }

    return this.toTag(updated);
  }

  async delete(tagId: string, user: AuthenticatedUser): Promise<void> {
    const tag = await this.findTag(tagId);
    if (tag === undefined) {
      throw new NotFoundException("Tag not found");
    }
    await this.ensureCanManage(tag.knowledgeBaseId, user);
    await db.delete(tags).where(eq(tags.id, tagId));
  }

  async replaceDocumentTags(
    documentId: string,
    input: ReplaceTagsRequest,
    user: AuthenticatedUser,
  ): Promise<TagListResponse> {
    const tagIds = [...new Set(input.tagIds)];
    const [document] = await db
      .select({
        knowledgeBaseId: documents.knowledgeBaseId,
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    if (document === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanManage(document.knowledgeBaseId, user);
    await this.ensureTagsBelongToKnowledgeBase(tagIds, document.knowledgeBaseId);

    await db.transaction(async (tx) => {
      await tx.delete(documentTags).where(eq(documentTags.documentId, documentId));
      if (tagIds.length > 0) {
        await tx.insert(documentTags).values(
          tagIds.map((tagId) => ({
            documentId,
            tagId,
          })),
        );
      }
    });

    return this.listTagsByDocument(documentId);
  }

  async replaceKnowledgeItemTags(
    knowledgeItemId: string,
    input: ReplaceTagsRequest,
    user: AuthenticatedUser,
  ): Promise<TagListResponse> {
    const tagIds = [...new Set(input.tagIds)];
    const [item] = await db
      .select({
        knowledgeBaseId: knowledgeItems.knowledgeBaseId,
      })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, knowledgeItemId))
      .limit(1);
    if (item === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanManage(item.knowledgeBaseId, user);
    await this.ensureTagsBelongToKnowledgeBase(tagIds, item.knowledgeBaseId);

    await db.transaction(async (tx) => {
      await tx
        .delete(knowledgeItemTags)
        .where(eq(knowledgeItemTags.knowledgeItemId, knowledgeItemId));
      if (tagIds.length > 0) {
        await tx.insert(knowledgeItemTags).values(
          tagIds.map((tagId) => ({
            knowledgeItemId,
            tagId,
          })),
        );
      }
    });

    return this.listTagsByKnowledgeItem(knowledgeItemId);
  }

  private async listTagsByDocument(documentId: string): Promise<TagListResponse> {
    const rows = await db
      .select(this.selection())
      .from(documentTags)
      .innerJoin(tags, eq(tags.id, documentTags.tagId))
      .where(eq(documentTags.documentId, documentId))
      .orderBy(asc(tags.name));
    return { items: rows.map((row) => this.toTag(row)) };
  }

  private async listTagsByKnowledgeItem(knowledgeItemId: string): Promise<TagListResponse> {
    const rows = await db
      .select(this.selection())
      .from(knowledgeItemTags)
      .innerJoin(tags, eq(tags.id, knowledgeItemTags.tagId))
      .where(eq(knowledgeItemTags.knowledgeItemId, knowledgeItemId))
      .orderBy(asc(tags.name));
    return { items: rows.map((row) => this.toTag(row)) };
  }

  private async ensureTagsBelongToKnowledgeBase(
    tagIds: string[],
    knowledgeBaseId: string,
  ): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }
    const rows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), eq(tags.knowledgeBaseId, knowledgeBaseId)));
    if (rows.length !== new Set(tagIds).size) {
      throw new BadRequestException("All tags must belong to the same knowledge base");
    }
  }

  private async ensureNameAvailable(knowledgeBaseId: string, name: string): Promise<void> {
    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.knowledgeBaseId, knowledgeBaseId), eq(tags.name, name)))
      .limit(1);
    if (existing !== undefined) {
      throw new BadRequestException("Tag name already exists in this knowledge base");
    }
  }

  private async ensureCanAccess(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canAccess(knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("Knowledge base not found");
  }

  private async ensureCanManage(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }
    throw new ForbiddenException("Cannot manage tags in this knowledge base");
  }

  private async findTag(tagId: string): Promise<TagRow | undefined> {
    const [tag] = await db.select(this.selection()).from(tags).where(eq(tags.id, tagId)).limit(1);
    return tag;
  }

  private selection() {
    return {
      id: tags.id,
      knowledgeBaseId: tags.knowledgeBaseId,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    };
  }

  private toTag(row: TagRow): KnowledgeTag {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
