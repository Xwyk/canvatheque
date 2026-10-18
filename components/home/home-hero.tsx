import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeroCards } from "@/components/home/hero-cards";
import { SearchForm } from "@/components/search-form";

/** Hero de l'accueil (planche Main). */
export function HomeHero({ popularTags }: { popularTags: string[] }) {
  const t = useTranslations("home");
  return (
    <section className="container-page flex flex-wrap items-center gap-10 pt-4 pb-12 md:pt-10 md:pb-16">
      <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5 md:gap-6">
        <span className="self-start rounded-full bg-highlight-soft px-3.5 py-1.5 text-sm font-bold text-foreground">
          {t("badge")}
        </span>
        <h1 className="m-0 text-[clamp(36px,5.2vw,62px)] leading-[1.04] font-extrabold tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="m-0 max-w-[520px] text-base text-muted-foreground md:text-[19px]">
          {t("subtitle")}
        </p>
        <SearchForm className="max-w-[560px]" />
        {popularTags.length > 0 && (
          <div className="-mx-5 flex items-center gap-x-2.5 gap-y-2 overflow-x-auto px-5 pb-1 text-[15px] text-muted-foreground md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <span id="popular-tags-label" className="shrink-0">
              {t("popular")}
            </span>
            <ul aria-labelledby="popular-tags-label" className="flex gap-2.5 md:flex-wrap">
              {popularTags.map((tag) => (
                <li key={tag} className="shrink-0">
                  <Link
                    href={{ pathname: "/models", query: { q: tag } }}
                    className="inline-flex min-h-11 items-center rounded-full bg-muted px-4 font-semibold text-foreground no-underline hover:text-primary md:min-h-9 md:px-3.5"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <HeroCards className="hidden min-w-0 flex-[1_1_380px] lg:block" />
    </section>
  );
}
