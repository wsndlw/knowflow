"use client";

import { useState, useEffect } from "react";
import type { ModelUsagePolicy, ModelCatalog, ModelUsageType } from "@knowflow/shared";
import {
  modelUsagePolicyListResponseSchema,
  modelUsagePolicySchema,
  modelCatalogListResponseSchema,
} from "@knowflow/shared";

import { apiRequest } from "../../../lib/api";
import { MODEL_USAGE_TYPE_LABELS } from "../../../lib/constants";
import { Select } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";

export function UsagePolicyPanel() {
  const [policies, setPolicies] = useState<ModelUsagePolicy[]>([]);
  const [allModels, setAllModels] = useState<ModelCatalog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [policiesData, modelsData] = await Promise.all([
        apiRequest("/admin/model-usage-policies", modelUsagePolicyListResponseSchema),
        apiRequest("/admin/models", modelCatalogListResponseSchema),
      ]);
      setPolicies(policiesData.items);
      setAllModels(modelsData.items.filter((m) => m.enabled));
    } catch (err) {
      console.error("Failed to load usage policies:", err);
    } finally {
      setLoading(false);
    }
  };

  // 乐观更新 + PATCH;失败则重新拉取回滚。返回体用实体 schema 解析(后端返回完整 policy)。
  const commit = async (
    usageType: ModelUsageType,
    field: string,
    value: string | boolean | number | null,
  ) => {
    setPolicies((prev) =>
      prev.map((p) => (p.usageType === usageType ? { ...p, [field]: value } : p)),
    );
    try {
      await apiRequest(`/admin/model-usage-policies/${usageType}`, modelUsagePolicySchema, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
    } catch (err) {
      console.error("Failed to update policy:", err);
      await loadData();
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-ink-muted">加载中...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-semibold text-ink">用途映射配置</h2>
      <div className="space-y-4">
        {policies.map((policy) => {
          const label = MODEL_USAGE_TYPE_LABELS[policy.usageType];
          return (
            <div
              key={policy.usageType}
              className="grid grid-cols-1 gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[180px_1fr_100px_200px] sm:items-center sm:gap-4"
            >
              <div>
                <p className="text-sm font-medium text-ink">{label}</p>
                <p className="text-xs text-ink-muted">{policy.usageType}</p>
              </div>

              <div>
                <label
                  htmlFor={`default-${policy.usageType}`}
                  className="mb-1 block text-xs text-ink-muted"
                >
                  默认模型
                </label>
                <Select
                  id={`default-${policy.usageType}`}
                  value={policy.defaultModelId ?? ""}
                  onChange={(e) =>
                    void commit(
                      policy.usageType,
                      "defaultModelId",
                      e.target.value === "" ? null : e.target.value,
                    )
                  }
                  className="text-sm"
                >
                  <option value="">请选择</option>
                  {allModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.providerName} / {model.modelName}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enabled-${policy.usageType}`}
                  checked={policy.enabled}
                  onChange={(e) => void commit(policy.usageType, "enabled", e.target.checked)}
                  className="size-4"
                />
                <label htmlFor={`enabled-${policy.usageType}`} className="text-xs text-ink">
                  启用
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor={`temp-${policy.usageType}`}
                    className="mb-1 block text-xs text-ink-muted"
                  >
                    温度
                  </label>
                  {/* 非受控 + onBlur 提交:避免每次按键都 PATCH,支持输入小数中间态;
                      key 含当前值,乐观更新/回滚后重建以保持显示同步 */}
                  <Input
                    key={`temp-${policy.usageType}-${String(policy.temperature)}`}
                    id={`temp-${policy.usageType}`}
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    defaultValue={policy.temperature}
                    onBlur={(e) => {
                      const next = parseFloat(e.target.value);
                      if (!Number.isNaN(next) && next !== policy.temperature) {
                        void commit(policy.usageType, "temperature", next);
                      }
                    }}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`tokens-${policy.usageType}`}
                    className="mb-1 block text-xs text-ink-muted"
                  >
                    最大输出
                  </label>
                  <Input
                    key={`tokens-${policy.usageType}-${String(policy.maxOutputTokens)}`}
                    id={`tokens-${policy.usageType}`}
                    type="number"
                    defaultValue={policy.maxOutputTokens ?? ""}
                    onBlur={(e) => {
                      const raw = e.target.value;
                      const next = raw === "" ? null : parseInt(raw, 10);
                      if (next !== null && Number.isNaN(next)) return;
                      if (next !== policy.maxOutputTokens) {
                        void commit(policy.usageType, "maxOutputTokens", next);
                      }
                    }}
                    placeholder="默认"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
