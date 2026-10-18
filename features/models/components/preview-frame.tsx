"use client";

import { ImageOff, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PreviewInfo } from "@/lib/storage/previews";

const ZOOM_STEPS = [1, 1.5, 2, 3];

/** Cadre d'aperçu 4:3 sur damier (transparence visible), zoom ± (planche Fiche). */
export function PreviewFrame({
  preview,
  alt,
  emptyLabel,
}: {
  preview: PreviewInfo | null;
  alt: string;
  emptyLabel: string;
}) {
  const t = useTranslations("publish.preview");
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex]!;
  return (
    <div className="bg-checker relative aspect-[4/3] w-full overflow-hidden rounded-[24px] border">
      {preview ? (
        <>
          <div className="size-full overflow-auto">
            {/* Aperçu servi par MinIO ; zoom par mise à l'échelle CSS. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.lg}
              srcSet={`${preview.md} 800w, ${preview.lg} 1600w`}
              sizes="(min-width: 1024px) 560px, 100vw"
              width={preview.width}
              height={preview.height}
              alt={alt}
              className="size-full object-contain transition-transform"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
            />
          </div>
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <button
              type="button"
              aria-label={t("zoomOut")}
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
              className="inline-flex size-11 items-center justify-center rounded-full bg-background shadow-fab disabled:opacity-40"
            >
              <Minus aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t("zoomIn")}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
              className="inline-flex size-11 items-center justify-center rounded-full bg-background shadow-fab disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          </div>
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff aria-hidden="true" className="size-10" />
          <span className="font-semibold">{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
