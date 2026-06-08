"use client";

import { useState } from "react";
import type { ModelCatalog, ModelType, CreateModelCatalogRequest, UpdateModelCatalogRequest } from "@knowflow/shared";

import { Dialog } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Checkbox } from "../../../components/ui/checkbox";
import { Button } from "../../../components/ui/button";

const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  chat: "对话",
  embedding: "向量嵌入",
  rerank: "重排",
  ocr: "OCR",
  vision: "视觉",
  moderation: "内容审核",
};

type FormData = {
  modelName: string;
  modelType: string;
  contextWindow: number | null;
  supportsStreaming: boolean;
  enabled: boolean;
};

type ModelDialogProps = {
  open: boolean;
  onClose: () => void;
  model?: ModelCatalog | null;
  onSubmit: (data: CreateModelCatalogRequest | UpdateModelCatalogRequest) => Promise<void>;
};

export function ModelDialog({ open, onClose, model, onSubmit }: ModelDialogProps) {
  const isEdit = model !== undefined && model !== null;

  const [formData, setFormData] = useState<FormData>(() => ({
    modelName: model?.modelName ?? "",
    modelType: model?.modelType ?? "",
    contextWindow: model?.contextWindow ?? null,
    supportsStreaming: model?.supportsStreaming ?? false,
    enabled: model?.enabled ?? true,
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleChange = (field: keyof FormData, value: string | boolean | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    if (!formData.modelName.trim()) {
      setErrors({ modelName: "模型名称不能为空" });
      return;
    }
    if (!formData.modelType) {
      setErrors({ modelType: "请选择模型类型" });
      return;
    }

    setLoading(true);
    try {
      const payload: CreateModelCatalogRequest | UpdateModelCatalogRequest = {
        modelName: formData.modelName,
        modelType: formData.modelType as ModelType,
        contextWindow: formData.contextWindow,
        supportsStreaming: formData.supportsStreaming,
        enabled: formData.enabled,
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : "操作失败" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      title={isEdit ? "编辑模型" : "新增模型"}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" form="model-form" disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </div>
      }
    >
      <form id="model-form" onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
        <div>
          <label htmlFor="modelName" className="mb-1.5 block text-sm font-medium text-ink">
            模型名称 <span className="text-danger">*</span>
          </label>
          <Input
            id="modelName"
            value={formData.modelName}
            onChange={(e) => handleChange("modelName", e.target.value)}
            placeholder="例如：gpt-4o"
            disabled={loading}
          />
          {errors["modelName"] !== undefined ? (
            <p className="mt-1 text-xs text-danger">{errors["modelName"]}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="modelType" className="mb-1.5 block text-sm font-medium text-ink">
            模型类型 <span className="text-danger">*</span>
          </label>
          <Select
            value={formData.modelType === "" ? undefined : formData.modelType}
            onValueChange={(next) => handleChange("modelType", next)}
            disabled={loading}
          >
            <SelectTrigger id="modelType" className="w-full">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MODEL_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors["modelType"] !== undefined ? (
            <p className="mt-1 text-xs text-danger">{errors["modelType"]}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="contextWindow" className="mb-1.5 block text-sm font-medium text-ink">
            上下文窗口(可选)
          </label>
          <Input
            id="contextWindow"
            type="number"
            value={formData.contextWindow ?? ""}
            onChange={(e) =>
              handleChange("contextWindow", e.target.value === "" ? null : Number(e.target.value))
            }
            placeholder="例如：128000"
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="supportsStreaming"
            checked={formData.supportsStreaming}
            onCheckedChange={(v) => handleChange("supportsStreaming", v === true)}
            disabled={loading}
          />
          <label htmlFor="supportsStreaming" className="text-sm text-ink">
            支持流式输出
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="enabled"
            checked={formData.enabled}
            onCheckedChange={(v) => handleChange("enabled", v === true)}
            disabled={loading}
          />
          <label htmlFor="enabled" className="text-sm text-ink">
            启用
          </label>
        </div>

        {errors["_form"] !== undefined ? (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            {errors["_form"]}
          </p>
        ) : null}

      </form>
    </Dialog>
  );
}
