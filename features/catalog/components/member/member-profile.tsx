import { Download, Link2, Shapes } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/avatar";
import { ModelGrid } from "@/components/model-card";
import { CatalogCard } from "@/features/catalog/components/catalog-card";
import type { MemberProfile } from "@/features/catalog/member";

/** Hôte affiché du site web (« exemple.fr/atelier »). */
function displayUrl(href: string): string {
  const url = new URL(href);
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.host.replace(/^www\./, "")}${path}`;
}

/** Profil public d'un membre (écran non maquetté, langage visuel de la fiche). */
export function MemberProfileView({ profile }: { profile: MemberProfile }) {
  const t = useTranslations("memberPage");
  const format = useFormatter();
  const pill =
    "inline-flex min-h-11 items-center gap-2 rounded-full bg-muted px-4 text-[15px] font-bold";

  return (
    <div className="container-page flex flex-col gap-12 py-8 md:gap-16 md:py-12">
      <header className="flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8">
        <Avatar pseudo={profile.pseudo} className="size-24 text-4xl" />
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="m-0 text-[36px] leading-[1.08] font-extrabold tracking-[-0.02em] break-words md:text-[44px]">
            {profile.pseudo}
          </h1>
          <p className="m-0 text-sm text-muted-foreground">
            {t("memberSince", {
              date: format.dateTime(profile.createdAt, { month: "long", year: "numeric" }),
            })}
          </p>
          {profile.bio && (
            <p className="m-0 max-w-[640px] whitespace-pre-line text-text-secondary">
              {profile.bio}
            </p>
          )}
          {profile.website && (
            <a
              href={profile.website}
              rel="nofollow ugc noopener"
              className="inline-flex min-h-11 items-center gap-2 self-start font-semibold"
            >
              <Link2 aria-hidden="true" className="size-5" />
              <span className="sr-only">{t("website")} : </span>
              {displayUrl(profile.website)}
            </a>
          )}
          <ul aria-label={t("stats")} className="m-0 flex list-none flex-wrap gap-2 p-0">
            <li className={pill}>
              <Shapes aria-hidden="true" className="size-5" />
              {t("modelCount", { count: profile.stats.models })}
            </li>
            <li className={pill}>
              <Download aria-hidden="true" className="size-5" />
              {t("downloadCount", { count: profile.stats.downloads })}
            </li>
          </ul>
        </div>
      </header>

      <section aria-labelledby="member-models" className="flex flex-col gap-7">
        <h2
          id="member-models"
          className="m-0 text-[26px] font-bold tracking-[-0.01em] md:text-[32px]"
        >
          {t("models")}
        </h2>
        {profile.models.length > 0 ? (
          <ModelGrid>
            {profile.models.map((item, index) => (
              <li key={item.id} className="min-w-0">
                <CatalogCard item={item} priority={index === 0} />
              </li>
            ))}
          </ModelGrid>
        ) : (
          <p className="m-0 rounded-[28px] bg-muted px-6 py-12 text-center text-text-secondary">
            {t("empty", { pseudo: profile.pseudo })}
          </p>
        )}
      </section>
    </div>
  );
}
