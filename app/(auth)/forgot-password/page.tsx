import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/password-reset-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("forgot"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard
      title={t("forgotTitle")}
      subtitle={t("forgotSubtitle")}
      footer={
        <Link href="/login" className="font-bold text-foreground underline">
          {t("backToSignIn")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
