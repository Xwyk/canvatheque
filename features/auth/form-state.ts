import type { FieldErrors } from "@/features/auth/schemas";
import type { ActionError } from "@/lib/result";

/** État renvoyé par les actions de formulaire (useActionState). */
export type FormState = {
  status: "idle" | "error" | "success";
  /** Clé de traduction du message global. */
  message?: string;
  messageValues?: Record<string, string | number>;
  /** Champ → clé `errors.field.*`. */
  fields?: FieldErrors;
  /** Valeurs à réafficher (jamais les mots de passe). */
  values?: Record<string, string>;
};

export const IDLE: FormState = { status: "idle" };

export function errorState(error: ActionError, values?: Record<string, string>): FormState {
  if (error.code === "RATE_LIMITED") {
    return {
      status: "error",
      message: "errors.rateLimited",
      messageValues: { minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) },
      values,
    };
  }
  return { status: "error", message: error.message, fields: error.fields, values };
}

export function invalidState(fields: FieldErrors, values?: Record<string, string>): FormState {
  return { status: "error", message: "errors.validation", fields, values };
}

/** Lit des champs texte d'un FormData (les absents valent ""). */
export function readForm<K extends string>(
  formData: FormData,
  keys: readonly K[],
): Record<K, string> {
  const result = {} as Record<K, string>;
  for (const key of keys) {
    const value = formData.get(key);
    result[key] = typeof value === "string" ? value : "";
  }
  return result;
}
