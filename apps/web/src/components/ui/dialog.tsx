"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "../../lib/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        "m-auto w-full max-w-md rounded-xl border border-border bg-surface p-0 shadow-lg",
        "backdrop:bg-neutral-950/40",
        className,
      )}
    >
      {open ? (
        <div className="flex flex-col">
          <div className="px-6 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description !== undefined ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          <div className="px-6 py-2">{children}</div>
          {footer !== undefined ? (
            <div className="flex justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
