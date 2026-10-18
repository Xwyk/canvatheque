import { getRequestConfig } from "next-intl/server";

export const DEFAULT_LOCALE = "fr";

// Une seule locale, sans préfixe d'URL ; la structure est prête pour « en ».
export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: "Europe/Paris",
  messages: (await import(`../messages/${DEFAULT_LOCALE}.json`)).default,
}));
