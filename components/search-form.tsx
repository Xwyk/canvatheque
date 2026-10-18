import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { pillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

type SearchFormProps = {
  defaultValue?: string;
  size?: "md" | "lg";
  className?: string;
};

/**
 * Recherche en pilule (GET /models?q=…) : fonctionne sans JavaScript.
 * Mobile : bouton rond intégré au champ ; à partir de 768 px : bouton « Rechercher ».
 */
export function SearchForm({ defaultValue, size = "lg", className }: SearchFormProps) {
  const t = useTranslations("search");
  const id = useId();
  const height = size === "lg" ? "h-[52px] md:h-14" : "h-[52px]";
  return (
    <form
      action="/models"
      method="get"
      role="search"
      className={cn("flex flex-wrap gap-3", className)}
    >
      <label htmlFor={id} className="sr-only">
        {t("label")}
      </label>
      <div className="relative min-w-0 flex-[1_1_260px]">
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={t("placeholder")}
          maxLength={100}
          className={cn(
            "w-full rounded-full border-2 border-ink bg-background pr-14 pl-5 text-base text-foreground placeholder:text-muted-foreground md:pr-6 md:pl-6 md:text-[17px]",
            height,
          )}
        />
        <button
          type="submit"
          aria-label={t("submit")}
          className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground md:hidden"
        >
          <Search aria-hidden="true" className="size-[22px]" strokeWidth={2.4} />
        </button>
      </div>
      <button
        type="submit"
        className={pillButton({ size: "xl", className: cn("hidden md:inline-flex", height) })}
      >
        {t("submit")}
      </button>
    </form>
  );
}
