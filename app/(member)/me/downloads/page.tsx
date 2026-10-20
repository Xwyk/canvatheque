import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { LibraryPage } from "@/components/layout/library-page";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import { listMyDownloads } from "@/features/downloads/service";
import { withFavorites } from "@/features/favorites/service";
import { requireUserPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("metaDownloads"), robots: { index: false } };
}

export default async function DownloadsPage() {
  const user = await requireUserPage("/me/downloads");
  const t = await getTranslations("library");
  const tMe = await getTranslations("me");
  const format = await getFormatter();
  const prisma = db();
  const downloads = await withFavorites(prisma, user.id, await listMyDownloads(prisma, user.id));
  return (
    <LibraryPage
      tab="/me/downloads"
      title={t("downloadsTitle")}
      subtitle={tMe("subtitle", { pseudo: user.pseudo })}
      count={t("downloadsCount", { count: downloads.length })}
      empty={
        downloads.length === 0
          ? { title: t("downloadsEmptyTitle"), text: t("downloadsEmptyText"), cta: t("browse") }
          : null
      }
    >
      {downloads.map((item, index) => (
        <li key={item.id} className="flex min-w-0 flex-col gap-2">
          <CatalogCard item={item} priority={index === 0} />
          <span className="text-sm text-muted-foreground">
            {t("downloadedOn", {
              date: format.dateTime(new Date(item.downloadedAt), { dateStyle: "medium" }),
            })}
          </span>
        </li>
      ))}
    </LibraryPage>
  );
}
