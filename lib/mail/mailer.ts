import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Envoi SMTP (Mailpit en développement, fournisseur réel en production). */
export function createSmtpMailer(options: {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}): Mailer {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.port === 465,
    auth: options.user ? { user: options.user, pass: options.password } : undefined,
  });
  return {
    async send(message) {
      try {
        await transport.sendMail({ from: options.from, ...message });
      } catch (error) {
        // Un SMTP indisponible ne doit pas faire échouer l'action (inscription, etc.) :
        // l'échec est journalisé et l'utilisateur peut redemander le lien.
        logger.error(
          { event: "mail_failed", subject: message.subject, err: error },
          "Échec d'envoi d'e-mail",
        );
      }
    },
  };
}

/** Sans SMTP configuré : rien n'est envoyé, seul l'événement est journalisé (sans contenu). */
export function createLogMailer(): Mailer {
  return {
    async send(message) {
      logger.warn(
        { event: "mail_not_sent", subject: message.subject },
        "SMTP non configuré : e-mail non envoyé",
      );
    },
  };
}

/** Transport mémoire pour les tests. */
export function createMemoryMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

const globalForMail = globalThis as unknown as { canvathequeMailer?: Mailer };

export function mailer(): Mailer {
  if (!globalForMail.canvathequeMailer) {
    const e = env();
    globalForMail.canvathequeMailer = e.SMTP_HOST
      ? createSmtpMailer({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          user: e.SMTP_USER,
          password: e.SMTP_PASSWORD,
          from: e.MAIL_FROM,
        })
      : createLogMailer();
  }
  return globalForMail.canvathequeMailer;
}

export function setMailerForTests(value: Mailer | undefined): void {
  globalForMail.canvathequeMailer = value;
}
