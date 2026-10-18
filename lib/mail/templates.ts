import { createTranslator } from "next-intl";
import type { MailMessage } from "@/lib/mail/mailer";
import { messages } from "@/messages";

const t = createTranslator({ locale: "fr", messages, namespace: "emails" });

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Content = {
  to: string;
  subject: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  notes?: string[];
};

/** Gabarit commun : texte brut + HTML simple aux couleurs de la charte. */
function render({ to, subject, paragraphs, action, notes = [] }: Content): MailMessage {
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label} : ${action.url}`] : []),
    ...notes,
    "--",
    t("footer"),
  ].join("\n\n");

  const p = (content: string, style = "") =>
    `<p style="margin:0 0 16px;${style}">${escapeHtml(content)}</p>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F1EEF9;font-family:Arial,Helvetica,sans-serif;color:#221F3A">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#FFFFFF;border-radius:20px;padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:800">Canvathèque</p>
${paragraphs.map((content) => p(content, "font-size:16px;line-height:1.5")).join("\n")}
${
  action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#C81E4B;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#5B5873;word-break:break-all">${escapeHtml(action.url)}</p>`
    : ""
}
${notes.map((content) => p(content, "font-size:14px;color:#5B5873")).join("\n")}
</div>
<p style="margin:16px 8px 0;font-size:12px;color:#5B5873">${escapeHtml(t("footer"))}</p>
</div></body></html>`;

  return { to, subject, text, html };
}

type Recipient = { to: string; pseudo: string };

export function verifyEmailMessage({ to, pseudo }: Recipient, url: string): MailMessage {
  return render({
    to,
    subject: t("verify.subject"),
    paragraphs: [t("verify.greeting", { pseudo }), t("verify.intro")],
    action: { label: t("verify.action"), url },
    notes: [t("verify.expiry"), t("ignore")],
  });
}

export function resetPasswordMessage({ to, pseudo }: Recipient, url: string): MailMessage {
  return render({
    to,
    subject: t("reset.subject"),
    paragraphs: [t("reset.greeting", { pseudo }), t("reset.intro")],
    action: { label: t("reset.action"), url },
    notes: [t("reset.expiry"), t("ignore")],
  });
}

export function changeEmailMessage({ to, pseudo }: Recipient, url: string): MailMessage {
  return render({
    to,
    subject: t("changeEmail.subject"),
    paragraphs: [t("changeEmail.greeting", { pseudo }), t("changeEmail.intro")],
    action: { label: t("changeEmail.action"), url },
    notes: [t("changeEmail.expiry"), t("ignore")],
  });
}

export function emailChangedNotice({ to, pseudo }: Recipient, newEmail: string): MailMessage {
  return render({
    to,
    subject: t("emailChanged.subject"),
    paragraphs: [
      t("emailChanged.greeting", { pseudo }),
      t("emailChanged.intro", { email: newEmail }),
    ],
  });
}

export function passwordChangedNotice({ to, pseudo }: Recipient): MailMessage {
  return render({
    to,
    subject: t("passwordChanged.subject"),
    paragraphs: [t("passwordChanged.greeting", { pseudo }), t("passwordChanged.intro")],
  });
}
