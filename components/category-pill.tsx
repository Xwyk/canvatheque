import Link from "next/link";
import { cn } from "@/lib/utils";

export type CategoryPillData = { slug: string; name: string; color: string };

/** Puce blanche à pastille colorée (bande « Parcourir par catégorie »). */
export function CategoryPill({
  category,
  className,
}: {
  category: CategoryPillData;
  className?: string;
}) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={cn(
        "inline-flex min-h-12 items-center gap-2.5 rounded-full bg-card pr-5.5 pl-4 font-semibold text-foreground no-underline shadow-chip hover:text-primary",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-3.5 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
      />
      {category.name}
    </Link>
  );
}
