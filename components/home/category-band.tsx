import { useTranslations } from "next-intl";
import { CategoryPill, type CategoryPillData } from "@/components/category-pill";

/** Bande lavande « Parcourir par catégorie ». */
export function CategoryBand({ categories }: { categories: CategoryPillData[] }) {
  const t = useTranslations("home");
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-title" className="bg-muted py-10 md:py-14">
      <div className="container-page flex flex-col gap-6">
        <h2
          id="categories-title"
          className="m-0 text-2xl font-bold tracking-[-0.01em] md:text-[32px]"
        >
          {t("categoriesTitle")}
        </h2>
        <ul className="flex flex-wrap gap-3">
          {categories.map((category) => (
            <li key={category.slug}>
              <CategoryPill category={category} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
