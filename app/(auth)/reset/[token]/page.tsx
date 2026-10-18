import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { pillButton } from "@/components/ui/pill-button";
import { ResetPasswordForm } from "@/features/auth/components/password-reset-forms";
import { isEmailTokenUsable } from "@/features/auth/service";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mailer } from "@/lib/mail/mailer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("reset"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const t = await getTranslations("auth");
  // Le jeton n'est consommé qu'à l'envoi du formulaire.
  const usable = await isEmailTokenUsable(
    { prisma: db(), mailer: mailer(), appUrl: env().APP_URL },
    token,
    "RESET_PASSWORD",
  );

  if (!usable) {
    return (
      <AuthCard title={t("resetTitle")} subtitle={t("resetInvalid")}>
        <Link href="/forgot-password" className={pillButton({ size: "lg" })}>
          {t("resetRequestNew")}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("resetTitle")} subtitle={t("resetSubtitle")}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
