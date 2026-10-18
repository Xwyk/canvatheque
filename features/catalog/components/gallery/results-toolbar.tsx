"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { SORTS, type CatalogSort } from "@/features/catalog/params";
import { NO_SCRIPT_ONLY } from "./gallery-filters";
import { interceptClick, useGallery } from "./gallery-context";
import { galleryHref, type GalleryFilters } from "./gallery-href";

type Chip = { key: string; label: string; next: GalleryFilters };

function useChips(): Chip[] {
  const t = useTranslations("gallery");
  const { filters, categories } = useGallery();
  const without = <K extends "formats" | "categories" | "licenses" | "tags">(
    key: K,
    value: string,
  ): GalleryFilters => ({
    ...filters,
    [key]: (filters[key] as string[]).filter((v) => v !== value),
  });
  return [
    ...filters.formats.map((format) => ({
      key: `format-${format}`,
      label: t(`formatChip.${format}`),
      next: without("formats", format),
    })),
    ...filters.categories.map((slug) => ({
      key: `category-${slug}`,
      label: categories.find((category) => category.slug === slug)?.name ?? slug,
      next: without("categories", slug),
    })),
    ...filters.licenses.map((group) => ({
      key: `license-${group}`,
      label: t(`licenseGroups.${group}`),
      next: without("licenses", group),
    })),
    ...filters.tags.map((tag) => ({
      key: `tag-${tag}`,
      label: t("tagChip", { tag }),
      next: without("tags", tag),
    })),
  ];
}

/** Tri : liste déroulante (envoi automatique ; bouton « Trier » sans JavaScript). */
function SortSelect() {
  const t = useTranslations("gallery");
  const id = useId();
  const { filters, navigate } = useGallery();
  // La pertinence n'est proposée qu'avec une recherche.
  const sorts = SORTS.filter((sort) => sort !== "relevance" || filters.q);
  return (
    <form action="/models" method="get" className="flex flex-wrap items-center gap-2.5">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {(["formats", "categories", "licenses", "tags"] as const).flatMap((key) =>
        filters[key].map((value) => (
          <input
            key={`${key}-${value}`}
            type="hidden"
            name={key === "categories" ? "category" : key.slice(0, -1)}
            value={value}
          />
        )),
      )}
      <label htmlFor={id} className="text-[15px] font-semibold">
        {t("sortLabel")}
      </label>
      <select
        id={id}
        name="sort"
        value={filters.sort}
        onChange={(event) =>
          navigate({ ...filters, sort: event.currentTarget.value as CatalogSort })
        }
        className="h-11 rounded-xl border-2 border-ink bg-background pr-9 pl-4 font-semibold text-foreground"
      >
        {sorts.map((sort) => (
          <option key={sort} value={sort}>
            {t(`sorts.${sort}`)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className={`${NO_SCRIPT_ONLY} min-h-11 items-center rounded-full bg-muted px-4 font-bold`}
      >
        {t("sortSubmit")}
      </button>
    </form>
  );
}

/**
 * En-tête des résultats : compteur (annoncé à chaque mise à jour), puces des filtres actifs
 * retirables (liens : fonctionnent sans JavaScript) et tri.
 */
export function ResultsToolbar({ total }: { total: number }) {
  const t = useTranslations("gallery");
  const { locked, navigate } = useGallery();
  const chips = useChips();
  const countRef = useRef<HTMLParagraphElement>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <p
          ref={countRef}
          tabIndex={-1}
          aria-live="polite"
          aria-atomic="true"
          className="m-0 font-bold outline-none"
        >
          {t("count", { count: total })}
        </p>
        {chips.length > 0 && (
          <ul aria-label={t("activeFilters")} className="m-0 flex list-none flex-wrap gap-2 p-0">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={galleryHref(chip.next, locked)}
                  scroll={false}
                  aria-label={t("removeFilter", { label: chip.label })}
                  onClick={(event) =>
                    interceptClick(event, () => {
                      navigate(chip.next);
                      // La puce disparaît : le focus passe au compteur de résultats.
                      countRef.current?.focus();
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-muted pr-3 pl-4 text-[15px] font-semibold text-foreground no-underline hover:bg-border hover:text-foreground"
                >
                  {chip.label}
                  <X aria-hidden="true" className="size-4" strokeWidth={2.4} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SortSelect />
    </div>
  );
}
