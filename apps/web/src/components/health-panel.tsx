"use client";

import { healthResponseSchema, type HealthResponse } from "@knowflow/shared";
import { useEffect, useState } from "react";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; data: HealthResponse }
  | { status: "error"; message: string };

export function HealthPanel() {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        const parsed = healthResponseSchema.parse(body);
        setState({ status: "ready", data: parsed });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "无法连接 API",
          });
        }
      }
    }

    void loadHealth();

    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return <div className="status-panel">正在检查服务状态...</div>;
  }

  if (state.status === "error") {
    return <div className="status-panel status-panel-error">API 连接失败：{state.message}</div>;
  }

  return (
    <div className="status-panel">
      <div>
        <span className={`status-dot status-${state.data.status}`} />
        <strong>API {state.data.status}</strong>
      </div>
      <dl className="dependency-list">
        <div>
          <dt>PostgreSQL</dt>
          <dd>{state.data.dependencies.database.status}</dd>
        </div>
        <div>
          <dt>Redis</dt>
          <dd>{state.data.dependencies.redis.status}</dd>
        </div>
      </dl>
    </div>
  );
}
