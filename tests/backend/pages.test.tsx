import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { createTranslator } from "next-intl";
import type * as NextIntl from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/fr.json";
import { seed } from "@/prisma/seed";
import { prisma } from "@/tests/setup/backend";
import { requestContext } from "@/tests/support/next-request";

beforeEach(() => {
  requestContext.reset();
  requestContext.headers.set("x-nonce", "nonce-de-test");
});

// Hors runtime Next : traductions serveur et en-têtes de requête simulés.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: "fr", messages, namespace: namespace as never }),
}));
// Le fournisseur serveur déduit locale et messages de i18n/request.ts ; ici on les fournit.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  const { default: fr } = await import("@/messages/fr.json");
  return {
    ...actual,
    NextIntlClientProvider: (props: React.ComponentProps<typeof actual.NextIntlClientProvider>) => (
      <actual.NextIntlClientProvider locale="fr" messages={fr} timeZone="Europe/Paris" {...props} />
    ),
  };
});
vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/app/fonts", () => ({
  bricolage: { variable: "font-bricolage" },
  figtree: { variable: "font-figtree" },
}));

function renderWithIntl(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("page d'accueil", () => {
  it("affiche le hero, les catégories en base et le panneau d'inscription", async () => {
    await seed(prisma, {
      adminEmail: "admin@x.test",
      memberPassword: "mot-de-passe",
      appUrl: "http://localhost:3000",
    });
    const { default: HomePage } = await import("@/app/page");
    const html = renderWithIntl(await HomePage());

    expect(html).toContain("Des modèles de découpe, partagés par celles et ceux qui les créent.");
    expect(html).toContain('href="/categories/nature-et-animaux"');
    expect(html).toContain("Lettrages et typographie");
    // Catalogue vide : suggestions éditoriales
    expect(html).toContain('href="/models?q=Mandala"');
    expect(html).toContain("Un compte gratuit, et tout s&#x27;ouvre.");
  });
});

describe("mise en page racine", () => {
  it("rend le squelette français avec en-tête, contenu, pied et barre mobile", async () => {
    const { default: RootLayout, generateMetadata, viewport } = await import("@/app/layout");
    const element = await RootLayout({
      children: <p>contenu de page</p>,
      params: Promise.resolve({}),
    } as never);
    const html = renderToStaticMarkup(element);

    expect(html).toContain('<html lang="fr"');
    expect(html).toContain("font-bricolage font-figtree");
    expect(html).toContain('href="#contenu"');
    expect(html).toContain('<main id="contenu"');
    expect(html).toContain("contenu de page");
    expect(html).toContain('aria-label="Navigation mobile"');
    expect(html).toContain('aria-label="Pied de page"');
    expect(html).toContain('nonce="nonce-de-test"');

    const metadata = await generateMetadata();
    expect(metadata.title).toEqual({
      default: "Canvathèque — modèles de découpe gratuits pour ScanNCut",
      template: "%s · Canvathèque",
    });
    expect(viewport.themeColor).toHaveLength(2);
  });
});
