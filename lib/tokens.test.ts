import { describe, expect, it } from "vitest";
import { generateToken, hashToken, safeEqual } from "@/lib/tokens";

describe("tokens", () => {
  it("génère des jetons URL-safe uniques de 256 bits", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hache de façon déterministe en SHA-256 hexadécimal", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("compare à temps constant", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret-plus-long")).toBe(false);
  });
});
