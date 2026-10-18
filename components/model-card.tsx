import { Download } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SHAPES } from "@/components/shapes";
import type { ModelFormat } from "@/lib/generated/prisma/enums";
import type { PreviewInfo } from "@/lib/storage/previews";
import { cn } from "@/lib/utils";

export type ModelCardData = {
  title: string;
  authorPseudo: string;
  format: ModelFormat;
  preview: PreviewInfo | null;
  downloadCount?: number;
};

/** Badge de format (CWPRJ : encre sur blanc ; SVG : encre sur jaune). */
export function FormatBadge({ format, className }: { format: ModelFormat; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-bold tracking-[0.04em]",
        format === "SVG" ? "bg-highlight text-highlight-foreground" : "bg-ink text-ink-foreground",
        className,
      )}
    >
      {format}
    </span>
  );
}

/** Aperçu carré 1:1 (cover) sur fond pastel, ou forme décorative en l'absence d'aperçu. */
export function ModelThumb({
  preview,
  size = "sm",
  className,
  children,
}: {
  preview: PreviewInfo | null;
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-[20px] bg-tint-teal dark:bg-muted",
        className,
      )}
    >
      {preview ? (
        // Aperçu servi par MinIO (origine autorisée par la CSP), dimensions connues.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview[size]}
          srcSet={`${preview.sm} 400w, ${preview.md} 800w`}
          sizes="(min-width: 768px) 280px, 50vw"
          width={preview.width}
          height={preview.height}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <svg viewBox="0 0 100 100" aria-hidden="true" className="size-[58%] fill-success/40">
          <path d={SHAPES.butterfly} />
        </svg>
      )}
      {children}
    </div>
  );
}

/** Carte de modèle (planches Main et Galerie). Sans `href`, carte statique (aperçu). */
export function ModelCard({
  model,
  href,
  badge,
  className,
}: {
  model: ModelCardData;
  href?: string;
  badge?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("modelCard");
  const title = href ? (
    <Link
      href={href}
      className="text-foreground no-underline after:absolute after:inset-0 after:rounded-3xl hover:text-primary"
    >
      {model.title}
    </Link>
  ) : (
    model.title
  );
  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-3xl border bg-card p-3.5 shadow-card",
        className,
      )}
    >
      <ModelThumb preview={model.preview}>
        <FormatBadge format={model.format} className="absolute top-3.5 left-3.5" />
        {badge}
      </ModelThumb>
      <div className="flex flex-col gap-1 px-1 pb-1">
        <h3 className="m-0 font-sans text-lg leading-snug font-bold break-words">{title}</h3>
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="truncate">{t("by", { pseudo: model.authorPseudo })}</span>
          {model.downloadCount !== undefined && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Download aria-hidden="true" className="size-4" />
              <span className="sr-only">{t("downloads", { count: model.downloadCount })}</span>
              <span aria-hidden="true">{model.downloadCount}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
