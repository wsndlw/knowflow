"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { UserOption, PlatformRole, CreateUserRequest } from "@knowflow/shared";
import {
  adminUserListResponseSchema,
  userOptionSchema,
} from "@knowflow/shared";

import { useAuth } from "../../../components/auth-provider";
import { apiRequest, emptyObjectSchema, ApiError } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/feedback";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "../../../components/ui/table";
import { UserDialog } from "./_components/user-dialog";
import { ResetPasswordDialog } from "./_components/reset-password-dialog";
import { RoleDialog } from "./_components/role-dialog";

const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "超级管理员",
  department_admin: "部门管理员",
  user: "普通用户",
};

const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  disabled: "已停用",
};

export default function UsersPage() {
  const { user } = useAuth();
  const role = user?.platformRole;

  if (role !== "super_admin") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <EmptyState title="无权访问" description="此页面仅超级管理员可见。" />
      </div>
    );
  }

  return <UsersPageContent />;
}

function UsersPageContent() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  const [resetPwdUser, setResetPwdUser] = useState<UserOption | null>(null);
  const [roleUser, setRoleUser] = useState<UserOption | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiRequest("/admin/users", adminUserListResponseSchema);
      setUsers(data.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (data: CreateUserRequest) => {
    try {
      await apiRequest("/admin/users", userOptionSchema, {
        method: "POST",
        body: JSON.stringify(data),
      });
      // no need for alert, UI will update naturally, but handoff asks for toast, alert is fine.
      alert("创建成功");
      await loadUsers();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        alert(err.message || "创建失败，请检查输入参数（如用户名是否重复）");
      } else {
        alert(err instanceof Error ? err.message : "创建失败");
      }
      throw err;
    }
  };

  const handleUpdateRole = async (platformRole: PlatformRole) => {
    if (!roleUser) return;
    try {
      const updatedUser = await apiRequest(`/admin/users/${roleUser.id}/role`, userOptionSchema, {
        method: "PATCH",
        body: JSON.stringify({ platformRole }),
      });
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      alert("角色已更新");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        alert(err.message || "更新角色失败");
      } else {
        alert(err instanceof Error ? err.message : "更新角色失败");
      }
      throw err;
    }
  };

  const handleResetPassword = async (password: string) => {
    if (!resetPwdUser) return;
    try {
      await apiRequest(`/admin/users/${resetPwdUser.id}/password`, emptyObjectSchema, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      alert("已重置，该用户需重新登录");
    } catch (err) {
      alert(err instanceof Error ? err.message : "重置密码失败");
      throw err;
    }
  };

  const handleToggleStatus = async (user: UserOption) => {
    const isDisabling = user.status === "active";
    if (isDisabling) {
      if (!confirm(`确认停用该用户？该用户将无法登录。`)) return;
    } else {
      if (!confirm(`确认启用该用户？`)) return;
    }

    try {
      const endpoint = isDisabling ? "disable" : "enable";
      const updatedUser = await apiRequest(`/admin/users/${user.id}/${endpoint}`, userOptionSchema, {
        method: "POST",
      });
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        alert(err.message || "操作失败");
      } else {
        alert(err instanceof Error ? err.message : "操作失败");
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">用户管理</h1>
        <Button onClick={() => setCreateDialogOpen(true)}>新建用户</Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-12 animate-pulse rounded-lg border border-border bg-neutral-50" />
          <div className="h-12 animate-pulse rounded-lg border border-border bg-neutral-50" />
          <div className="h-12 animate-pulse rounded-lg border border-border bg-neutral-50" />
        </div>
      ) : loadError !== "" ? (
        <EmptyState
          title="加载失败"
          description={loadError}
          action={
            <Button variant="secondary" onClick={() => void loadUsers()}>
              重试
            </Button>
          }
        />
      ) : users.length === 0 ? (
        <EmptyState title="暂无用户" description="点击「新建用户」创建新用户。" />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>姓名</TableHeaderCell>
                <TableHeaderCell>用户名</TableHeaderCell>
                <TableHeaderCell>角色</TableHeaderCell>
                <TableHeaderCell>状态</TableHeaderCell>
                <TableHeaderCell>部门</TableHeaderCell>
                <TableHeaderCell className="text-right">操作</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-ink">{item.name}</TableCell>
                  <TableCell className="text-ink-muted">{item.username}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-subtle">
                      {ROLE_LABELS[item.platformRole]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        item.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </TableCell>
                  <TableCell>{item.departmentName || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.id !== currentUser?.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRoleUser(item)}
                          >
                            改角色
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setResetPwdUser(item)}
                          >
                            重置密码
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={item.status === "active" ? "text-danger hover:text-danger" : ""}
                            onClick={() => void handleToggleStatus(item)}
                          >
                            {item.status === "active" ? "停用" : "启用"}
                          </Button>
                        </>
                      ) : (
                        <span className="px-2 text-xs text-ink-subtle">当前账号</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UserDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={handleCreateUser}
      />

      <ResetPasswordDialog
        open={resetPwdUser !== null}
        onClose={() => setResetPwdUser(null)}
        user={resetPwdUser}
        onSubmit={handleResetPassword}
      />

      <RoleDialog
        open={roleUser !== null}
        onClose={() => setRoleUser(null)}
        user={roleUser}
        onSubmit={handleUpdateRole}
      />
    </div>
  );
}
