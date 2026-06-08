"use client";

import { useState, useEffect } from "react";
import type { ModelCatalog } from "@knowflow/shared";
import { modelCatalogListResponseSchema, modelCatalogSchema } from "@knowflow/shared";

import { apiRequest, emptyObjectSchema } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { ModelDialog } from "./model-dialog";

type ModelCatalogListProps = {
  providerId: string;
  expanded: boolean;
};

export function ModelCatalogList({ providerId, expanded }: ModelCatalogListProps) {
  const [models, setModels] = useState<ModelCatalog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelCatalog | null>(null);
  const [pendingDeleteModelId, setPendingDeleteModelId] = useState<string | null>(null);

  useEffect(() => {
    if (expanded && !loaded) {
      void loadModels();
    }
  }, [expanded, loaded]);

  const loadModels = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(
        `/admin/model-providers/${providerId}/models`,
        modelCatalogListResponseSchema,
      );
      setModels(data.items);
      setLoaded(true);
    } catch (err) {
      console.error("Failed to load models:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: unknown) => {
    await apiRequest(`/admin/model-providers/${providerId}/models`, modelCatalogSchema, {
      method: "POST",
      body: JSON.stringify(data),
    });
    await loadModels();
  };

  const handleUpdate = async (data: unknown) => {
    if (editingModel === null) return;
    await apiRequest(`/admin/models/${editingModel.id}`, modelCatalogSchema, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    await loadModels();
  };

  const handleDelete = (modelId: string) => {
    setPendingDeleteModelId(modelId);
  };

  const doDeleteModel = async (modelId: string) => {
    await apiRequest(`/admin/models/${modelId}`, emptyObjectSchema, {
      method: "DELETE",
    });
    await loadModels();
  };

  const openCreateDialog = () => {
    setEditingModel(null);
    setDialogOpen(true);
  };

  const openEditDialog = (model: ModelCatalog) => {
    setEditingModel(model);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingModel(null);
  };

  if (!expanded) return null;

  if (loading && !loaded) {
    return (
      <div className="mt-3 rounded-md bg-surface-soft p-4">
        <p className="text-sm text-ink-muted">加载中...</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md bg-surface-soft p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">共 {models.length} 个模型</p>
        <Button size="sm" onClick={openCreateDialog}>
          新增模型
        </Button>
      </div>

      {models.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">暂无模型</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>模型名称</TableHeaderCell>
              <TableHeaderCell>类型</TableHeaderCell>
              <TableHeaderCell>上下文窗口</TableHeaderCell>
              <TableHeaderCell>流式输出</TableHeaderCell>
              <TableHeaderCell>状态</TableHeaderCell>
              <TableHeaderCell>操作</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {models.map((model) => (
              <TableRow key={model.id}>
                <TableCell className="font-medium">{model.modelName}</TableCell>
                <TableCell className="text-ink-muted">{model.modelType}</TableCell>
                <TableCell className="text-ink-muted">
                  {model.contextWindow !== null ? model.contextWindow.toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <Badge tone={model.supportsStreaming ? "success" : "neutral"}>
                    {model.supportsStreaming ? "支持" : "不支持"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={model.enabled ? "success" : "neutral"}>
                    {model.enabled ? "启用" : "禁用"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { openEditDialog(model); }}>
                      编辑
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { handleDelete(model.id); }}>
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ModelDialog
        key={editingModel?.id ?? "new"}
        open={dialogOpen}
        onClose={closeDialog}
        model={editingModel}
        onSubmit={editingModel === null ? handleCreate : handleUpdate}
      />

      <AlertDialog
        open={pendingDeleteModelId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDeleteModelId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除模型</AlertDialogTitle>
            <AlertDialogDescription>确认删除此模型？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const id = pendingDeleteModelId;
                setPendingDeleteModelId(null);
                if (id !== null) void doDeleteModel(id);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
