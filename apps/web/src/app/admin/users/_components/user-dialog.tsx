"use client";

import { useState, useEffect } from "react";
import type { PlatformRole, Department } from "@knowflow/shared";
import { departmentListResponseSchema, type CreateUserRequest } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";
import { apiRequest } from "../../../../lib/api";

const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "超级管理员",
  department_admin: "部门管理员",
  user: "普通用户",
};

type UserDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserRequest) => Promise<void>;
};

export function UserDialog({ open, onClose, onSubmit }: UserDialogProps) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [platformRole, setPlatformRole] = useState<PlatformRole>("user");
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setName("");
      setPassword("");
      setDepartmentId("");
      setPlatformRole("user");
      
      const loadDepts = async () => {
        setLoading(true);
        try {
          const data = await apiRequest("/admin/departments", departmentListResponseSchema);
          setDepartments(data.items);
        } catch (err) {
          console.error("Failed to load departments:", err);
        } finally {
          setLoading(false);
        }
      };
      void loadDepts();
    }
  }, [open]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (username.trim().length === 0 || name.trim().length === 0 || password.length === 0 || !departmentId) {
      alert("请填写完整信息");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        username: username.trim(),
        name: name.trim(),
        password,
        departmentId,
        platformRole,
      });
      onClose();
    } catch (err) {
      // The parent component handles error alert
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="新建用户">
      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4 py-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">用户名</label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="登录用的账号"
            maxLength={80}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">姓名</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="用户的真实姓名"
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">密码</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码(建议设置强密码)"
            required
            minLength={1}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">部门</label>
          <select
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-neutral-100 disabled:opacity-50"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            disabled={loading}
            required
          >
            <option value="">请选择部门</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">角色</label>
          <select
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            value={platformRole}
            onChange={(e) => setPlatformRole(e.target.value as PlatformRole)}
          >
            {(["super_admin", "department_admin", "user"] as PlatformRole[]).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" disabled={submitting || loading}>
            {submitting ? "提交中..." : "确认"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
