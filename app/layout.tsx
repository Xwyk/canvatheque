import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { preconnect } from "react-dom";
import { getTranslations } from "next-intl/server";
import { bricolage, figtree } from "@/app/fonts";
import { AuthGateProvider } from "@/components/auth/auth-gate";
import { FlashToast } from "@/components/flash-toast";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { UnverifiedBanner } from "@/components/layout/unverified-banner";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_OG_IMAGE } from "@/features/catalog/seo";
import { getCurrentUser } from "@/lib/auth/current";
import { originOf } from "@/lib/security/csp";
import { clientMessages } from "@/messages/client";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const seo = await getTranslations("seo");
  // Image de partage par défaut ; une page qui définit `openGraph` doit la reprendre (fusion superficielle).
  const image = { ...DEFAULT_OG_IMAGE, alt: seo("ogImageAlt") };
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: t("defaultTitle"), template: `%s · ${t("siteName")}` },
    description: t("description"),
    applicationName: t("siteName"),
    openGraph: {
      siteName: t("siteName"),
      locale: "fr_FR",
      type: "website",
      title: t("defaultTitle"),
      description: t("description"),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: t("defaultTitle"),
      description: t("description"),
      images: [image],
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#181630" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Lire l'en-tête rend chaque page dynamique : condition de la CSP à nonces (ADR-011).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Les aperçus viennent du stockage (autre origine) : connexion ouverte dès le début (LCP).
  const storage = originOf(process.env.S3_PUBLIC_URL);
  if (storage) preconnect(storage);
  const t = await getTranslations("a11y");
  const user = await getCurrentUser();
  const headerUser = user
    ? { pseudo: user.pseudo, email: user.email, isAdmin: user.role === "ADMIN" }
    : null;

  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${bricolage.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-20 md:pb-0">
        <NextIntlClientProvider messages={clientMessages}>
          <ThemeProvider nonce={nonce}>
            <a
              href="#contenu"
              className="sr-only z-50 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              {t("skipToContent")}
            </a>
            <AuthGateProvider signedIn={!!user}>
              {user && !user.emailVerifiedAt && <UnverifiedBanner email={user.email} />}
              <SiteHeader user={headerUser} />
              <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
              <SiteFooter />
              <MobileTabBar />
            </AuthGateProvider>
            <Toaster position="top-center" richColors closeButton />
            <FlashToast />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
