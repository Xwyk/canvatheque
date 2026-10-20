"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ModelGrid } from "@/components/model-card";
import { pillButton } from "@/components/ui/pill-button";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import type { CatalogItem, CatalogPage } from "@/features/catalog/search";
import { cn } from "@/lib/utils";
import { interceptClick, useGallery } from "./gallery-context";
import { GallerySkeleton } from "./gallery-skeleton";

/**
 * Cartes chargées en priorité : deux suffisent (première rangée mobile ; sur ordinateur, la plus
 * grande image visible est l'une d'elles). Au-delà, elles se disputeraient la bande passante (LCP).
 */
const PRIORITY_CARDS = 2;

/** Liens des cartes (titres). */
const CARD_LINKS = "li h3 a";

type Status = "idle" | "loading" | "error";

/**
 * Grille de résultats à défilement infini : la première page vient du serveur, les suivantes
 * de `GET /api/models` (mêmes paramètres + curseur) dès que la fin de liste approche. Le bouton
 * « Charger plus » reste disponible (clavier, sans IntersectionObserver) ; sans JavaScript,
 * c'est un lien vers la page suivante.
 */
export function GalleryResults({
  initialItems,
  initialCursor,
  query,
  pageHref,
}: {
  initialItems: CatalogItem[];
  initialCursor: string | null;
  /** Paramètres de recherche de la page (sans curseur). */
  query: string;
  /** URL de la page courante, pour le lien « page suivante » sans JavaScript. */
  pageHref: string;
}) {
  const t = useTranslations("gallery");
  const { pending } = useGallery();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [status, setStatus] = useState<Status>("idle");
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  /** Après « Charger plus » : focus sur la première nouvelle carte (le bouton peut disparaître). */
  const focusIndex = useRef<number | null>(null);

  const loadMore = useCallback(
    async (moveFocus = false) => {
      if (!cursor || loading.current) return;
      loading.current = true;
      setStatus("loading");
      const loaded = grid.current?.querySelectorAll(CARD_LINKS).length ?? 0;
      try {
        const params = new URLSearchParams(query);
        params.set("cursor", cursor);
        const response = await fetch(`/api/models?${params.toString()}`, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const page = (await response.json()) as CatalogPage;
        setItems((previous) => {
          const seen = new Set(previous.map((item) => item.id));
          return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
        });
        if (moveFocus) focusIndex.current = loaded;
        setCursor(page.nextCursor);
        setStatus("idle");
      } catch {
        setStatus("error");
      } finally {
        loading.current = false;
      }
    },
    [cursor, query],
  );

  useLayoutEffect(() => {
    if (focusIndex.current === null) return;
    grid.current?.querySelectorAll<HTMLAnchorElement>(CARD_LINKS)[focusIndex.current]?.focus();
    focusIndex.current = null;
  }, [items]);

  // Défilement infini : pas de relance automatique après une erreur.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !cursor || status !== "idle" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, status, loadMore]);

  const nextHref = cursor
    ? `${pageHref}${pageHref.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`
    : null;

  return (
    <div
      ref={grid}
      aria-busy={pending}
      className={cn("flex flex-col gap-8 transition-opacity duration-200", pending && "opacity-60")}
    >
      <ModelGrid min={220}>
        {items.map((item, index) => (
          <li key={item.id}>
            <CatalogCard item={item} priority={index < PRIORITY_CARDS} />
          </li>
        ))}
      </ModelGrid>

      {status === "loading" && <GallerySkeleton />}

      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="m-0 font-semibold text-destructive">{t("loadError")}</p>
          <button
            type="button"
            onClick={() => void loadMore(true)}
            className={pillButton({ variant: "outline", size: "sm" })}
          >
            {t("retry")}
          </button>
        </div>
      )}

      {nextHref && status !== "error" && (
        <div ref={sentinel} className="flex justify-center">
          <a
            href={nextHref}
            onClick={(event) => interceptClick(event, () => void loadMore(true))}
            className={pillButton({ variant: "outline", size: "lg" })}
          >
            {t("loadMore")}
          </a>
        </div>
      )}
    </div>
  );
}
