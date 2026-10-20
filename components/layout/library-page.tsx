import Link from "next/link";
import type { ReactNode } from "react";
import { MeTabs, type MeTab } from "@/components/layout/me-tabs";
import { ModelGrid } from "@/components/model-card";
import { pillButton } from "@/components/ui/pill-button";

/** Gabarit des listes de l'espace membre (favoris, téléchargements) avec état vide. */
export function LibraryPage({
  tab,
  title,
  subtitle,
  count,
  empty,
  children,
}: {
  tab: MeTab;
  title: string;
  subtitle: string;
  count: string;
  empty: { title: string; text: string; cta: string } | null;
  children: ReactNode;
}) {
  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="m-0 text-muted-foreground">{subtitle}</p>
      </div>
      <MeTabs current={tab} />
      <section aria-labelledby="library-list" className="flex flex-col gap-5">
        <h2 id="library-list" className="m-0 text-xl font-bold">
          {count}
        </h2>
        {empty ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-muted px-6 py-12 text-center">
            <strong className="text-xl">{empty.title}</strong>
            <p className="m-0 max-w-[440px] text-text-secondary">{empty.text}</p>
            <Link href="/models" className={pillButton({ size: "lg", className: "mt-2" })}>
              {empty.cta}
            </Link>
          </div>
        ) : (
          <ModelGrid>{children}</ModelGrid>
        )}
      </section>
    </div>
  );
}
