"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import type { KnowledgeTag } from "@knowflow/shared";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

type TagPickerPopoverProps = {
  allTags: KnowledgeTag[];
  selectedTagIds: string[];
  /** 全量替换：传入当前全部勾选的 tagId 数组 */
  onChange: (tagIds: string[]) => Promise<void>;
  children: ReactNode;
  disabled?: boolean;
};

export function TagPickerPopover({
  allTags,
  selectedTagIds,
  onChange,
  children,
  disabled = false,
}: TagPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(tagId: string) {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSaving(true);
    setError(null);
    try {
      await onChange(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0 bg-surface">
        <Command className="bg-surface">
          <CommandInput placeholder="搜索标签…" />
          <CommandList>
            <CommandEmpty>
              {allTags.length === 0 ? "暂无标签，请先在「管理标签」中创建" : "未找到匹配标签"}
            </CommandEmpty>
            <CommandGroup>
              {allTags.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    disabled={saving}
                    onSelect={() => void handleToggle(tag.id)}
                    className="gap-2"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked ? <CheckIcon className="size-3" /> : null}
                    </span>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                    <span className="truncate">{tag.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {error !== null ? (
            <p className="border-t border-border px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
