import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EmailForm, PasswordForm, ProfileForm } from "@/features/auth/components/settings-forms";
import { requireUserPage } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("settings"), robots: { index: false } };
}

function SettingsCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-5 rounded-3xl border bg-card p-5 shadow-card md:p-8"
    >
      <h2 id={id} className="m-0 text-2xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const session = await requireUserPage("/me/settings");
  const t = await getTranslations("settings");
  const profile = await db().user.findUniqueOrThrow({
    where: { id: session.id },
    select: { bio: true, website: true },
  });

  return (
    <div className="container-page flex max-w-[760px] flex-col gap-6 py-8 md:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="m-0 text-muted-foreground">{t("subtitle", { pseudo: session.pseudo })}</p>
      </div>

      <SettingsCard id="profile-title" title={t("profileTitle")}>
        <ProfileForm bio={profile.bio ?? ""} website={profile.website ?? ""} />
      </SettingsCard>

      <SettingsCard id="email-title" title={t("emailTitle")}>
        <p className="m-0 flex flex-wrap items-center gap-2 text-text-secondary">
          {t("emailCurrent", { email: session.email })}
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-sm font-bold",
              session.emailVerifiedAt
                ? "bg-success-soft text-foreground"
                : "bg-highlight-soft text-foreground",
            )}
          >
            {session.emailVerifiedAt ? t("emailVerified") : t("emailUnverified")}
          </span>
        </p>
        <EmailForm />
      </SettingsCard>

      <SettingsCard id="password-title" title={t("passwordTitle")}>
        <PasswordForm />
      </SettingsCard>
    </div>
  );
}
