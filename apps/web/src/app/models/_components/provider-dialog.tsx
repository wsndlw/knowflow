"use client";

import { useState } from "react";
import type {
  ModelProvider,
  ModelProviderType,
  CreateModelProviderRequest,
  UpdateModelProviderRequest,
} from "@knowflow/shared";

import { Dialog } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Select } from "../../../components/ui/select";
import { Button } from "../../../components/ui/button";
import { Textarea } from "../../../components/ui/textarea";

const PROVIDER_TYPE_LABELS: Record<ModelProviderType, string> = {
  openai: "OpenAI",
  azure_openai: "Azure OpenAI",
  aliyun: "阿里云",
  zhipu: "智谱 AI",
  deepseek: "DeepSeek",
  moonshot: "Moonshot",
  ollama: "Ollama",
  openai_compatible: "OpenAI 兼容",
};

type FormData = {
  name: string;
  providerType: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  timeoutMs: number;
  retryCount: number;
  concurrencyLimit: number;
  dailyQuota: number | null;
  remark: string | null;
};

type ProviderDialogProps = {
  open: boolean;
  onClose: () => void;
  provider?: ModelProvider | null;
  onSubmit: (data: CreateModelProviderRequest | UpdateModelProviderRequest) => Promise<void>;
};

export function ProviderDialog({ open, onClose, provider, onSubmit }: ProviderDialogProps) {
  const isEdit = provider !== undefined && provider !== null;

  const [formData, setFormData] = useState<FormData>(() => ({
    name: provider?.name ?? "",
    providerType: provider?.providerType ?? "",
    baseUrl: provider?.baseUrl ?? "",
    apiKey: "",
    enabled: provider?.enabled ?? true,
    timeoutMs: provider?.timeoutMs ?? 30000,
    retryCount: provider?.retryCount ?? 3,
    concurrencyLimit: provider?.concurrencyLimit ?? 10,
    dailyQuota: provider?.dailyQuota ?? null,
    remark: provider?.remark ?? "",
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [clearKey, setClearKey] = useState(false);

  const handleChange = (field: keyof FormData, value: string | boolean | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    if (!formData.name.trim()) {
      setErrors({ name: "名称不能为空" });
      return;
    }
    if (!formData.providerType) {
      setErrors({ providerType: "请选择供应商类型" });
      return;
    }
    try {
      new URL(formData.baseUrl);
    } catch {
      setErrors({ baseUrl: "请输入有效的 URL" });
      return;
    }

    setLoading(true);
    try {
      const payload: CreateModelProviderRequest | UpdateModelProviderRequest = {
        name: formData.name,
        providerType: formData.providerType as ModelProviderType,
        baseUrl: formData.baseUrl,
        enabled: formData.enabled,
        timeoutMs: formData.timeoutMs,
        retryCount: formData.retryCount,
        concurrencyLimit: formData.concurrencyLimit,
        dailyQuota: formData.dailyQuota,
        remark: formData.remark,
      };

      if (isEdit) {
        if (clearKey) {
          payload.apiKey = null;
        } else if (formData.apiKey && formData.apiKey.trim().length > 0) {
          payload.apiKey = formData.apiKey;
        }
      } else {
        if (formData.apiKey && formData.apiKey.trim().length > 0) {
          payload.apiKey = formData.apiKey;
        }
      }

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : "操作失败" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "编辑供应商" : "新增供应商"}>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
            名称 <span className="text-danger">*</span>
          </label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="例如：主 OpenAI"
            disabled={loading}
          />
          {errors["name"] !== undefined ? (
            <p className="mt-1 text-xs text-danger">{errors["name"]}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="providerType" className="mb-1.5 block text-sm font-medium text-ink">
            供应商类型 <span className="text-danger">*</span>
          </label>
          <Select
            id="providerType"
            value={formData.providerType}
            onChange={(e) => handleChange("providerType", e.target.value)}
            disabled={loading || isEdit}
          >
            <option value="">请选择</option>
            {Object.entries(PROVIDER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {errors["providerType"] !== undefined ? (
            <p className="mt-1 text-xs text-danger">{errors["providerType"]}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="baseUrl" className="mb-1.5 block text-sm font-medium text-ink">
            Base URL <span className="text-danger">*</span>
          </label>
          <Input
            id="baseUrl"
            value={formData.baseUrl}
            onChange={(e) => handleChange("baseUrl", e.target.value)}
            placeholder="https://api.openai.com/v1"
            disabled={loading}
          />
          {errors["baseUrl"] !== undefined ? (
            <p className="mt-1 text-xs text-danger">{errors["baseUrl"]}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="apiKey" className="mb-1.5 block text-sm font-medium text-ink">
            API Key {isEdit ? "(留空保持不变)" : ""}
          </label>
          <Input
            id="apiKey"
            type="password"
            value={formData.apiKey}
            onChange={(e) => handleChange("apiKey", e.target.value)}
            placeholder={isEdit ? "密钥未修改" : "sk-..."}
            disabled={loading || clearKey}
          />
          {isEdit && provider.hasApiKey ? (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="checkbox"
                id="clearKey"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
                disabled={loading}
                className="size-4"
              />
              <label htmlFor="clearKey" className="text-sm text-ink-muted">
                清除密钥
              </label>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="timeoutMs" className="mb-1.5 block text-sm font-medium text-ink">
              超时(ms)
            </label>
            <Input
              id="timeoutMs"
              type="number"
              value={formData.timeoutMs}
              onChange={(e) => handleChange("timeoutMs", Number(e.target.value))}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="retryCount" className="mb-1.5 block text-sm font-medium text-ink">
              重试次数
            </label>
            <Input
              id="retryCount"
              type="number"
              value={formData.retryCount}
              onChange={(e) => handleChange("retryCount", Number(e.target.value))}
              disabled={loading}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="concurrencyLimit"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              并发限制
            </label>
            <Input
              id="concurrencyLimit"
              type="number"
              value={formData.concurrencyLimit}
              onChange={(e) => handleChange("concurrencyLimit", Number(e.target.value))}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="dailyQuota" className="mb-1.5 block text-sm font-medium text-ink">
              每日配额(可选)
            </label>
            <Input
              id="dailyQuota"
              type="number"
              value={formData.dailyQuota ?? ""}
              onChange={(e) =>
                handleChange("dailyQuota", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="不限制"
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label htmlFor="remark" className="mb-1.5 block text-sm font-medium text-ink">
            备注
          </label>
          <Textarea
            id="remark"
            value={formData.remark ?? ""}
            onChange={(e) => handleChange("remark", e.target.value)}
            placeholder="可选"
            rows={3}
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={formData.enabled}
            onChange={(e) => handleChange("enabled", e.target.checked)}
            disabled={loading}
            className="size-4"
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
