"use client";

import { useState, type SyntheticEvent } from "react";
import { batchImportResponseSchema, type BatchImportResponse } from "@knowflow/shared";

import { Button } from "../../../../../components/ui/button";
import { Dialog } from "../../../../../components/ui/dialog";
import { Input } from "../../../../../components/ui/input";
import { apiRequest } from "../../../../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../../components/ui/table";
import { Badge } from "../../../../../components/ui/badge";

type BatchImportDialogProps = {
  open: boolean;
  onClose: () => void;
  knowledgeBaseId: string;
  onSuccess: () => Promise<void>;
};

export function BatchImportDialog({ open, onClose, knowledgeBaseId, onSuccess }: BatchImportDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchImportResponse | null>(null);

  function handleReset() {
    setError(null);
    setResult(null);
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      setError("请选择要导入的文件");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/knowledge-items/batch-import`,
        batchImportResponseSchema,
        {
          method: "POST",
          body: formData,
        }
      );
      setResult(response);
      if (response.imported > 0) {
        await onSuccess();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量导入失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="批量导入知识条目">
      {!result ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div className="text-sm text-ink-subtle">
            <p>支持格式：.csv, .xls, .xlsx</p>
            <p>列映射：标题 (title)、内容 (content)、摘要 (summary)。中英表头皆可。</p>
            <p>上限：500行。导入的条目初始状态为草稿且未启用。</p>
          </div>
          {error ? (
            <p className="text-sm text-danger bg-danger-bg px-3 py-2 rounded-md">{error}</p>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">选择文件</span>
            <Input
              name="file"
              type="file"
              required
              accept=".csv,.xls,.xlsx"
              className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              取消
            </Button>
            <Button type="submit" loading={submitting}>
              导入
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 py-2">
            <Badge tone="success">成功: {result.imported}</Badge>
            <Badge tone="warning">跳过(含空/无效行): {result.skipped}</Badge>
            <Badge tone={result.errors.length > 0 ? "danger" : "neutral"}>
              失败: {result.errors.length}
            </Badge>
          </div>
          {result.errors.length > 0 ? (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-20">行号</TableHeaderCell>
                    <TableHeaderCell>失败原因</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.errors.map((err, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{err.row}</TableCell>
                      <TableCell className="text-danger">{err.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={handleClose}>
              完成
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
