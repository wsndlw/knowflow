"use client";

import { useState } from "react";
import type { ModelProvider, TestModelProviderResponse } from "@knowflow/shared";

import { cn } from "../../../lib/cn";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { apiRequest } from "../../../lib/api";
import { testModelProviderResponseSchema } from "@knowflow/shared";

type ProviderCardProps = {
  provider: ModelProvider;
  onEdit: () => void;
  onDelete: () => void;
  onToggleModels: () => void;
  modelsExpanded: boolean;
};

export function ProviderCard({
  provider,
  onEdit,
  onDelete,
  onToggleModels,
  modelsExpanded,
}: ProviderCardProps) {
  const [testResult, setTestResult] = useState<TestModelProviderResponse | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiRequest(
        `/admin/model-providers/${provider.id}/test`,
        testModelProviderResponseSchema,
        { method: "POST", body: JSON.stringify({}) },
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        modelName: null,
        error: err instanceof Error ? err.message : "连接测试失败",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{provider.name}</h3>
            <Badge tone={provider.enabled ? "success" : "neutral"}>
              {provider.enabled ? "启用" : "禁用"}
            </Badge>
            {provider.hasApiKey ? (
              <span className="inline-flex size-2 rounded-full bg-success" title="已配置密钥" />
            ) : (
              <span className="inline-flex size-2 rounded-full bg-neutral" title="未配置密钥" />
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">{provider.providerType}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{provider.baseUrl}</p>
          {provider.apiKeyPreview !== null ? (
            <p className="mt-1 font-mono text-xs text-ink-muted">{provider.apiKeyPreview}</p>
          ) : null}
          {provider.remark !== null && provider.remark.trim().length > 0 ? (
            <p className="mt-2 text-sm text-ink-muted">{provider.remark}</p>
          ) : null}

          {testResult !== null ? (
            <div className="mt-3">
              {testResult.ok ? (
                <div className="flex items-center gap-1.5 text-sm text-success">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    className="size-4"
                    aria-hidden
                  >
                    <path
                      d="M13.5 4.5L6 12L2.5 8.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    {testResult.latencyMs}ms
                    {testResult.modelName !== null ? ` · ${testResult.modelName}` : ""}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-sm text-danger">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  >
                    <path
                      d="M12 4L4 12M4 4l8 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="break-words">{testResult.error ?? "测试失败"}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" onClick={() => void handleTest()} disabled={testing}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            编辑
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={onToggleModels}
          className="flex w-full items-center justify-between text-left text-sm font-medium text-ink transition-colors hover:text-brand-600"
        >
          <span>模型目录</span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className={cn("size-4 transition-transform", modelsExpanded && "rotate-180")}
            aria-hidden
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
