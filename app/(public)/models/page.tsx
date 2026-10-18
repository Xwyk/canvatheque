import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GalleryScreen } from "@/features/catalog/components/gallery/gallery-screen";
import { isRefined } from "@/features/catalog/components/gallery/gallery-href";
import { loadGalleryPage } from "@/features/catalog/gallery";
import { parseCatalogParams } from "@/features/catalog/params";
import { getCategories } from "@/features/catalog/queries";
import { db } from "@/lib/db";

export async function generateMetadata({ searchParams }: PageProps<"/models">): Promise<Metadata> {
  const t = await getTranslations("gallery");
  const filters = parseCatalogParams(await searchParams);
  // Seule la galerie complète est indexée : recherches, filtres, tris et pages suivantes
  // (contenu dupliqué, combinaisons infinies) sont `noindex` mais leurs liens restent suivis,
  // et pointent tous vers la même URL canonique.
  const refined = isRefined(filters) || !!filters.cursor;
  return {
    title: filters.q ? t("metaSearchTitle", { q: filters.q }) : t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/models" },
    robots: refined ? { index: false, follow: true } : undefined,
  };
}

export default async function ModelsPage({ searchParams }: PageProps<"/models">) {
  const t = await getTranslations("gallery");
  const filters = parseCatalogParams(await searchParams);
  const prisma = db();
  const [categories, page] = await Promise.all([
    getCategories(prisma),
    loadGalleryPage(prisma, filters),
  ]);
  return (
    <GalleryScreen
      title={t("title")}
      filters={filters}
      categories={categories}
      items={page.items}
      nextCursor={page.nextCursor}
      total={page.total}
    />
  );
}
