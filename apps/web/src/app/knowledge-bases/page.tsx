"use client";

import {
  createKnowledgeBaseRequestSchema,
  departmentOptionsResponseSchema,
  knowledgeBaseListResponseSchema,
  type CreateKnowledgeBaseRequest,
  type DepartmentOption,
  type KnowledgeBase,
  type KnowledgeBaseVisibility,
} from "@knowflow/shared";
import Link from "next/link";
import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

import { useAuth } from "../../components/auth-provider";
import { apiRequest } from "../../lib/api";

type Filters = {
  visibility: "" | KnowledgeBaseVisibility;
  keyword: string;
};

const visibilityLabels: Record<KnowledgeBaseVisibility, string> = {
  public: "Public",
  department: "Department",
  restricted: "Restricted",
};

function buildListPath(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.visibility !== "") {
    params.set("visibility", filters.visibility);
  }
  if (filters.keyword.trim() !== "") {
    params.set("keyword", filters.keyword.trim());
  }

  const query = params.toString();
  return query === "" ? "/knowledge-bases" : `/knowledge-bases?${query}`;
}

export default function KnowledgeBasesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [filters, setFilters] = useState<Filters>({ visibility: "", keyword: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const canCreate = user?.platformRole === "super_admin" || user?.platformRole === "department_admin";

  const loadKnowledgeBases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest(buildListPath(filters), knowledgeBaseListResponseSchema, {
        cache: "no-store",
      });
      setItems(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load knowledge bases");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  useEffect(() => {
    if (!canCreate) {
      return;
    }

    async function loadDepartments() {
      try {
        const response = await apiRequest(
          "/knowledge-bases/departments/options",
          departmentOptionsResponseSchema,
          { cache: "no-store" },
        );
        setDepartments(response.items);
        setSelectedDepartmentId((current) => (current === "" ? (response.items[0]?.id ?? "") : current));
      } catch (caught) {
        setCreateError(caught instanceof Error ? caught.message : "Failed to load departments");
      }
    }

    void loadDepartments();
  }, [canCreate]);

  async function handleCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const input: CreateKnowledgeBaseRequest = createKnowledgeBaseRequestSchema.parse({
        name: formData.get("name"),
        description: formData.get("description"),
        departmentId: selectedDepartmentId,
        visibility: formData.get("visibility"),
      });

      await apiRequest("/knowledge-bases", knowledgeBaseListResponseSchema.shape.items.element, {
        method: "POST",
        body: JSON.stringify(input),
      });
      event.currentTarget.reset();
      await loadKnowledgeBases();
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "Failed to create knowledge base");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading page-heading-row">
        <div>
          <p className="eyebrow">Knowledge assets</p>
          <h1>Knowledge Bases</h1>
        </div>
        <div className="toolbar">
          <select
            aria-label="Filter by visibility"
            value={filters.visibility}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                visibility: event.target.value as Filters["visibility"],
              }))
            }
          >
            <option value="">All visibility</option>
            <option value="public">Public</option>
            <option value="department">Department</option>
            <option value="restricted">Restricted</option>
          </select>
          <input
            aria-label="Search knowledge bases"
            placeholder="Search"
            value={filters.keyword}
            onChange={(event) =>
              setFilters((current) => ({ ...current, keyword: event.target.value }))
            }
          />
        </div>
      </div>

      {canCreate && (
        <form className="panel-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required maxLength={160} placeholder="Policy knowledge base" />
            </label>
            <label>
              Department
              <select
                name="departmentId"
                required
                value={selectedDepartmentId}
                onChange={(event) => setSelectedDepartmentId(event.target.value)}
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visibility
              <select name="visibility" defaultValue="department">
                <option value="public">Public</option>
                <option value="department">Department</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea name="description" maxLength={2000} rows={3} />
          </label>
          {createError !== null && <div className="form-error">{createError}</div>}
          <div className="form-actions">
            <button type="submit" disabled={isCreating || departments.length === 0}>
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      {error !== null && <div className="form-error">{error}</div>}
      {isLoading && <div className="empty-state">Loading knowledge bases...</div>}
      {!isLoading && error === null && items.length === 0 && (
        <div className="empty-state">No knowledge bases match your permissions or filters.</div>
      )}
      {!isLoading && error === null && items.length > 0 && (
        <div className="kb-grid">
          {items.map((item) => (
            <Link key={item.id} className="kb-card" href={`/knowledge-bases/${item.id}`}>
              <div className="kb-card-header">
                <strong>{item.name}</strong>
                <span>{visibilityLabels[item.visibility]}</span>
              </div>
              <p>{item.description ?? "No description"}</p>
              <dl className="meta-list">
                <div>
                  <dt>Department</dt>
                  <dd>{item.departmentName}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{item.status}</dd>
                </div>
                <div>
                  <dt>Index</dt>
                  <dd>{item.indexStatus}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{item.canManage ? "Manager" : "Reader"}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
