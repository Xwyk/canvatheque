"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FormEvent, ReactNode } from "react";
import { pillButton } from "@/components/ui/pill-button";
import { FORMATS, LICENSE_GROUP_KEYS } from "@/features/catalog/params";
import { cn } from "@/lib/utils";
import { interceptClick, useGallery } from "./gallery-context";
import { EMPTY_FACETS, galleryHref, toggleValue, type GalleryFilters } from "./gallery-href";

/** Sans JavaScript uniquement (media query `scripting`) : bouton d'envoi des formulaires GET. */
export const NO_SCRIPT_ONLY = "hidden [@media(scripting:none)]:inline-flex";

type Facet = "formats" | "categories" | "licenses";

function Option({
  name,
  value,
  checked,
  onToggle,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 leading-tight">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onToggle}
        className="size-[22px] shrink-0 accent-primary"
      />
      {children}
    </label>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="pb-2 text-[15px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * Colonne de filtres (planche Galerie : cases 22 px, lignes 44 px). Chaque case met l'URL à
 * jour immédiatement ; sans JavaScript, le formulaire GET s'envoie avec « Appliquer ».
 */
export function GalleryFilters({ className }: { className?: string }) {
  const t = useTranslations("gallery");
  const { filters, categories, locked, navigate } = useGallery();

  function toggle(facet: Facet, value: string) {
    navigate({ ...filters, [facet]: toggleValue(filters[facet] as string[], value) });
  }

  // Avec JavaScript, les cases naviguent déjà : l'envoi (touche Entrée) ne recharge rien.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  // Sur une page de catégorie, la catégorie de la page reste cochée.
  const reset: GalleryFilters = {
    ...filters,
    ...EMPTY_FACETS,
    categories: locked ? [locked] : [],
  };

  return (
    <form
      action="/models"
      method="get"
      onSubmit={onSubmit}
      className={cn("flex flex-col gap-7", className)}
    >
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      {filters.sort !== (filters.q ? "relevance" : "recent") && (
        <input type="hidden" name="sort" value={filters.sort} />
      )}
      {filters.tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}

      <Group legend={t("format")}>
        {FORMATS.map((format) => (
          <Option
            key={format}
            name="format"
            value={format}
            checked={filters.formats.includes(format)}
            onToggle={() => toggle("formats", format)}
          >
            {t(`formats.${format}`)}
          </Option>
        ))}
      </Group>

      {categories.length > 0 && (
        <Group legend={t("category")}>
          {categories.map((category) => (
            <Option
              key={category.slug}
              name="category"
              value={category.slug}
              checked={filters.categories.includes(category.slug)}
              onToggle={() => toggle("categories", category.slug)}
            >
              {category.name}
            </Option>
          ))}
        </Group>
      )}

      <Group legend={t("license")}>
        {LICENSE_GROUP_KEYS.map((group) => (
          <Option
            key={group}
            name="license"
            value={group}
            checked={filters.licenses.includes(group)}
            onToggle={() => toggle("licenses", group)}
          >
            {t(`licenseGroups.${group}`)}
          </Option>
        ))}
      </Group>

      <div className="flex flex-col items-start gap-2">
        <button type="submit" className={pillButton({ size: "md", className: NO_SCRIPT_ONLY })}>
          {t("apply")}
        </button>
        <Link
          href={galleryHref(reset, locked)}
          scroll={false}
          onClick={(event) => interceptClick(event, () => navigate(reset))}
          className="inline-flex min-h-11 items-center font-bold text-foreground underline hover:text-primary"
        >
          {t("reset")}
        </Link>
      </div>
    </form>
  );
}
