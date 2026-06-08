"use client";

import { useState, useEffect, useMemo } from "react";
import type { UserOption } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";

type AddMemberDialogProps = {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
  availableUsers: UserOption[];
  loadingUsers: boolean;
  onAdd: (userId: string) => Promise<void>;
};

export function AddMemberDialog({
  open,
  onClose,
  departmentId,
  departmentName,
  availableUsers,
  loadingUsers,
  onAdd,
}: AddMemberDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 过滤掉已在本部门的用户
  const filteredUsers = useMemo(
    () => availableUsers.filter((u) => u.departmentId !== departmentId),
    [availableUsers, departmentId],
  );

  useEffect(() => {
    if (open) {
      setSelectedUserId("");
      setError("");
      setLoading(false);
    }
  }, [open]);

  const handleAdd = async () => {
    if (!selectedUserId) {
      setError("请选择用户");
      return;
    }
    setLoading(true);
    try {
      await onAdd(selectedUserId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`添加成员到「${departmentName}」`}>
      <div className="flex flex-col gap-4">
        {loadingUsers ? (
          <div className="space-y-2">
            <div className="h-9 animate-pulse rounded bg-neutral-100" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="text-sm text-ink-muted">暂无可分配的用户（所有用户均已在本部门）。</p>
        ) : (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              选择用户
            </label>
            <Select
              value={selectedUserId}
              onValueChange={(next) => {
                setSelectedUserId(next);
                setError("");
              }}
              disabled={loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {filteredUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}（{u.username}）— 当前：{u.departmentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {error !== "" ? (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={() => {
              void handleAdd();
            }}
            disabled={loading || selectedUserId === ""}
          >
            {loading ? "添加中..." : "添加"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
