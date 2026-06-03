"use client";

import { useState } from "react";
import { CheckIcon, TagsIcon } from "lucide-react";
import type { KnowledgeTag } from "@knowflow/shared";

import { Button } from "@/components/ui/button";
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

type TagFilterPopoverProps = {
  allTags: KnowledgeTag[];
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
  onClear: () => void;
};

/** 列表标签筛选：多选 AND（同时包含所选标签才显示）。仅本地选中，由列表接口 ?tagIds= 实现过滤。 */
export function TagFilterPopover({
  allTags,
  selectedTagIds,
  onToggle,
  onClear,
}: TagFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const count = selectedTagIds.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <TagsIcon className="size-3.5" />
          标签筛选
          {count > 0 ? (
            <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 text-xs font-medium text-brand-700">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="搜索标签…" />
          <CommandList>
            <CommandEmpty>{allTags.length === 0 ? "暂无标签" : "未找到匹配标签"}</CommandEmpty>
            <CommandGroup heading="同时包含所选标签（AND）">
              {allTags.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() => onToggle(tag.id)}
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
          {count > 0 ? (
            <div className="border-t border-border p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={onClear}>
                清除筛选
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
