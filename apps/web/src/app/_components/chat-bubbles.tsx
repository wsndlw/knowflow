import {
  HelpCircle,
  AlertTriangle,
  Compass,
  ShieldAlert,
  AlertCircle,
  FileText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { type SyntheticEvent, useState } from "react";

import {
  type Citation,
  type ConfidenceLevel,
  type ConversationMessage,
  type FeedbackRating,
  type NoAnswerType,
} from "@knowflow/shared";

import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { cn } from "../../lib/cn";

export type DraftAssistantMessage = {
  id: string;
  conversationId: string;
  role: "assistant";
  content: string;
  confidenceLevel: ConfidenceLevel | null;
  noAnswerType: NoAnswerType | null;
  citations: Citation[];
  recommendedQuestions: string[];
  createdAt: string;
};

export type DisplayMessage = ConversationMessage | DraftAssistantMessage;

export const confidenceMeta: Record<ConfidenceLevel, { label: string; cls: string }> = {
  strong: { label: "依据充分", cls: "bg-success-bg text-success" },
  medium: { label: "依据一般", cls: "bg-info-bg text-info" },
  weak: { label: "依据不足", cls: "bg-warning-bg text-warning" },
  not_found: { label: "未找到依据", cls: "bg-neutral-100 text-ink-muted" },
};

export const noAnswerMeta: Record<
  NoAnswerType,
  {
    label: string;
    description: string;
    bgCls: string;
    textCls: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  no_answer: {
    label: "无匹配答案",
    description: "未在知识库中找到相关内容。",
    bgCls: "bg-neutral-50 border border-border",
    textCls: "text-ink-muted",
    icon: HelpCircle,
  },
  low_confidence: {
    label: "回答可信度较低",
    description: "此回答依据不足，可信度较低，请谨慎参考。",
    bgCls: "bg-warning-bg border border-warning/20",
    textCls: "text-warning",
    icon: AlertTriangle,
  },
  knowledge_gap: {
    label: "知识库空白",
    description: "知识库中尚无相关内容，无法回答该问题。",
    bgCls: "bg-info-bg border border-info/20",
    textCls: "text-info",
    icon: Compass,
  },
  permission_limited: {
    label: "权限受限",
    description: "受权限限制，无法读取与此问题相关的知识库文档。",
    bgCls: "bg-danger-bg border border-danger/20",
    textCls: "text-danger",
    icon: ShieldAlert,
  },
  attachment_parse_failed: {
    label: "附件解析失败",
    description: "上传的附件解析失败，无法提取有效信息进行回答。",
    bgCls: "bg-danger-bg border border-danger/20",
    textCls: "text-danger",
    icon: AlertCircle,
  },
};

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-base whitespace-pre-wrap text-white">
        {content}
      </div>
    </div>
  );
}

