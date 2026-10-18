import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeRedirect } from "@/features/auth/schemas";
import { getCurrentUser } from "@/lib/auth/current";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("signIn"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const redirectTo = safeRedirect((await searchParams).redirectTo);
  if (await getCurrentUser()) redirect(redirectTo);
  const t = await getTranslations("auth");

  return (
    <AuthCard
      title={t("signInTitle")}
      subtitle={t("signInSubtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link
            href={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`}
            className="font-bold text-foreground underline"
          >
            {t("signUpLink")}
          </Link>
        </>
      }
    >
      <AuthTabs current="signIn" redirectTo={redirectTo} />
      <SignInForm redirectTo={redirectTo} />
    </AuthCard>
  );
}
