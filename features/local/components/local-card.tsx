"use client";

import { BadgeCheck, Image as ImageIcon, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { FormatBadge, ModelThumb, tintFor } from "@/components/model-card";
import { PathButton } from "@/features/local/components/path-button";
import { pillButton } from "@/components/ui/pill-button";
import type { LookupMatch } from "@/features/local/lookup-client";
import type { LocalEntry } from "@/features/local/scan";
import { formatFileSize } from "@/lib/format";
import type { PreviewInfo } from "@/lib/storage/previews";

/**
 * URL `blob:` d'un fichier local (aucun script exécuté par `<img>`), révoquée au démontage.
 * Révocation différée et annulée si l'effet se réexécute (double montage du mode strict).
 */
export function useObjectUrl(file: Blob | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const pending = useRef<{ url: string; timer: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    if (pending.current?.url === url) window.clearTimeout(pending.current.timer);
    return () => {
      pending.current = { url, timer: window.setTimeout(() => URL.revokeObjectURL(url), 1000) };
    };
  }, [url]);
  return url;
}

/** Aperçu affichable par ModelThumb à partir d'une seule URL (dimensions nominales). */
export function localPreview(url: string | null): PreviewInfo | null {
  return url ? { sm: url, md: url, lg: url, width: 400, height: 400 } : null;
}

export type LocalActions = {
  publish: (entry: LocalEntry) => void;
  thumbnail?: (entry: LocalEntry) => void;
};

/** Carte d'un fichier local : aperçu (SVG) ou miniature demandée (CWPRJ), chemin, actions. */
export function LocalCard({
  entry,
  folderName,
  file,
  thumbnail,
  match,
  actions,
}: {
  entry: LocalEntry;
  /** Nom du dossier choisi (début du chemin affiché). */
  folderName: string;
  /** Fichier de l'analyse en cours ; absent pour un index restauré. */
  file?: File;
  /** Miniature CWPRJ obtenue sur demande (URL `blob:`). */
  thumbnail?: string;
  match?: LookupMatch;
  actions: LocalActions;
}) {
  const t = useTranslations("local");
  const svgUrl = useObjectUrl(entry.format === "SVG" ? file : undefined);
  const preview = localPreview(svgUrl ?? thumbnail ?? null);
  const canPublish = !!file && !entry.tooLarge;
  const titleId = `local-${entry.id}`;

  return (
    <article aria-labelledby={titleId} className="relative flex min-w-0 flex-col gap-3">
      <ModelThumb preview={preview} tint={tintFor(entry.id)}>
        <FormatBadge format={entry.format} className="absolute top-3.5 left-3.5" />
        {match && (
          <Link
            href={`/models/${match.slug}`}
            aria-label={t("lookup.badgeLink", { title: match.title })}
            className="absolute right-2.5 bottom-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-success px-3 text-[13px] font-bold text-white no-underline dark:text-background"
          >
            <BadgeCheck aria-hidden="true" className="size-4" />
            {t("lookup.badge")}
          </Link>
        )}
      </ModelThumb>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={titleId} className="m-0 text-lg leading-tight font-bold break-words">
          {entry.name}
        </h3>
        <p className="m-0 truncate text-sm text-muted-foreground" title={entry.path}>
          {entry.folder ? t("card.folder", { folder: entry.folder }) : t("card.root")} ·{" "}
          {formatFileSize(entry.size)}
        </p>
        {entry.tooLarge && (
          <p className="m-0 text-sm font-semibold text-destructive">{t("card.tooLarge")}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canPublish}
          onClick={() => actions.publish(entry)}
          aria-label={t("card.publishLabel", { name: entry.name })}
          className={pillButton({ variant: "outline", size: "sm" })}
        >
          <Upload aria-hidden="true" className="size-4" />
          {t("card.publish")}
        </button>
        <PathButton name={entry.name} path={`${folderName}/${entry.path}`} />
        {entry.format === "CWPRJ" && actions.thumbnail && !thumbnail && file && (
          <button
            type="button"
            onClick={() => actions.thumbnail!(entry)}
            aria-label={t("card.thumbnailLabel", { name: entry.name })}
            title={t("card.thumbnailHint")}
            className={pillButton({ variant: "soft", size: "sm" })}
          >
            <ImageIcon aria-hidden="true" className="size-4" />
            {t("card.thumbnail")}
          </button>
        )}
      </div>
    </article>
  );
}
