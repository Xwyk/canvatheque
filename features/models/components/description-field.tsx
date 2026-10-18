"use client";

import { Bold, Italic, Link2, List, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { FieldShell, inputClass } from "@/components/forms/text-field";
import { DESCRIPTION_MAX_LENGTH } from "@/features/models/schemas";
import { applyMarkdownFormat, type MarkdownFormat } from "@/lib/markdown-format";
import { cn } from "@/lib/utils";

const TOOLS: { format: MarkdownFormat; icon: LucideIcon }[] = [
  { format: "bold", icon: Bold },
  { format: "italic", icon: Italic },
  { format: "list", icon: List },
  { format: "link", icon: Link2 },
];

/** Description Markdown avec barre d'outils (gras, italique, liste, lien). */
export function DescriptionField({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("publish.info");
  const textarea = useRef<HTMLTextAreaElement>(null);

  const format = (kind: MarkdownFormat) => {
    const element = textarea.current;
    if (!element) return;
    const result = applyMarkdownFormat(value, element.selectionStart, element.selectionEnd, kind);
    onChange(result.value);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <FieldShell id={id} label={t("description")} hint={t("descriptionHint")} error={error}>
      {(describedBy) => (
        <div className="flex flex-col gap-2">
          <div role="toolbar" aria-label={t("toolbar")} aria-controls={id} className="flex gap-1.5">
            {TOOLS.map(({ format: kind, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                onClick={() => format(kind)}
                aria-label={t(kind)}
                title={t(kind)}
                className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-input bg-background hover:border-ink"
              >
                <Icon aria-hidden="true" className="size-5" />
              </button>
            ))}
          </div>
          <textarea
            ref={textarea}
            id={id}
            value={value}
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={7}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            className={cn(inputClass, "h-auto min-h-40 resize-y py-3 leading-normal")}
          />
        </div>
      )}
    </FieldShell>
  );
}
