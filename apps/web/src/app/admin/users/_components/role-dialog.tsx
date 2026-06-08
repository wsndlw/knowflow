"use client";

import { useState, useEffect } from "react";
import type { UserOption, PlatformRole } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";

const ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: "超级管理员",
  department_admin: "部门管理员",
  user: "普通用户",
};

type RoleDialogProps = {
  open: boolean;
  onClose: () => void;
  user: UserOption | null;
  onSubmit: (role: PlatformRole) => Promise<void>;
};

export function RoleDialog({ open, onClose, user, onSubmit }: RoleDialogProps) {
  const [role, setRole] = useState<PlatformRole>("user");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && user) {
      setRole(user.platformRole);
    }
  }, [open, user]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(role);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="更改角色">
      <div className="mb-4 text-sm text-ink-muted">
        更改用户 <span className="font-medium text-ink">{user?.name}</span> 的角色。
      </div>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">选择角色</label>
          <Select
            value={role}
            onValueChange={(next) => setRole(next as PlatformRole)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择角色" />
            </SelectTrigger>
            <SelectContent>
              {(["super_admin", "department_admin", "user"] as PlatformRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" disabled={submitting || role === user?.platformRole}>
            {submitting ? "提交中..." : "确认"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
