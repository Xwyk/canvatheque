"use client";

import { Upload } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { pillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

/** Zone de dépôt (planche Publier) : glisser-déposer ou bouton « Choisir un fichier ». */
export function Dropzone({
  title,
  hint,
  buttonLabel,
  accept,
  disabled,
  onFile,
}: {
  title: string;
  hint: string;
  buttonLabel: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-3.5 rounded-[28px] border-3 border-dashed border-input bg-muted px-6 py-10 text-center transition-colors",
        dragging && "border-primary bg-tint-rose dark:bg-secondary",
        disabled && "opacity-60",
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-full bg-background"
      >
        <Upload className="size-7 text-primary" strokeWidth={2.2} />
      </span>
      <strong className="text-xl">{title}</strong>
      <span id={hintId} className="text-[15px] text-muted-foreground">
        {hint}
      </span>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={buttonLabel}
        aria-describedby={hintId}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
        className={pillButton({
          variant: "outline",
          size: "md",
          className: "min-h-12 bg-background px-6",
        })}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
