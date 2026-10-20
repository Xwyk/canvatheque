import { messages } from "./index";

/**
 * Textes transmis au navigateur (NextIntlClientProvider) : sans les espaces de noms rendus
 * uniquement côté serveur (métadonnées, e-mails, pages de contenu, pages d'administration).
 * Ils étaient sérialisés dans chaque page et alourdissaient le HTML de plus de 20 Ko.
 */
const { content, emails, meta, seo, admin, ...shared } = messages;
void [content, emails, meta, seo];

export const clientMessages = { ...shared, admin: { moderation: admin.moderation } };
