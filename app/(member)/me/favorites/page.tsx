import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LibraryPage } from "@/components/layout/library-page";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { listFavorites } from "@/features/favorites/service";
import { requireUserPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("metaFavorites"), robots: { index: false } };
}

export default async function FavoritesPage() {
  const user = await requireUserPage("/me/favorites");
  const t = await getTranslations("library");
  const tMe = await getTranslations("me");
  const favorites = await listFavorites(db(), user.id);
  return (
    <LibraryPage
      tab="/me/favorites"
      title={t("favoritesTitle")}
      subtitle={tMe("subtitle", { pseudo: user.pseudo })}
      count={t("favoritesCount", { count: favorites.length })}
      empty={
        favorites.length === 0
          ? { title: t("favoritesEmptyTitle"), text: t("favoritesEmptyText"), cta: t("browse") }
          : null
      }
    >
      {favorites.map((item, index) => (
        <li key={item.id} className="min-w-0">
          <CatalogCard item={item} priority={index === 0} />
        </li>
      ))}
    </LibraryPage>
  );
}
