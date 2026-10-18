import Link from "next/link";
import { useTranslations } from "next-intl";
import { SHAPES } from "@/components/shapes";
import { pillButton } from "@/components/ui/pill-button";

export type EmptyKind = "refined" | "category" | "catalog";

/**
 * État vide illustré : avec recherche ou filtres, invitation à élargir (`resetHref`) ;
 * catégorie ou catalogue vides, invitation à publier.
 */
export function EmptyState({ kind, resetHref }: { kind: EmptyKind; resetHref: string }) {
  const t = useTranslations("gallery");
  return (
    <div className="flex flex-col items-center gap-4 rounded-[28px] bg-muted px-6 py-12 text-center md:py-16">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-24 fill-primary/30">
        <path d={SHAPES.butterfly} />
      </svg>
      <h2 className="m-0 text-2xl font-bold">{t(`empty.${kind}.title`)}</h2>
      <p className="m-0 max-w-[460px] text-text-secondary">{t(`empty.${kind}.text`)}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {kind === "refined" ? (
          <Link href={resetHref} className={pillButton({ size: "md" })}>
            {t("reset")}
          </Link>
        ) : (
          <Link href="/publish" className={pillButton({ size: "md" })}>
            {t("publish")}
          </Link>
        )}
        {kind !== "catalog" && (
          <Link href="/models" className={pillButton({ variant: "outline", size: "md" })}>
            {t("seeAll")}
          </Link>
        )}
      </div>
    </div>
  );
}
