"use client";

import {
  documentListResponseSchema,
  documentProgressEventSchema,
  documentSchema,
  knowledgeBaseMembersResponseSchema,
  knowledgeBaseSchema,
  updateKnowledgeBaseRequestSchema,
  userOptionsResponseSchema,
  type DocumentProgressEvent,
  type KnowledgeDocument,
  type KnowledgeBase,
  type KnowledgeBaseMember,
  type KnowledgeBaseVisibility,
  type UserOption,
} from "@knowflow/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";

import { apiRequest, apiUrl, parseApiError } from "../../../lib/api";

const visibilityLabels: Record<KnowledgeBaseVisibility, string> = {
  public: "Public",
  department: "Department",
  restricted: "Restricted",
};

const activeDocumentStatuses = new Set(["pending", "parsing", "chunking", "embedding"]);

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
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [progressByDocumentId, setProgressByDocumentId] = useState<Record<string, DocumentProgressEvent>>({});
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    const response = await apiRequest(
      `/knowledge-bases/${knowledgeBaseId}/documents`,
      documentListResponseSchema,
      { cache: "no-store" },
    );
    setDocuments(response.items);
  }, [knowledgeBaseId]);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [detail, documentResponse] = await Promise.all([
        apiRequest(`/knowledge-bases/${knowledgeBaseId}`, knowledgeBaseSchema, {
          cache: "no-store",
        }),
        apiRequest(`/knowledge-bases/${knowledgeBaseId}/documents`, documentListResponseSchema, {
          cache: "no-store",
        }),
      ]);
      setKnowledgeBase(detail);
      setDocuments(documentResponse.items);

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
  const activeDocumentIds = useMemo(
    () =>
      documents
        .filter((document) => activeDocumentStatuses.has(document.processStatus))
        .map((document) => document.id)
        .sort(),
    [documents],
  );

  useEffect(() => {
    if (activeDocumentIds.length === 0) {
      return;
    }

    const eventSources = activeDocumentIds.map((documentId) => {
      const eventSource = new EventSource(apiUrl(`/documents/${documentId}/progress`), {
        withCredentials: true,
      });
      eventSource.onmessage = (event) => {
        try {
          const progress = documentProgressEventSchema.parse(JSON.parse(event.data as string));
          setProgressByDocumentId((current) => ({
            ...current,
            [progress.documentId]: progress,
          }));
          if (progress.stage === "completed" || progress.stage === "failed") {
            void loadDocuments();
          }
        } catch {
          eventSource.close();
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
      };
      return eventSource;
    });

    const pollingId = window.setInterval(() => {
      void loadDocuments();
    }, 3000);

    return () => {
      window.clearInterval(pollingId);
      eventSources.forEach((eventSource) => eventSource.close());
    };
  }, [activeDocumentIds, loadDocuments]);

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

  async function handleUpload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (knowledgeBase === null) {
      return;
    }

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file");
    if (!(fileInput instanceof HTMLInputElement) || fileInput.files?.[0] === undefined) {
      setActionError("Select a PDF, Markdown, or TXT file");
      return;
    }

    const formData = new FormData();
    formData.set("file", fileInput.files[0]);
    setIsUploading(true);
    setActionError(null);
    try {
      const response = await fetch(apiUrl(`/knowledge-bases/${knowledgeBase.id}/documents`), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("ok" in body) ||
        body.ok !== true ||
        !("data" in body)
      ) {
        throw new Error("Invalid API response");
      }
      const created = documentSchema.parse(body.data);
      setDocuments((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setProgressByDocumentId((current) => ({
        ...current,
        [created.id]: {
          documentId: created.id,
          stage: created.processStatus,
          percent: 5,
          message: "Document queued",
          timestamp: new Date().toISOString(),
        },
      }));
      form.reset();
      await loadDocuments();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Failed to upload document");
    } finally {
      setIsUploading(false);
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

      <section className="detail-panel">
        <div className="section-heading-row">
          <h2>Documents</h2>
          {knowledgeBase.canManage && (
            <form className="upload-form" onSubmit={(event) => void handleUpload(event)}>
              <input
                aria-label="Upload document"
                name="file"
                type="file"
                accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
              />
              <button className="action-button" type="submit" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </form>
          )}
        </div>

        {documents.length === 0 && <div className="empty-state">No documents uploaded.</div>}
        {documents.length > 0 && (
          <div className="document-list">
            {documents.map((document) => {
              const progress = progressByDocumentId[document.id];
              const percent = progress?.percent ?? statusPercent(document.processStatus);
              const message = progress?.message ?? document.errorMessage ?? document.processStatus;
              return (
                <div key={document.id} className="document-row">
                  <div>
                    <strong>{document.title}</strong>
                    <span>
                      {document.sourceType} / {formatBytes(document.fileSize)} / uploaded by{" "}
                      {document.uploaderName}
                    </span>
                  </div>
                  <div className="document-status">
                    <span>{document.processStatus}</span>
                    <progress value={percent} max={100} />
                    <small>{message}</small>
                  </div>
                  <div className="document-counts">
                    <span>{document.parentChunkCount} parent</span>
                    <span>{document.childChunkCount} child</span>
                  </div>
                  {knowledgeBase.canManage && (
                    <button
                      className="action-button secondary"
                      type="button"
                      onClick={() =>
                        void runMemberAction(async () => {
                          await apiRequest(`/documents/${document.id}`, emptyObjectSchema, {
                            method: "DELETE",
                          });
                          await loadDocuments();
                        })
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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

function statusPercent(status: KnowledgeDocument["processStatus"]): number {
  switch (status) {
    case "pending":
      return 5;
    case "parsing":
      return 15;
    case "chunking":
      return 35;
    case "embedding":
      return 60;
    case "completed":
    case "failed":
      return 100;
  }
}

function formatBytes(value: number | null): string {
  if (value === null) {
    return "unknown size";
  }
  if (value < 1024) {
    return `${String(value)} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
