import { ModelCard } from "@/components/model-card";
import type { CatalogItem } from "@/features/catalog/search";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";

/** Carte du catalogue (planches Main, Galerie, Fiche) : lien vers la fiche et cœur des favoris. */
export function CatalogCard({ item, priority }: { item: CatalogItem; priority?: boolean }) {
  return (
    <ModelCard
      model={item}
      href={`/models/${item.slug}`}
      variant="plain"
      tintKey={item.id}
      priority={priority}
      badge={
        <FavoriteButton modelId={item.id} title={item.title} favorited={item.favorited ?? false} />
      }
    />
  );
}
