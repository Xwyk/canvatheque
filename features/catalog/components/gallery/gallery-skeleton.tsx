import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Cartes fantômes pendant le chargement (planche Galerie), annoncées une seule fois. */
export function GallerySkeleton({ count = 3, className }: { count?: number; className?: string }) {
  const t = useTranslations("gallery");
  return (
    <div
      role="status"
      aria-label={t("loadingMore")}
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] md:gap-6",
        className,
      )}
    >
      <span className="sr-only">{t("loadingMore")}</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex flex-col gap-3">
          <div className="aspect-square animate-pulse rounded-[20px] bg-muted" />
          <div className="h-[18px] w-[70%] rounded-md bg-muted" />
          <div className="h-3.5 w-[45%] rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
