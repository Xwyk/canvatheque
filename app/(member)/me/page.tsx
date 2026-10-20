import { CirclePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MeTabs } from "@/components/layout/me-tabs";
import { pillButton } from "@/components/ui/pill-button";
import { MyModels } from "@/features/models/components/my-models";
import { listMyModels } from "@/features/models/service";
import { requireUserPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("me"), robots: { index: false } };
}

export default async function MePage() {
  const user = await requireUserPage("/me");
  const t = await getTranslations("me");
  const models = await listMyModels(db(), user.id);

  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
            {t("title")}
          </h1>
          <p className="m-0 text-muted-foreground">{t("subtitle", { pseudo: user.pseudo })}</p>
        </div>
        <Link href="/publish" className={pillButton({ size: "lg" })}>
          <CirclePlus aria-hidden="true" className="size-5" />
          {t("publish")}
        </Link>
      </div>

      <MeTabs current="/me" />

      <section aria-labelledby="my-models" className="flex flex-col gap-5">
        <h2 id="my-models" className="m-0 text-2xl font-bold">
          {t("tabModels")}{" "}
          <span className="text-base font-semibold text-muted-foreground">
            ({t("count", { count: models.length })})
          </span>
        </h2>
        {models.length > 0 ? (
          <MyModels models={models} authorPseudo={user.pseudo} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-muted px-6 py-12 text-center">
            <strong className="text-xl">{t("emptyTitle")}</strong>
            <p className="m-0 max-w-[440px] text-text-secondary">{t("emptyText")}</p>
            <Link href="/publish" className={pillButton({ size: "lg", className: "mt-2" })}>
              {t("publish")}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
