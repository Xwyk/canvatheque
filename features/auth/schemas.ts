import { z } from "@/lib/validation";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

/**
 * Schémas partagés client/serveur. Les messages sont des clés de traduction
 * (`errors.field.*`), résolues à l'affichage.
 * La vérification « mot de passe courant » n'a lieu que côté serveur (lib/auth/password.ts).
 */

export const PSEUDO_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;
export const RESERVED_PSEUDOS = new Set([
  "admin",
  "administrateur",
  "moderateur",
  "canvatheque",
  "support",
  "auteur-supprime",
  "system",
]);

export const emailField = z
  .string({ error: "required" })
  .trim()
  .toLowerCase()
  .min(1, "required")
  .max(254, "email")
  .pipe(z.email({ error: "email" }));

export const passwordField = z
  .string({ error: "required" })
  .min(PASSWORD_MIN_LENGTH, "passwordShort")
  .max(PASSWORD_MAX_LENGTH, "passwordLong");

export const pseudoField = z
  .string({ error: "required" })
  .trim()
  .min(3, "pseudoLength")
  .max(30, "pseudoLength")
  .regex(PSEUDO_PATTERN, "pseudoChars");

/** Chemin interne sûr pour une redirection après authentification. */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/api/")) return fallback;
  return value.length > 512 ? fallback : value;
}

export const signUpSchema = z.object({
  pseudo: pseudoField,
  email: emailField,
  password: passwordField,
  acceptTos: z.literal("on", { error: "tos" }),
});

export const signInSchema = z.object({
  email: emailField,
  password: z
    .string({ error: "required" })
    .min(1, "required")
    .max(PASSWORD_MAX_LENGTH, "passwordLong"),
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: "required" }).min(1, "required").max(PASSWORD_MAX_LENGTH),
  newPassword: passwordField,
});

export const changeEmailSchema = z.object({
  newEmail: emailField,
  password: z.string({ error: "required" }).min(1, "required").max(PASSWORD_MAX_LENGTH),
});

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

export const profileSchema = z.object({
  bio: optionalText(300, "bioLong"),
  website: z
    .string()
    .trim()
    .max(200, "url")
    .refine((value) => value === "" || /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value), "url")
    .transform((value) => value || null),
});

export type FieldErrors = Record<string, string>;

/** Aplatit les erreurs Zod en { champ: cléDeMessage } (première erreur par champ). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