export function AssistantBubble({
  message,
  isStreaming,
  statusText,
  feedback,
  onFeedback,
  onCorrection,
  onRegenerate,
  onAskRecommended,
}: {
  message: DisplayMessage;
  isStreaming: boolean;
  statusText: string;
  feedback: FeedbackRating | undefined;
  onFeedback: (rating: FeedbackRating) => void;
  onCorrection: () => void;
  onRegenerate: () => void;
  onAskRecommended: (q: string) => void;
}) {
  const showSkeleton = isStreaming && message.content === "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
          AI
        </span>
        <div className="min-w-0 flex-1">
          {/* noAnswerType 提示 */}
          {!showSkeleton && message.noAnswerType ? (
            (() => {
              const meta = noAnswerMeta[message.noAnswerType];
              const Icon = meta.icon;
              return (
                <div className={cn("mb-3 flex items-start gap-2.5 rounded-lg border p-3 text-sm transition-all shadow-xs", meta.bgCls)}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", meta.textCls)} />
                  <div className="flex-1">
                    <span className={cn("font-semibold block", meta.textCls)}>
                      {meta.label}
                    </span>
                    <span className="text-ink-muted text-xs mt-0.5 block">
                      {meta.description}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : null}

          {showSkeleton ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="inline-flex gap-1" aria-hidden>
                <span className="size-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-brand-400 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-brand-400" />
              </span>
              {statusText || "思考中"}
            </p>
          ) : (
            <div className="text-base leading-relaxed text-ink">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
                components={{
                  p: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <p className="mb-2 last:mb-0" {...rest} />;
                  },
                  ul: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <ul className="mb-2 ml-5 list-disc space-y-1" {...rest} />;
                  },
                  ol: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <ol className="mb-2 ml-5 list-decimal space-y-1" {...rest} />;
                  },
                  li: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <li {...rest} />;
                  },
                  h1: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <h1 className="mb-3 mt-5 text-xl font-bold text-ink" {...rest} />;
                  },
                  h2: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <h2 className="mb-3 mt-4 text-lg font-bold text-ink" {...rest} />;
                  },
                  h3: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <h3 className="mb-2 mt-4 text-base font-semibold text-ink" {...rest} />;
                  },
                  h4: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <h4 className="mb-2 mt-3 text-sm font-semibold text-ink" {...rest} />;
                  },
                  a: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <a className="text-brand-600 underline hover:text-brand-700" target="_blank" rel="noopener noreferrer" {...rest} />;
                  },
                  strong: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <strong className="font-bold text-ink" {...rest} />;
                  },
                  pre: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, ...rest } = props;
                    return <pre className="my-3 overflow-x-auto rounded-md bg-neutral-100 p-3 text-sm" {...rest} />;
                  },
                  code: (props) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { node, className, children, ...rest } = props;
                    return !className ? (
                      <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-sm text-brand-700" {...rest}>
                        {children}
                      </code>
                    ) : (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* 引用展示区 */}
          {!showSkeleton && message.citations.length > 0 ? (
            <div className="mt-4 border-t border-dashed border-border pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                <FileText className="size-3.5 text-ink-subtle" />
                <span>引用来源</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(() => {
                  // 后端 contexts 已按分数降序排列（retrieval.service.ts），直接取前 3 条
                  return message.citations.slice(0, 3).map((citation, idx) => {
                    const content = (
                      <>
                        <span className="line-clamp-1 block text-sm font-medium text-ink transition-colors group-hover:text-brand-700">
                          [{idx + 1}] {citation.title}
                        </span>
                        {citation.knowledgeBaseName ? (
                          <span className="mt-0.5 line-clamp-1 block text-xs text-ink-subtle">
                            知识库: {citation.knowledgeBaseName}
                          </span>
                        ) : null}
                      </>
                    );
                    
                    if (citation.knowledgeBaseId !== null) {
                      return (
                        <a
                          key={citation.id ?? idx}
                          href={`/knowledge-bases/${citation.knowledgeBaseId}`}
                          className="group flex flex-col gap-0.5 rounded-lg border border-border bg-surface p-2.5 shadow-xs transition-all hover:border-brand-300 hover:bg-brand-50"
                        >
                          {content}
                        </a>
                      );
                    }
                    return (
                      <div
                        key={citation.id ?? idx}
                        className="flex flex-col gap-0.5 rounded-lg border border-border bg-neutral-50 p-2.5 shadow-xs"
                      >
                        {content}
                        <span className="mt-0.5 text-xs text-ink-subtle">(该文档已被删除)</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : null}

          {/* 可信度 + 元信息 */}
          {!message.id.startsWith("draft-") && message.confidenceLevel !== null ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                  confidenceMeta[message.confidenceLevel].cls,
                )}
              >
                {confidenceMeta[message.confidenceLevel].label}
              </span>
            </div>
          ) : null}

          {/* 操作按钮 */}
          {!message.id.startsWith("draft-") ? (
            <div className="mt-2 flex items-center gap-1">
              <IconAction label="复制" onClick={() => void navigator.clipboard.writeText(message.content)} />
              <IconAction label="重新生成" onClick={onRegenerate} />
              <IconAction
                label="赞"
                active={feedback === "useful"}
                disabled={feedback !== undefined}
                onClick={() => onFeedback("useful")}
              />
              <IconAction
                label="踩"
                active={feedback === "not_useful"}
                disabled={feedback !== undefined}
                onClick={() => onFeedback("not_useful")}
              />
              <IconAction label="纠错" onClick={onCorrection} />
              {feedback !== undefined ? (
                <span className="ml-1 text-xs text-ink-subtle">已反馈</span>
              ) : null}
            </div>
          ) : null}

          {/* 推荐问题 */}
          {message.recommendedQuestions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.recommendedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onAskRecommended(q)}
                  className="rounded-full border border-border bg-neutral-0 px-3 py-1 text-sm text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function IconAction({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-2 py-1 text-xs transition-colors duration-150",
        active ? "bg-brand-50 text-brand-700" : "text-ink-subtle hover:bg-neutral-100 hover:text-ink",
        disabled && !active ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      {label}
    </button>
  );
}

export function CorrectionDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    reason?: string;
    correctionContent: string;
    suggestedSource?: string;
    suggestedIngestion?: boolean;
  }) => void;
}) {
  const [correction, setCorrection] = useState("");
  const [source, setSource] = useState("");
  const [ingestion, setIngestion] = useState(false);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (correction.trim() === "") {
      return;
    }
    const trimmedSource = source.trim();
    onSubmit({
      correctionContent: correction.trim(),
      ...(trimmedSource === "" ? {} : { suggestedSource: trimmedSource }),
      suggestedIngestion: ingestion,
    });
    setCorrection("");
    setSource("");
    setIngestion(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="纠错反馈" description="帮助我们改进答案质量。">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">正确答案是什么</span>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            required
            placeholder="请填写你认为正确的答案"
            className="w-full resize-y rounded-md border border-border bg-neutral-0 px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">应该引用哪份资料(可选)</span>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="资料名称或位置"
            className="h-9.5 w-full rounded-md border border-border bg-neutral-0 px-3 text-base text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="flex items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            checked={ingestion}
            onChange={(e) => setIngestion(e.target.checked)}
            className="size-4 rounded border-border text-brand-600 focus:ring-brand-500/20"
          />
          建议补充到知识库
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={correction.trim() === ""}>
            提交纠错
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
