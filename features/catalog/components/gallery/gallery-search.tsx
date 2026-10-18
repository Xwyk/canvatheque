"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type FormEvent } from "react";
import { pillButton } from "@/components/ui/pill-button";
import { useGallery } from "./gallery-context";
import { sortAfterSearch } from "./gallery-href";

/**
 * Recherche de la galerie. Sans JavaScript : GET /models avec les filtres en champs cachés ;
 * avec JavaScript : nouvelle URL sans rechargement (filtres conservés).
 */
export function GallerySearch() {
  const t = useTranslations("search");
  const id = useId();
  const { filters, navigate } = useGallery();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get("q") ?? "")
      .trim()
      .slice(0, 100);
    navigate({ ...filters, q, sort: sortAfterSearch(q, filters.sort) });
  }

  return (
    <form
      action="/models"
      method="get"
      role="search"
      onSubmit={onSubmit}
      className="flex max-w-[720px] flex-wrap gap-3"
    >
      {filters.formats.map((value) => (
        <input key={`f-${value}`} type="hidden" name="format" value={value} />
      ))}
      {filters.categories.map((value) => (
        <input key={`c-${value}`} type="hidden" name="category" value={value} />
      ))}
      {filters.licenses.map((value) => (
        <input key={`l-${value}`} type="hidden" name="license" value={value} />
      ))}
      {filters.tags.map((value) => (
        <input key={`t-${value}`} type="hidden" name="tag" value={value} />
      ))}
      <label htmlFor={id} className="sr-only">
        {t("label")}
      </label>
      <div className="relative min-w-0 flex-[1_1_260px]">
        {/* Réinitialisé quand la recherche change ailleurs (puce, retour arrière). */}
        <input
          key={filters.q}
          id={id}
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder={t("placeholder")}
          maxLength={100}
          className="h-[52px] w-full rounded-full border-2 border-ink bg-background pr-14 pl-5 text-base text-foreground placeholder:text-muted-foreground md:pr-6 md:pl-[22px] md:text-[17px]"
        />
        <button
          type="submit"
          aria-label={t("submit")}
          className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground md:hidden"
        >
          <Search aria-hidden="true" className="size-[22px]" strokeWidth={2.4} />
        </button>
      </div>
      <button
        type="submit"
        className={pillButton({ size: "lg", className: "hidden h-[52px] md:inline-flex" })}
      >
        {t("submit")}
      </button>
    </form>
  );
}
