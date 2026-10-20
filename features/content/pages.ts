import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ContentPageData, ContentPageKey } from "@/features/content/content-page";
import { CONTENT_PATHS } from "@/features/content/paths";
import { env } from "@/lib/env";

export async function contentMetadata(page: ContentPageKey): Promise<Metadata> {
  const t = await getTranslations("content");
  const data = t.raw(page) as ContentPageData;
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: CONTENT_PATHS[page] },
  };
}

/**
 * Valeurs des pages légales, lues dans l'environnement (`LEGAL_*`, `CONTACT_EMAIL`) ;
 * une valeur absente est signalée « à compléter » plutôt qu'inventée.
 */
export async function legalValues(): Promise<Record<string, string>> {
  const t = await getTranslations("content");
  const config = env();
  const missing = `[${t("missing")}]`;
  return {
    publisher: config.LEGAL_PUBLISHER ?? missing,
    address: config.LEGAL_ADDRESS ?? missing,
    host: config.LEGAL_HOST ?? missing,
    contact: config.CONTACT_EMAIL
      ? `[${config.CONTACT_EMAIL}](mailto:${config.CONTACT_EMAIL})`
      : missing,
  };
}
