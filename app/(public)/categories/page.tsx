import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pillButton } from "@/components/ui/pill-button";
import { CategoryIndex } from "@/features/catalog/components/gallery/category-index";
import { getCategoriesWithCounts } from "@/features/catalog/gallery";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("categoriesPage");
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: { canonical: "/categories" },
  };
}

export default async function CategoriesPage() {
  const t = await getTranslations("categoriesPage");
  const categories = await getCategoriesWithCounts(db());
  return (
    <div className="bg-muted">
      <div className="container-page flex flex-col gap-8 pt-6 pb-14 md:pt-10 md:pb-20">
        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-[clamp(34px,4.5vw,48px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
            {t("title")}
          </h1>
          <p className="m-0 max-w-[720px] text-text-secondary">{t("subtitle")}</p>
        </div>
        <CategoryIndex categories={categories} />
        <Link
          href="/models"
          className={pillButton({ variant: "outline", size: "lg", className: "self-start" })}
        >
          {t("seeAll")}
        </Link>
      </div>
    </div>
  );
}
