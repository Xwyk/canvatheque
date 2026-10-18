import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/features/catalog/seo";
import { db } from "@/lib/db";

// Calculé à chaque requête : `next build` s'exécute sans base de données ni APP_URL.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(db());
}
