import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { CategoryBand } from "@/components/home/category-band";
import { DarkCtaPanel } from "@/components/home/dark-cta-panel";
import { EmptyCatalog } from "@/components/home/empty-catalog";
import { HomeHero } from "@/components/home/home-hero";
import { LatestSection, PopularSection } from "@/components/home/model-section";
import { getHomeData } from "@/features/catalog/home";
import {
  getCategories,
  getPopularTagNames,
  withFallbackSuggestions,
} from "@/features/catalog/queries";
import { absoluteUrl, DEFAULT_OG_IMAGE, jsonLd } from "@/features/catalog/seo";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Données structurées : site avec recherche interne, et organisation éditrice. */
async function structuredData() {
  const meta = await getTranslations("meta");
  const seo = await getTranslations("seo");
  const home = absoluteUrl("/");
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${home}#website`,
      url: home,
      name: meta("siteName"),
      description: meta("description"),
      inLanguage: "fr-FR",
      publisher: { "@id": `${home}#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${absoluteUrl("/models")}?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${home}#organization`,
      name: meta("siteName"),
      url: home,
      description: seo("organizationDescription"),
      logo: absoluteUrl(DEFAULT_OG_IMAGE.url),
    },
  ];
}

export default async function HomePage() {
  const t = await getTranslations("home");
  const prisma = db();
  const [categories, popularTags, user, sections, data, requestHeaders] = await Promise.all([
    getCategories(prisma),
    getPopularTagNames(prisma),
    getCurrentUser(),
    getHomeData(prisma),
    structuredData(),
    headers(),
  ]);
  const suggestions = withFallbackSuggestions(popularTags, t.raw("popularFallback") as string[]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
      />
      <HomeHero popularTags={suggestions} />
      <CategoryBand categories={categories} />
      <PopularSection models={sections.popular} />
      <LatestSection models={sections.latest} empty={<EmptyCatalog />} />
      <DarkCtaPanel member={!!user} />
    </>
  );
}
