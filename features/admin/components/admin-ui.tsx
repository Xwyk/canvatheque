import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { pillButton } from "@/components/ui/pill-button";
import type { ModelStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/admin", key: "dashboard" },
  { href: "/admin/reports", key: "reports" },
  { href: "/admin/members", key: "members" },
  { href: "/admin/models", key: "models" },
  { href: "/admin/log", key: "log" },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["href"];

const activePill = "border-ink bg-ink text-ink-foreground hover:bg-ink hover:text-ink-foreground";

/** Gabarit des pages d'administration : titre, sous-navigation en pilules, contenu. */
export function AdminShell({
  current,
  openReports,
  title,
  children,
}: {
  current: AdminSection;
  openReports: number;
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[13px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
          {t("title")}
        </p>
        <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
      </div>
      <nav aria-label={t("navLabel")}>
        <ul className="m-0 -mx-5 flex list-none gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {SECTIONS.map((section) => {
            const active = section.href === current;
            return (
              <li key={section.href} className="shrink-0">
                <Link
                  href={section.href}
                  aria-current={active ? "page" : undefined}
                  className={pillButton({
                    variant: active ? "outline" : "soft",
                    size: "sm",
                    className: active ? activePill : undefined,
                  })}
                >
                  {t(`nav.${section.key}`, { count: openReports })}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}

/** Filtres en pilules (liens : l'état reste dans l'URL). */
export function FilterPills({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "true" : undefined}
              className={pillButton({
                variant: item.active ? "outline" : "soft",
                size: "sm",
                className: item.active ? activePill : undefined,
              })}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Recherche GET (fonctionne sans JavaScript) ; les filtres en cours sont conservés. */
export function AdminSearch({
  action,
  label,
  placeholder,
  submit,
  defaultValue,
  keep = {},
}: {
  action: string;
  label: string;
  placeholder: string;
  submit: string;
  defaultValue: string;
  keep?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" role="search" className="flex flex-wrap gap-3">
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        <span className="sr-only">{label}</span>
        <input
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          maxLength={100}
          className="h-[52px] w-full rounded-full border-2 border-ink bg-background px-5 text-base text-foreground placeholder:text-muted-foreground"
        />
      </label>
      <button type="submit" className={pillButton({ variant: "outline", size: "lg" })}>
        <Search aria-hidden="true" className="size-5" />
        {submit}
      </button>
    </form>
  );
}

/** Pagination précédente / suivante (pages de 30 éléments). */
export function Pagination({
  page,
  hasNext,
  href,
}: {
  page: number;
  hasNext: boolean;
  href: (page: number) => string;
}) {
  const t = useTranslations("admin.pagination");
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={pillButton({ variant: "outline", size: "sm" })}>
          <ChevronLeft aria-hidden="true" className="size-5" />
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-[15px] font-semibold text-muted-foreground">{t("page", { page })}</span>
      {hasNext ? (
        <Link href={href(page + 1)} className={pillButton({ variant: "outline", size: "sm" })}>
          {t("next")}
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

const STATUS_TONE: Record<ModelStatus, string> = {
  DRAFT: "bg-muted text-foreground",
  PUBLISHED: "bg-success text-white dark:text-background",
  HIDDEN: "bg-highlight text-highlight-foreground",
};

export function ModelStatusBadge({
  status,
  className,
}: {
  status: ModelStatus;
  className?: string;
}) {
  const t = useTranslations("admin.models.status");
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-3 text-[13px] font-bold whitespace-nowrap",
        STATUS_TONE[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}

/** Message d'état vide d'une liste. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-[28px] bg-muted px-6 py-12 text-center text-text-secondary">
      {children}
    </p>
  );
}

/** URL d'une liste avec ses paramètres (les valeurs vides ou par défaut sont omises). */
export function listHref(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
