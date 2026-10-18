import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

const warn = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { warn, error } }));

import { resetEnvCache } from "@/lib/env";
import {
  createLogMailer,
  createMemoryMailer,
  createSmtpMailer,
  mailer,
  setMailerForTests,
} from "@/lib/mail/mailer";
import {
  changeEmailMessage,
  emailChangedNotice,
  escapeHtml,
  passwordChangedNotice,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/lib/mail/templates";

const MESSAGE = { to: "a@b.fr", subject: "Sujet", text: "texte", html: "<p>html</p>" };

describe("transports", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCache();
    setMailerForTests(undefined);
  });

  it("SMTP : envoie avec l'expéditeur configuré, TLS implicite sur le port 465", async () => {
    const smtp = createSmtpMailer({
      host: "smtp.x",
      port: 465,
      user: "u",
      password: "p",
      from: "C <n@x>",
    });
    await smtp.send(MESSAGE);
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.x",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
    expect(sendMail).toHaveBeenCalledWith({ from: "C <n@x>", ...MESSAGE });

    createSmtpMailer({ host: "mailpit", port: 1025, from: "C <n@x>" });
    expect(createTransport).toHaveBeenLastCalledWith({
      host: "mailpit",
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it("SMTP : un échec d'envoi est journalisé sans être propagé", async () => {
    sendMail.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const smtp = createSmtpMailer({ host: "absent", port: 25, from: "C <n@x>" });
    await expect(smtp.send(MESSAGE)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "mail_failed", subject: "Sujet" }),
      expect.any(String),
    );
  });

  it("journal : n'envoie rien et ne journalise ni destinataire ni contenu", async () => {
    await createLogMailer().send(MESSAGE);
    expect(warn).toHaveBeenCalledWith(
      { event: "mail_not_sent", subject: "Sujet" },
      expect.any(String),
    );
  });

  it("mémoire : conserve les messages", async () => {
    const memory = createMemoryMailer();
    await memory.send(MESSAGE);
    expect(memory.sent).toEqual([MESSAGE]);
  });

  it("choisit SMTP si SMTP_HOST est défini, sinon le journal", async () => {
    const base = {
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://u:p@localhost/db",
      AUTH_SECRET: "x".repeat(32),
      S3_ENDPOINT: "http://localhost:9000",
      S3_PUBLIC_URL: "http://localhost:9000",
      S3_ACCESS_KEY: "k",
      S3_SECRET_KEY: "s",
      ADMIN_EMAIL: "admin@x.fr",
    };
    for (const [key, value] of Object.entries(base)) vi.stubEnv(key, value);
    vi.stubEnv("SMTP_HOST", "");
    await mailer().send(MESSAGE);
    expect(sendMail).not.toHaveBeenCalled();
    expect(mailer()).toBe(mailer());

    setMailerForTests(undefined);
    resetEnvCache();
    vi.stubEnv("SMTP_HOST", "mailpit");
    await mailer().send(MESSAGE);
    expect(sendMail).toHaveBeenCalledOnce();
  });
});

describe("gabarits", () => {
  const recipient = { to: "lucie@exemple.fr", pseudo: "Lucie <b>" };
  const url = "http://localhost:3000/check-mail/abc?x=1&y=2";

  it.each([
    ["vérification", verifyEmailMessage(recipient, url), "Confirmez votre adresse e-mail"],
    [
      "réinitialisation",
      resetPasswordMessage(recipient, url),
      "Réinitialisation de votre mot de passe",
    ],
    [
      "changement d'adresse",
      changeEmailMessage(recipient, url),
      "Confirmez votre nouvelle adresse e-mail",
    ],
  ])("%s : sujet, lien en texte et en HTML échappé", (_name, message, subject) => {
    expect(message.to).toBe("lucie@exemple.fr");
    expect(message.subject).toBe(subject);
    expect(message.text).toContain(url);
    expect(message.text).toContain("Bonjour Lucie <b>,");
    expect(message.html).toContain("Bonjour Lucie &lt;b&gt;,");
    expect(message.html).toContain('href="http://localhost:3000/check-mail/abc?x=1&amp;y=2"');
    expect(message.html).not.toContain("<b>");
  });

  it("notifications sans lien", () => {
    const changed = emailChangedNotice(recipient, "nouvelle@exemple.fr");
    expect(changed.text).toContain("nouvelle@exemple.fr");
    expect(changed.html).not.toContain("<a ");
    expect(passwordChangedNotice(recipient).subject).toBe("Votre mot de passe a changé");
  });

  it("échappe les caractères HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});
