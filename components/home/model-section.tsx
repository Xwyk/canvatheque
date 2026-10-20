import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ModelGrid } from "@/components/model-card";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import type { CatalogItem } from "@/features/catalog/search";

/**
 * Section de cartes de l'accueil (planche Main) : titre, lien « Tout voir → » et grille.
 * Les aperçus restent en chargement différé : le hero occupe le premier écran (LCP).
 */
export function ModelSection({
  id,
  title,
  seeAllHref,
  seeAllHint,
  models,
  children,
}: {
  id: string;
  title: string;
  seeAllHref: string;
  /** Complément lu par les lecteurs d'écran : « Tout voir les derniers modèles ». */
  seeAllHint: string;
  models: CatalogItem[];
  /** Contenu affiché à la place de la grille (état vide). */
  children?: ReactNode;
}) {
  const t = useTranslations("homeSections");
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="container-page pt-12 md:pt-16">
      <div className="flex flex-col gap-5 md:gap-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id={titleId} className="m-0 text-2xl font-bold tracking-[-0.01em] md:text-[32px]">
            {title}
          </h2>
          {models.length > 0 && (
            <Link
              href={seeAllHref}
              className="inline-flex min-h-11 items-center gap-1 text-[15px] font-bold no-underline md:text-base"
            >
              {t("seeAll")} <span className="sr-only">{seeAllHint}</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
        {models.length > 0 ? (
          <ModelGrid>
            {models.map((model) => (
              <li key={model.id} className="min-w-0">
                <CatalogCard item={model} />
              </li>
            ))}
          </ModelGrid>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** « Populaires cette semaine » : masquée sans modèle à montrer. */
export function PopularSection({ models }: { models: CatalogItem[] }) {
  const t = useTranslations("homeSections");
  if (models.length === 0) return null;
  return (
    <ModelSection
      id="popular"
      title={t("popularTitle")}
      seeAllHref="/models?sort=popular"
      seeAllHint={t("popularSeeAllHint")}
      models={models}
    />
  );
}

/** « Derniers modèles » : état vide illustré quand le catalogue n'a encore rien publié. */
export function LatestSection({ models, empty }: { models: CatalogItem[]; empty: ReactNode }) {
  const t = useTranslations("homeSections");
  return (
    <ModelSection
      id="latest"
      title={t("latestTitle")}
      seeAllHref="/models"
      seeAllHint={t("latestSeeAllHint")}
      models={models}
    >
      {empty}
    </ModelSection>
  );
}
