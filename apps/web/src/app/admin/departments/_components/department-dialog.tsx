"use client";

import { useState, useEffect } from "react";

import { Dialog } from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";

type DepartmentDialogProps = {
  open: boolean;
  onClose: () => void;
  /** 传入 string 则为编辑模式，undefined 则新建 */
  initialName: string | undefined;
  onSubmit: (name: string) => Promise<void>;
};

export function DepartmentDialog({
  open,
  onClose,
  initialName,
  onSubmit,
}: DepartmentDialogProps) {
  const isEdit = initialName !== undefined;
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 打开弹窗时重置表单
  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setError("");
      setLoading(false);
    }
  }, [open, initialName]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("部门名称不能为空");
      return;
    }
    if (trimmed.length > 120) {
      setError("部门名称不能超过 120 字");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "重命名部门" : "新建部门"}>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="dept-name" className="mb-1.5 block text-sm font-medium text-ink">
            部门名称 <span className="text-danger">*</span>
          </label>
          <Input
            id="dept-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="例如：研发部"
            disabled={loading}
            autoFocus
          />
          {error !== "" ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
