import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { GalleryScreen } from "@/features/catalog/components/gallery/gallery-screen";
import { isRefined } from "@/features/catalog/components/gallery/gallery-href";
import { loadGalleryPage } from "@/features/catalog/gallery";
import { getCurrentUser } from "@/lib/auth/current";
import { parseCatalogParams, type SearchParamsInput } from "@/features/catalog/params";
import { getCategories } from "@/features/catalog/queries";
import { db } from "@/lib/db";

const loadCategories = cache(() => getCategories(db()));

/** Filtres de l'URL, la catégorie étant imposée par le chemin. */
function categoryFilters(slug: string, searchParams: SearchParamsInput) {
  return { ...parseCatalogParams(searchParams), categories: [slug] };
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = (await loadCategories()).find((c) => c.slug === slug);
  if (!category) return { robots: { index: false } };
  const t = await getTranslations("gallery");
  const filters = categoryFilters(slug, await searchParams);
  // Comme la galerie : seule la page de la catégorie sans recherche ni filtre est indexée.
  const refined = isRefined(filters, slug) || !!filters.cursor;
  return {
    title: t("categoryMetaTitle", { name: category.name }),
    description: t("categoryMetaDescription", { name: category.name }),
    alternates: { canonical: `/categories/${category.slug}` },
    robots: refined ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const categories = await loadCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const t = await getTranslations("gallery");
  const tc = await getTranslations("categoriesPage");
  const filters = categoryFilters(slug, await searchParams);
  const page = await loadGalleryPage(db(), filters, (await getCurrentUser())?.id);

  const breadcrumb = (
    <nav aria-label={t("breadcrumb")}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[15px] text-muted-foreground">
        <li className="flex items-center gap-1">
          <Link
            href="/categories"
            className="inline-flex min-h-11 items-center font-semibold text-text-secondary hover:text-primary"
          >
            {tc("title")}
          </Link>
          <ChevronRight aria-hidden="true" className="size-4" />
        </li>
        <li>
          <span aria-current="page" className="inline-flex min-h-11 items-center">
            {category.name}
          </span>
        </li>
      </ol>
    </nav>
  );

  return (
    <GalleryScreen
      title={category.name}
      intro={t("categoryIntro", { name: category.name })}
      before={breadcrumb}
      filters={filters}
      locked={slug}
      categories={categories}
      items={page.items}
      nextCursor={page.nextCursor}
      total={page.total}
    />
  );
}
