"use client";

import { type TextareaHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib/cn";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-24 w-full resize-y rounded-md border bg-neutral-0 px-3 py-2.5 text-base text-ink",
        "placeholder:text-ink-subtle",
        "transition-colors duration-150",
        "hover:border-neutral-300",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20",
        "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-ink-subtle",
        invalid
          ? "border-danger focus:border-danger focus:ring-danger/20"
          : "border-border",
        className,
      )}
      {...props}
    />
  );
});
