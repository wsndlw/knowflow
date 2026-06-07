"use client";

import { useEffect, useState } from "react";
import {
  retrievalSettingsSchema,
  knowledgeBaseSchema,
  type RetrievalSettings,
  type KnowledgeBaseStatus,
  RETRIEVAL_MODES,
} from "@knowflow/shared";
import { Button } from "../../../../components/ui/button";
import { Label } from "../../../../components/ui/label";
import { Slider } from "../../../../components/ui/slider";
import { Switch } from "../../../../components/ui/switch";
import { Select } from "../../../../components/ui/select";
import { Dialog } from "../../../../components/ui/dialog";
import { Skeleton } from "../../../../components/ui/feedback";
import { apiRequest, emptyObjectSchema } from "../../../../lib/api";

const RETRIEVAL_MODE_LABELS: Record<string, string> = {
  hybrid: "混合检索",
  hybrid_rerank: "混合检索 + Rerank",
  vector_only: "仅向量检索",
  fts_only: "仅全文检索",
  ki_only: "仅知识条目检索",
};

export function TabSettings({
  knowledgeBaseId,
  kbName,
  kbStatus,
  onStatusChanged,
}: {
  knowledgeBaseId: string;
  kbName: string;
  kbStatus: KnowledgeBaseStatus;
  onStatusChanged: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<RetrievalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiRequest(
          `/knowledge-bases/${knowledgeBaseId}/retrieval-settings`,
          retrievalSettingsSchema,
        );
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载设置失败");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [knowledgeBaseId]);

  async function handleSave(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!settings) return;

    if (settings.rerankKeepN > settings.rerankTopN) {
      setError("重排序后保留数量（rerankKeepN）不能大于重排序候选数量（rerankTopN）");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/retrieval-settings`,
        retrievalSettingsSchema,
        {
          method: "PUT",
          body: JSON.stringify(settings),
        },
      );
      setSettings(data);
      setSuccess("设置保存成功");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存设置失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    setToggling(true);
    setError(null);
    try {
      await apiRequest(`/knowledge-bases/${knowledgeBaseId}/disable`, emptyObjectSchema, {
        method: "POST",
      });
      setConfirmOpen(false);
      setSuccess("知识库已禁用，可随时重新启用");
      await onStatusChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "禁用失败");
    } finally {
      setToggling(false);
    }
  }

  async function handleEnable() {
    setToggling(true);
    setError(null);
    try {
      await apiRequest(`/knowledge-bases/${knowledgeBaseId}/enable`, knowledgeBaseSchema, {
        method: "POST",
      });
      setSuccess("知识库已启用");
      await onStatusChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "启用失败");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!settings) {
    return (
      <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
        {error ?? "无法加载设置"}
      </p>
    );
  }

  const isActive = kbStatus === "active";

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-8 max-w-2xl">
      {error ? (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-success-bg px-4 py-3 text-sm text-success">{success}</p>
      ) : null}

      <div className="flex flex-col gap-6">
        <h3 className="text-lg font-medium text-ink">基础检索设置</h3>
        
        <div className="flex flex-col gap-3">
          <Label>检索模式</Label>
          <Select
            value={settings.mode}
            onChange={(e) => setSettings({ ...settings, mode: e.target.value as typeof RETRIEVAL_MODES[number] })}
            className="max-w-xs"
          >
            {RETRIEVAL_MODES.map((m) => (
              <option key={m} value={m}>
                {RETRIEVAL_MODE_LABELS[m] ?? m}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between">
            <Label>Top K (最大召回数)</Label>
            <span className="text-sm font-medium text-ink tabular-nums">{settings.topK}</span>
          </div>
          <Slider
            min={1}
            max={50}
            step={1}
            value={[settings.topK]}
            onValueChange={([val]) => setSettings({ ...settings, topK: val ?? 1 })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between">
            <Label>相似度阈值 (Similarity Threshold)</Label>
            <span className="text-sm font-medium text-ink tabular-nums">{settings.similarityThreshold.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[settings.similarityThreshold]}
            onValueChange={([val]) => setSettings({ ...settings, similarityThreshold: val ?? 0 })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-medium text-ink">重排序 (Rerank)</h3>
            <p className="text-sm text-ink-muted">使用专用模型对初步召回结果进行精准重排</p>
          </div>
          <Switch
            checked={settings.rerankEnabled}
            onCheckedChange={(checked) => setSettings({ ...settings, rerankEnabled: checked })}
          />
        </div>

        {settings.rerankEnabled ? (
          <div className="flex flex-col gap-6 pl-4 border-l-2 border-border/50">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between">
                <Label>候选数量 (Rerank Top N)</Label>
                <span className="text-sm font-medium text-ink tabular-nums">{settings.rerankTopN}</span>
              </div>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[settings.rerankTopN]}
                onValueChange={([val]) => setSettings({ ...settings, rerankTopN: val ?? 1 })}
              />
              <p className="text-xs text-ink-muted">送入重排模型的文档块总数</p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between">
                <Label>保留数量 (Rerank Keep N)</Label>
                <span className="text-sm font-medium text-ink tabular-nums">{settings.rerankKeepN}</span>
              </div>
              <Slider
                min={1}
                max={50}
                step={1}
                value={[settings.rerankKeepN]}
                onValueChange={([val]) => setSettings({ ...settings, rerankKeepN: val ?? 1 })}
              />
              <p className="text-xs text-ink-muted">重排后最终返回的文档块数量，不能大于候选数量</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 border-t border-border pt-6">
        <h3 className="text-lg font-medium text-ink">混合检索权重配比</h3>
        <p className="text-sm text-ink-muted">仅在混合检索（或最终算分）时生效</p>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between">
            <Label>向量权重 (Vector Weight)</Label>
            <span className="text-sm font-medium text-ink tabular-nums">{settings.vectorWeight.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[settings.vectorWeight]}
            onValueChange={([val]) => setSettings({ ...settings, vectorWeight: val ?? 0 })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between">
            <Label>全文权重 (FTS Weight)</Label>
            <span className="text-sm font-medium text-ink tabular-nums">{settings.ftsWeight.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[settings.ftsWeight]}
            onValueChange={([val]) => setSettings({ ...settings, ftsWeight: val ?? 0 })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between">
            <Label>知识条目权重 (KI Weight)</Label>
            <span className="text-sm font-medium text-ink tabular-nums">{settings.kiWeight.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[settings.kiWeight]}
            onValueChange={([val]) => setSettings({ ...settings, kiWeight: val ?? 0 })}
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" loading={saving}>
          保存设置
        </Button>
      </div>
    </form>

      {/* 危险区域 */}
      <section className="flex max-w-2xl flex-col gap-3 rounded-lg border border-danger/40 bg-danger-bg/30 p-5">
        <div>
          <h3 className="text-base font-medium text-danger">危险区域</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {isActive
              ? "禁用知识库后，该库将不再参与检索、问答和 Agent 调用，可随时重新启用。"
              : "该知识库当前已禁用，不参与检索和问答。点击下方按钮可重新启用。"}
          </p>
        </div>
        <div>
          {isActive ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)}>
              禁用知识库
            </Button>
          ) : (
            <Button type="button" variant="secondary" loading={toggling} onClick={() => void handleEnable()}>
              启用知识库
            </Button>
          )}
        </div>
      </section>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认禁用知识库"
        description={`禁用「${kbName}」后，该库将不再参与检索、问答和 Agent 调用。你可以随时重新启用。`}
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            取消
          </Button>
          <Button variant="destructive" loading={toggling} onClick={() => void handleDisable()}>
            确认禁用
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

