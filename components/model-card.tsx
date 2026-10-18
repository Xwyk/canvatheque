import { Download } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar, stableIndex } from "@/components/avatar";
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

/** Fonds pastel des cartes (maquettes), choisis de façon stable par modèle. */
const TINTS = [
  "bg-tint-rose",
  "bg-tint-teal",
  "bg-tint-yellow",
  "bg-tint-lilac",
  "bg-tint-green",
  "bg-tint-blue",
  "bg-tint-peach",
] as const;

export function tintFor(key: string): string {
  return TINTS[stableIndex(key, TINTS.length)]!;
}

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
  tint = "bg-tint-teal",
  priority = false,
  className,
  children,
}: {
  preview: PreviewInfo | null;
  size?: "sm" | "md";
  tint?: string;
  /** Première carte visible : chargement immédiat (LCP). */
  priority?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-[20px] dark:bg-muted",
        tint,
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
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
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

/**
 * Carte de modèle. `plain` (galerie, accueil, fiche : planches Main et Galerie) : aperçu sur
 * fond pastel, titre, avatar et pseudo, téléchargements. `framed` (récapitulatif de
 * publication, « Mes modèles ») : carte bordée. Sans `href`, carte statique.
 */
export function ModelCard({
  model,
  href,
  badge,
  variant = "framed",
  tintKey,
  priority,
  className,
}: {
  model: ModelCardData;
  href?: string;
  badge?: ReactNode;
  variant?: "framed" | "plain";
  /** Clé du fond pastel (id du modèle) ; sinon fond sarcelle. */
  tintKey?: string;
  priority?: boolean;
  className?: string;
}) {
  const t = useTranslations("modelCard");
  const plain = variant === "plain";
  const title = href ? (
    <Link
      href={href}
      className={cn(
        "text-foreground no-underline after:absolute after:inset-0 hover:text-primary",
        plain ? "after:rounded-[20px]" : "after:rounded-3xl",
      )}
    >
      {model.title}
    </Link>
  ) : (
    model.title
  );
  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col gap-3",
        !plain && "rounded-3xl border bg-card p-3.5 shadow-card",
        className,
      )}
    >
      <ModelThumb
        preview={model.preview}
        tint={tintKey ? tintFor(tintKey) : undefined}
        priority={priority}
      >
        <FormatBadge format={model.format} className="absolute top-3.5 left-3.5" />
        {badge}
      </ModelThumb>
      <div className={cn("flex flex-col gap-1.5", !plain && "px-1 pb-1")}>
        <h3 className="m-0 font-sans text-lg leading-tight font-bold break-words">{title}</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {plain && <Avatar pseudo={model.authorPseudo} />}
          <span className="min-w-0 truncate">
            {plain ? model.authorPseudo : t("by", { pseudo: model.authorPseudo })}
          </span>
          {model.downloadCount !== undefined && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1">
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

/** Grille de cartes (maquettes : `auto-fill`, minimum 220 ou 240 px). */
export function ModelGrid({
  children,
  min = 240,
  className,
}: {
  children: ReactNode;
  min?: 220 | 240;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "m-0 grid list-none gap-x-6 gap-y-8 p-0",
        min === 220
          ? "grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
          : "grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]",
        "max-md:gap-x-4 max-md:gap-y-6",
        className,
      )}
    >
      {children}
    </ul>
  );
}
