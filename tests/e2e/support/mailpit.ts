import { expect, type APIRequestContext } from "@playwright/test";

/** API Mailpit de la pile E2E (docker-compose.e2e.yml). */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

type MailSummary = { ID: string; Subject: string; Created: string };

/** Attend le dernier e-mail reçu par `to` dont le sujet correspond, et renvoie son texte. */
export async function waitForMail(
  request: APIRequestContext,
  to: string,
  subject: RegExp,
): Promise<string> {
  let found: MailSummary | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"`, limit: 20 },
        });
        const { messages } = (await response.json()) as { messages: MailSummary[] };
        found = messages.find((message) => subject.test(message.Subject));
        return found !== undefined;
      },
      { timeout: 15_000, message: `e-mail « ${subject} » pour ${to}` },
    )
    .toBe(true);
  const message = await request.get(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
  return ((await message.json()) as { Text: string }).Text;
}

/** Premier lien de l'application contenu dans le texte d'un e-mail. */
export function linkFrom(text: string, path: string): string {
  const match = new RegExp(`https?://[^\\s]+/${path}/[A-Za-z0-9_-]+`).exec(text);
  if (!match) throw new Error(`Aucun lien /${path}/ dans l'e-mail`);
  // L'e-mail cite APP_URL ; les tests suivent la baseURL configurée.
  return new URL(match[0]).pathname;
}

export function uniqueEmail(prefix: string, project: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}-${project}-${stamp}@e2e.canvatheque.test`.toLowerCase();
}
