"use client";

import { AlertDialog } from "radix-ui";
import { pillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

/** Confirmation d'une action sensible (suppression…) : focus piégé, Échap annule. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[28px] bg-popover p-6 text-popover-foreground shadow-dialog outline-none md:p-8",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          <AlertDialog.Title className="m-0 text-2xl leading-tight font-bold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="m-0 text-text-secondary">
            {description}
          </AlertDialog.Description>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <AlertDialog.Cancel className={pillButton({ variant: "outline", size: "lg" })}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <button
              type="button"
              disabled={pending}
              onClick={onConfirm}
              className={pillButton({
                size: "lg",
                className:
                  "border-destructive bg-destructive text-white hover:border-destructive hover:bg-destructive/90 hover:text-white dark:text-background dark:hover:text-background",
              })}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
