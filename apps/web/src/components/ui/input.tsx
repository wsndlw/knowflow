"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

import { cn } from "../../lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9.5 w-full rounded-md border bg-neutral-0 px-3 text-base text-ink",
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
