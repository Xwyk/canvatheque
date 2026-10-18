import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { catalogSearchParams } from "@/features/catalog/params";
import type { CatalogItem } from "@/features/catalog/search";
import { BackToTop } from "./back-to-top";
import { EmptyState, type EmptyKind } from "./empty-state";
import { GalleryProvider, type GalleryCategory } from "./gallery-context";
import { GalleryFilters as FiltersForm } from "./gallery-filters";
import { galleryHref, pickGalleryFilters, type GalleryFilters } from "./gallery-href";
import { GalleryResults } from "./gallery-results";
import { GallerySearch } from "./gallery-search";
import { MobileFilters } from "./mobile-filters";
import { ResultsToolbar } from "./results-toolbar";

export const GALLERY_TITLE_ID = "galerie-titre";

/** Sans JavaScript (media query `scripting`), les filtres restent visibles à toute largeur. */
const NO_SCRIPT_BLOCK = "[@media(scripting:none)]:block";

/**
 * Écran de galerie (planche Galerie), commun à `/models` et `/categories/[slug]` (préfiltré
 * par `locked`). Recherche, filtres et tri vivent dans l'URL.
 */
export function GalleryScreen({
  title,
  intro,
  before,
  filters: input,
  locked = null,
  categories,
  items,
  nextCursor,
  total,
}: {
  title: string;
  intro?: string;
  /** Au-dessus du titre (fil d'Ariane). */
  before?: ReactNode;
  filters: GalleryFilters;
  locked?: string | null;
  categories: GalleryCategory[];
  items: CatalogItem[];
  nextCursor: string | null;
  total: number;
}) {
  const t = useTranslations("gallery");
  const filters = pickGalleryFilters(input);
  const pageHref = galleryHref(filters, locked);
  const query = catalogSearchParams(filters).toString();
  const base = locked ? `/categories/${locked}` : "/models";
  // Recherche ou filtres au-delà de la catégorie de la page (le tri seul ne vide rien).
  const narrowed =
    galleryHref({ ...filters, sort: filters.q ? "relevance" : "recent" }, locked) !== base;
  const emptyKind: EmptyKind = narrowed ? "refined" : locked ? "category" : "catalog";

  return (
    <GalleryProvider filters={filters} categories={categories} locked={locked}>
      <div className="container-page flex flex-col pb-12">
        <section className="flex flex-col gap-5 pt-6 pb-8">
          {before}
          <h1
            id={GALLERY_TITLE_ID}
            tabIndex={-1}
            className="m-0 text-[clamp(34px,4.5vw,48px)] leading-[1.08] font-extrabold tracking-[-0.02em] outline-none"
          >
            {title}
          </h1>
          {intro && <p className="m-0 max-w-[720px] text-text-secondary">{intro}</p>}
          <GallerySearch />
        </section>

        <div className="flex flex-col gap-x-10 gap-y-6 lg:flex-row lg:items-start">
          <aside
            aria-label={t("filtersLabel")}
            className={`hidden w-full lg:block lg:w-60 lg:shrink-0 ${NO_SCRIPT_BLOCK}`}
          >
            <FiltersForm />
          </aside>

          <section
            aria-labelledby="galerie-resultats"
            className="flex min-w-0 flex-1 flex-col gap-6"
          >
            <h2 id="galerie-resultats" className="sr-only">
              {t("resultsLabel")}
            </h2>
            <MobileFilters
              total={total}
              className="self-start lg:hidden [@media(scripting:none)]:hidden"
            />
            <ResultsToolbar total={total} />
            {items.length > 0 ? (
              <GalleryResults
                key={query}
                initialItems={items}
                initialCursor={nextCursor}
                query={query}
                pageHref={pageHref}
              />
            ) : (
              <EmptyState kind={emptyKind} resetHref={base} />
            )}
          </section>
        </div>
      </div>
      <BackToTop targetId={GALLERY_TITLE_ID} />
    </GalleryProvider>
  );
}
