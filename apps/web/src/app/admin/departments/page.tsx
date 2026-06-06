"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Department, UserOption, PlatformRole } from "@knowflow/shared";
import {
  departmentListResponseSchema,
  departmentSchema,
  departmentMembersResponseSchema,
  adminUserListResponseSchema,
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
import { DepartmentDialog } from "./_components/department-dialog";
import { AddMemberDialog } from "./_components/add-member-dialog";
import { MoveMemberDialog } from "./_components/move-member-dialog";

const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "超级管理员",
  department_admin: "部门管理员",
  user: "普通用户",
};

// ──────────────────────────────────────────────────────────────
// 页级守卫：super_admin 或 department_admin 才可进入
// 守卫之后不得再调用 Hooks —— 真正的页面逻辑放在 DepartmentsPageContent 内，
// 避免角色变化时 Hook 数量改变违反 React Hooks 规则。
// ──────────────────────────────────────────────────────────────
export default function DepartmentsPage() {
  const { user } = useAuth();
  const role = user?.platformRole;

  if (role !== "super_admin" && role !== "department_admin") {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto w-full bg-background">
        <div className="mx-auto max-w-5xl px-6 py-8">
        <EmptyState title="无权访问" description="此页面仅管理员可见。" />
      </div>
      </div>
    );
  }

  return <DepartmentsPageContent />;
}

