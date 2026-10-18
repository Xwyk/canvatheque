import { describe, expect, it } from "vitest";
import { withFallbackSuggestions } from "@/features/catalog/queries";

describe("withFallbackSuggestions", () => {
  const fallback = ["Mandala", "Cartes de vœux", "Boîtes", "Anniversaire"];

  it("utilise les suggestions éditoriales quand le catalogue est vide", () => {
    expect(withFallbackSuggestions([], fallback)).toEqual(fallback);
  });

  it("place les tags réels en premier, sans doublon, dans la limite", () => {
    expect(withFallbackSuggestions(["papillon", "mandala"], fallback)).toEqual([
      "papillon",
      "mandala",
      "Cartes de vœux",
      "Boîtes",
    ]);
    expect(withFallbackSuggestions(["a", "b", "c", "d", "e"], fallback, 3)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
