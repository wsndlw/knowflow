"use client";

import { useState, useEffect } from "react";
import type { UserOption } from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";

type ResetPasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  user: UserOption | null;
  onSubmit: (password: string) => Promise<void>;
};

export function ResetPasswordDialog({ open, onClose, user, onSubmit }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
    }
  }, [open]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 8) {
      alert("密码长度不能小于 8 位");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="重置密码">
      <div className="mb-4 text-sm text-ink-muted">
        正在为 <span className="font-medium text-ink">{user?.name}</span> 重置密码。
      </div>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-ink">新密码</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 个字符"
            minLength={8}
            required
          />
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "提交中..." : "确认"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
