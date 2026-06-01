"use client";

import { type ButtonHTMLAttributes, type ReactElement, cloneElement, forwardRef, isValidElement } from "react";

import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** 渲染为子元素(如 Link),避免 <a><button> 嵌套。loading 状态不适用 asChild。 */
  asChild?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50",
  secondary:
    "bg-neutral-0 text-ink border border-border hover:bg-neutral-50 active:bg-neutral-100 disabled:text-ink-subtle",
  ghost:
    "bg-transparent text-ink-muted hover:bg-neutral-100 hover:text-ink active:bg-neutral-200 disabled:text-ink-subtle",
  danger: "bg-danger text-white hover:opacity-90 active:opacity-80 disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-md gap-1.5",
  md: "h-9.5 px-4 text-base rounded-md gap-2",
  lg: "h-11 px-5 text-md rounded-lg gap-2",
};

const baseClasses =
  "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed";

type ChildWithClassName = ReactElement<{ className?: string }>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, asChild = false, disabled, className, children, ...props },
  ref,
) {
  const composed = cn(baseClasses, variantClasses[variant], sizeClasses[size], className);

  // asChild:把样式应用到子元素(如 Link),渲染单个 <a>,避免交互元素嵌套
  if (asChild && isValidElement(children)) {
    const child = children as ChildWithClassName;
    return cloneElement(child, { className: cn(composed, child.props.className) });
  }

  return (
    <button
      ref={ref}
      disabled={disabled === true || loading}
      className={composed}
      {...props}
    >
      {loading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
});
