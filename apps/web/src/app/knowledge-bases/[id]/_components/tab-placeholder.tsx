"use client";

import { EmptyState } from "../../../../components/ui/feedback";

type TabPlaceholderProps = {
  title: string;
};

export function TabPlaceholder({ title }: TabPlaceholderProps) {
  return (
    <EmptyState
      title={title}
      description="该功能正在开发中,敬请期待。"
    />
  );
}
