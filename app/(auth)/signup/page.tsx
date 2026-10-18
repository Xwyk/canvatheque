import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { safeRedirect } from "@/features/auth/schemas";
import { getCurrentUser } from "@/lib/auth/current";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("signUp") };
}

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const redirectTo = safeRedirect((await searchParams).redirectTo);
  if (await getCurrentUser()) redirect(redirectTo);
  const t = await getTranslations("auth");

  return (
    <AuthCard
      title={t("signUpTitle")}
      subtitle={t("signUpSubtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link
            href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
            className="font-bold text-foreground underline"
          >
            {t("signInLink")}
          </Link>
        </>
      }
    >
      <AuthTabs current="signUp" redirectTo={redirectTo} />
      <SignUpForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
