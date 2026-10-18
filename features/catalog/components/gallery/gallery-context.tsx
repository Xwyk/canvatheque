"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { galleryHref, type GalleryFilters } from "./gallery-href";

export type GalleryCategory = { slug: string; name: string; color: string };

type GalleryContextValue = {
  /** Filtres affichés : ceux de l'URL, ou ceux demandés pendant la navigation (optimistes). */
  filters: GalleryFilters;
  categories: GalleryCategory[];
  /** Catégorie de la page `/categories/[slug]`, sinon null. */
  locked: string | null;
  pending: boolean;
  navigate: (next: GalleryFilters) => void;
};

const GalleryContext = createContext<GalleryContextValue | null>(null);

/**
 * État partagé des contrôles de la galerie. Les filtres vivent dans l'URL : chaque choix
 * pousse une nouvelle URL (historique navigable) sans recharger la page ni remonter en haut.
 */
export function GalleryProvider({
  filters,
  categories,
  locked = null,
  children,
}: {
  filters: GalleryFilters;
  categories: GalleryCategory[];
  locked?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(filters);

  const navigate = useCallback(
    (next: GalleryFilters) => {
      startTransition(() => {
        setOptimistic(next);
        router.push(galleryHref(next, locked), { scroll: false });
      });
    },
    [router, locked, setOptimistic],
  );

  const value = useMemo(
    () => ({ filters: optimistic, categories, locked, pending, navigate }),
    [optimistic, categories, locked, pending, navigate],
  );
  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

export function useGallery(): GalleryContextValue {
  const context = useContext(GalleryContext);
  if (!context) throw new Error("useGallery doit être utilisé dans <GalleryProvider>");
  return context;
}

/** Clic simple sur un lien de filtre : navigation gérée ici (ouverture en onglet préservée). */
export function interceptClick(event: MouseEvent<HTMLAnchorElement>, run: () => void): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  run();
}
