"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { documentProgressEventSchema, type DocumentProgressEvent } from "@knowflow/shared";

import { apiUrl } from "../../../../lib/api";

const ACTIVE_STATUSES = new Set(["pending", "parsing", "chunking", "embedding"]);

type DocumentWithStatus = { id: string; processStatus: string };

export function useDocumentProgress(
  documents: DocumentWithStatus[],
  onCompleted: () => void,
): Record<string, DocumentProgressEvent> {
  const [progressMap, setProgressMap] = useState<Record<string, DocumentProgressEvent>>({});
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const activeDocumentIds = useMemo(
    () =>
      documents
        .filter((doc) => ACTIVE_STATUSES.has(doc.processStatus))
        .map((doc) => doc.id)
        .sort(),
    [documents],
  );

  const depsKey = activeDocumentIds.join(",");

  useEffect(() => {
    // 仅依赖稳定的 depsKey，从中派生 id；避免 activeDocumentIds 每次渲染都是新数组引用导致 SSE 反复重连
    const ids = depsKey === "" ? [] : depsKey.split(",");
    if (ids.length === 0) return;

    let hasSseError = false;

    const eventSources = ids.map((docId) => {
      const es = new EventSource(apiUrl(`/documents/${docId}/progress`), {
        withCredentials: true,
      });
      es.onmessage = (event) => {
        try {
          const progress = documentProgressEventSchema.parse(
            JSON.parse(event.data as string),
          );
          setProgressMap((current) => ({
            ...current,
            [progress.documentId]: progress,
          }));
          if (progress.stage === "completed" || progress.stage === "failed") {
            onCompletedRef.current();
          }
        } catch {
          es.close();
        }
      };
      es.onerror = () => {
        hasSseError = true;
        es.close();
      };
      return es;
    });

    const pollingId = window.setInterval(() => {
      if (hasSseError) {
        onCompletedRef.current();
      }
    }, 10000);

    return () => {
      window.clearInterval(pollingId);
      eventSources.forEach((es) => es.close());
    };
  }, [depsKey]);

  return progressMap;
}
