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
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { Select } from "../../../../components/ui/select";
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
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // 初始化选中用户(仅在 userOptions 加载完且尚未选择时设置)
  useEffect(() => {
    if (!selectedUserId && userOptions.length > 0) {
      setSelectedUserId(userOptions[0]?.id ?? "");
    }
  }, [userOptions, selectedUserId]);

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
      await loadData();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleAddMember() {
    if (!selectedUserId) return;
    await runAction(async () => {
      await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/members`,
        emptyObjectSchema,
        { method: "POST", body: JSON.stringify({ userId: selectedUserId }) },
      );
    });
  }

  async function handleRemoveMember(memberId: string) {
    await runAction(async () => {
      await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/members/${memberId}`,
        emptyObjectSchema,
        { method: "DELETE" },
      );
    });
  }

  async function handleSetAdmin(memberId: string) {
    await runAction(async () => {
      await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/admins`,
        emptyObjectSchema,
        { method: "POST", body: JSON.stringify({ userId: memberId }) },
      );
    });
  }

  async function handleRemoveAdmin(memberId: string) {
    await runAction(async () => {
      await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/admins/${memberId}`,
        emptyObjectSchema,
        { method: "DELETE" },
      );
    });
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

  return (
    <div className="flex flex-col gap-4">
      {/* 添加成员 */}
      {canManage ? (
        <div className="flex items-center gap-2">
          <Select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="max-w-xs"
            aria-label="选择用户"
          >
            {userOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}({opt.username})- {opt.departmentName}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => void handleAddMember()} disabled={!selectedUserId}>
            添加成员
          </Button>
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
            <tr>
              <TableHeaderCell>姓名</TableHeaderCell>
              <TableHeaderCell>用户名</TableHeaderCell>
              <TableHeaderCell>部门</TableHeaderCell>
              <TableHeaderCell>角色</TableHeaderCell>
              <TableHeaderCell>KB 管理员</TableHeaderCell>
              {canManage ? <TableHeaderCell className="text-right">操作</TableHeaderCell> : null}
            </tr>
          </TableHead>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
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
                      <Button variant="ghost" size="sm" onClick={() => void handleRemoveMember(member.id)}>
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
    </div>
  );
}
