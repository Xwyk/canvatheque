import { describe, expect, it } from "vitest";
import {
  changeEmailSchema,
  changePasswordSchema,
  fieldErrors,
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  safeRedirect,
  signInSchema,
  signUpSchema,
} from "@/features/auth/schemas";

const VALID = {
  pseudo: "Lucie.M",
  email: "  Lucie@Exemple.FR ",
  password: "papillon-de-nuit-42",
  acceptTos: "on",
};

const errorsOf = (result: { success: boolean; error?: unknown }) =>
  result.success ? {} : fieldErrors(result.error as never);

describe("signUpSchema", () => {
  it("normalise l'adresse et accepte un pseudo accentué", () => {
    const parsed = signUpSchema.parse({ ...VALID, pseudo: " Éloïse_42 " });
    expect(parsed.email).toBe("lucie@exemple.fr");
    expect(parsed.pseudo).toBe("Éloïse_42");
  });

  it.each([
    [{ pseudo: "ab" }, "pseudo", "pseudoLength"],
    [{ pseudo: "x".repeat(31) }, "pseudo", "pseudoLength"],
    [{ pseudo: "-lucie" }, "pseudo", "pseudoChars"],
    [{ pseudo: "lucie m" }, "pseudo", "pseudoChars"],
    [{ email: "pas-une-adresse" }, "email", "email"],
    [{ email: "" }, "email", "required"],
    [{ password: "court" }, "password", "passwordShort"],
    [{ password: "x".repeat(129) }, "password", "passwordLong"],
    [{ acceptTos: "" }, "acceptTos", "tos"],
  ])("refuse %o (%s : %s)", (override, field, key) => {
    expect(errorsOf(signUpSchema.safeParse({ ...VALID, ...override }))[field]).toBe(key);
  });

  it("signale un champ absent comme obligatoire", () => {
    expect(errorsOf(signUpSchema.safeParse({}))).toMatchObject({
      pseudo: "required",
      email: "required",
      password: "required",
    });
  });
});

describe("autres schémas", () => {
  it("connexion : mot de passe non vide, sans règle de longueur minimale", () => {
    expect(signInSchema.safeParse({ email: "a@b.fr", password: "x" }).success).toBe(true);
    expect(errorsOf(signInSchema.safeParse({ email: "a@b.fr", password: "" })).password).toBe(
      "required",
    );
  });

  it("mot de passe oublié, réinitialisation, changements", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.fr" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "t", password: "court" }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "nouveau-mot-de-passe" })
        .success,
    ).toBe(true);
    expect(changeEmailSchema.parse({ newEmail: "NEW@B.FR", password: "x" }).newEmail).toBe(
      "new@b.fr",
    );
  });

  it("profil : champs vides convertis en null, URL http(s) uniquement", () => {
    expect(profileSchema.parse({ bio: "  ", website: "" })).toEqual({ bio: null, website: null });
    expect(profileSchema.parse({ bio: "Bonjour", website: "https://exemple.fr" })).toEqual({
      bio: "Bonjour",
      website: "https://exemple.fr",
    });
    expect(
      errorsOf(profileSchema.safeParse({ bio: "", website: "javascript:alert(1)" })).website,
    ).toBe("url");
    expect(errorsOf(profileSchema.safeParse({ bio: "x".repeat(301), website: "" })).bio).toBe(
      "bioLong",
    );
  });
});

describe("safeRedirect", () => {
  it.each([
    ["/models/papillon", "/models/papillon"],
    ["/me/settings?tab=1", "/me/settings?tab=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/api/models/x/download", "/"],
    [undefined, "/"],
    [42, "/"],
    [`/${"x".repeat(600)}`, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
