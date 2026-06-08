"use client";

import { useCallback, useEffect, useState } from "react";
import {
  knowledgeBaseMembersResponseSchema,
  userOptionsResponseSchema,
  type KnowledgeBaseMember,
  type UserOption,
} from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Dialog } from "../../../../components/ui/dialog";
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { Input } from "../../../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { apiRequest, emptyObjectSchema } from "../../../../lib/api";

type TabMembersProps = {
  knowledgeBaseId: string;
  canManage: boolean;
};

const roleLabels: Record<string, string> = {
  super_admin: "超级管理员",
  department_admin: "部门管理员",
  user: "普通用户",
};

export function TabMembers({ knowledgeBaseId, canManage }: TabMembersProps) {
  const [members, setMembers] = useState<KnowledgeBaseMember[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 添加成员弹窗（多选）
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // 行多选
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 移除确认（单个或批量）
  const [removeTarget, setRemoveTarget] = useState<{ ids: string[] } | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [memberRes, userRes] = await Promise.all([
        apiRequest(
          `/knowledge-bases/${knowledgeBaseId}/members`,
          knowledgeBaseMembersResponseSchema,
          { cache: "no-store" },
        ),
        apiRequest(
          `/knowledge-bases/${knowledgeBaseId}/user-options`,
          userOptionsResponseSchema,
          { cache: "no-store" },
        ),
      ]);
      setMembers(memberRes.items);
      setUserOptions(userRes.items);
      setSelected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const existingIds = new Set(members.map((m) => m.id));
  const addableUsers = userOptions.filter((u) => !existingIds.has(u.id));
  const filteredAddable = addableUsers.filter((u) => {
    const q = addSearch.trim().toLowerCase();
    if (q === "") return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.departmentName.toLowerCase().includes(q)
    );
  });

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      await loadData();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  function openAdd() {
    setAddSelected(new Set());
    setAddSearch("");
    setActionError(null);
    setAddOpen(true);
  }

  function toggleAddSelected(userId: string) {
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleAddMembers() {
    if (addSelected.size === 0) return;
    setAdding(true);
    setActionError(null);
    try {
      for (const userId of addSelected) {
        await apiRequest(`/knowledge-bases/${knowledgeBaseId}/members`, emptyObjectSchema, {
          method: "POST",
          body: JSON.stringify({ userId }),
        });
      }
      setAddOpen(false);
      await loadData();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "添加成员失败");
    } finally {
      setAdding(false);
    }
  }

  async function handleSetAdmin(memberId: string) {
    await runAction(async () => {
      await apiRequest(`/knowledge-bases/${knowledgeBaseId}/admins`, emptyObjectSchema, {
        method: "POST",
        body: JSON.stringify({ userId: memberId }),
      });
    });
  }

  async function handleRemoveAdmin(memberId: string) {
    await runAction(async () => {
      await apiRequest(`/knowledge-bases/${knowledgeBaseId}/admins/${memberId}`, emptyObjectSchema, {
        method: "DELETE",
      });
    });
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setActionError(null);
    try {
      for (const id of removeTarget.ids) {
        await apiRequest(`/knowledge-bases/${knowledgeBaseId}/members/${id}`, emptyObjectSchema, {
          method: "DELETE",
        });
      }
      setRemoveTarget(null);
      await loadData();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "移除失败");
    } finally {
      setRemoving(false);
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = members.length > 0 && selected.size === members.length;
  function toggleAll() {
    setSelected((prev) => (prev.size === members.length ? new Set() : new Set(members.map((m) => m.id))));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>;
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部操作栏 */}
      {canManage ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-ink-muted">
            {selectedCount > 0 ? (
              <span>
                已选 <span className="font-medium text-ink tabular-nums">{selectedCount}</span> 名成员
              </span>
            ) : (
              <span>
                共 <span className="font-medium text-ink tabular-nums">{members.length}</span> 名成员
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRemoveTarget({ ids: [...selected] })}
              >
                批量移除（{selectedCount}）
              </Button>
            ) : null}
            <Button size="sm" onClick={openAdd}>
              添加成员
            </Button>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
      ) : null}

      {members.length === 0 ? (
        <EmptyState title="暂无成员" description="添加成员以协作管理知识库。" />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {canManage ? (
                <TableHeaderCell className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => toggleAll()}
                    aria-label="全选"
                  />
                </TableHeaderCell>
              ) : null}
              <TableHeaderCell>姓名</TableHeaderCell>
              <TableHeaderCell>用户名</TableHeaderCell>
              <TableHeaderCell>部门</TableHeaderCell>
              <TableHeaderCell>角色</TableHeaderCell>
              <TableHeaderCell>KB 管理员</TableHeaderCell>
              {canManage ? <TableHeaderCell className="text-right">操作</TableHeaderCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                {canManage ? (
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selected.has(member.id)}
                      onCheckedChange={() => toggleRow(member.id)}
                      aria-label={`选择 ${member.name}`}
                    />
                  </TableCell>
                ) : null}
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="text-ink-muted">{member.username}</TableCell>
                <TableCell className="text-ink-muted">{member.departmentName}</TableCell>
                <TableCell>
                  <Badge tone="neutral">{roleLabels[member.platformRole] ?? member.platformRole}</Badge>
                </TableCell>
                <TableCell>
                  {member.isAdmin ? <Badge tone="brand">管理员</Badge> : <span className="text-ink-subtle">—</span>}
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {member.isAdmin ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleRemoveAdmin(member.id)}>
                          撤管理员
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void handleSetAdmin(member.id)}>
                          设管理员
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setRemoveTarget({ ids: [member.id] })}>
                        移除
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* 添加成员弹窗（多选） */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="添加成员"
        description="搜索并勾选多名用户，一次性加入知识库。"
      >
        <div className="flex flex-col gap-3 pt-1">
          <Input
            placeholder="搜索姓名 / 用户名 / 部门…"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
          />
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {filteredAddable.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-subtle">
                {addableUsers.length === 0 ? "已无可添加的用户" : "未找到匹配用户"}
              </p>
            ) : (
              filteredAddable.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50"
                >
                  <Checkbox
                    checked={addSelected.has(u.id)}
                    onCheckedChange={() => toggleAddSelected(u.id)}
                    aria-label={`选择 ${u.name}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                    <span className="block truncate text-xs text-ink-subtle">
                      {u.username} · {u.departmentName}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          {actionError ? (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
          ) : null}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-ink-muted">
              已选 <span className="font-medium text-ink tabular-nums">{addSelected.size}</span>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAddOpen(false)}>
                取消
              </Button>
              <Button loading={adding} disabled={addSelected.size === 0} onClick={() => void handleAddMembers()}>
                确定添加
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* 移除确认 */}
      <Dialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="确认移除成员"
        description={
          removeTarget ? `确定将选中的 ${String(removeTarget.ids.length)} 名成员移出该知识库吗？` : ""
        }
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
            取消
          </Button>
          <Button variant="destructive" loading={removing} onClick={() => void handleConfirmRemove()}>
            确认移除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
