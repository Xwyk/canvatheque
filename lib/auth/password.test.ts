import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isCommonPassword,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/auth/password";

describe("isCommonPassword", () => {
  it.each(["123456", "password", "Qwerty", "PASSWORD123", "iloveyou"])(
    "reconnaît %s comme courant (sans tenir compte de la casse)",
    (value) => {
      expect(isCommonPassword(value)).toBe(true);
    },
  );

  it("laisse passer une phrase de passe originale", () => {
    expect(isCommonPassword("papillon-de-nuit-42")).toBe(false);
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});

describe("hachage argon2id", () => {
  it("hache avec les paramètres OWASP et vérifie", async () => {
    const hash = await hashPassword("papillon-de-nuit-42");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(await verifyPassword(hash, "papillon-de-nuit-42")).toBe(true);
    expect(await verifyPassword(hash, "papillon-de-nuit-43")).toBe(false);
  });

  it("refuse un hachage absent ou corrompu sans lever d'erreur", async () => {
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword("pas-un-hash", "x")).toBe(false);
  });

  it("consomme un temps comparable pour une adresse inconnue", async () => {
    expect(await verifyAgainstDummy("quelconque")).toBe(false);
    expect(await verifyAgainstDummy("encore")).toBe(false);
  });
});