// ──────────────────────────────────────────────────────────────
// 页面主体
// ──────────────────────────────────────────────────────────────
function DepartmentsPageContent() {
  const { user } = useAuth();
  const role = user?.platformRole;
  const isSuperAdmin = role === "super_admin";

  /* ── 部门列表 ── */
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /* ── 展开成员面板 ── */
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [members, setMembers] = useState<UserOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  /* ── 可分配用户（加人弹窗） ── */
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  /* ── 弹窗控制 ── */
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [addMemberDept, setAddMemberDept] = useState<Department | null>(null);
  const [movingMember, setMovingMember] = useState<UserOption | null>(null);

  // ─── 加载部门列表 ───
  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiRequest("/admin/departments", departmentListResponseSchema);
      setDepartments(data.items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载部门列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  // ─── 加载部门成员 ───
  const loadMembers = useCallback(async (deptId: string) => {
    setMembersLoading(true);
    try {
      const data = await apiRequest(
        `/admin/departments/${deptId}/members`,
        departmentMembersResponseSchema,
      );
      setMembers(data.items);
    } catch (err) {
      console.error("Failed to load members:", err);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  // ─── 加载可分配用户 ───
  const loadAvailableUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await apiRequest("/admin/users", adminUserListResponseSchema);
      setAvailableUsers(data.items);
    } catch (err) {
      console.error("Failed to load users:", err);
      setAvailableUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ─── 展开/收起成员 ───
  const toggleMembers = (deptId: string) => {
    if (expandedDeptId === deptId) {
      setExpandedDeptId(null);
      setMembers([]);
    } else {
      setExpandedDeptId(deptId);
      void loadMembers(deptId);
    }
  };

  // ─── 部门 CRUD ───
  const handleCreateDepartment = async (name: string) => {
    await apiRequest("/admin/departments", departmentSchema, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await loadDepartments();
  };

  const handleUpdateDepartment = async (name: string) => {
    if (editingDept === null) return;
    await apiRequest(`/admin/departments/${editingDept.id}`, departmentSchema, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    await loadDepartments();
  };

  const handleDeleteDepartment = async (deptId: string) => {
    if (!confirm("确认删除此部门？")) return;
    try {
      await apiRequest(`/admin/departments/${deptId}`, emptyObjectSchema, {
        method: "DELETE",
      });
      if (expandedDeptId === deptId) {
        setExpandedDeptId(null);
        setMembers([]);
      }
      await loadDepartments();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // 后端对非空部门返回 400，给出友好提示
        alert("该部门仍有成员或关联的知识库，无法删除。请先转移所有成员和资源后再试。");
      } else {
        alert(err instanceof Error ? err.message : "删除失败");
      }
    }
  };

  // ─── 成员操作 ───
  const handleAddMember = async (userId: string) => {
    if (addMemberDept === null) return;
    await apiRequest(`/admin/departments/${addMemberDept.id}/members`, emptyObjectSchema, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    // 刷新成员列表和部门列表（成员数变化）
    if (expandedDeptId === addMemberDept.id) {
      await Promise.all([loadMembers(addMemberDept.id), loadDepartments()]);
    } else {
      await loadDepartments();
    }
  };

  const handleMoveMember = async (targetDeptId: string) => {
    if (movingMember === null || expandedDeptId === null) return;
    // 移人端点是 DELETE 带 body { departmentId }（目标部门）
    await apiRequest(
      `/admin/departments/${expandedDeptId}/members/${movingMember.id}`,
      emptyObjectSchema,
      {
        method: "DELETE",
        body: JSON.stringify({ departmentId: targetDeptId }),
      },
    );
    // 刷新成员列表和部门列表（计数变化）
    await Promise.all([loadMembers(expandedDeptId), loadDepartments()]);
  };

  // ─── 弹窗控制 ───
  const openCreateDialog = () => {
    setEditingDept(null);
    setDeptDialogOpen(true);
  };

  const openEditDialog = (dept: Department) => {
    setEditingDept(dept);
    setDeptDialogOpen(true);
  };

  const closeDeptDialog = () => {
    setDeptDialogOpen(false);
    setEditingDept(null);
  };

  const openAddMemberDialog = (dept: Department) => {
    setAddMemberDept(dept);
    void loadAvailableUsers();
  };

  const closeAddMemberDialog = () => {
    setAddMemberDept(null);
    setAvailableUsers([]);
  };

  const openMoveMemberDialog = (member: UserOption) => {
    setMovingMember(member);
  };

  const closeMoveMemberDialog = () => {
    setMovingMember(null);
  };


  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* ── 页面头 ── */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">部门管理</h1>
        {isSuperAdmin ? <Button onClick={openCreateDialog}>新建部门</Button> : null}
      </div>

      {/* ── 主体区域 ── */}
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
            <Button
              variant="secondary"
              onClick={() => {
                void loadDepartments();
              }}
            >
              重试
            </Button>
          }
        />
      ) : departments.length === 0 ? (
        <EmptyState
          title="暂无部门"
          description={
            isSuperAdmin
              ? "点击「新建部门」创建第一个部门。"
              : "当前没有可管理的部门。"
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>部门名称</TableHeaderCell>
                <TableHeaderCell>成员数</TableHeaderCell>
                <TableHeaderCell>创建时间</TableHeaderCell>
                <TableHeaderCell className="text-right">操作</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <React.Fragment key={dept.id}>
                  <TableRow>
                    <TableCell className="font-medium text-ink">{dept.name}</TableCell>
                    <TableCell>{dept.memberCount ?? 0}</TableCell>
                    <TableCell className="text-ink-muted">
                      {new Date(dept.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            toggleMembers(dept.id);
                          }}
                        >
                          {expandedDeptId === dept.id ? "收起成员" : "查看成员"}
                        </Button>
                        {isSuperAdmin ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                openEditDialog(dept);
                              }}
                            >
                              改名
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              onClick={() => {
                                void handleDeleteDepartment(dept.id);
                              }}
                            >
                              删除
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* ── 展开成员面板 ── */}
                  {expandedDeptId === dept.id ? (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-neutral-50/60 px-6 py-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-ink">
                              「{dept.name}」的成员
                            </h3>
                            <Button
                              size="sm"
                              onClick={() => {
                                openAddMemberDialog(dept);
                              }}
                            >
                              添加成员
                            </Button>
                          </div>

                          {membersLoading ? (
                            <div className="space-y-2">
                              <div className="h-9 animate-pulse rounded bg-neutral-100" />
                              <div className="h-9 animate-pulse rounded bg-neutral-100" />
                            </div>
                          ) : members.length === 0 ? (
                            <p className="py-4 text-center text-sm text-ink-muted">暂无成员</p>
                          ) : (
                            <div className="divide-y divide-border rounded-lg border border-border bg-white">
                              {members.map((member) => (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between px-4 py-2.5"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-ink">
                                      {member.name}
                                    </span>
                                    <span className="text-xs text-ink-muted">
                                      {member.username}
                                    </span>
                                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-subtle">
                                      {ROLE_LABELS[member.platformRole]}
                                    </span>
                                  </div>
                                  {/* super_admin 才显示移人按钮；department_admin 不能移出本部门 */}
                                  {isSuperAdmin ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        openMoveMemberDialog(member);
                                      }}
                                    >
                                      移到其他部门
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── 弹窗 ── */}
      <DepartmentDialog
        open={deptDialogOpen}
        onClose={closeDeptDialog}
        initialName={editingDept?.name}
        onSubmit={editingDept !== null ? handleUpdateDepartment : handleCreateDepartment}
      />

      <AddMemberDialog
        open={addMemberDept !== null}
        onClose={closeAddMemberDialog}
        departmentId={addMemberDept?.id ?? ""}
        departmentName={addMemberDept?.name ?? ""}
        availableUsers={availableUsers}
        loadingUsers={usersLoading}
        onAdd={handleAddMember}
      />

      <MoveMemberDialog
        open={movingMember !== null}
        onClose={closeMoveMemberDialog}
        member={movingMember}
        sourceDepartmentId={expandedDeptId ?? ""}
        departments={departments}
        onMove={handleMoveMember}
      />
    </div>
  );
}
