import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CategoryWithCount } from "@/features/catalog/gallery";

/** Index des catégories : puces à pastille colorée avec le nombre de modèles publiés. */
export function CategoryIndex({ categories }: { categories: CategoryWithCount[] }) {
  const t = useTranslations("categoriesPage");
  if (categories.length === 0) {
    return <p className="m-0 text-text-secondary">{t("empty")}</p>;
  }
  return (
    <ul
      aria-label={t("listLabel")}
      className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
    >
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            href={`/categories/${category.slug}`}
            className="flex min-h-16 items-center gap-3 rounded-full bg-card py-3 pr-6 pl-5 text-foreground no-underline shadow-chip hover:text-primary"
          >
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <span className="min-w-0 flex-1 text-[17px] font-bold">{category.name}</span>
            <span className="shrink-0 text-[15px] font-semibold text-muted-foreground">
              {t("count", { count: category.count })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
