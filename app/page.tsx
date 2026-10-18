import { getTranslations } from "next-intl/server";
import { CategoryBand } from "@/components/home/category-band";
import { DarkCtaPanel } from "@/components/home/dark-cta-panel";
import { HomeHero } from "@/components/home/home-hero";
import {
  getCategories,
  getPopularTagNames,
  withFallbackSuggestions,
} from "@/features/catalog/queries";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";

export default async function HomePage() {
  const t = await getTranslations("home");
  const prisma = db();
  const [categories, popular, user] = await Promise.all([
    getCategories(prisma),
    getPopularTagNames(prisma),
    getCurrentUser(),
  ]);
  const suggestions = withFallbackSuggestions(popular, t.raw("popularFallback") as string[]);

  return (
    <>
      <HomeHero popularTags={suggestions} />
      <CategoryBand categories={categories} />
      {/* « Populaires cette semaine » et « Derniers modèles » : étape Catalogue. */}
      <DarkCtaPanel member={!!user} />
    </>
  );
}
