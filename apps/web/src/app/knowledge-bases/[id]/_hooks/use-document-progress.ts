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
    if (activeDocumentIds.length === 0) return;

    const eventSources = activeDocumentIds.map((docId) => {
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
        es.close();
      };
      return es;
    });

    const pollingId = window.setInterval(() => {
      onCompletedRef.current();
    }, 3000);

    return () => {
      window.clearInterval(pollingId);
      eventSources.forEach((es) => es.close());
    };
  }, [depsKey, activeDocumentIds]);

  return progressMap;
}
