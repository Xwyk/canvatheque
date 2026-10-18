import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { pillButton } from "@/components/ui/pill-button";
import { getCurrentUser } from "@/lib/auth/current";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("checkMail"), robots: { index: false } };
}

/** Résultat d'un lien de confirmation (voir check-mail/[token]/route.ts). */
export default async function CheckMailResultPage({ searchParams }: PageProps<"/check-mail">) {
  const { result } = await searchParams;
  const t = await getTranslations("auth.checkMail");

  let title = t("invalidTitle");
  let text = t("invalidText");
  if (result === "verified" || result === "alreadyVerified") {
    title = t("verifiedTitle");
    text = result === "verified" ? t("verifiedText") : t("alreadyVerifiedText");
  } else if (result === "emailChanged") {
    const user = await getCurrentUser();
    title = t("changedTitle");
    text = user ? t("changedText", { email: user.email }) : t("changedTextAnonymous");
  }

  return (
    <AuthCard title={title} subtitle={text}>
      <Link href="/" className={pillButton({ size: "lg" })}>
        {t("continue")}
      </Link>
    </AuthCard>
  );
}
