"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { pillButton } from "@/components/ui/pill-button";
import { activeFilterCount, type CatalogFilters } from "@/features/catalog/params";
import { useGallery } from "./gallery-context";
import { GalleryFilters } from "./gallery-filters";

/**
 * Sous 1024 px : bouton « Filtres (2) » ouvrant les filtres en panneau latéral. Sans
 * JavaScript, le panneau ne peut pas s'ouvrir : la colonne de filtres reste alors affichée.
 */
export function MobileFilters({ total, className }: { total: number; className?: string }) {
  const t = useTranslations("gallery");
  const { filters } = useGallery();
  const count = activeFilterCount(filters as CatalogFilters);

  return (
    <Dialog>
      <DialogTrigger className={pillButton({ variant: "outline", size: "md", className })}>
        <SlidersHorizontal aria-hidden="true" className="size-5" />
        {t("filtersButton", { count })}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-[min(360px,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none rounded-r-[28px] p-0 shadow-dialog sm:max-w-none data-open:slide-in-from-left data-closed:slide-out-to-left"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-popover px-5 pt-5 pb-3">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-2xl font-bold">{t("filtersPanelTitle")}</DialogTitle>
            <DialogDescription className="text-sm text-text-secondary">
              {t("filtersPanelDescription")}
            </DialogDescription>
          </div>
          <DialogClose
            aria-label={t("closeFilters")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>
        <GalleryFilters className="px-5 pb-4" />
        <div className="sticky bottom-0 mt-auto border-t bg-popover px-5 py-4">
          <DialogClose className={pillButton({ size: "lg", className: "w-full" })}>
            {t("showResults", { count: total })}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
