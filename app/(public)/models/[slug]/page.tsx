import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { clientOs } from "@/features/downloads/links";
import { ModelView } from "@/features/catalog/components/model-page/model-view";
import {
  getAuthorModels,
  getModelPage,
  getSimilarModels,
  modelJsonLd,
  summarize,
  type ModelPageData,
} from "@/features/catalog/model-page";
import { absoluteUrl, DEFAULT_OG_IMAGE, jsonLd } from "@/features/catalog/seo";
import { withFavorites } from "@/features/favorites/service";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** Fiche résolue une seule fois par requête (métadonnées et page). */
const loadModel = cache(async (slug: string) => getModelPage(db(), await getCurrentUser(), slug));

async function describe(data: ModelPageData): Promise<string> {
  if (data.descriptionText) return summarize(data.descriptionText);
  const t = await getTranslations("modelPage");
  return t("metaFallback", { format: data.model.format, pseudo: data.author.pseudo });
}

const canonicalOf = (slug: string) => absoluteUrl(`/models/${slug}`);

export async function generateMetadata({ params }: PageProps<"/models/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadModel(slug);
  const t = await getTranslations("modelPage");
  const tMeta = await getTranslations("meta");
  if (!data) return { title: t("notFoundTitle"), robots: { index: false } };

  const { model, preview } = data;
  const description = await describe(data);
  const canonical = canonicalOf(model.slug);
  const images = preview
    ? [
        {
          url: preview.lg,
          width: preview.width,
          height: preview.height,
          alt: t("imageAlt", { title: model.title }),
        },
      ]
    : [{ ...DEFAULT_OG_IMAGE, alt: tMeta("siteName") }];
  return {
    title: model.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: tMeta("siteName"),
      locale: "fr_FR",
      url: canonical,
      title: model.title,
      description,
      ...(model.publishedAt ? { publishedTime: model.publishedAt.toISOString() } : {}),
      authors: [data.author.pseudo],
      tags: data.tags,
      images,
    },
    twitter: { card: "summary_large_image", title: model.title, description, images },
    ...(model.status === "PUBLISHED" ? {} : { robots: { index: false } }),
  };
}

export default async function ModelPage({ params }: PageProps<"/models/[slug]">) {
  const { slug } = await params;
  const data = await loadModel(slug);
  if (!data) notFound();

  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const user = await getCurrentUser();
  const [similarModels, otherModels, description] = await Promise.all([
    getSimilarModels(db(), data.model),
    data.author.hasProfile
      ? getAuthorModels(db(), { id: data.model.id, authorId: data.author.id })
      : [],
    describe(data),
  ]);
  // Une seule requête de favoris pour la fiche et ses deux listes.
  const marked = await withFavorites(db(), user?.id, [
    { id: data.model.id },
    ...similarModels,
    ...otherModels,
  ]);
  const favorited = new Set(marked.filter((item) => item.favorited).map((item) => item.id));
  const mark = <T extends { id: string }>(items: T[]) =>
    items.map((item) => ({ ...item, favorited: favorited.has(item.id) }));
  const similar = mark(similarModels);
  const authorModels = mark(otherModels);
  const canonical = canonicalOf(data.model.slug);

  return (
    <>
      {data.model.status === "PUBLISHED" && (
        <script
          type="application/ld+json"
          nonce={nonce}
          // JSON sérialisé avec « < » échappé : aucune fermeture de balise possible.
          dangerouslySetInnerHTML={{
            __html: jsonLd(modelJsonLd(data, env().APP_URL, description)),
          }}
        />
      )}
      <ModelView
        data={data}
        similar={similar}
        authorModels={authorModels}
        canonicalUrl={canonical}
        favorited={favorited.has(data.model.id)}
        os={clientOs(requestHeaders.get("user-agent"))}
      />
    </>
  );
}
