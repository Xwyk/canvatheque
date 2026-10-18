"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { pillButton } from "@/components/ui/pill-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Crop } from "@/lib/images/preview";

/** Recadrage carré d'après le zoom (1 à 4) et la position (0 à 1) dans l'image. */
export function squareCrop(
  width: number,
  height: number,
  zoom: number,
  positionX: number,
  positionY: number,
): Crop {
  const side = Math.min(width, height) / zoom;
  const left = positionX * (width - side);
  const top = positionY * (height - side);
  return { x: left / width, y: top / height, width: side / width, height: side / height };
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-[15px] font-bold">
        {label}
        <span className="font-semibold text-text-secondary">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full accent-primary"
      />
    </div>
  );
}

/**
 * Recadrage simple d'une image d'aperçu (carré, comme les cartes de la galerie) avant envoi.
 * Les curseurs sont utilisables au clavier ; « Image entière » envoie l'image sans recadrage.
 */
export function CropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  onCancel: () => void;
  onConfirm: (crop: Crop | undefined) => void;
}) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-[28px] p-6 shadow-dialog sm:max-w-[500px] md:p-8"
      >
        {/* Une instance par fichier : état et URL locale repartent de zéro. */}
        {file && (
          <CropEditor
            key={`${file.name}-${file.size}-${file.lastModified}`}
            file={file}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CropEditor({
  file,
  onConfirm,
}: {
  file: File;
  onConfirm: (crop: Crop | undefined) => void;
}) {
  const t = useTranslations("publish.crop");
  const [url] = useState(() => URL.createObjectURL(file));
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0.5);
  const [positionY, setPositionY] = useState(0.5);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const crop = size ? squareCrop(size.width, size.height, zoom, positionX, positionY) : null;
  const percent = (value: number) => `${Math.round(value * 100)} %`;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <DialogTitle className="text-[28px] leading-tight font-bold">{t("title")}</DialogTitle>
        <DialogClose
          aria-label={t("close")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
        >
          <X aria-hidden="true" className="size-5" />
        </DialogClose>
      </div>
      <DialogDescription className="text-[15px] text-text-secondary">
        {t("description")}
      </DialogDescription>

      <div className="bg-checker relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[20px]">
        {url && (
          // Aperçu local (blob:) du fichier choisi.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={t("imageAlt")}
            onLoad={(event) =>
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="absolute max-w-none"
            style={
              crop
                ? {
                    width: `${100 / crop.width}%`,
                    height: `${100 / crop.height}%`,
                    left: `${(-crop.x / crop.width) * 100}%`,
                    top: `${(-crop.y / crop.height) * 100}%`,
                  }
                : { width: "100%", height: "100%", objectFit: "contain" }
            }
          />
        )}
      </div>

      <RangeField
        label={t("zoom")}
        value={zoom}
        min={1}
        max={4}
        step={0.05}
        display={`× ${zoom.toFixed(1).replace(".", ",")}`}
        onChange={setZoom}
      />
      <RangeField
        label={t("horizontal")}
        value={positionX}
        min={0}
        max={1}
        step={0.01}
        display={percent(positionX)}
        onChange={setPositionX}
      />
      <RangeField
        label={t("vertical")}
        value={positionY}
        min={0}
        max={1}
        step={0.01}
        display={percent(positionY)}
        onChange={setPositionY}
      />

      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={() => onConfirm(undefined)}
          className={pillButton({ variant: "outline", size: "lg" })}
        >
          {t("whole")}
        </button>
        <button
          type="button"
          disabled={!crop}
          onClick={() => crop && onConfirm(crop)}
          className={pillButton({ size: "lg" })}
        >
          {t("apply")}
        </button>
      </div>
    </>
  );
}
