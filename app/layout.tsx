import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { bricolage, figtree } from "@/app/fonts";
import { FlashToast } from "@/components/flash-toast";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { UnverifiedBanner } from "@/components/layout/unverified-banner";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/auth/current";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: t("defaultTitle"), template: `%s · ${t("siteName")}` },
    description: t("description"),
    applicationName: t("siteName"),
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
        <NextIntlClientProvider>
          <ThemeProvider nonce={nonce}>
            <a
              href="#contenu"
              className="sr-only z-50 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              {t("skipToContent")}
            </a>
            {user && !user.emailVerifiedAt && <UnverifiedBanner email={user.email} />}
            <SiteHeader user={headerUser} />
            <main id="contenu" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <SiteFooter />
            <MobileTabBar />
            <Toaster position="top-center" richColors closeButton />
            <FlashToast />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
