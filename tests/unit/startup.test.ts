import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCoreAccounts: vi.fn(),
  ensureCategories: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  send: vi.fn(),
  smtpHost: undefined as string | undefined,
}));

vi.mock("@/features/account/bootstrap", () => ({ ensureCoreAccounts: mocks.ensureCoreAccounts }));
vi.mock("@/features/catalog/categories", () => ({ ensureCategories: mocks.ensureCategories }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
vi.mock("@/lib/env", () => ({
  env: () => ({
    ADMIN_EMAIL: "admin@x.test",
    ADMIN_PASSWORD: undefined,
    APP_URL: "http://localhost:3000",
    SMTP_HOST: mocks.smtpHost,
  }),
}));
vi.mock("@/lib/mail/mailer", () => ({ mailer: () => ({ send: mocks.send }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn, info: mocks.info } }));

describe("runStartupTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.smtpHost = undefined;
  });

  it("affiche le lien de définition du mot de passe administrateur", async () => {
    mocks.ensureCoreAccounts.mockResolvedValue({
      adminId: "a",
      systemUserId: "s",
      resetUrl: "http://x/reset/t",
    });
    const { runStartupTasks } = await import("@/lib/startup");
    await runStartupTasks();
    expect(mocks.ensureCategories).toHaveBeenCalledOnce();
    expect(mocks.ensureCoreAccounts).toHaveBeenCalledWith(
      {},
      { adminEmail: "admin@x.test", adminPassword: undefined, appUrl: "http://localhost:3000" },
    );
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ resetUrl: "http://x/reset/t" }),
      expect.any(String),
    );
    expect(mocks.info).toHaveBeenCalled();
  });

  it("envoie le lien par e-mail quand SMTP est configuré, sans l'écrire dans les journaux", async () => {
    mocks.smtpHost = "mailpit";
    mocks.ensureCoreAccounts.mockResolvedValue({
      adminId: "a",
      adminEmail: "admin@x.test",
      adminPseudo: "admin",
      systemUserId: "s",
      resetUrl: "http://x/reset/t",
    });
    const { runStartupTasks } = await import("@/lib/startup");
    await runStartupTasks();
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@x.test",
        subject: "Réinitialisation de votre mot de passe",
      }),
    );
    expect(mocks.warn).toHaveBeenCalledWith(
      { event: "admin_bootstrap", delivery: "email" },
      expect.any(String),
    );
  });

  it("reste silencieux quand l'administrateur a déjà un mot de passe", async () => {
    mocks.ensureCoreAccounts.mockResolvedValue({ adminId: "a", systemUserId: "s" });
    const { runStartupTasks } = await import("@/lib/startup");
    await runStartupTasks();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});

describe("instrumentation.register", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("n'exécute rien hors runtime Node ou si désactivé", async () => {
    const startup = { runStartupTasks: vi.fn() };
    vi.doMock("@/lib/startup", () => startup);
    const { register } = await import("@/instrumentation");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SKIP_STARTUP_TASKS", "true");
    await register();
    expect(startup.runStartupTasks).not.toHaveBeenCalled();
  });

  it("lance les tâches de démarrage dans le runtime Node", async () => {
    const startup = { runStartupTasks: vi.fn() };
    vi.doMock("@/lib/startup", () => startup);
    const { register } = await import("@/instrumentation");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SKIP_STARTUP_TASKS", "");
    await register();
    expect(startup.runStartupTasks).toHaveBeenCalledOnce();
  });
});
