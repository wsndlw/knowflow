"use client";

import { useState, useEffect } from "react";
import type { ModelProvider } from "@knowflow/shared";
import { modelProviderListResponseSchema, modelProviderSchema } from "@knowflow/shared";

import { useAuth } from "../../components/auth-provider";
import { apiRequest, emptyObjectSchema } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/feedback";
import { ProviderDialog } from "./_components/provider-dialog";
import { ProviderCard } from "./_components/provider-card";
import { ModelCatalogList } from "./_components/model-catalog-list";
import { UsagePolicyPanel } from "./_components/usage-policy-panel";

export default function ModelsPage() {
  const { user } = useAuth();

  // 页级守卫:非超管不渲染内容组件,也不发任何请求。
  // 守卫之后不得再调用 Hooks —— 真正的页面逻辑放在 ModelsPageContent 内,
  // 避免角色变化(如退出登录)时 Hook 数量改变违反 React Hooks 规则。
  if (user?.platformRole !== "super_admin") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <EmptyState title="无权访问" description="此页面仅超级管理员可见。" />
      </div>
    );
  }

  return <ModelsPageContent />;
}

function ModelsPageContent() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);

  useEffect(() => {
    void loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/admin/model-providers", modelProviderListResponseSchema);
      setProviders(data.items);
    } catch (err) {
      console.error("Failed to load providers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: unknown) => {
    await apiRequest("/admin/model-providers", modelProviderSchema, {
      method: "POST",
      body: JSON.stringify(data),
    });
    await loadProviders();
  };

  const handleUpdate = async (data: unknown) => {
    if (editingProvider === null) return;
    await apiRequest(`/admin/model-providers/${editingProvider.id}`, modelProviderSchema, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    await loadProviders();
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm("确认删除此供应商？关联的模型也会被删除。")) return;
    await apiRequest(`/admin/model-providers/${providerId}`, emptyObjectSchema, {
      method: "DELETE",
    });
    await loadProviders();
  };

  const openCreateDialog = () => {
    setEditingProvider(null);
    setDialogOpen(true);
  };

  const openEditDialog = (provider: ModelProvider) => {
    setEditingProvider(provider);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingProvider(null);
  };

  const toggleModels = (providerId: string) => {
    setExpandedProviderId((prev) => (prev === providerId ? null : providerId));
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">模型配置</h1>
        <Button onClick={openCreateDialog}>新增供应商</Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-lg border border-border bg-neutral-50" />
          <div className="h-28 animate-pulse rounded-lg border border-border bg-neutral-50" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            {providers.length === 0 ? (
              <EmptyState
                title="暂无供应商配置"
                description="添加模型供应商后,即可在对话与知识库问答中调用其模型。"
              />
            ) : (
              providers.map((provider) => (
                <div key={provider.id}>
                  <ProviderCard
                    provider={provider}
                    onEdit={() => { openEditDialog(provider); }}
                    onDelete={() => {
                      handleDelete(provider.id).catch(console.error);
                    }}
                    onToggleModels={() => toggleModels(provider.id)}
                    modelsExpanded={expandedProviderId === provider.id}
                  />
                  <ModelCatalogList
                    providerId={provider.id}
                    expanded={expandedProviderId === provider.id}
                  />
                </div>
              ))
            )}
          </div>

          <UsagePolicyPanel />
        </div>
      )}

      </div>
      <ProviderDialog
        open={dialogOpen}
        onClose={closeDialog}
        provider={editingProvider}
        onSubmit={editingProvider === null ? handleCreate : handleUpdate}
      />
    </div>
  );
}
