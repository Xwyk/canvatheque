import { z } from "zod";

const intFromString = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().startsWith("postgres"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères"),

  S3_ENDPOINT: z.url(),
  S3_PUBLIC_URL: z.url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_MODELS: z.string().min(3).default("models"),
  S3_BUCKET_PREVIEWS: z.string().min(3).default("previews"),

  SMTP_HOST: optionalString,
  SMTP_PORT: intFromString(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().min(3).default("Canvathèque <no-reply@canvatheque.local>"),

  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: optionalString,

  MAX_FILE_SIZE_MB: intFromString(20),
  MAX_MODELS_PER_USER: intFromString(200),
  SIGNED_URL_TTL_SECONDS: intFromString(300),

  METRICS_TOKEN: optionalString,
  SENTRY_DSN: optionalString,

  RATE_LIMIT_LOGIN_PER_15MIN: intFromString(10),
  RATE_LIMIT_SIGNUP_PER_HOUR: intFromString(5),
  RATE_LIMIT_RESET_PER_HOUR: intFromString(3),
  RATE_LIMIT_UPLOAD_PER_HOUR: intFromString(20),
  RATE_LIMIT_DOWNLOAD_PER_HOUR: intFromString(60),
  RATE_LIMIT_COMMENT_PER_HOUR: intFromString(30),
  RATE_LIMIT_REPORT_PER_DAY: intFromString(10),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuration invalide :\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

/** Valide un ensemble de variables ; lève une EnvError listant chaque problème. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/**
 * Configuration validée, lue paresseusement : `next build` n'a pas besoin des
 * secrets ; la validation a lieu au démarrage du serveur (instrumentation.ts).
 */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Réservé aux tests. */
export function resetEnvCache(): void {
  cached = undefined;
}
