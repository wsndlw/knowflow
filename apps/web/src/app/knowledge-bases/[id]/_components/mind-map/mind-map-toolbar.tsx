"use client";

import { PlusIcon, SaveIcon, SparklesIcon, UploadIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { AddTopicDialog } from "./add-topic-dialog";

type MindMapToolbarProps = {
  hasNodes: boolean;
  dirty: boolean;
  generating: boolean;
  saving: boolean;
  publishing: boolean;
  onGenerate: () => void;
  onSave: () => void;
  onPublish: () => void;
  onAddTopic: (title: string) => void;
};

export function MindMapToolbar({
  hasNodes,
  dirty,
  generating,
  saving,
  publishing,
  onGenerate,
  onSave,
  onPublish,
  onAddTopic,
}: MindMapToolbarProps) {
  const busy = generating || saving || publishing;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 生成（二次确认：会覆盖草稿） */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy} className="gap-1.5">
            <SparklesIcon className="size-4" />
            {hasNodes ? "重新生成" : "生成思维导图"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>生成思维导图</AlertDialogTitle>
            <AlertDialogDescription>
              将基于当前知识库的文档与条目重新分析结构，覆盖当前草稿。已发布版本不受影响。确认继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onGenerate}>确认生成</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 添加主题 */}
      <AddTopicDialog
        onAdd={onAddTopic}
        trigger={
          <Button variant="outline" size="sm" disabled={busy || !hasNodes} className="gap-1.5">
            <PlusIcon className="size-4" />
            添加主题
          </Button>
        }
      />

      {/* 保存 */}
      <Button
        variant="outline"
        size="sm"
        disabled={busy || !hasNodes || !dirty}
        onClick={onSave}
        className="gap-1.5"
      >
        <SaveIcon className="size-4" />
        {saving ? "保存中…" : "保存"}
        {dirty ? <Badge tone="warning">未保存</Badge> : null}
      </Button>

      {/* 发布（二次确认） */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={busy || !hasNodes} className="gap-1.5">
            <UploadIcon className="size-4" />
            {publishing ? "发布中…" : "发布"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>发布思维导图</AlertDialogTitle>
            <AlertDialogDescription>
              发布后，知识库所有成员都能看到这张知识关系图。未保存的改动会一并发布。确认继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onPublish}>确认发布</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
