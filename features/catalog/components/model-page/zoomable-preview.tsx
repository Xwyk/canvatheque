"use client";

import { ImageOff, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PreviewInfo } from "@/lib/storage/previews";
import { cn } from "@/lib/utils";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
const BUTTON_FACTOR = 1.5;

type View = { scale: number; x: number; y: number };
const INITIAL: View = { scale: 1, x: 0, y: 0 };

const clampScale = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

/** Déplacement borné : l'image agrandie ne quitte pas le cadre. */
function clampView(view: View, frame: HTMLElement | null): View {
  const scale = clampScale(view.scale);
  if (scale === 1) return INITIAL;
  const width = frame?.clientWidth ?? 0;
  const height = frame?.clientHeight ?? 0;
  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, view.x)),
    y: Math.min(maxY, Math.max(-maxY, view.y)),
  };
}

const distance = (points: { x: number; y: number }[]) =>
  Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);

/**
 * Cadre d'aperçu de la fiche (planches Fiche et MobileFiche) : damier, 4:3 sur ordinateur et
 * carré sur mobile ; zoom par boutons ±, molette et pincement, déplacement au glisser.
 */
export function ZoomablePreview({
  preview,
  alt,
  emptyLabel,
}: {
  preview: PreviewInfo | null;
  alt: string;
  emptyLabel: string;
}) {
  const t = useTranslations("publish.preview");
  const tPage = useTranslations("modelPage");
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [view, setView] = useState<View>(INITIAL);
  const scaleRef = useRef(MIN_ZOOM);

  useEffect(() => {
    scaleRef.current = view.scale;
  }, [view.scale]);

  const update = (next: (current: View) => View) =>
    setView((current) => clampView(next(current), frameRef.current));

  // Molette : écouteur non passif pour empêcher le défilement pendant le zoom.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !preview) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      // Au zoom minimal, la molette vers le bas fait défiler la page normalement.
      if (event.deltaY > 0 && scaleRef.current <= MIN_ZOOM) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.002);
      setView((current) => clampView({ ...current, scale: current.scale * factor }, frame));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [preview]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const before = [...pointers.current.values()];
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (before.length >= 2) {
      // Pincement : rapport des écarts entre deux doigts.
      const after = [...pointers.current.values()];
      const ratio = distance(after) / (distance(before) || 1);
      update((current) => ({ ...current, scale: current.scale * ratio }));
    } else {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      update((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const zoomed = view.scale > MIN_ZOOM;

  return (
    <div className="bg-checker relative aspect-square w-full overflow-hidden rounded-[24px] border md:aspect-[4/3] md:rounded-[28px]">
      {preview ? (
        <>
          <div
            ref={frameRef}
            data-testid="preview-viewport"
            className={cn(
              "size-full select-none",
              zoomed ? "cursor-grab touch-none active:cursor-grabbing" : "touch-pan-y",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            {/* Aperçu servi par MinIO (origine autorisée par la CSP) ; image LCP de la fiche. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.lg}
              srcSet={`${preview.md} 800w, ${preview.lg} 1600w`}
              sizes="(min-width: 1024px) 660px, 100vw"
              width={preview.width}
              height={preview.height}
              alt={alt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
              className="pointer-events-none size-full object-contain p-6 transition-transform duration-120 md:p-10"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              }}
            />
          </div>
          <p className="sr-only" aria-live="polite">
            {tPage("zoomLevel", { percent: Math.round(view.scale * 100) })}
          </p>
          <div className="absolute right-4 bottom-4 flex gap-2">
            <button
              type="button"
              aria-label={t("zoomIn")}
              disabled={view.scale >= MAX_ZOOM}
              onClick={() =>
                update((current) => ({ ...current, scale: current.scale * BUTTON_FACTOR }))
              }
              className="inline-flex size-11 items-center justify-center rounded-md bg-background shadow-fab disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t("zoomOut")}
              disabled={!zoomed}
              onClick={() =>
                update((current) => ({ ...current, scale: current.scale / BUTTON_FACTOR }))
              }
              className="inline-flex size-11 items-center justify-center rounded-md bg-background shadow-fab disabled:opacity-40"
            >
              <Minus aria-hidden="true" className="size-5" />
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
