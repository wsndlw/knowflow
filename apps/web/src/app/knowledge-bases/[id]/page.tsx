"use client";

import {
  knowledgeBaseMembersResponseSchema,
  knowledgeBaseSchema,
  updateKnowledgeBaseRequestSchema,
  userOptionsResponseSchema,
  type KnowledgeBase,
  type KnowledgeBaseMember,
  type KnowledgeBaseVisibility,
  type UserOption,
} from "@knowflow/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";

import { apiRequest } from "../../../lib/api";

const visibilityLabels: Record<KnowledgeBaseVisibility, string> = {
  public: "Public",
  department: "Department",
  restricted: "Restricted",
};

const emptyObjectSchema = {
  parse(input: unknown): Record<string, never> {
    if (typeof input === "object" && input !== null && Object.keys(input).length === 0) {
      return {};
    }
    throw new Error("Invalid API response");
  },
};

export default function KnowledgeBaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const knowledgeBaseId = params.id;
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [members, setMembers] = useState<KnowledgeBaseMember[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await apiRequest(`/knowledge-bases/${knowledgeBaseId}`, knowledgeBaseSchema, {
        cache: "no-store",
      });
      setKnowledgeBase(detail);

      if (detail.canManage) {
        const [memberResponse, userResponse] = await Promise.all([
          apiRequest(
            `/knowledge-bases/${knowledgeBaseId}/members`,
            knowledgeBaseMembersResponseSchema,
            { cache: "no-store" },
          ),
          apiRequest(`/knowledge-bases/${knowledgeBaseId}/user-options`, userOptionsResponseSchema, {
            cache: "no-store",
          }),
        ]);
        setMembers(memberResponse.items);
        setUserOptions(userResponse.items);
        setSelectedUserId((current) => (current === "" ? (userResponse.items[0]?.id ?? "") : current));
      } else {
        setMembers([]);
        setUserOptions([]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load knowledge base");
    } finally {
      setIsLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const currentSelectionIsMember = selectedUserId !== "" && memberIds.has(selectedUserId);
  const selectedMember = members.find((member) => member.id === selectedUserId);

  async function handleUpdate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (knowledgeBase === null) {
      return;
    }

    setIsSaving(true);
    setActionError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const input = updateKnowledgeBaseRequestSchema.parse({
        name: formData.get("name"),
        description: formData.get("description"),
        visibility: formData.get("visibility"),
        status: formData.get("status"),
      });
      const updated = await apiRequest(`/knowledge-bases/${knowledgeBase.id}`, knowledgeBaseSchema, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setKnowledgeBase(updated);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Failed to update knowledge base");
    } finally {
      setIsSaving(false);
    }
  }

  async function runMemberAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      await loadDetail();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Action failed");
    }
  }

  async function handleDelete() {
    if (knowledgeBase === null) {
      return;
    }

    setActionError(null);
    try {
      await apiRequest(`/knowledge-bases/${knowledgeBase.id}`, emptyObjectSchema, {
        method: "DELETE",
      });
      router.replace("/knowledge-bases");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Failed to delete knowledge base");
    }
  }

  if (isLoading) {
    return <div className="empty-state">Loading knowledge base...</div>;
  }

  if (error !== null || knowledgeBase === null) {
    return (
      <section className="page-stack">
        <Link className="back-link" href="/knowledge-bases">
          Back to knowledge bases
        </Link>
        <div className="form-error">{error ?? "Knowledge base not found"}</div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="page-heading page-heading-row">
        <div>
          <Link className="back-link" href="/knowledge-bases">
            Back to knowledge bases
          </Link>
          <p className="eyebrow">Knowledge base</p>
          <h1>{knowledgeBase.name}</h1>
        </div>
        {knowledgeBase.canManage && (
          <button className="action-button danger" type="button" onClick={() => void handleDelete()}>
            Delete
          </button>
        )}
      </div>

      {actionError !== null && <div className="form-error">{actionError}</div>}

      <div className="detail-grid">
        <section className="detail-panel">
          <h2>Overview</h2>
          <p>{knowledgeBase.description ?? "No description"}</p>
          <dl className="meta-list">
            <div>
              <dt>Department</dt>
              <dd>{knowledgeBase.departmentName}</dd>
            </div>
            <div>
              <dt>Visibility</dt>
              <dd>{visibilityLabels[knowledgeBase.visibility]}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{knowledgeBase.status}</dd>
            </div>
            <div>
              <dt>Index</dt>
              <dd>{knowledgeBase.indexStatus}</dd>
            </div>
            <div>
              <dt>Creator</dt>
              <dd>{knowledgeBase.creatorName}</dd>
            </div>
            <div>
              <dt>Embedding</dt>
              <dd>
                {knowledgeBase.embeddingModel} / {knowledgeBase.embeddingDimension}
              </dd>
            </div>
          </dl>
        </section>

        {knowledgeBase.canManage && (
          <form className="panel-form" onSubmit={(event) => void handleUpdate(event)}>
            <h2>Settings</h2>
            <label>
              Name
              <input name="name" defaultValue={knowledgeBase.name} required maxLength={160} />
            </label>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={knowledgeBase.description ?? ""}
                maxLength={2000}
                rows={4}
              />
            </label>
            <div className="form-grid two">
              <label>
                Visibility
                <select name="visibility" defaultValue={knowledgeBase.visibility}>
                  <option value="public">Public</option>
                  <option value="department">Department</option>
                  <option value="restricted">Restricted</option>
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue={knowledgeBase.status}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>

      {knowledgeBase.canManage && (
        <section className="detail-panel">
          <div className="section-heading-row">
            <h2>Members</h2>
            <div className="member-actions">
              <select
                className="inline-select"
                aria-label="Select user"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {userOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.username})
                  </option>
                ))}
              </select>
              <button
                className="action-button"
                type="button"
                disabled={selectedUserId === ""}
                onClick={() =>
                  void runMemberAction(async () => {
                    await apiRequest(`/knowledge-bases/${knowledgeBase.id}/members`, emptyObjectSchema, {
                      method: "POST",
                      body: JSON.stringify({ userId: selectedUserId }),
                    });
                  })
                }
              >
                {currentSelectionIsMember ? "Ensure member" : "Add member"}
              </button>
              <button
                className="action-button secondary"
                type="button"
                disabled={selectedUserId === ""}
                onClick={() =>
                  void runMemberAction(async () => {
                    await apiRequest(`/knowledge-bases/${knowledgeBase.id}/admins`, emptyObjectSchema, {
                      method: "POST",
                      body: JSON.stringify({ userId: selectedUserId }),
                    });
                  })
                }
              >
                Make admin
              </button>
            </div>
          </div>

          {members.length === 0 && <div className="empty-state">No members.</div>}
          {members.length > 0 && (
            <div className="member-list">
              {members.map((member) => (
                <div key={member.id} className="member-row">
                  <div>
                    <strong>{member.name}</strong>
                    <span>
                      {member.username} / {member.departmentName}
                    </span>
                  </div>
                  <div className="member-badges">
                    <span>{member.platformRole}</span>
                    {member.isAdmin && <span>KB admin</span>}
                  </div>
                  <div className="member-row-actions">
                    {member.isAdmin && (
                      <button
                        className="action-button secondary"
                        type="button"
                        onClick={() =>
                          void runMemberAction(async () => {
                            await apiRequest(
                              `/knowledge-bases/${knowledgeBase.id}/admins/${member.id}`,
                              emptyObjectSchema,
                              { method: "DELETE" },
                            );
                          })
                        }
                      >
                        Remove admin
                      </button>
                    )}
                    <button
                      className="action-button secondary"
                      type="button"
                      onClick={() =>
                        void runMemberAction(async () => {
                          await apiRequest(
                            `/knowledge-bases/${knowledgeBase.id}/members/${member.id}`,
                            emptyObjectSchema,
                            { method: "DELETE" },
                          );
                        })
                      }
                    >
                      Remove member
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedMember !== undefined && (
            <p className="helper-text">
              Selected user is {selectedMember.isAdmin ? "an admin" : "a member"} of this knowledge base.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
