"use client";

import { useState, useEffect, useMemo } from "react";
import type { Department, UserOption } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";

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
            <label htmlFor="target-dept" className="mb-1.5 block text-sm font-medium text-ink">
              目标部门
            </label>
            <select
              id="target-dept"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={targetDeptId}
              onChange={(e) => {
                setTargetDeptId(e.target.value);
                setError("");
              }}
              disabled={loading}
            >
              <option value="">请选择</option>
              {otherDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
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
