import { afterEach, describe, expect, it } from "vitest";
import { EnvError, env, parseEnv, resetEnvCache } from "@/lib/env";

const VALID = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_URL: "http://localhost:9000",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret",
  ADMIN_EMAIL: "admin@example.org",
};

describe("parseEnv", () => {
  it("applique les valeurs par défaut documentées", () => {
    const result = parseEnv(VALID);
    expect(result.MAX_FILE_SIZE_MB).toBe(20);
    expect(result.MAX_MODELS_PER_USER).toBe(200);
    expect(result.SIGNED_URL_TTL_SECONDS).toBe(300);
    expect(result.S3_BUCKET_MODELS).toBe("models");
    expect(result.RATE_LIMIT_LOGIN_PER_15MIN).toBe(10);
    expect(result.NODE_ENV).toBe("development");
  });

  it("convertit les nombres et ignore les chaînes vides optionnelles", () => {
    const result = parseEnv({
      ...VALID,
      MAX_FILE_SIZE_MB: "5",
      SMTP_HOST: "",
      METRICS_TOKEN: "  ",
    });
    expect(result.MAX_FILE_SIZE_MB).toBe(5);
    expect(result.SMTP_HOST).toBeUndefined();
    expect(result.METRICS_TOKEN).toBeUndefined();
  });

  it("liste chaque variable manquante ou invalide", () => {
    const { APP_URL: _omit, ...missing } = VALID;
    let error: unknown;
    try {
      parseEnv({ ...missing, AUTH_SECRET: "court", MAX_FILE_SIZE_MB: "-1" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvError);
    const issues = (error as EnvError).issues.join("\n");
    expect(issues).toContain("APP_URL");
    expect(issues).toContain("AUTH_SECRET");
    expect(issues).toContain("MAX_FILE_SIZE_MB");
    expect((error as EnvError).message).toMatch(/^Configuration invalide/);
  });
});

describe("env", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    resetEnvCache();
  });

  it("lit process.env une seule fois puis met en cache", () => {
    Object.assign(process.env, VALID);
    const first = env();
    process.env.APP_URL = "http://changed.example";
    expect(env()).toBe(first);
    resetEnvCache();
    expect(env().APP_URL).toBe("http://changed.example");
  });
});
