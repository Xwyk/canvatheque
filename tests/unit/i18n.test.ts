import { describe, expect, it, vi } from "vitest";

// Hors du runtime « react-server », next-intl refuse getRequestConfig : on l'identifie à la fonction.
vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));

import getRequestConfig, { DEFAULT_LOCALE } from "@/i18n/request";
import { messages } from "@/messages";

type ConfigFn = (params: { requestLocale: Promise<string | undefined> }) => Promise<{
  locale: string;
  timeZone: string;
  messages: unknown;
}>;

describe("configuration i18n", () => {
  it("sert le français sans préfixe d'URL", async () => {
    const config = await (getRequestConfig as unknown as ConfigFn)({
      requestLocale: Promise.resolve(undefined),
    });
    expect(DEFAULT_LOCALE).toBe("fr");
    expect(config.locale).toBe("fr");
    expect(config.timeZone).toBe("Europe/Paris");
    expect(config.messages).toEqual(messages);
  });
});
