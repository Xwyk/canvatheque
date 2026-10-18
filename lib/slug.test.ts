import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it.each([
    ["Cœur d'été", "coeur-d-ete"],
    ["Cartes et papeterie", "cartes-et-papeterie"],
    ["  Lettrages & Typographie  ", "lettrages-typographie"],
    ["ÆSOPE", "aesope"],
    ["lucie.m", "lucie-m"],
    ["---", ""],
  ])("%s → %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("tronque sans laisser de tiret final", () => {
    expect(slugify("abc def ghi", 4)).toBe("abc");
  });
});
