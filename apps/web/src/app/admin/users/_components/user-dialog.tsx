"use client";

import { useState, useEffect } from "react";
import type { PlatformRole, Department } from "@knowflow/shared";
import { departmentListResponseSchema, type CreateUserRequest } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
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
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername("");
      setName("");
      setPassword("");
      setDepartmentId("");
      setPlatformRole("user");
      setFormError(null);

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
    setFormError(null);
    if (username.trim().length === 0 || name.trim().length === 0 || !departmentId) {
      setFormError("请填写完整信息");
      return;
    }
    if (password.length < 8) {
      setFormError("密码至少 8 位");
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
        {formError ? (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{formError}</p>
        ) : null}
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
            placeholder="密码(至少 8 位)"
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">部门</label>
          <Select
            value={departmentId}
            onValueChange={(next) => setDepartmentId(next)}
            disabled={loading}
            required
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择部门" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">角色</label>
          <Select
            value={platformRole}
            onValueChange={(next) => setPlatformRole(next as PlatformRole)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择角色" />
            </SelectTrigger>
            <SelectContent>
              {(["super_admin", "department_admin", "user"] as PlatformRole[]).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
