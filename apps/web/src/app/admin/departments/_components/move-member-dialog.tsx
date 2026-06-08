"use client";

import { useState, useEffect, useMemo } from "react";
import type { Department, UserOption } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";

type MoveMemberDialogProps = {
  open: boolean;
  onClose: () => void;
  member: UserOption | null;
  sourceDepartmentId: string;
  departments: Department[];
  onMove: (targetDepartmentId: string) => Promise<void>;
};

export function MoveMemberDialog({
  open,
  onClose,
  member,
  sourceDepartmentId,
  departments,
  onMove,
}: MoveMemberDialogProps) {
  const [targetDeptId, setTargetDeptId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 过滤掉源部门
  const otherDepartments = useMemo(
    () => departments.filter((d) => d.id !== sourceDepartmentId),
    [departments, sourceDepartmentId],
  );

  useEffect(() => {
    if (open) {
      setTargetDeptId("");
      setError("");
      setLoading(false);
    }
  }, [open]);

  const handleMove = async () => {
    if (!targetDeptId) {
      setError("请选择目标部门");
      return;
    }
    setLoading(true);
    try {
      await onMove(targetDeptId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移动失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={member !== null ? `移动成员「${member.name}」` : "移动成员"}
    >
      <div className="flex flex-col gap-4">
        {member !== null ? (
          <p className="text-sm text-ink-muted">
            将 <span className="font-medium text-ink">{member.name}</span> 从当前部门移动到：
          </p>
        ) : null}

        {otherDepartments.length === 0 ? (
          <p className="text-sm text-ink-muted">没有其他部门可供选择，请先创建新部门。</p>
        ) : (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              目标部门
            </label>
            <Select
              value={targetDeptId}
              onValueChange={(next) => {
                setTargetDeptId(next);
                setError("");
              }}
              disabled={loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                {otherDepartments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
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
              void handleMove();
            }}
            disabled={loading || targetDeptId === ""}
          >
            {loading ? "移动中..." : "确认移动"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
